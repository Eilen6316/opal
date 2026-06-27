/**
 * 适配器注册表 —— 按格式路由到 HostAdapter,避免硬编码 new UniverAdapter。
 * 新格式(Excel/Word/PPT/drawio/…)只需 register 一个 AdapterRegistration。
 * 多候选时按 priority 降序(markitdown 式优先级)。
 */
import type { HostAdapter } from './adapter.js';

export interface AdapterRegistration {
  format: string; // 'excel' | 'word' | 'ppt' | 'drawio' | (string & {})
  engines?: string[]; // 引擎提示:'univer' | 'prosemirror' | 'drawio' …
  priority?: number; // 多候选时高者优先(默认 0)
  create(hostId: string): HostAdapter;
}

export class AdapterRegistry {
  private readonly regs: AdapterRegistration[] = [];

  register(reg: AdapterRegistration): void {
    this.regs.push(reg);
    this.regs.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** 按格式解析注册项(取优先级最高的匹配)。无匹配返回 undefined。 */
  resolve(format: string): AdapterRegistration | undefined {
    return this.regs.find((r) => r.format === format);
  }

  /** 直接造一个适配器实例。无匹配抛错。 */
  create(format: string, hostId: string): HostAdapter {
    const r = this.resolve(format);
    if (!r) throw new Error(`AdapterRegistry: no adapter registered for format "${format}"`);
    return r.create(hostId);
  }

  formats(): string[] {
    return [...new Set(this.regs.map((r) => r.format))];
  }
}
