import Foundation

/// Native-owned compatibility defaults. Legacy files remain decodable as written;
/// they acquire revisions only when loaded into a durable native operation.
extension Meeting {
    static let currentSchemaVersion = 1

    func revisioned() -> Meeting {
        var copy = self
        copy.schemaVersion = max(schemaVersion ?? 0, Self.currentSchemaVersion)
        copy.revision = revision ?? draftRevision ?? 0
        copy.documentRevision = documentRevision ?? draftRevision ?? 0
        copy.sourceRevision = sourceRevision ?? 0
        return copy
    }
}

enum MeetingMutationFailure: Error, LocalizedError, Equatable {
    case missingMeeting(String)
    case invalidMeetingID
    case invalidCreation
    case invalidSourceRevision
    case missingImage(String)

    var errorDescription: String? {
        switch self {
        case .missingMeeting: "That meeting no longer exists. Your unsaved writing is still open."
        case .invalidMeetingID: "The meeting change did not match the meeting it named."
        case .invalidCreation: "That meeting already exists and was not replaced."
        case .invalidSourceRevision: "The transcript changed before that correction could be saved."
        case .missingImage: "That captured moment no longer exists."
        }
    }
}

/// Applies only the fields named by typed editor operations. This is shared by live
/// capture and completed-file persistence, so neither path can accept a stale whole
/// meeting snapshot.
enum MeetingMutationReducer {
    static let retainedOperationCount = 32

    static func acknowledgment(
        for mutation: MeetingMutation,
        applyingTo input: Meeting
    ) throws -> MeetingMutationAcknowledgment {
        var meeting = input.revisioned()
        guard meeting.id == mutation.meetingId else { throw MeetingMutationFailure.invalidMeetingID }

        if meeting.appliedOperationIds?.contains(mutation.operationId) == true {
            return acknowledgment(mutation, .duplicate, meeting)
        }

        let currentRevision = meeting.revision ?? 0
        let currentDocumentRevision = meeting.documentRevision ?? 0
        let currentSourceRevision = meeting.sourceRevision ?? 0

        // Document replacement and transcript correction are the two operations that
        // cannot be safely replayed over another edit to the same logical source.
        // Image/title changes are id-addressed and review edits are source-scoped.
        for change in mutation.changes {
            switch change {
            case .create:
                throw MeetingMutationFailure.invalidCreation
            case .setDocument:
                guard mutation.baseDocumentRevision == currentDocumentRevision else {
                    return acknowledgment(mutation, .conflict, meeting,
                        "The document changed while you were writing. Your local version was kept for retry.")
                }
            case .setReviewItems:
                guard mutation.baseSourceRevision == currentSourceRevision else {
                    return acknowledgment(mutation, .conflict, meeting,
                        "The transcript changed while review edits were being saved.")
                }
            case .correctTranscript(_, _, _, _, _, let sourceRevision):
                guard mutation.baseSourceRevision == currentSourceRevision,
                      mutation.baseDocumentRevision == currentDocumentRevision,
                      sourceRevision == currentSourceRevision + 1 else {
                    return acknowledgment(mutation, .conflict, meeting,
                        "The transcript or document changed while that correction was being saved.")
                }
            case .setTitle, .addImages, .updateImage:
                break
            }
        }

        var changedDocument = false
        var changedSource = false
        for change in mutation.changes {
            switch change {
            case .create:
                throw MeetingMutationFailure.invalidCreation
            case .setTitle(let title):
                meeting.title = title
            case .setDocument(let document, let suggestedNotes):
                meeting.notes = document
                meeting.suggestedNotes = suggestedNotes
                changedDocument = true
            case .setReviewItems(let items):
                meeting.items = items
            case .correctTranscript(let events, let items, let document, let suggestedNotes,
                                    let images, let sourceRevision):
                meeting.events = events
                meeting.items = items
                meeting.notes = document
                meeting.suggestedNotes = suggestedNotes
                meeting.images = images
                meeting.sourceRevision = sourceRevision
                changedDocument = true
                changedSource = true
            case .addImages(let images, let blocks):
                var existing = meeting.images ?? []
                let known = Set(existing.map(\.id))
                existing.append(contentsOf: images.filter { !known.contains($0.id) })
                meeting.images = existing
                var document = meeting.notes ?? NotesDocument(
                    method: "extractive", keyPoints: [], topics: [], blocks: [])
                var existingBlocks = document.blocks ?? []
                let knownBlocks = Set(existingBlocks.map(\.id))
                existingBlocks.append(contentsOf: blocks.filter { !knownBlocks.contains($0.id) })
                document.blocks = existingBlocks
                meeting.notes = document
                meeting.suggestedNotes = nil
                changedDocument = true
            case .updateImage(let imageId, let caption, let needsReview, let anchorAt, let timeKnown, let blockText):
                guard let index = meeting.images?.firstIndex(where: { $0.id == imageId }) else {
                    throw MeetingMutationFailure.missingImage(imageId)
                }
                meeting.images?[index].caption = caption
                meeting.images?[index].needsReview = needsReview
                if let anchorAt {
                    meeting.images?[index].anchorAt = anchorAt
                    meeting.images?[index].context = MeetingMoments.context(at: anchorAt, events: meeting.events)
                }
                if let timeKnown { meeting.images?[index].timeKnown = timeKnown }
                if var document = meeting.notes {
                    document.blocks = document.blocks?.map { block in
                        guard block.imageId == imageId else { return block }
                        var copy = block
                        copy.text = blockText
                        copy.userEdited = true
                        return copy
                    }
                    meeting.notes = document
                }
                meeting.suggestedNotes = nil
                changedDocument = true
            }
        }

        if changedDocument { meeting.documentRevision = currentDocumentRevision + 1 }
        if !changedSource { meeting.sourceRevision = currentSourceRevision }
        meeting.revision = currentRevision + 1
        var operationIDs = meeting.appliedOperationIds ?? []
        operationIDs.append(mutation.operationId)
        meeting.appliedOperationIds = Array(operationIDs.suffix(retainedOperationCount))
        meeting.schemaVersion = Meeting.currentSchemaVersion
        let status: MeetingMutationAcknowledgment.Status = mutation.baseRevision == currentRevision ? .applied : .rebased
        return acknowledgment(mutation, status, meeting)
    }

    static func created(_ mutation: MeetingMutation) throws -> MeetingMutationAcknowledgment {
        guard mutation.changes.count == 1,
              case .create(let supplied) = mutation.changes[0],
              supplied.id == mutation.meetingId else { throw MeetingMutationFailure.invalidCreation }
        var meeting = supplied.revisioned()
        meeting.schemaVersion = Meeting.currentSchemaVersion
        meeting.revision = max(1, meeting.revision ?? 0)
        meeting.documentRevision = meeting.documentRevision ?? 0
        meeting.sourceRevision = meeting.sourceRevision ?? 0
        meeting.appliedOperationIds = [mutation.operationId]
        return acknowledgment(mutation, .applied, meeting)
    }

    private static func acknowledgment(
        _ mutation: MeetingMutation,
        _ status: MeetingMutationAcknowledgment.Status,
        _ meeting: Meeting,
        _ message: String? = nil
    ) -> MeetingMutationAcknowledgment {
        MeetingMutationAcknowledgment(
            operationId: mutation.operationId,
            meetingId: mutation.meetingId,
            status: status,
            revision: meeting.revision ?? 0,
            documentRevision: meeting.documentRevision ?? 0,
            sourceRevision: meeting.sourceRevision ?? 0,
            meeting: meeting,
            message: message)
    }
}
