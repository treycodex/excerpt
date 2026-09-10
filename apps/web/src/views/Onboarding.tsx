import { useEffect, useState } from 'react';
import { deriveBoosts, loadPreferences, savePreferences } from '@excerpt/core';
import type { Preferences as Prefs } from '@excerpt/types';
import { CAPTION_PRESETS, applyPreset, currentPreset } from '../captionPreset';
import type { CaptionPreset } from '../captionPreset';

const EXAMPLE = 'I run an agency. I care about client feedback, deadlines, and anything I promised to do.';

/**
 * "Make it yours" — shown once, straight after the demo, when the user has just seen
 * why any of it matters.
 *
 * This is Preferences content moved to where it is discoverable and motivated.
 * Two decisions, both visual and instant; no tour, no tooltips, nothing to read.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [preset, setPreset] = useState<CaptionPreset>(() => currentPreset());
  const [instruction, setInstruction] = useState('');
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => { void loadPreferences().then(setPrefs); }, []);

  const boosts = deriveBoosts(instruction);

  const finish = async () => {
    if (prefs) {
      await savePreferences({ ...prefs, instruction, boosts });
    }
    onDone();
  };

  return (
    <div className="onboard">
      <header>
        <div className="eyebrow">Almost done</div>
        <h1>Make it yours</h1>
        <p className="lede">Two quick things. You can change both later.</p>
      </header>

      <section>
        <h2>How should subtitles look?</h2>
        <div className="preset-cards">
          {CAPTION_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset-card${preset === p.id ? ' on' : ''}`}
              onClick={() => { setPreset(p.id); applyPreset(p.id); }}
              aria-pressed={preset === p.id}
            >
              <span className="preview" data-caption={p.id}>
                <span className="line">Let’s move the launch to October.</span>
              </span>
              <span className="preset-name">{p.name}</span>
              <span className="preset-note">{p.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>What matters to you in a meeting?</h2>
        <p className="rubric">
          Write it however you like. Excerpt has no idea what your sentence means —
          it just pulls out the words and listens harder for them. You can see exactly
          which ones below.
        </p>
        <textarea
          className="instruction"
          rows={3}
          value={instruction}
          placeholder={EXAMPLE}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <div className="boosts">
          <span className="boost-label">Listening out for</span>
          {boosts.length === 0 && <span className="rubric">nothing yet</span>}
          {boosts.map((b) => <span className="chip" key={b}>{b}</span>)}
        </div>
      </section>

      <div className="actions">
        <button className="cta" onClick={() => { void finish(); }}>See my notes</button>
        <button onClick={onDone}>Skip</button>
      </div>
    </div>
  );
}
