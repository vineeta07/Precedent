import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  computeKpis,
  derivePromiseStatus,
  keepRate,
  panelVerdict,
  routeFlag,
  shouldRunGuard,
  supersedeChain,
} from '../../src/ledger/rules';
import type { Decision } from '../../src/ledger/types';

const settings = { ignoreBelow: 0.55, commentAbove: 0.8, postComments: true };

describe('thresholds', () => {
  it('ignores below 0.55, panel in the middle, comment above 0.8 only when enabled', () => {
    expect(routeFlag(0.54, settings)).toBe('ignore');
    expect(routeFlag(0.55, settings)).toBe('panel');
    expect(routeFlag(0.8, settings)).toBe('panel');
    expect(routeFlag(0.81, settings)).toBe('panel_and_comment');
    expect(routeFlag(0.95, { ...settings, postComments: false })).toBe('panel');
    expect(routeFlag(Number.NaN, settings)).toBe('ignore');
  });
});

describe('promise status', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  it('kept when the linked issue is done', () => {
    expect(derivePromiseStatus({ dueDate: '2026-08-01', status: 'open' }, { statusCategory: 'done', resolution: 'Done' }, now)).toBe('kept');
  });
  it("broken when the issue was closed as won't do", () => {
    expect(derivePromiseStatus({ dueDate: null, status: 'open' }, { statusCategory: 'done', resolution: "Won't Do" }, now)).toBe('broken');
  });
  it('overdue when past due but in progress, broken when long past due and untouched', () => {
    expect(derivePromiseStatus({ dueDate: '2026-08-01', status: 'open' }, { statusCategory: 'indeterminate', resolution: null }, now)).toBe('overdue');
    expect(derivePromiseStatus({ dueDate: '2026-08-01', status: 'open' }, { statusCategory: 'new', resolution: null }, now)).toBe('broken');
    expect(derivePromiseStatus({ dueDate: '2026-11-10', status: 'open' }, null, now)).toBe('overdue');
  });
  it('open when not yet due, and manual outcomes without an issue are respected', () => {
    expect(derivePromiseStatus({ dueDate: '2026-12-01', status: 'open' }, null, now)).toBe('open');
    expect(derivePromiseStatus({ dueDate: '2026-11-15', status: 'open' }, null, now)).toBe('open');
    expect(derivePromiseStatus({ dueDate: '2026-01-01', status: 'kept' }, null, now)).toBe('kept');
  });
});

describe('metrics', () => {
  it('keep rate ignores promises that are not due yet', () => {
    expect(keepRate([])).toBeNull();
    expect(keepRate([{ status: 'open' }])).toBeNull();
    expect(keepRate([{ status: 'kept' }, { status: 'kept' }, { status: 'broken' }, { status: 'overdue' }, { status: 'open' }])).toBe(50);
  });
  it('counts distinct work items per flag kind, not dismissed ones', () => {
    const k = computeKpis(
      [{ status: 'accepted' }, { status: 'rejected' }, { status: 'superseded' }],
      [{ status: 'open' }, { status: 'kept' }],
      [
        { kind: 'deja_vu', dismissed: false, workItemKey: 'A-1' },
        { kind: 'deja_vu', dismissed: false, workItemKey: 'A-1' },
        { kind: 'deja_vu', dismissed: true, workItemKey: 'A-2' },
        { kind: 'conflict', dismissed: false, workItemKey: 'A-3' },
      ],
    );
    expect(k.decisionsTracked).toBe(2);
    expect(k.repeatIncidentsCaught).toBe(1);
    expect(k.conflictsCaught).toBe(1);
    expect(k.keepRate).toBe(100);
  });
});

describe('lifecycle', () => {
  it('only allows proposed → accepted → superseded', () => {
    expect(canTransition('proposed', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'superseded')).toBe(true);
    expect(canTransition('superseded', 'accepted')).toBe(false);
    expect(canTransition('proposed', 'superseded')).toBe(false);
    expect(() => assertTransition('superseded', 'accepted')).toThrow();
  });
  it('walks the supersede chain from the root and survives cycles', () => {
    const d = (id: string, supersededBy: string | null) => ({ id, supersededBy }) as Decision;
    const map = new Map([['a', d('a', 'b')], ['b', d('b', 'c')], ['c', d('c', null)]]);
    expect(supersedeChain(map.get('b') as Decision, map).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    const cyc = new Map([['a', d('a', 'b')], ['b', d('b', 'a')]]);
    expect(supersedeChain(cyc.get('a') as Decision, cyc).length).toBeLessThanOrEqual(2);
  });
});

describe('verdict', () => {
  it('prioritises conflict, then déjà vu, then promises', () => {
    expect(panelVerdict([{ kind: 'conflict', dismissed: false }, { kind: 'open_promise', dismissed: false }]).text).toBe('Conflicts with 1 decision');
    expect(panelVerdict([{ kind: 'deja_vu', dismissed: false }], 'INC-214', 2).text).toBe('Looks like INC-214 — 2 promises still open');
    expect(panelVerdict([{ kind: 'open_promise', dismissed: false }]).text).toBe('1 related promise is still open');
    expect(panelVerdict([{ kind: 'conflict', dismissed: true }]).text).toBe('No precedents found');
  });
});

describe('debounce', () => {
  it('skips stale events and unchanged content', () => {
    expect(shouldRunGuard(100, 200, null, 'h')).toBe(false);
    expect(shouldRunGuard(200, 200, 'h', 'h')).toBe(false);
    expect(shouldRunGuard(200, 200, 'old', 'h')).toBe(true);
    expect(shouldRunGuard(200, null, null, 'h')).toBe(true);
  });
});
