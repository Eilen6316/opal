/**
 * 分层约定层 —— 类 AGENTS.md(agents.md 开放标准):把"持久的排版/格式/风格约定"分层喂给 Agent,
 * 约束它产出的 ChangeSet 风格。层级:全局(用户偏好)→ 工作区(本套报表/品牌规范)→ 单文档(override)。
 * 拼接顺序 global→workspace→document(就近在后,提示模型就近覆盖)。与 SKILL.md(能力库)互补:
 * 技能=会做什么,约定=按什么规矩做。
 */
export type ConventionScope = 'global' | 'workspace' | 'document';

const ORDER: Record<ConventionScope, number> = { global: 0, workspace: 1, document: 2 };

export interface Convention {
  scope: ConventionScope;
  text: string;
  source?: string;
}

/** 从一份 AGENTS.md / 约定 Markdown 造一个 Convention(去掉可能的 frontmatter,取正文)。 */
export function conventionFromMarkdown(md: string, scope: ConventionScope, source?: string): Convention {
  const body = md.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  return { scope, text: body, source };
}

export class ConventionStack {
  private readonly layers: Convention[] = [];

  constructor(layers: Convention[] = []) {
    for (const l of layers) this.add(l);
  }

  add(c: Convention): this {
    this.layers.push(c);
    return this;
  }

  all(): readonly Convention[] {
    return this.layers;
  }

  /** 拼成可注入系统提示的片段(global→workspace→document)。无内容返回空串。 */
  render(): string {
    const ordered = this.layers
      .filter((l) => l.text.trim())
      .sort((a, b) => ORDER[a.scope] - ORDER[b.scope]);
    if (!ordered.length) return '';
    const body = ordered.map((l) => `[${l.scope}] ${l.text.trim()}`).join('\n');
    return '约定(就近覆盖,document > workspace > global):\n' + body;
  }
}
