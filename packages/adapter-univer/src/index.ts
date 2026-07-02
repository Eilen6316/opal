/**
 * UniverAdapter —— Excel 适配器(桩)。MVP 首发底座。
 *
 * 落地映射(待实现):
 *  - anchors():  Univer SelectionService 产出 {unitId, sheetId, A1} → LogicalAnchor;
 *                RefRangeService 注册区域,插行/删列自动平移 → rebase 的 'tracked' 态。
 *  - changes():  Facade getRange().setValue/setFormula;Command/Mutation 系统给 undo/redo;
 *                Node 同构 headless 实例做 shadowApply(fork 快照→应用→算 before/after)。
 *  - overlay():  在 Univer canvas 之上挂自建绝对定位 SVG 覆盖层(圈选/红笔/diff 高亮)。
 *  - writebacks(): 交给 @otterpatch/writeback-surgical(外科补丁)。
 *
 * 详见 .work/abstraction-layer.md §5、§9(MVP 最小子集)。
 */
import type {
  AdapterRegistration,
  AnchorService,
  ChangeSetEngine,
  CapabilitySet,
  HostAdapter,
  HostMeta,
  WritebackBackend,
} from '@otterpatch/core';
import { SurgicalOoxmlWriteback } from '@otterpatch/writeback-surgical';
import { buildXlsxCompiler } from './xlsx-patch.js';
import { GridChangeSetEngine } from './grid-engine.js';

const TODO = (what: string): never => {
  throw new Error(`UniverAdapter: ${what}() not implemented yet`);
};

export class UniverAdapter implements HostAdapter {
  readonly hostId: string;
  readonly meta: HostMeta = { format: 'excel', engine: 'univer', headless: false };

  constructor(hostId: string) {
    this.hostId = hostId;
  }

  capabilities(): CapabilitySet {
    return TODO('capabilities');
  }
  anchors(): AnchorService {
    return TODO('anchors');
  }
  changes(): ChangeSetEngine {
    return new GridChangeSetEngine();
  }
  writebacks(): readonly WritebackBackend[] {
    // Real write-back: surgical OOXML patch + the xlsx ChangeSet→part compiler.
    return [new SurgicalOoxmlWriteback(buildXlsxCompiler())];
  }
  dispose(): void {
    /* no-op */
  }
  // Optional capabilities (ProjectionCapability / ShadowCapability / LiveDocCapability /
  // OverlayCapability) are intentionally NOT declared: throwing TODO stubs would advertise
  // support the adapter doesn't have. Implement the interface when the feature lands.
}

/** 注册项:把 Excel(Univer)接入 AdapterRegistry。app 启动时 registry.register(univerAdapterRegistration)。 */
export const univerAdapterRegistration: AdapterRegistration = {
  format: 'excel',
  engines: ['univer'],
  create: (hostId) => new UniverAdapter(hostId),
};

export { buildXlsxCompiler } from './xlsx-patch.js';
export { GridChangeSetEngine, gridShadow, type GridCell, type GridShadow } from './grid-engine.js';
export { buildGridVerifier, type SheetSnapshot } from './grid-verify.js';
