/**
 * Skill — SKILL.md compatible + progressive disclosure (L0/L1/L2).
 * `requires` capability gate = reuse across hosts; scripts/demonstrations always emit a ChangeSet; asMcpTools = skills as infrastructure.
 * See .work/abstraction-layer.md §4.
 */
import type { AnchorKind, DocRev, LogicalAnchor } from './anchor.js';
import type {
  AbstractStyle,
  CellValue,
  ChangeMeta,
  ChangeSet,
  EditOp,
  MarkSpec,
} from './changeset.js';
import type { CapabilityQuery, CapabilitySet, DocProjection, ProjectionQuery } from './adapter.js';

export interface SkillTrigger {
  intent?: string;
  anchorKind?: AnchorKind;
}

export interface SkillManifest {
  readonly name: string; // L0 (always loaded into context)
  readonly description: string; // L0 (Agent matches intent against this)
  readonly version: string;
  readonly requires?: CapabilityQuery[]; // hosts that don't satisfy these are omitted from list()
  readonly anchorKinds?: AnchorKind[];
  readonly triggers?: SkillTrigger[];
  load(): Promise<SkillBody>; // L1: body + script/resource declarations fetched only on match
}

export interface SkillBody {
  readonly instructions: string; // L1: SKILL.md body (Markdown)
  readonly scripts?: SkillScript[]; // L2: bundled deterministic scripts
  readonly demonstrations?: Demonstration[];
  readonly resources?: Array<{ id: string; load: () => Promise<Uint8Array> }>;
}

export interface ChangeSetBuilder {
  anchorOf(a: LogicalAnchor): string;
  setValue(a: string, v: CellValue): void;
  setFormula(a: string, f: string): void;
  setStyle(a: string, s: AbstractStyle): void;
  replaceText(a: string, t: string): void;
  setMark(a: string, m: MarkSpec, on: boolean): void;
  raw(a: string, hostId: string, payload: unknown): void; // requires caps approval
  build(meta: ChangeMeta): ChangeSet;
}

export interface SkillContext {
  readonly hostId: string;
  readonly anchors: readonly LogicalAnchor[]; // user selection (pixels already resolved to anchors)
  readonly params: Record<string, unknown>;
  readonly caps: CapabilitySet; // scripts self-degrade based on this
  readonly baseRev: DocRev;
  project(q: ProjectionQuery): Promise<DocProjection>; // read-only structured projection
  readonly emit: ChangeSetBuilder; // safe construction: output is valid by construction
}

/** Deterministic script entry point: pure function, sandboxable and unit-testable. */
export type SkillScript = (ctx: SkillContext) => Promise<ChangeSet>;

/** Demonstration-as-skill: record committed ChangeSet sequence → relativize anchors + parameterize values → replayable skill. */
export interface ParameterizedEdit {
  anchorSlot: { fromSelection: number; transform?: string };
  opTemplate: EditOp;
}
export interface Demonstration {
  readonly recordedEdits: ParameterizedEdit[];
  synthesize(ctx: SkillContext): ChangeSet;
}
export interface SkillRecorder {
  start(hostId: string): void;
  observe(cs: ChangeSet): void;
  finish(meta: { name: string; description: string }): SkillManifest;
}

export interface SkillRegistry {
  list(caps: CapabilitySet): Promise<Array<Pick<SkillManifest, 'name' | 'description'>>>;
  load(name: string): Promise<SkillBody>;
  invoke(name: string, ctx: SkillContext): Promise<ChangeSet | { promptOnly: string }>;
  distill(rec: SkillRecorder): SkillManifest; // "demonstration-as-skill" flywheel
  asMcpTools(
    caps: CapabilitySet,
  ): Array<{ name: string; description: string; inputSchema: object }>;
}
