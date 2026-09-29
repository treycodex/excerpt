import { useEffect, useRef } from 'react';
import './demo-modal.css';

/**
 * The demo film, over the page. A native <dialog>: Escape closes it, focus is held
 * inside while it is open and returned to the button afterwards, and a click on the
 * dimmed backdrop closes it too. The film only loads when it is opened.
 */
export function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      void video.current?.play().catch(() => {});
    } else if (!open && el.open) {
      el.close();
    }
    if (!open) video.current?.pause();
  }, [open]);

  return (
    <dialog ref={dialog} className="demo-modal" aria-label="Excerpt demo film" onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <div className="demo-modal-frame">
        {open && (
          <video ref={video} src="/media/excerpt-demo.mp4" poster="/media/excerpt-demo.jpg"
            controls playsInline preload="metadata" />
        )}
        <button type="button" className="demo-modal-close" onClick={onClose} aria-label="Close the demo">×</button>
      </div>
      <p className="demo-modal-note">Real Excerpt footage. The meeting is scripted, with synthetic voices.</p>
    </dialog>
  );
}
