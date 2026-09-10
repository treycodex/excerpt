import Foundation
import Speech

/// On-device transcription still needs a model, and it is not always present.
/// Treating that as a first-class setup step — with progress, failure and an
/// offline check — is the difference between "effortless" and a dead first run.
enum ModelProvisioning {

    struct Report {
        var localeSupported = false
        var localeInstalled = false
        var statusBefore = ""
        var statusAfter = ""
        /// An installation request existed and completed. NOT proof bytes moved —
        /// a request is returned even when the model is already present.
        var installationRan = false
        var downloadSeconds: Double = 0
        var reserved = false
        var reservedLocales: [String] = []
        var maximumReserved = 0
        var reserveError: String?
        var reserveNote: String?
        var error: String?

        /// Reservation is judged by the inventory, never by reserve()'s return value:
        /// it returns false when the locale is ALREADY reserved, which reads as failure.
        var passes: Bool {
            localeSupported && localeInstalled && error == nil
                && reservedLocales.contains { $0.hasPrefix("en") }
        }
    }

    static let locale = Locale(identifier: "en-US")

    /// Best-effort match: supported locales are language+region, the caller's may not be.
    private static func matches(_ a: Locale, _ b: Locale) -> Bool {
        a.identifier(.bcp47).lowercased() == b.identifier(.bcp47).lowercased()
            || a.language.languageCode == b.language.languageCode
    }

    static func inspect() async -> Report {
        var report = Report()

        let supported = await SpeechTranscriber.supportedLocales
        let installed = await SpeechTranscriber.installedLocales
        report.localeSupported = supported.contains { matches($0, locale) }
        report.localeInstalled = installed.contains { matches($0, locale) }

        let transcriber = SpeechTranscriber(
            locale: locale,
            preset: .timeIndexedProgressiveTranscription
        )
        report.statusBefore = String(describing: await AssetInventory.status(forModules: [transcriber]))
        return report
    }

    /// Downloads the model if absent, reporting progress. Never silently no-ops.
    static func install(
        onProgress: @escaping @Sendable (Double) -> Void
    ) async -> Report {
        var report = await inspect()
        guard report.localeSupported else {
            report.error = "en-US is not in SpeechTranscriber.supportedLocales on this Mac"
            return report
        }

        let transcriber = SpeechTranscriber(
            locale: locale,
            preset: .timeIndexedProgressiveTranscription
        )

        do {
            if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                let started = Date()
                let progress = request.progress
                let observer = progress.observe(\.fractionCompleted, options: [.initial, .new]) { p, _ in
                    onProgress(p.fractionCompleted)
                }
                defer { observer.invalidate() }

                try await request.downloadAndInstall()
                report.installationRan = true
                report.downloadSeconds = Date().timeIntervalSince(started)
            } else {
                // No request means nothing to install — already provisioned.
                report.installationRan = false
            }

            // Reserving keeps the model available to this app. Worth knowing exactly
            // why it fails, since an evicted model breaks a later meeting silently.
            report.maximumReserved = await AssetInventory.maximumReservedLocales
            do {
                report.reserved = try await AssetInventory.reserve(locale: locale)
            } catch {
                report.reserveError = "\(error)"
            }
            report.reservedLocales = await AssetInventory.reservedLocales.map(\.identifier)
            if !report.reserved && report.reservedLocales.contains(where: { $0.hasPrefix("en") }) {
                report.reserveNote = "reserve() returned false because the locale was already reserved"
            }

            let installedAfter = await SpeechTranscriber.installedLocales
            report.localeInstalled = installedAfter.contains { matches($0, locale) }
            report.statusAfter = String(describing: await AssetInventory.status(forModules: [transcriber]))
        } catch {
            report.error = "\(error)"
        }
        return report
    }
}
