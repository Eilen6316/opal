/**
 * 影子校验器:把提案应用到整表快照影子、重算,产出可回喂的观察 + 问题清单。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorId, ChangeSet, DocRev, EditOp, HostId, LogicalAnchor } from '@otterpatch/core';
import { buildGridVerifier, type SheetSnapshot } from './grid-verify.js';

function makeCs(edits: Array<{ a1: string; op: EditOp }>): ChangeSet {
  const anchors: Record<AnchorId, LogicalAnchor> = {};
  const es = edits.map((e, i) => {
    const aid = ('a' + i) as AnchorId;
    anchors[aid] = { id: aid, hostId: 'h' as HostId, kind: 'grid', ref: null, baseRev: 0 as DocRev, portable: { kind: 'grid', sheet: 'Sheet1', a1: e.a1 } };
    return { id: 'e' + i, target: aid, op: e.op };
  });
  return { id: 'cs', hostId: 'h', baseRev: 0 as DocRev, anchors, origin: { by: 'agent', sessionId: 't' }, meta: { intent: 't' }, edits: es };
}

const SHEET: SheetSnapshot = { a1: 'A1:C3', values: [['h1', 'h2', 'h3'], [1, 2, 0], [3, 4, 0]] };

test('grid-verify: 合法公式提案 ok=true,report 含影子重算结果(供模型核对)', async () => {
  const v = buildGridVerifier(SHEET);
  const r = await v(makeCs([{ a1: 'Sheet1!C2', op: { family: 'value', kind: 'setFormula', formula: '=A2+B2' } }]));
  assert.equal(r.ok, true);
  assert.match(r.report, /C2=3/, '影子把 =A2+B2 重算为 3 回喂模型');
});

test('grid-verify: 越界写入(数据只到第3行却写第40行)ok=false', async () => {
  const v = buildGridVerifier(SHEET);
  const r = await v(makeCs([{ a1: 'Sheet1!C40', op: { family: 'value', kind: 'setValue', value: 9 } }]));
  assert.equal(r.ok, false);
  assert.match(r.report, /C40/);
  assert.match(r.report, /笔误/);
});

test('grid-verify: 同一格被多条改动重复命中 ok=false', async () => {
  const v = buildGridVerifier(SHEET);
  const r = await v(makeCs([
    { a1: 'Sheet1!B2', op: { family: 'value', kind: 'setValue', value: 1 } },
    { a1: 'Sheet1!B2', op: { family: 'value', kind: 'setValue', value: 2 } },
  ]));
  assert.equal(r.ok, false);
  assert.match(r.report, /重复命中/);
});
