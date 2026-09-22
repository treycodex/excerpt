import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, bridge, deriveBoosts, loadMeeting, loadPreferences, savePreferences } from '@excerpt/core';
import type { Category, Preferences as Prefs } from '@excerpt/types';

const LABEL: Record<Category, string> = {
  decision: 'Decisions', action: 'Action items',
  deadline: 'Deadlines', question: 'Open questions',
};

/**
 * The meeting this visit came from, if it came from one.
 *
 * Read once and cleared, so a later visit from the sidebar does not offer a link
 * back to something the reader has long since left. The id is checked against the
 * library before it is shown: a link to a meeting this device no longer has is
 * worse than no link.
 */
const RETURN_KEY = 'excerpt:return-to';
function takeReturnId(): string | null {
  try {
    const id = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  } catch { return null; }
}

export function Preferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyState, setKeyState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [unsaved, setUnsaved] = useState<Prefs | null>(null);
  /** The last state storage confirmed, so Cancel can put the screen back to it. */
  const saved_ = useRef<Prefs | null>(null);
  /**
   * The "Saved" notice clears itself after a moment, and the instruction field commits
   * on every keystroke. An un-cancelled timer from an earlier success therefore used to
   * land on a *later* failure and wipe its notice and both of its buttons, leaving a
   * refused edit on screen looking saved — the exact state the retry exists to prevent.
   */
  const clearNotice = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(clearNotice.current), []);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    void loadPreferences().catch(() => DEFAULT_PREFERENCES).then((loaded) => { saved_.current = loaded; setPrefs(loaded); });
    void bridge()?.getNotesProviderStatus?.().then((status) => setKeyConfigured(status.openAIKeyConfigured)).catch(() => {});
    const id = takeReturnId();
    if (id) void loadMeeting(id).then((meeting) => { if (meeting) setReturnTo(meeting.id); }).catch(() => {});
  }, []);
  if (!prefs) return <div className="notes"><p className="rubric">Reading…</p></div>;

  // A refused write leaves the choice on screen and offers the two things a person
  // can actually do about it. It never throws the edit away, and it never blocks the
  // notes: these settings only order what is already there.
  const commit = (next: Prefs) => {
    setPrefs(next);
    setSaved('saving');
    void savePreferences(next)
      .then(() => {
        saved_.current = next; setUnsaved(null); setSaved('saved');
        clearTimeout(clearNotice.current);
        clearNotice.current = setTimeout(() => setSaved((state) => state === 'saved' ? 'idle' : state), 1500);
      })
      .catch(() => { clearTimeout(clearNotice.current); setUnsaved(next); setSaved('failed'); });
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

  const configureKey = async () => {
    if (!bridge()?.configureOpenAIKey) return;
    setKeyState('saving');
    try {
      const status = await bridge()!.configureOpenAIKey!();
      setKeyConfigured(status.openAIKeyConfigured);
      setKeyState(status.openAIKeyConfigured ? 'saved' : 'idle');
    } catch { setKeyState('failed'); }
  };

  const removeKey = async () => {
    if (!bridge()?.removeOpenAIKey) return;
    try {
      await bridge()!.removeOpenAIKey!();
      setKeyConfigured(false); setKeyState('idle');
      if (prefs.notesProvider === 'openai') commit({ ...prefs, notesProvider: 'apple' });
    } catch { setKeyState('failed'); }
  };

  return (
    <div className="notes">
      <header className="masthead">
        <div className="eyebrow">Excerpt</div>
        {returnTo && <a className="preferences-return" href={`#/m/${returnTo}`}>← Back to your notes</a>}
        <h1>What matters to you</h1>
        <p className="rubric">
          Stored on this device. Preferences change the order of your notes, never what
          appears in them — a decision you forgot to prioritise is still a decision.
        </p>
      </header>

      <section className="notes-provider-settings">
        <h2>Note enhancement</h2>
        <p className="rubric">Choose who rewrites the transcript into cleaner notes. With OpenAI selected, Excerpt sends the transcript and screenshot captions to OpenAI. Screenshot pixels stay on this Mac.</p>
        <label className="provider-choice"><input type="radio" name="notes-provider" checked={(prefs.notesProvider ?? 'apple') === 'apple'} onChange={() => commit({ ...prefs, notesProvider: 'apple' })} /><span><b>On this Mac</b><small>Apple Intelligence, when available</small></span></label>
        <label className="provider-choice"><input type="radio" name="notes-provider" checked={prefs.notesProvider === 'openai'} onChange={() => commit({ ...prefs, notesProvider: 'openai' })} /><span><b>OpenAI with your key</b><small>Uses gpt-5-mini only when you choose this</small></span></label>
        <div className="api-key-setting">
          <p>{keyConfigured ? 'An API key is stored in macOS Keychain.' : 'Add an API key to use OpenAI for note wording.'}</p>
          <button disabled={keyState === 'saving'} onClick={() => { void configureKey(); }}>{keyState === 'saving' ? 'Opening Keychain…' : keyConfigured ? 'Replace key…' : 'Add key…'}</button>
          {keyConfigured && <button onClick={() => { void removeKey(); }}>Remove key</button>}
          <span className="rubric" role="status">{keyState === 'saved' ? 'Saved in Keychain' : keyState === 'failed' ? 'Could not update Keychain' : ''}</span>
        </div>
      </section>
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
          These visible terms change the order of review items, here and on the Mac.
          They do not filter items or instruct the notes summarizer.
        </p>
        <textarea
          aria-label="What matters to you in meetings"
          className="instruction"
          rows={4}
          value={prefs.instruction}
          placeholder="I work at an agency. Prioritise client feedback, deadlines, campaign decisions, deliverables, and anything assigned to me. Ignore small talk."
          onChange={(e) => setInstruction(e.target.value)}
        />

        <div className="boosts">
          <span className="boost-label">Listening out for</span>
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
          <span className="rubric" role="status">
            {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'failed' ? 'Could not save on this Mac. Your notes are unaffected.' : ''}
          </span>
          {saved === 'failed' && unsaved && <>
            <button onClick={() => commit(unsaved)}>Try again</button>
            {/* Put the screen back to what storage actually holds. Leaving the
                refused choice on screen looked applied and silently reverted on
                the next load. */}
            <button onClick={() => { if (saved_.current) setPrefs(saved_.current); setUnsaved(null); setSaved('idle'); }}>Cancel</button>
          </>}
        </div>
      </section>
    </div>
  );
}
