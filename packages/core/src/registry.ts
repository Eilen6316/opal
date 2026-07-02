/**
 * Adapter registry — routes by format to a HostAdapter, avoiding hardcoded `new UniverAdapter`.
 * New formats (Excel/Word/PPT/drawio/…) only need to register one AdapterRegistration.
 * With multiple candidates, sorted by priority descending (markitdown-style priority).
 */
import type { HostAdapter } from './adapter.js';

export interface AdapterRegistration {
  format: string; // 'excel' | 'word' | 'ppt' | 'drawio' | (string & {})
  engines?: string[]; // engine hints: 'univer' | 'prosemirror' | 'drawio' …
  priority?: number; // higher wins among multiple candidates (default 0)
  create(hostId: string): HostAdapter;
}

export class AdapterRegistry {
  private readonly regs: AdapterRegistration[] = [];

  register(reg: AdapterRegistration): void {
    this.regs.push(reg);
    this.regs.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** Resolve a registration by format (highest-priority match). Returns undefined if none. */
  resolve(format: string): AdapterRegistration | undefined {
    return this.regs.find((r) => r.format === format);
  }

  /** Create an adapter instance directly. Throws if no match. */
  create(format: string, hostId: string): HostAdapter {
    const r = this.resolve(format);
    if (!r) throw new Error(`AdapterRegistry: no adapter registered for format "${format}"`);
    return r.create(hostId);
  }

  formats(): string[] {
    return [...new Set(this.regs.map((r) => r.format))];
  }
}
