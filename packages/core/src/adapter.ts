/**
 * Adapter contract + capability negotiation — the single "narrow waist".
 * Adding a host/format = implementing one HostAdapter. Capability negotiation is
 * front-loaded into list()/validate (the master gate).
 * See .work/abstraction-layer.md §5.
 */
import type {
  AnchorKind,
  AnchorService,
  DocRev,
  MutationLog,
  Unsubscribe,
} from './anchor.js';
import type {
  ChangeSet,
  ChangeSetEngine,
  EditId,
  EditOpKind,
  ShadowDoc,
} from './changeset.js';
import type { DiffLevel } from './diff.js';
import type { WritebackBackend } from './writeback.js';

export interface HostMeta {
  format: 'excel' | 'word' | 'ppt' | 'csv' | 'db' | (string & {});
  engine: 'univer' | 'onlyoffice' | 'prosemirror' | 'pptist' | (string & {});
  headless: boolean;
}
export interface PartRef {
  hostId: string;
  sub?: string;
} // sheet / slide; Word is always a single document flow

/** Read-only structured projection request. The envelope is the cross-adapter contract;
 *  `args` carries host-specific parameters (kept opaque on purpose — payloads differ per host). */
export interface ProjectionQuery {
  kind: string; // e.g. 'outline' | 'style-usage' | 'grid-window'
  scope?: PartRef;
  args?: Readonly<Record<string, unknown>>;
}
/** Projection result envelope: typed identity + revision, host-shaped payload. */
export interface DocProjection {
  kind: string;
  rev?: DocRev;
  data: unknown; // host-shaped payload, matched to `kind` by the caller
}
export interface OverlayPort {
  mount(d: unknown): { dispose(): void };
}

export interface OpCapability {
  level: 'native' | 'downgrade' | 'unsupported';
  downgradeTo?: EditOpKind; // e.g. setFormula→setValue
  limits?: { maxCells?: number; maxTextLen?: number; maxBatchEdits?: number };
}
export type CapabilityQuery =
  | { op: EditOpKind }
  | { feature: keyof CapabilitySet['features'] }
  | { anchorKind: AnchorKind };
export type CapabilityVerdict =
  | { ok: true }
  | { ok: false; downgrade: EditOpKind; reason: string }
  | { ok: false; reason: string };

export interface CapabilitySet {
  readonly anchorKinds: readonly AnchorKind[];
  readonly diffGranularity: readonly DiffLevel[];
  readonly ops: Readonly<Record<EditOpKind, OpCapability>>;
  readonly features: {
    shadowApply: boolean; // Univer headless: true; OnlyOffice free tier: false
    nativeUndo: boolean;
    antiDrift: 'auto' | 'reanchor' | 'none'; // Univer RefRange/PM RelPos=auto
    formulaRecalc: boolean;
    headless: boolean;
  };
  supports(q: CapabilityQuery): CapabilityVerdict;
}

/** At the validate stage, projects the abstract ChangeSet onto the target host, yielding a runnable subset + downgrades + rejections. */
export interface CapabilityNegotiator {
  negotiate(
    cs: ChangeSet,
    caps: CapabilitySet,
  ): {
    runnable: ChangeSet;
    downgraded: Array<{ editId: EditId; from: EditOpKind; to: EditOpKind; reason: string }>;
    rejected: Array<{ editId: EditId; reason: string }>;
  };
}

/**
 * Adapter tiers — honest contract instead of one heavyweight interface:
 *  - `HostAdapter` (required core): identity + capability negotiation + anchors + edit engine
 *    + write-back. This is what the propose→diff→commit pipeline actually exercises.
 *  - Optional capability interfaces below: implement only what the host really supports,
 *    discover at runtime via the `has*` guards. A format may also ship as a bare
 *    `WritebackBackend` only (pdf/pptx today) and skip HostAdapter entirely — that tier is
 *    registered on the runtime's backend table, not in the adapter registry.
 */
export interface HostAdapter {
  readonly hostId: string;
  readonly meta: HostMeta;
  capabilities(): CapabilitySet;
  anchors(): AnchorService;
  changes(): ChangeSetEngine;
  writebacks(): readonly WritebackBackend[];
  dispose(): void;
}

/** Optional: read-only structured projections of the document (outlines, style usage, windows). */
export interface ProjectionCapability {
  project(q: ProjectionQuery): Promise<DocProjection>;
}
/** Optional: fork a shadow snapshot for verify/preview without touching the live document. */
export interface ShadowCapability {
  createShadow(scope: PartRef): Promise<ShadowDoc>;
}
/** Optional: live-document integration — revision tracking + mutation feed for anchor rebase. */
export interface LiveDocCapability {
  rev(scope: PartRef): DocRev;
  onAdvance(cb: (rev: DocRev) => void): Unsubscribe;
  observeMutations(scope: PartRef, cb: (log: MutationLog, rev: DocRev) => void): Unsubscribe;
}
/** Optional: pixel overlay port (selection lasso / diff highlights) over the host's canvas. */
export interface OverlayCapability {
  overlay(): OverlayPort;
}

export const hasProjection = (a: HostAdapter): a is HostAdapter & ProjectionCapability => 'project' in a;
export const hasShadow = (a: HostAdapter): a is HostAdapter & ShadowCapability => 'createShadow' in a;
export const hasLiveDoc = (a: HostAdapter): a is HostAdapter & LiveDocCapability => 'observeMutations' in a;
export const hasOverlay = (a: HostAdapter): a is HostAdapter & OverlayCapability => 'overlay' in a;
