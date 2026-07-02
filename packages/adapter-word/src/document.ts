/**
 * Surgical transform of word/document.xml: locate the target text within a paragraph and rewrite
 * only the hit range at the run level, as native Word tracked changes:
 *  - Text rewrite -> word-level <w:ins>/<w:del> (keeps each hit run's <w:rPr>; untouched runs preserved byte-for-byte);
 *  - Character formatting (bold/font/size/color...) -> <w:rPr> + <w:rPrChange> (reviewable format revision);
 *  - Paragraph formatting (alignment/line spacing/style/shading) -> <w:pPr> + <w:pPrChange>.
 * All other paragraphs pass through unchanged -- combined with surgical write-back (only document.xml
 * is modified), this is "OOXML surgical-grade" persistence.
 * v1's defect (flattening the whole hit paragraph, losing per-run formatting) is fixed: the whole-paragraph
 * fallback is used only when the hit involves a complex run (tabs/drawings, etc.).
 */
import { buildRedlineXml, diffWords, type RedlineOptions } from './redline.js';
import { charElems, paraElems, mergeRPr, mergePPr, type CharProps, type ParaProps } from './style.js';
import { esc, paraText, parsePara, splitBody, sliceRuns } from './runs.js';

/** Text rewrite (compatible with the legacy signature). */
export interface ParaEdit { old: string; new: string }
/** Format revision (character and/or paragraph; both may coexist). */
export interface FmtEdit { kind: 'fmt'; quote: string; char?: CharProps; para?: ParaProps }
export type DocEdit = ParaEdit | FmtEdit;

const isText = (e: DocEdit): e is ParaEdit => 'old' in e;
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Ctx { id: number; author: string; authorRaw: string; date: string }

/** Word-level redline within the range; preserves formatting per run's rPr: equal/del segments carry their original rPr (unchanged text keeps its formatting), ins uses the rPr at the current old-text offset. */
function spanRedline(middle: { rPr: string; text: string }[], newS: string, ctx: Ctx): string {
  const oldS = middle.map((m) => m.text).join('');
  const charRPr: string[] = [];
  for (const m of middle) for (let i = 0; i < m.text.length; i++) charRPr.push(m.rPr);
  const first = middle[0]?.rPr ?? '';
  let pos = 0; // offset into oldS
  const byRPr = (text: string, make: (rPr: string, t: string) => string): string => {
    let out = '';
    let i = 0;
    while (i < text.length) {
      const rPr = charRPr[pos + i] ?? first;
      let j = i + 1;
      while (j < text.length && (charRPr[pos + j] ?? first) === rPr) j++;
      out += make(rPr, text.slice(i, j));
      i = j;
    }
    pos += text.length;
    return out;
  };
  return diffWords(oldS, newS)
    .map((seg) => {
      if (seg.op === 'equal') return byRPr(seg.text, (rPr, t) => `<w:r>${rPr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`);
      if (seg.op === 'del') return byRPr(seg.text, (rPr, t) => `<w:del w:id="${ctx.id++}" w:author="${ctx.author}" w:date="${ctx.date}"><w:r>${rPr}<w:delText xml:space="preserve">${esc(t)}</w:delText></w:r></w:del>`);
      const insRPr = charRPr[Math.min(pos, charRPr.length - 1)] ?? first;
      return `<w:ins w:id="${ctx.id++}" w:author="${ctx.author}" w:date="${ctx.date}"><w:r>${insRPr}<w:t xml:space="preserve">${esc(seg.text)}</w:t></w:r></w:ins>`;
    })
    .join('');
}

/** Whole-paragraph fallback when the hit involves a complex run (loses per-run formatting; rare). */
function flattenReplace(full: string, quote: string, next: string, ctx: Ctx): string {
  const revised = full.replace(quote, () => next); // function replacement: $ sequences in `next` are treated literally
  const xml = buildRedlineXml(full, revised, { author: ctx.authorRaw, date: ctx.date, idStart: ctx.id });
  ctx.id += diffWords(full, revised).filter((x) => x.op !== 'equal').length;
  return xml;
}

/** Try to apply one edit to a paragraph; returns null if the quote is not in this paragraph. */
function tryApply(para: string, edit: DocEdit, ctx: Ctx): string | null {
  const quote = isText(edit) ? edit.old : edit.quote;
  if (!quote) return null;
  const full = paraText(para);
  if (!full.includes(quote)) return null;

  const { open, pPr, body } = parsePara(para);
  const toks = splitBody(body);
  const runText = toks.filter((t) => t.run).map((t) => t.text).join('');
  const s = runText.indexOf(quote);

  let newPPr = pPr;
  let newBody = body;
  let changed = false;

  // Paragraph-level formatting (modifies pPr directly)
  if (!isText(edit) && edit.para) {
    newPPr = mergePPr(pPr, paraElems(edit.para), ctx.id++, ctx.author, ctx.date);
    changed = true;
  }

  if (isText(edit)) {
    if (s >= 0) {
      const sl = sliceRuns(toks, s, s + quote.length);
      if (sl.ok && sl.middle.length) newBody = sl.before + spanRedline(sl.middle, edit.new, ctx) + sl.after;
      else newBody = flattenReplace(full, quote, edit.new, ctx); // complex run -> whole-paragraph fallback
    } else {
      newBody = flattenReplace(full, quote, edit.new, ctx); // quote lives in nested content -> whole-paragraph fallback
    }
    changed = true;
  } else if (edit.char) {
    if (s >= 0) {
      const sl = sliceRuns(toks, s, s + quote.length);
      if (sl.ok && sl.middle.length) {
        const add = charElems(edit.char);
        newBody = sl.before + sl.middle.map((p) => `<w:r>${mergeRPr(p.rPr, add, ctx.id++, ctx.author, ctx.date)}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r>`).join('') + sl.after;
        changed = true;
      }
    }
  }

  if (!changed) return null;
  return open + newPPr + newBody + '</w:p>';
}

/** Apply a set of edits to document.xml; each edit locates its first matching paragraph and rewrites it surgically. */
export function redlineDocumentXml(documentXml: string, edits: DocEdit[], opts: RedlineOptions = {}): { xml: string; changed: number } {
  const authorRaw = opts.author ?? 'OtterPatch';
  const ctx: Ctx = { id: opts.idStart ?? 1, author: escAttr(authorRaw), authorRaw, date: opts.date ?? '1970-01-01T00:00:00Z' };
  let xml = documentXml;
  let changed = 0;
  for (const edit of edits) {
    let applied = false;
    // Match both self-closing empty paragraphs <w:p .../> (common in Word) and regular <w:p>...</w:p>, so an empty paragraph doesn't swallow the next one
    xml = xml.replace(/<w:p\b[^>]*\/>|<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
      if (applied) return para;
      const res = tryApply(para, edit, ctx);
      if (res == null) return para;
      applied = true;
      return res;
    });
    if (applied) changed++;
  }
  return { xml, changed };
}
