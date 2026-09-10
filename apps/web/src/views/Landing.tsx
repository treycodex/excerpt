import { HeroLoop } from './HeroLoop';

const CLAIMS = [
  {
    n: '01',
    title: 'Free, and private',
    body: 'Your Mac does the listening. Nothing is uploaded, no account, no subscription.',
  },
  {
    n: '02',
    title: 'Nothing made up',
    body: 'Every note is something a person actually said, and Excerpt shows you where.',
  },
  {
    n: '03',
    title: 'Wrong sometimes',
    body: 'So you can fix anything in a click. It tells you what it heard, and what it could not tell.',
  },
];

const TICKER = [
  'Decisions', 'Action items', 'Deadlines', 'Open questions',
  'Who agreed to what', 'What you promised', 'What is still unanswered',
];

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <section className="hero">
        <HeroLoop />
        <div className="hero-scrim" />
        <div className="hero-copy">
          <h1>
            Be in the meeting.<br />
            <span className="hero-em">We’ll remember it.</span>
          </h1>
          <p className="lede">
            Beautiful live subtitles while you talk. Afterwards, notes you can actually
            trust — every line points back at what was said.
          </p>
          <div className="cta-row">
            <button className="cta" onClick={onStart}>Watch a meeting</button>
            <a className="cta ghost" href="#/record">Record a real one</a>
          </div>
          <p className="runtime">85 seconds · nothing to install</p>
        </div>
      </section>

      {/* Genesis-style ticker: what Excerpt looks for, moving slowly. */}
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <span className="marquee-run" key={copy}>
              {TICKER.map((item) => (
                <span className="marquee-item" key={item}>
                  {item}<i />
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="claims">
        {CLAIMS.map((claim) => (
          <article key={claim.n}>
            <span className="claim-n">{claim.n}</span>
            <h2>{claim.title}</h2>
            <p>{claim.body}</p>
          </article>
        ))}
      </section>

      <section className="closing">
        <h2 className="closing-line">
          Most meeting tools hand you a confident summary you cannot check.
          <span className="closing-em"> This one shows its work.</span>
        </h2>
        <button className="cta" onClick={onStart}>See it in 85 seconds</button>
      </section>
    </div>
  );
}
