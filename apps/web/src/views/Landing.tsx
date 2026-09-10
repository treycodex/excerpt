import { DEMO_SCRIPT } from '../demo/script';

const demoSeconds = Math.ceil(((DEMO_SCRIPT.at(-1)?.at ?? 0) + 2000) / 1000);

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="eyebrow">Excerpt</div>
      <h1>Be in the meeting.<br />We’ll remember it.</h1>
      <p className="lede">
        Cinematic captions while you talk. Afterwards, notes where every line points
        back at the passage it came from — so you can check it, and correct it.
      </p>

      <div className="cta-row">
        <button className="cta" onClick={onStart}>Watch the demo →</button>
        <a className="cta ghost" href="#/record">Capture a meeting</a>
      </div>
      <p className="runtime">
        {demoSeconds} seconds · scripted demo · no microphone access
      </p>

      <figure className="proof">
        <figcaption><span>Decision</span><b>Every note keeps its source in frame.</b></figcaption>
        <blockquote>“Let’s move the campaign launch to October.”</blockquote>
        <p>Speaker · approximate 1:02 · View passage</p>
      </figure>

      <div className="claims">
        <div>
          <dt>Free to run</dt>
          <dd>On-device by default, with cloud transcription only after explicit consent. No API keys, backend, or account.</dd>
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

    </div>
  );
}
