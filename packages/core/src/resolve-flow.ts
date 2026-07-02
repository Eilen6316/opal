/**
 * Flow anchor resolver — implements PortableLocator.flow's context-anchored addressing
 * with no reliance on line numbers/offsets.
 * Approach inspired by codex's V4A apply_patch (context anchors instead of line numbers,
 * resilient to document drift); clean-room rewrite.
 * Three-level fallback: (1) exact text + context scoring -> (2) whitespace/CRLF-insensitive
 * -> (3) context-only matching (body text was modified).
 * The returned confidence drives anchor.ts's RebaseResult (tracked/shifted/fuzzy/detached).
 */
export interface FlowQuote {
  prefix: string;
  text: string;
  suffix: string;
}

export interface FlowMatch {
  start: number;
  end: number;
  confidence: number; // 1 = exact match with matching context ... 0 = none
  mode: 'exact' | 'ws-insensitive' | 'context-only';
}

function allIndices(h: string, n: string): number[] {
  const out: number[] = [];
  if (!n) return out;
  let i = h.indexOf(n);
  while (i >= 0) {
    out.push(i);
    i = h.indexOf(n, i + 1);
  }
  return out;
}
function commonSuffixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}
function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Locate a flow anchor quote in the current document text; returns the matched range + confidence, or null if unresolvable. */
export function resolveFlow(doc: string, quote: FlowQuote): FlowMatch | null {
  const { prefix, text, suffix } = quote;
  if (!text) return null;

  // (1) Exact text: disambiguate multiple hits via context scoring
  const occ = allIndices(doc, text);
  if (occ.length) {
    let best = occ[0]!;
    let bestScore = -1;
    let ties = 0;
    for (const idx of occ) {
      const before = doc.slice(Math.max(0, idx - prefix.length), idx);
      const after = doc.slice(idx + text.length, idx + text.length + suffix.length);
      const total = prefix.length + suffix.length;
      const ctx = total === 0 ? 1 : (commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix)) / total;
      if (ctx > bestScore) {
        bestScore = ctx;
        best = idx;
        ties = 1;
      } else if (ctx === bestScore) {
        ties++;
      }
    }
    const confidence = Math.max(0, 0.6 + 0.4 * bestScore - (ties > 1 ? 0.1 : 0));
    return { start: best, end: best + text.length, confidence, mode: 'exact' };
  }

  // (2) Whitespace/CRLF-insensitive: whitespace runs inside the text may drift (e.g. "a b" <-> "a\nb")
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const re = new RegExp(tokens.map(escapeRe).join('\\s+'));
    const m = re.exec(doc);
    if (m) return { start: m.index, end: m.index + m[0].length, confidence: 0.85, mode: 'ws-insensitive' };
  }

  // (3) Context-only: body text was modified but prefix...suffix still exist -> match the modified span between them
  if (prefix && suffix) {
    const p = doc.indexOf(prefix);
    if (p >= 0) {
      const s = doc.indexOf(suffix, p + prefix.length);
      if (s >= 0) return { start: p + prefix.length, end: s, confidence: 0.4, mode: 'context-only' };
    }
  }
  return null;
}

/** Map confidence to RebaseResult status tiers. */
export function flowConfidenceToStatus(confidence: number): 'tracked' | 'shifted' | 'fuzzy' | 'detached' {
  if (confidence >= 0.95) return 'tracked';
  if (confidence >= 0.8) return 'shifted';
  if (confidence >= 0.45) return 'fuzzy';
  return 'detached';
}
