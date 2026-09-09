import { describe, expect, it } from 'vitest';
import type { Item, Preferences } from '@excerpt/types';
import { DEFAULT_PREFERENCES, applyPreferences, deriveBoosts, matchedBoosts, scoreItem } from './preferences';

const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', category: 'decision', state: 'decided', title: 'Move the launch to October',
  evidence: [{ eventIds: ['e'], tArrived: 0, quote: 'Move the launch to October', speakerLabel: 'SPEAKER' }],
  assignee: 'unassigned', salience: 0, ...over,
});

describe('deriveBoosts', () => {
  it('pulls the meaningful terms out of an instruction', () => {
    const boosts = deriveBoosts(
      'I work at an agency. Prioritize client feedback, deadlines, campaign decisions, deliverables, and anything assigned to me. Ignore small talk.');
    expect(boosts).toContain('agency');
    expect(boosts).toContain('client');
    expect(boosts).toContain('feedback');
    expect(boosts).toContain('campaign');
    expect(boosts).toContain('deliverables');
  });

  it('drops filler that says nothing about priorities', () => {
    const boosts = deriveBoosts('I really just want to focus on the things I care about');
    expect(boosts).toHaveLength(0);
  });

  it('does not repeat a term in singular and plural', () => {
    const boosts = deriveBoosts('deadline deadlines deliverable deliverables');
    expect(boosts).toEqual(['deadline', 'deliverable']);
  });
});

describe('salience', () => {
  const prefs: Preferences = { ...DEFAULT_PREFERENCES, boosts: ['client', 'campaign'] };

  it('ranks what lands on you above what does not', () => {
    const mine = scoreItem(item({ assignee: 'you' }), prefs);
    const theirs = scoreItem(item(), prefs);
    expect(mine).toBeGreaterThan(theirs);
  });

  it('lifts items whose evidence matches a boost term', () => {
    const hit = scoreItem(item({ title: 'Client wants the campaign moved' }), prefs);
    expect(hit).toBeGreaterThan(scoreItem(item(), prefs));
  });

  it('reports which terms actually fired', () => {
    expect(matchedBoosts(item({ title: 'Client feedback on the campaign' }), prefs))
      .toEqual(['client', 'campaign']);
  });

  it('reorders by category preference', () => {
    const prefsQ: Preferences = { ...DEFAULT_PREFERENCES, order: ['question', 'decision', 'action', 'deadline'] };
    const sorted = applyPreferences(
      [item({ id: 'd', category: 'decision' }), item({ id: 'q', category: 'question', state: 'discussed' })],
      prefsQ);
    expect(sorted[0]?.id).toBe('q');
  });

  it('orders but never hides — every item survives', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', category: 'question' })];
    expect(applyPreferences(items, { ...DEFAULT_PREFERENCES, boosts: ['nothing'] })).toHaveLength(2);
  });
});
