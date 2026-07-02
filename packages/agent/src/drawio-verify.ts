/**
 * drawio shadow verifier — the core of graph self-checking is "topological integrity":
 * target ids of update/delete/move must actually exist (otherwise they silently no-op);
 * a new edge's source/target must point to an existing node or a node created in the same
 * proposal (dangling edges are the most common form of graph corruption);
 * new ids must not collide with existing ids nor repeat within the proposal.
 * Isomorphic to word-verify: pure string/structural checks, zero adapter dependencies,
 * with a structured report fed back into propose→observe→repair.
 */
import type { ChangeSet, VerifyReport } from '@otterpatch/core';

/** Build a self-check verifier from the board topology context (the context fed to the model at propose time). */
export function buildDrawioVerifier(boardContext: string): (cs: ChangeSet) => VerifyReport {
  const known = (id: string): boolean => !!id && boardContext.includes(id);
  return (cs: ChangeSet): VerifyReport => {
    const errors: string[] = [];
    const warnings: string[] = [];
    // Collect ids created in this proposal (edges may point to nodes created in the same proposal)
    const created = new Set<string>();
    for (const e of cs.edits) {
      if (e.op.kind === 'addObject') {
        const id = String((e.op.payload as { id?: unknown })?.id ?? '');
        if (id) {
          if (created.has(id)) errors.push(`新建对象 id "${id}" 在本提案里重复出现 —— 后者会覆盖/冲突,请换唯一 id`);
          if (known(id)) warnings.push(`新建对象 id "${id}" 与画板已有元素撞名,可能覆盖既有对象`);
          created.add(id);
        }
      }
    }
    const touched = new Set<string>();
    for (const e of cs.edits) {
      const a = cs.anchors[e.target];
      const elementId = a?.portable.kind === 'object' ? a.portable.elementId : '';
      if (e.op.kind === 'addObject') {
        const p = e.op.payload as { edge?: boolean; source?: string; target?: string; parent?: string };
        if (p.edge || p.source || p.target) {
          for (const [end, v] of [['source', p.source], ['target', p.target]] as const) {
            if (!v) { errors.push(`新建边缺少 ${end} —— 悬空边不可落地,请补上端点节点 id`); continue; }
            if (!known(v) && !created.has(v)) errors.push(`新建边的 ${end}="${v}" 既不在画板中、也不是本提案新建的节点 —— 会成为悬空边。请改成真实存在的节点 id`);
          }
        }
        if (p.parent && p.parent !== '1' && !known(p.parent) && !created.has(p.parent)) warnings.push(`新建对象的 parent="${p.parent}" 不在画板中,将落到默认层`);
        continue;
      }
      // update/delete/move: the target must actually exist
      if (!elementId) { errors.push(`有一条 ${e.op.kind} 改动没有目标 id,无法落地`); continue; }
      if (!known(elementId)) { errors.push(`${e.op.kind} 的目标 id "${elementId}" 不在画板中 —— 这条改动会静默失效。请用上下文里真实的 cell id`); continue; }
      if (e.op.kind === 'deleteObject' && touched.has(elementId)) warnings.push(`id "${elementId}" 在本提案里先被修改又被删除,前面的修改将被浪费`);
      if (touched.has(elementId) && e.op.kind !== 'deleteObject') warnings.push(`id "${elementId}" 被多条改动重复命中,注意先后覆盖`);
      touched.add(elementId);
    }
    const parts: string[] = [];
    if (errors.length) parts.push('发现以下拓扑问题(会导致改动失效或图损坏):\n' + errors.map((s) => '- ' + s).join('\n'));
    if (warnings.length) parts.push('另外这些地方请留意:\n' + warnings.map((s) => '- ' + s).join('\n'));
    const ok = errors.length === 0;
    const tail = ok ? '' : '\n请据此修正后重新调用 propose_changeset。';
    return { ok, report: (parts.join('\n') || '自检通过:所有目标 id 真实存在,边的两端都有着落。') + tail };
  };
}
