/**
 * DrawioAdapter —— drawio 图形适配器(桩)。下一个格式,接入抽象层。
 *
 * 落地映射(待实现):
 *  - 左侧用 react-drawio 嵌入自托管 drawio(Apache-2.0),postMessage load/merge/export 远控;
 *  - anchors():  get-selected-cell 语义 → mxCell id 作 LogicalAnchor(portable.kind='object',
 *                slide=diagram 序号, elementId=cell id);id 跨编辑稳定。
 *  - changes():  ChangeSet 的 object 族 add/delete/setObjectProps/move → mxgraph.applyEditsToModel。
 *  - writebacks(): DrawioSurgicalWriteback(单 XML、只改目标 <diagram>)。
 *
 * 详见 .work/references.md(高星仓库调研:drawio 接入方案)。
 */
import type {
  AdapterRegistration,
  AnchorService,
  CapabilitySet,
  ChangeSetEngine,
  HostAdapter,
  HostMeta,
  WritebackBackend,
} from '@otterpatch/core';
import { DrawioSurgicalWriteback } from './writeback.js';

const TODO = (what: string): never => {
  throw new Error(`DrawioAdapter: ${what}() not implemented yet`);
};

export class DrawioAdapter implements HostAdapter {
  readonly hostId: string;
  readonly meta: HostMeta = { format: 'drawio', engine: 'drawio', headless: true };

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
    return TODO('changes');
  }
  writebacks(): readonly WritebackBackend[] {
    return [new DrawioSurgicalWriteback()];
  }
  dispose(): void {
    /* no-op */
  }
  // Optional capabilities are intentionally not declared — no throwing stubs advertising
  // support that doesn't exist. Implement Projection/Shadow/LiveDoc/Overlay when they land.
}

/** 注册项:把 drawio 接入 AdapterRegistry。app 启动时 registry.register(drawioAdapterRegistration)。 */
export const drawioAdapterRegistration: AdapterRegistration = {
  format: 'drawio',
  engines: ['drawio'],
  create: (hostId) => new DrawioAdapter(hostId),
};

export { DrawioSurgicalWriteback } from './writeback.js';
export * from './mxgraph.js';
