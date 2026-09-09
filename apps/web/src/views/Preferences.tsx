import { useEffect, useState } from 'react';
import { DEFAULT_PREFERENCES, deriveBoosts, loadPreferences, savePreferences } from '@excerpt/core';
import type { Category, Preferences as Prefs } from '@excerpt/types';

const LABEL: Record<Category, string> = {
  decision: 'Decisions', action: 'Action items',
  deadline: 'Deadlines', question: 'Open questions',
};

export function Preferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { void loadPreferences().then(setPrefs); }, []);
  if (!prefs) return <div className="notes"><p className="rubric">Reading…</p></div>;

  const commit = (next: Prefs) => {
    setPrefs(next);
    void savePreferences(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const move = (index: number, by: number) => {
    const order = [...prefs.order];
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    const a = order[index]!; const b = order[target]!;
    order[index] = b; order[target] = a;
    commit({ ...prefs, order });
  };

  const setInstruction = (instruction: string) =>
    commit({ ...prefs, instruction, boosts: deriveBoosts(instruction) });

  return (
    <div className="notes">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        <h1>What you care about</h1>
        <p className="rubric">
          Stored on this device. Preferences change the order of your notes, never what
          appears in them — a decision you forgot to prioritise is still a decision.
        </p>
      </header>

      <section>
        <h2>Order</h2>
        <p className="rubric">Most important first.</p>
        <ol className="pref-order">
          {prefs.order.map((c, i) => (
            <li key={c}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <span className="cat">{LABEL[c]}</span>
              <span className="move">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${LABEL[c]} up`}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === prefs.order.length - 1} aria-label={`Move ${LABEL[c]} down`}>↓</button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>In your words</h2>
        <p className="rubric">
          Excerpt has no language model, so it will not pretend to understand this
          sentence. It pulls out the terms it will actually weight, and shows you
          exactly what they are.
        </p>
        <textarea
          className="instruction"
          rows={4}
          value={prefs.instruction}
          placeholder="I work at an agency. Prioritise client feedback, deadlines, campaign decisions, deliverables, and anything assigned to me. Ignore small talk."
          onChange={(e) => setInstruction(e.target.value)}
        />

        <div className="boosts">
          <span className="boost-label">Boosting</span>
          {prefs.boosts.length === 0 && <span className="rubric">nothing yet</span>}
          {prefs.boosts.map((b) => (
            <button
              key={b}
              className="chip"
              onClick={() => commit({ ...prefs, boosts: prefs.boosts.filter((x) => x !== b) })}
              title="Remove this term"
            >
              {b} <span aria-hidden>×</span>
            </button>
          ))}
        </div>

        <div className="actions">
          <button onClick={() => commit({ ...DEFAULT_PREFERENCES })}>Reset</button>
          <span className="rubric">{saved ? 'Saved' : ''}</span>
        </div>
      </section>
    </div>
  );
}
