/**
 * Layered conventions — AGENTS.md-like (agents.md open standard): feeds persistent
 * layout/format/style conventions to the Agent in layers, constraining the style of the
 * ChangeSets it produces. Layers: global (user preferences) → workspace (report-set/brand
 * guidelines) → document (override). Concatenation order is global→workspace→document
 * (nearest scope last, prompting the model to let nearer scopes override). Complements
 * SKILL.md (capability library): skills = what it can do, conventions = the rules it follows.
 */
export type ConventionScope = 'global' | 'workspace' | 'document';

const ORDER: Record<ConventionScope, number> = { global: 0, workspace: 1, document: 2 };

export interface Convention {
  scope: ConventionScope;
  text: string;
  source?: string;
}

/** Build a Convention from an AGENTS.md / convention Markdown file (strips any frontmatter, keeps the body). */
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

  /** Render as a snippet injectable into the system prompt (global→workspace→document). Returns '' if empty. */
  render(): string {
    const ordered = this.layers
      .filter((l) => l.text.trim())
      .sort((a, b) => ORDER[a.scope] - ORDER[b.scope]);
    if (!ordered.length) return '';
    const body = ordered.map((l) => `[${l.scope}] ${l.text.trim()}`).join('\n');
    return '约定(就近覆盖,document > workspace > global):\n' + body;
  }
}
