/**
 * SemanticAnchor — the abstraction layer's "position" currency.
 * Transparent identity, opaque addressing (opaque ref), drift converges at a single point (the one rebase).
 * See .work/abstraction-layer.md §1.
 */

export type HostId = string & { readonly __brand: 'HostId' };
export type DocRev = number & { readonly __brand: 'DocRev' };
export type AnchorId = string & { readonly __brand: 'AnchorId' };

/** Addressing family: only for capability matching / skill availability / diff grouping. NEVER used in resolution. */
export type AnchorKind = 'grid' | 'flow' | 'object' | 'composite';

/** Portable fallback. Core stores it without reading it; consumed when ref goes stale or across sessions. Exists because Word has no stable paragraph ids. */
export type PortableLocator =
  | { kind: 'grid'; sheet: string; a1: string }
  | {
      kind: 'flow';
      path: number[];
      quote: { prefix: string; text: string; suffix: string };
      bias: 'left' | 'right';
    }
  | { kind: 'object'; slide: number; elementId: string }
  | { kind: 'composite'; parts: PortableLocator[] };

/** Pure data: serializable, persistable, cross-session. This is what flows through the pipeline. */
export interface LogicalAnchor<Ref = unknown> {
  readonly id: AnchorId;
  readonly hostId: HostId; // whoever minted it resolves it
  readonly kind: AnchorKind; // coarse addressing family (capability matching only, not resolution)
  readonly ref: Ref; // adapter-private addressing payload (opaque)
  readonly portable: PortableLocator; // fallback when ref goes stale
  readonly baseRev: DocRev; // if != current rev, must rebase before resolving
}

export type PixelRect = { x: number; y: number; w: number; h: number };
export type PixelSelection = {
  viewportRect: PixelRect;
  polygon?: Array<{ x: number; y: number }>;
  modifier?: 'add' | 'subtract';
};
/** One host mutation (edit step) as observed by an adapter — the unit anchors get rebased over.
 *  The envelope (kind/rev/part) is the cross-adapter contract; `payload` stays host-opaque. */
export interface MutationRecord {
  kind: string; // host op name, e.g. 'set-range-values' / 'insert-rows' / 'replace-text'
  rev: DocRev; // document revision this mutation produced
  part?: string; // sheet / slide / flow it touched
  payload?: unknown; // host-native detail, opaque to core
}
/** Host mutation/step sequence — the input to rebase. */
export type MutationLog = readonly MutationRecord[];
export type Unsubscribe = () => void;

export interface ResolvedAnchor {
  readonly anchor: LogicalAnchor;
  readonly pixelRects: PixelRect[]; // text wrapping lines / regions spanning pages → multiple rects
  readonly nativeHandle: unknown; // opaque to core
  readonly live: boolean; // false = detached; UI prompts user to re-select
  readonly rev: DocRev;
}

/** Rich RebaseResult: status legible to core — drives UI directly. Output of the single source of truth for drift resistance. */
export type RebaseResult =
  | { status: 'tracked'; anchor: LogicalAnchor } // host substrate auto-shifted it: zero cost, semantics unchanged
  | { status: 'remapped'; anchor: LogicalAnchor } // precisely re-anchored via structural path
  | { status: 'shifted'; anchor: LogicalAnchor; warning: string } // shift succeeded but semantics may have changed → soft warning
  | { status: 'fuzzy'; anchor: LogicalAnchor; confidence: number } // fingerprint fuzzy match → needs human review
  | { status: 'detached'; reason: 'deleted' | 'rev-gap' | 'unresolvable' };

/** Anchor lifecycle service: one implementation per adapter. Core calls only these 7 signatures. */
export interface AnchorService {
  fromPixels(sel: PixelSelection): Promise<LogicalAnchor>;
  toPixels(a: LogicalAnchor): Promise<PixelRect[]>;
  resolve(
    a: LogicalAnchor,
    atRev: DocRev,
  ): Promise<ResolvedAnchor | { status: 'detached'; reason: string }>;
  /** ★ Single source of truth for drift resistance: layered degradation — host substrate freebie → structural re-anchor → fingerprint fuzzy match → detached. */
  rebase(a: LogicalAnchor, log: MutationLog, target: DocRev): RebaseResult;
  track(a: LogicalAnchor, onShift: (next: LogicalAnchor) => void): Unsubscribe;
  rehydrate(
    a: LogicalAnchor,
  ): Promise<LogicalAnchor | { status: 'detached'; reason: string }>;
  serialize(a: LogicalAnchor): string;
  deserialize(s: string): LogicalAnchor;
}
