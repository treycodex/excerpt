import './brand.css';

/**
 * `[ e ] excerpt`, wherever it appears.
 *
 * A component rather than three markup fragments because it had already become three
 * — different casing, different weight, different size on each surface. The size is
 * inherited from the context (`font-size` on the element that renders it), so a nav
 * can set it small and a sidebar can set it large without either restating the shape.
 */
export function Wordmark({ markOnly = false, className }: { markOnly?: boolean; className?: string }) {
  return (
    <span className={className ? `wordmark ${className}` : 'wordmark'} aria-label="Excerpt">
      <span className="mark" aria-hidden>[ e ]</span>
      {!markOnly && <span className="word" aria-hidden>excerpt</span>}
    </span>
  );
}
