/**
 * 容忍被"输出长度截断"的工具入参 JSON。
 * 模型一次产出过多改动时,propose 入参的 JSON 可能在中途被截断,直接 JSON.parse 会抛
 * "Unterminated string"。这里:正常能 parse 就原样返回;否则尽力抽出 plan + edits/ops 数组里
 * 【已闭合】的条目,丢弃残缺的尾巴 —— 把"整批失败"降级成"应用可解析的部分"。
 */
export interface SalvagedProposal {
  plan?: string;
  edits?: unknown[];
  ops?: unknown[];
  truncated: boolean;
}

/** 从原始(可能截断的)JSON 串里抽取某数组键下【已闭合】的对象条目。 */
function extractArrayItems(raw: string, key: string): unknown[] | undefined {
  const m = new RegExp('"' + key + '"\\s*:\\s*\\[').exec(raw);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const out: unknown[] = [];
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i]!)) i++;
    if (i >= raw.length || raw[i] !== '{') break;
    let depth = 0, inStr = false, esc = false, j = i, closed = false;
    for (; j < raw.length; j++) {
      const c = raw[j]!;
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { j++; closed = true; break; } }
    }
    if (!closed) break; // 残缺尾巴,丢弃
    try { out.push(JSON.parse(raw.slice(i, j))); } catch { break; }
    i = j;
  }
  return out.length ? out : undefined;
}

export function salvageProposalArgs(raw: string): SalvagedProposal {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return { ...o, truncated: false } as SalvagedProposal;
  } catch {
    /* 截断 → 尽力抽取 */
  }
  const planRaw = /"plan"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1];
  let plan: string | undefined;
  if (planRaw != null) { try { plan = JSON.parse('"' + planRaw + '"') as string; } catch { plan = undefined; } }
  const edits = extractArrayItems(raw, 'edits');
  const ops = extractArrayItems(raw, 'ops');
  return { ...(plan != null ? { plan } : {}), ...(edits ? { edits } : {}), ...(ops ? { ops } : {}), truncated: true };
}
