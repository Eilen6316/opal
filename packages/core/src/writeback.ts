/**
 * 写回保真 —— 可插拔后端 + 逐 edit 路由 + 自动降级 + verify。
 * 实测:外科补丁(surgical-ooxml)在真实 .docx 上 30/31 部件字节级不变;模型往返重写 11/31。
 * 详见 .work/abstraction-layer.md §7 与 .work/kill-experiments.md。
 */
import type { DocRev } from './anchor.js';
import type { ChangeSet, EditId, EditOpKind } from './changeset.js';

export type WritebackId = string & { readonly __brand: 'WritebackId' };
export type WritebackKind =
  | 'surgical-ooxml' // 首选:只改目标部件 XML、其余字节原样
  | 'surgical-xml' // drawio 等单 XML:只改目标 <diagram>、其余字节原样
  | 'model-roundtrip'
  | 'libreoffice-headless'
  | 'native-command';

export interface OoxmlPart {
  path: string; // xl/worksheets/sheet1.xml、word/document.xml、ppt/slides/slideN.xml
  xpath?: string;
}

export interface FidelityReport {
  score: number;
  drift: Array<{
    part: string;
    kind: 'style' | 'layout' | 'content' | 'formula';
    note: string;
  }>;
}
export interface DocHandle {
  readonly hostId: string;
  readonly bytes?: Uint8Array;
  readonly rev: DocRev;
}
export interface WritebackResult {
  ok: boolean;
  bytes: Uint8Array;
  touchedParts: string[];
  fidelity: FidelityReport;
  fallbackUsed?: WritebackKind;
  /** 真正落盘的 edit(诚实写回:每条 edit 是否被写入)。省略=后端未上报(视为全部已写)。 */
  appliedEditIds?: EditId[];
  /** 被静默丢弃的 edit + 原因(如 op 不被该写回后端支持、目标越界)。非空 ⇒ ok=false。 */
  droppedEdits?: Array<{ editId: EditId; reason: string }>;
}

export interface WritebackBackend {
  readonly id: WritebackId;
  readonly strategy: WritebackKind;
  canHandle(cs: ChangeSet): { ok: boolean; reason?: string }; // surgical 对跨部件大重排返回 no → 降级
  supports(op: EditOpKind, part: OoxmlPart): boolean;
  commit(cs: ChangeSet, doc: DocHandle): Promise<WritebackResult>;
  verify(before: DocHandle, after: DocHandle, cs: ChangeSet): Promise<FidelityReport>;
}

export interface WritebackRouter {
  route(
    cs: ChangeSet,
    backends: readonly WritebackBackend[],
  ): Array<{ editIds: EditId[]; backend: WritebackBackend }>;
  /** route→commit;verify 不达标→自动降级下一后端;校验不过则 tx 不进 committed。 */
  commitWithFallback(cs: ChangeSet, doc: DocHandle): Promise<WritebackResult>;
}
