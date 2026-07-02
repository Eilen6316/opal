/**
 * DrawioAdapter — drawio diagram adapter (stub). Next format to plug into the abstraction layer.
 *
 * Planned mapping (to be implemented):
 *  - Left pane embeds self-hosted drawio (Apache-2.0) via react-drawio, remote-controlled
 *    through postMessage load/merge/export;
 *  - anchors():  get-selected-cell semantics → mxCell id as LogicalAnchor (portable.kind='object',
 *                slide=diagram index, elementId=cell id); ids are stable across edits.
 *  - changes():  ChangeSet object-family ops add/delete/setObjectProps/move → mxgraph.applyEditsToModel.
 *  - writebacks(): DrawioSurgicalWriteback (single XML, only mutates the target <diagram>).
 *
 * See .work/references.md (high-star repo survey: drawio integration approach).
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

/** Registration entry: wires drawio into AdapterRegistry. App calls registry.register(drawioAdapterRegistration) at startup. */
export const drawioAdapterRegistration: AdapterRegistration = {
  format: 'drawio',
  engines: ['drawio'],
  create: (hostId) => new DrawioAdapter(hostId),
};

export { DrawioSurgicalWriteback } from './writeback.js';
export * from './mxgraph.js';
