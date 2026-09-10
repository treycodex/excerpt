export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="eyebrow">Excerpt</div>
      <h1>Be in the meeting.<br />We’ll remember it.</h1>
      <p className="lede">
        Cinematic captions while you talk. Afterwards, notes where every line points
        back at the passage it came from — so you can check it, and correct it.
      </p>

      <div className="claims">
        <div>
          <dt>Free to run</dt>
          <dd>Transcribed on your machine by Chrome’s own speech engine. No API keys, no backend, no account.</dd>
        </div>
        <div>
          <dt>Nothing invented</dt>
          <dd>Notes are extracted by grammar, not by a language model. Every item is a span of something a person actually said.</dd>
        </div>
        <div>
          <dt>Wrong sometimes</dt>
          <dd>So everything is correctable. Excerpt says what it heard, and what it could not tell.</dd>
        </div>
      </div>

      <div className="cta-row">
        <button className="cta" onClick={onStart}>Watch a meeting →</button>
        <a className="cta ghost" href="#/record">Record a real one</a>
      </div>
      <p className="runtime">
        85 seconds · no install · recording needs Chrome on macOS
      </p>
    </div>
  );
}
