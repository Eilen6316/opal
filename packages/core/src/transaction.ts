/**
 * Concurrency kernel — SuggestionTransaction state machine + Git-style three-way rebase + single-writer commit queue.
 * Human↔Agent collaboration must never degrade to "last write wins". Reuses the unified AnchorService.rebase.
 * See .work/abstraction-layer.md §6.
 */
import type { AnchorId, DocRev, MutationLog } from './anchor.js';
import type { ChangeOrigin, ChangeSet, Edit, ShadowResult } from './changeset.js';
import type { DiffDecision, DiffNodeId, DiffView, PreviewValue } from './diff.js';

export type TxId = string & { readonly __brand: 'TxId' };

export type TxState =
  | 'draft' // Agent is reporting its plan; not shadow-applied yet
  | 'proposed' // shadowApply done + diff ready; awaiting review
  | 'partiallyAccepted'
  | 'staged' // projected subset re-validated against current rev; ready to commit
  | 'committing'
  | 'committed'
  | 'rejected'
  | 'rolledBack'
  | 'stale' // base rev has fallen behind; rebase required
  | 'rebasing'
  | 'conflicted'
  | 'abandoned';

export interface SuggestionTransaction {
  readonly id: TxId;
  readonly state: TxState;
  readonly changeSet: ChangeSet; // replaced by the migrated version after rebase
  readonly baseRev: DocRev;
  readonly shadow?: ShadowResult;
  readonly diff?: DiffView;
  readonly decisions: ReadonlyMap<DiffNodeId, DiffDecision>;
  readonly origin: ChangeOrigin;
  readonly dependsOn?: readonly TxId[]; // inter-suggestion dependency (B's anchored region depends on A)
  readonly history: readonly { at: number; kind: string; detail?: unknown }[];
}

export interface MergeConflict {
  anchor: AnchorId;
  reason: 'detached' | 'overlap';
  base?: PreviewValue;
  ours?: PreviewValue;
  theirs?: PreviewValue;
  resolution?: 'ours' | 'theirs' | 'manual';
  otherTxn?: TxId;
}
export interface MergePlan {
  overlaps: Array<{ node: DiffNodeId; choices: ('ours' | 'theirs' | 'both' | 'none')[] }>;
}
export type RebaseOutcome =
  | { ok: true; tx: SuggestionTransaction }
  | { ok: false; tx: SuggestionTransaction; conflicts: MergeConflict[] };

export interface TransactionManager {
  begin(origin: ChangeOrigin, baseRev: DocRev): SuggestionTransaction;
  appendOps(tx: TxId, edits: Edit[]): SuggestionTransaction;
  propose(tx: TxId): Promise<SuggestionTransaction>; // → proposed: shadowApply + diff
  decide(tx: TxId, node: DiffNodeId, d: 'accepted' | 'rejected'): SuggestionTransaction;
  stage(tx: TxId): Promise<SuggestionTransaction>; // → staged: project + re-validate against current rev
  commit(tx: TxId): Promise<{ rev: DocRev }>; // serialized through the single-writer queue
  reject(tx: TxId): SuggestionTransaction;
  rollback(tx: TxId): Promise<SuggestionTransaction>;
  onDocumentAdvanced(from: DocRev, to: DocRev, incoming: MutationLog): TxId[];
  rebase(tx: TxId, onto: DocRev, incoming: MutationLog): RebaseOutcome;
  rebaseOnto(txB: TxId, txA: TxId): RebaseOutcome; // between suggestions
  merge(a: TxId, b: TxId): MergePlan;
}
