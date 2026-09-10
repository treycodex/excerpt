import { useEffect, useState } from 'react';
import { deriveBoosts, loadPreferences, savePreferences } from '@excerpt/core';
import type { Preferences as Prefs } from '@excerpt/types';
import { CAPTION_PRESETS, applyPreset, currentPreset } from '../captionPreset';
import type { CaptionPreset } from '../captionPreset';
import './setup.css';

export function Onboarding({ onDone, forCapture = false }: { onDone: () => void; forCapture?: boolean }) {
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<CaptionPreset>(() => currentPreset());
  const [instruction, setInstruction] = useState('');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void loadPreferences().then((p) => { setPrefs(p); setInstruction(p.instruction); }).catch(() => setError('Could not load your preferences. You can continue with the defaults.')); }, []);
  const boosts = deriveBoosts(instruction);
  const finish = async () => {
    if (!prefs || saving) return;
    setSaving(true); setError('');
    try { await savePreferences({ ...prefs, instruction, boosts }); onDone(); }
    catch { setError('Could not save your preferences. Try again, or skip setup.'); }
    finally { setSaving(false); }
  };
  return <div className="setup-page">
    <nav className="setup-nav"><a href="#/" aria-label="Excerpt home">[ e ] <strong>EXCERPT</strong></a><a href="#/get-started">ALL WAYS TO USE EXCERPT ↗</a></nav>
    <div className="setup-wizard">
      <aside className="setup-rail"><span className="setup-eyebrow">MAKE IT YOURS</span><h2>A little setup.<br /><em>Better notes.</em></h2><ol><li className={step === 0 ? 'current' : 'complete'}><b>{step === 0 ? '1' : '✓'}</b>Your subtitle style</li><li className={step === 1 ? 'current' : ''}><b>2</b>Your priorities</li></ol><p>Everything can be changed later in Preferences.</p><span className="setup-eyebrow">FREE & OPEN SOURCE</span></aside>
      <div className="setup-wizard-content">
        {step === 0 ? <section><span className="setup-eyebrow">01 / YOUR STYLE</span><h1>Give your meetings<br /><em>a cinematic touch.</em></h1><p className="setup-description">Choose how your live subtitles look.</p><div className="setup-subtitle-scene" data-caption={preset}><div className="caption"><span className="line">Let’s make it happen.</span></div><span className="setup-scene-label">SUBTITLE PREVIEW</span></div><div className="setup-presets">{CAPTION_PRESETS.map((p) => <button key={p.id} aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); applyPreset(p.id); }}><strong>{p.name} {preset === p.id && '✓'}</strong><span>{p.note}</span></button>)}</div></section> : <section><span className="setup-eyebrow">02 / YOUR PRIORITIES</span><h1>What matters<br /><em>in your meetings?</em></h1><p className="setup-description">Optional: add topics you want near the top of your notes. Excerpt uses the matching terms below to order notes, without hiding anything.</p><label className="setup-input-label" htmlFor="meeting-priorities">Your priorities</label><textarea id="meeting-priorities" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={5} disabled={!prefs || saving} placeholder="Client feedback, launch deadlines, and anything assigned to me." /><div className="setup-terms"><span className="setup-eyebrow">PRIORITY TERMS</span><div>{boosts.length ? boosts.map((b) => <span key={b}>{b}</span>) : <p>No priorities added. All notes will use the default order.</p>}</div></div></section>}
        {error && <p role="alert" className="setup-error">{error}</p>}
        <footer className="setup-wizard-footer">{step === 1 && <button className="setup-quiet" onClick={() => setStep(0)} disabled={saving}>← Back</button>}<button className="setup-quiet setup-skip" onClick={onDone} disabled={saving}>Skip setup</button>{step === 0 ? <button className="setup-primary" onClick={() => setStep(1)}>Continue <span>→</span></button> : <button className="setup-primary" disabled={!prefs || saving} onClick={() => { void finish(); }}>{saving ? 'Saving…' : forCapture ? 'Set up meeting audio' : 'Open my notes'} <span>→</span></button>}</footer>
      </div>
    </div>
  </div>;
}
