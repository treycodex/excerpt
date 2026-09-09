/**
 * Document Picture-in-Picture: an always-on-top window of arbitrary HTML.
 *
 * This is how cinematic captions float over a real meeting without an extension.
 * Verified in the Day 0 spike. Chrome-only; callers must feature-detect.
 */
export function supportsPiP(): boolean {
  return 'documentPictureInPicture' in window;
}

export async function openCaptionWindow(): Promise<Document | null> {
  if (!supportsPiP()) return null;
  const w = await (window as any).documentPictureInPicture.requestWindow({
    width: 820, height: 200,
  });

  // Carry our own stylesheets across; the PiP document starts empty.
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const style = w.document.createElement('style');
      style.textContent = css;
      w.document.head.appendChild(style);
    } catch {
      // Cross-origin sheet: re-link it instead of reading it.
      const link = w.document.createElement('link');
      link.rel = 'stylesheet';
      if (sheet.href) { link.href = sheet.href; w.document.head.appendChild(link); }
    }
  }

  w.document.body.style.cssText =
    'margin:0;background:#000;height:100vh;overflow:hidden;display:grid;place-items:center';
  return w.document as Document;
}
