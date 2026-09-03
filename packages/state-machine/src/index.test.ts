import { describe, expect, it } from 'vitest';
import {
  IllegalProspectTransitionError,
  PROSPECT_STATES,
  allowedProspectTransitions,
  assertProspectTransition,
  canTransitionProspect,
  isTerminalProspectState,
} from './index';

describe('prospect state machine', () => {
  it('defines every state exactly once in the transition map', () => {
    for (const state of PROSPECT_STATES) {
      expect(allowedProspectTransitions(state)).toBeDefined();
    }
  });

  it('allows the master happy path and scored branches', () => {
    expect(canTransitionProspect('DISCOVERED', 'NORMALIZED')).toBe(true);
    expect(canTransitionProspect('SCORED', 'DEMO_QUALIFIED')).toBe(true);
    expect(canTransitionProspect('SCORED', 'RESEARCH_MORE')).toBe(true);
    expect(canTransitionProspect('SCORED', 'REJECTED')).toBe(true);
    expect(canTransitionProspect('PROPOSAL', 'WON')).toBe(true);
    expect(canTransitionProspect('PROPOSAL', 'LOST')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(() => assertProspectTransition('DISCOVERED', 'SENT')).toThrow(
      IllegalProspectTransitionError,
    );
    expect(() => assertProspectTransition('WON', 'RESEARCH_PENDING')).toThrow(
      'Illegal prospect transition: WON -> RESEARCH_PENDING',
    );
  });

  it('keeps safety and outcome states terminal', () => {
    for (const state of ['REJECTED', 'SUPPRESSED', 'UNSUBSCRIBED', 'WON', 'LOST'] as const) {
      expect(isTerminalProspectState(state)).toBe(true);
      expect(allowedProspectTransitions(state)).toEqual([]);
    }
  });
});
