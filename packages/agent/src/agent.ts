/**
 * Agent —— 意图 → ChangeSet 的入口。按 req.format 选 HostDialect,并把
 * 约定层(ConventionStack:怎么做的规矩)与技能库(SkillLibrary:会做什么)按需注入系统提示
 * (渐进披露)。后续接技能脚本执行、能力协商、影子校验、失败回喂重试。
 */
import type { ChangeSet } from '@opal/core';
import type { SkillLibrary } from '@opal/skills';
import type { ConventionStack } from './conventions.js';
import { DIALECTS } from './dialects.js';
import type { HostDialect, ModelClient, ProposeRequest } from './model.js';

export class Agent {
  constructor(
    private readonly model: ModelClient,
    private readonly dialects: Record<string, HostDialect> = DIALECTS,
    private readonly skills?: SkillLibrary,
    private readonly conventions?: ConventionStack,
  ) {}

  async propose(req: ProposeRequest): Promise<ChangeSet> {
    const dialect = this.dialects[req.format];
    if (!dialect) throw new Error(`Agent: no dialect for format "${req.format}"`);

    const parts = [dialect.systemPrompt];
    const conv = this.conventions?.render();
    if (conv) parts.push(conv);
    const skl = this.skills?.render(req.format, req.intent);
    if (skl) parts.push(skl);

    const d: HostDialect = parts.length > 1 ? { ...dialect, systemPrompt: parts.join('\n\n') } : dialect;
    return this.model.proposeChangeSet(req, d);
  }
}
