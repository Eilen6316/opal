/**
 * OOXML formatting-property builder — compiles abstract formats (character/paragraph) into <w:rPr>/<w:pPr> child elements,
 * and persists them as reviewable format revisions: <w:rPrChange> (character) / <w:pPrChange> (paragraph) embed the original properties,
 * so Word renders "font/size/bold/alignment/line-spacing/style/shading changes" as native tracked changes that can be accepted/rejected one by one.
 * Clean-room: uses only public OOXML semantics.
 */

/** Character-level formatting (applies to the runs of the selected text). */
export interface CharProps { bold?: boolean; italic?: boolean; underline?: boolean; font?: string; size?: number; color?: string }
/** Paragraph-level formatting (applies to the whole paragraph's pPr). */
export interface ParaProps { align?: 'left' | 'center' | 'right' | 'justify'; lineSpacing?: number; block?: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote'; bgColor?: string }

const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: string): string => { let h = c.replace(/[^0-9a-fA-F]/g, '').toUpperCase(); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); return h.slice(0, 6).padStart(6, '0'); };

/** New rPr child elements + the tag names they override (must be removed from the original rPr). */
export function charElems(p: CharProps): { xml: string; overrides: string[] } {
  const out: string[] = [];
  const ov: string[] = [];
  if (p.bold != null) { out.push(p.bold ? '<w:b/>' : '<w:b w:val="0"/>'); ov.push('w:b'); }
  if (p.italic != null) { out.push(p.italic ? '<w:i/>' : '<w:i w:val="0"/>'); ov.push('w:i'); }
  if (p.underline != null) { out.push(`<w:u w:val="${p.underline ? 'single' : 'none'}"/>`); ov.push('w:u'); }
  if (p.font) { const f = escAttr(p.font); out.push(`<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`); ov.push('w:rFonts'); }
  if (p.size != null) { const s = Math.max(1, Math.round(p.size * 2)); out.push(`<w:sz w:val="${s}"/>`, `<w:szCs w:val="${s}"/>`); ov.push('w:sz', 'w:szCs'); }
  if (p.color) { out.push(`<w:color w:val="${hex(p.color)}"/>`); ov.push('w:color'); }
  return { xml: out.join(''), overrides: ov };
}

const STYLE_ID: Record<string, string> = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', p: 'Normal', blockquote: 'Quote' };

/** New pPr child elements (pStyle must come first) + the overridden tag names. */
export function paraElems(p: ParaProps): { xml: string; overrides: string[]; pStyle: string } {
  const out: string[] = [];
  const ov: string[] = [];
  let pStyle = '';
  if (p.block) { pStyle = `<w:pStyle w:val="${STYLE_ID[p.block] ?? 'Normal'}"/>`; ov.push('w:pStyle'); }
  if (p.align) { const v = p.align === 'justify' ? 'both' : p.align; out.push(`<w:jc w:val="${v}"/>`); ov.push('w:jc'); }
  if (p.lineSpacing != null) { out.push(`<w:spacing w:line="${Math.round(p.lineSpacing * 240)}" w:lineRule="auto"/>`); ov.push('w:spacing'); }
  if (p.bgColor) { out.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex(p.bgColor)}"/>`); ov.push('w:shd'); }
  return { xml: out.join(''), overrides: ov, pStyle };
}

const rxEl = (tag: string): RegExp => { const t = tag.replace(':', '\\:'); return new RegExp(`<${t}\\b[^>]*/>|<${t}\\b[^>]*>[\\s\\S]*?</${t}>`, 'g'); };
/** Remove the given tags (old elements overridden by the new properties) from a chunk of inner XML. */
function stripElems(inner: string, overrides: string[]): string {
  let s = inner;
  for (const tag of overrides) s = s.replace(rxEl(tag), '');
  return s;
}
/** Extract the inner content of '<w:rPr ...>inner</w:rPr>', '<w:rPr/>', or ''. */
function innerOf(el: string): string {
  const t = el.trim();
  if (!t || /^<w:[a-zA-Z]+\b[^>]*\/>$/.test(t)) return '';
  return /^<w:[a-zA-Z]+\b[^>]*>([\s\S]*)<\/w:[a-zA-Z]+>$/.exec(t)?.[1] ?? '';
}

/** Merge character formatting into rPr: keep original non-overridden properties + new ones, and wrap the original rPr inside rPrChange. */
export function mergeRPr(origRPr: string, add: { xml: string; overrides: string[] }, id: number, author: string, date: string): string {
  const orig = origRPr || '<w:rPr/>';
  const cleaned = stripElems(innerOf(origRPr), add.overrides);
  const change = `<w:rPrChange w:id="${id}" w:author="${author}" w:date="${date}">${orig}</w:rPrChange>`;
  return `<w:rPr>${cleaned}${add.xml}${change}</w:rPr>`;
}

/** Merge paragraph formatting into pPr: pStyle first, keep the rest, and wrap the original pPr inside pPrChange (placed last). */
export function mergePPr(origPPr: string, add: { xml: string; overrides: string[]; pStyle: string }, id: number, author: string, date: string): string {
  const orig = origPPr || '<w:pPr/>';
  const cleaned = stripElems(innerOf(origPPr), add.overrides);
  const change = `<w:pPrChange w:id="${id}" w:author="${author}" w:date="${date}">${orig}</w:pPrChange>`;
  return `<w:pPr>${add.pStyle}${cleaned}${add.xml}${change}</w:pPr>`;
}
