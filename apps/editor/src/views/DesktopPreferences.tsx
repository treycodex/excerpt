import { useEffect, useRef, useState } from 'react';
import { bridge } from '@excerpt/core';
import type { CaptionSettings, DesktopSettings } from '@excerpt/types';

/** Native snapshots are the only source of settings; no WebView persistence. */
export function DesktopPreferences() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const eventVersion = useRef(0);
  const mounted = useRef(false);

  const load = async () => {
    const version = eventVersion.current;
    try {
      const host = bridge();
      if (!host) throw new Error('Open Excerpt on your Mac to change these settings.');
      const snapshot = await host.loadDesktopSettings();
      if (mounted.current && version === eventVersion.current) { setSettings(snapshot); setError(''); }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Could not read settings. Try again.');
    }
  };

  useEffect(() => {
    mounted.current = true;
    const receive = (event: Event) => {
      eventVersion.current += 1;
      setSettings((event as CustomEvent<DesktopSettings>).detail);
    };
    window.addEventListener('excerpt:desktop-settings', receive);
    void load();
    return () => { mounted.current = false; window.removeEventListener('excerpt:desktop-settings', receive); };
  }, []);

  const commit = async (write: () => Promise<DesktopSettings>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    const version = eventVersion.current;
    try {
      const snapshot = await write();
      // A native event delivered while awaiting the acknowledgment is newer.
      if (mounted.current && version === eventVersion.current) setSettings(snapshot);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Settings could not be saved. Try again.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const caption = (patch: Partial<Pick<CaptionSettings, 'preset' | 'size' | 'position' | 'enabled' | 'displayId'>>) => {
    void commit(() => bridge()!.saveCaptionSettings(patch));
  };

  return <section className="desktop-settings" aria-label="Desktop settings">
    {error && <p role="alert">{error} <button onClick={() => { void load(); }}>Reload settings</button></p>}
    {!settings ? <p role="status">Reading desktop settings…</p> : <>
      <fieldset disabled={busy}>
        <legend>Captions</legend>
        <label><input type="checkbox" checked={settings.captions.enabled} onChange={(e) => caption({ enabled: e.target.checked })} /> Show captions during meetings</label>
        <label>Caption look<select aria-label="Caption look" value={settings.captions.preset} onChange={(e) => caption({ preset: e.target.value as CaptionSettings['preset'] })}>
          <option value="classic">Cinema</option><option value="warm">Golden hour</option><option value="contrast">Screenplay</option>
        </select></label>
        <label>Caption size<select aria-label="Caption size" value={settings.captions.size} onChange={(e) => caption({ size: e.target.value as CaptionSettings['size'] })}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select></label>
        <label>Caption position<select aria-label="Caption position" value={settings.captions.position} onChange={(e) => caption({ position: e.target.value as CaptionSettings['position'] })}>
          <option value="lower">Lower</option><option value="standard">Standard</option><option value="higher">Higher</option>
        </select></label>
        <label>Caption display<select aria-label="Caption display" value={settings.captions.displayId} onChange={(e) => caption({ displayId: e.target.value })}>
          {settings.captions.displayMissing && <option value={settings.captions.displayId}>Selected display disconnected</option>}
          {settings.captions.displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
        </select></label>
        {settings.captions.displayMissing && <p role="status">Using an available display until your selected display reconnects.</p>}
        <p className="rubric">Captions can appear in screen recordings and screen sharing. Check your meeting app’s sharing preview before sharing a display.</p>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>macOS screenshots</legend>
        <p>To place screenshots taken with ⌘⇧4 or ⌘⇧5 in a live transcript, Excerpt needs access to the folder where macOS saves them{settings.screenshotImport.folderName ? ` (${settings.screenshotImport.folderName})` : ''}. It looks only for new screenshots while a meeting is running.</p>
        <p>Capture moment in the Excerpt menu works without this folder access.</p>
        <button type="button" onClick={() => { void commit(() => bridge()!.setScreenshotImportEnabled(!settings.screenshotImport.enabled)); }}>
          {settings.screenshotImport.enabled ? 'Turn off automatic import' : 'Enable automatic import…'}
        </button>
        <p role="status">Automatic import is {settings.screenshotImport.enabled ? 'on' : 'off'}.</p>
      </fieldset>
      <fieldset disabled={busy || settings.microphone.selectionLocked}>
        <legend>Microphone</legend>
        <label>Selected microphone<select aria-label="Selected microphone" value={settings.microphone.selectedDeviceId} onChange={(e) => { void commit(() => bridge()!.selectMicrophone(e.target.value)); }}>
          {!settings.microphone.devices.some((d) => d.id === settings.microphone.selectedDeviceId) && <option value={settings.microphone.selectedDeviceId}>Selected input unavailable</option>}
          {settings.microphone.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
        </select></label>
        <p role="status">{settings.microphone.message}</p>
        {settings.microphone.selectionLocked && <p>End the meeting or stop the input check to change microphones.</p>}
        <p className="rubric">Excerpt hears meeting audio plus this microphone. Other Mac audio may also enter the transcript. A short input check is available under Settings & Help → Set up Excerpt.</p>
      </fieldset>
      <details>
        <summary>Keyboard shortcuts</summary>
        <ul>{settings.shortcuts.map((shortcut) => <li key={shortcut.name}>
          {shortcut.label}: <kbd>{shortcut.shortcut}</kbd> — {!shortcut.relevant ? 'Available during meetings' : shortcut.registered ? 'Active' : 'Unavailable — use the Excerpt menu'}
        </li>)}</ul>
      </details>
      {settings.shortcuts.some((shortcut) => shortcut.relevant && !shortcut.registered) && <p role="status">A keyboard shortcut is unavailable. Use the Excerpt menu; see Keyboard shortcuts for details.</p>}
      {busy && <p role="status">Saving desktop settings…</p>}
    </>}
  </section>;
}
