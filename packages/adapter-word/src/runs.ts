/**
 * Run-level parsing and splitting inside a <w:p> paragraph — the key to surgical write-back:
 * tokenize the paragraph body into run/non-run tokens, split hit runs precisely by character range,
 * so untouched runs are preserved byte-for-byte (including their fine-grained <w:rPr> formatting),
 * rewriting only the small segment that actually changed.
 */

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** All visible text of a paragraph (every <w:t>, including nested ones e.g. inside hyperlinks), used to decide "does this paragraph contain the quote". */
export function paraText(para: string): string {
  let t = '';
  for (const m of para.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) t += unescapeXml(m[1]!);
  return t;
}

/** Split a <w:p> into its open tag, pPr, and the body after pPr. pPr matching is depth-aware (a nested <w:pPr> may appear inside pPrChange). */
export function parsePara(para: string): { open: string; pPr: string; body: string } {
  const open = /^<w:p\b[^>]*>/.exec(para)?.[0] ?? '<w:p>';
  const inner = para.slice(open.length, para.length - '</w:p>'.length);
  let pPr = '';
  const sc = /^\s*<w:pPr\b[^>]*\/>/.exec(inner); // self-closing pPr
  if (sc) pPr = sc[0];
  else if (/^\s*<w:pPr\b/.test(inner)) {
    // Depth-aware matching: pPrChange can nest <w:pPr>…</w:pPr>, so a single non-greedy match would cut too early
    const re = /<w:pPr\b(?:[^>]*[^/])?>|<\/w:pPr>/g;
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      depth += m[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { pPr = inner.slice(0, re.lastIndex); break; }
    }
  }
  const body = inner.slice(pPr.length);
  return { open, pPr, body };
}

export interface Tok { run: boolean; xml: string; rPr: string; text: string; complex: boolean }

/** Split the body into top-level runs and the non-run fragments between them (bookmarks/hyperlinks etc. preserved as-is). */
export function splitBody(body: string): Tok[] {
  const toks: Tok[] = [];
  const re = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) toks.push({ run: false, xml: body.slice(last, m.index), rPr: '', text: '', complex: false });
    const xml = m[0];
    const rPr = /<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/.exec(xml)?.[0] ?? '';
    let text = '';
    for (const tm of xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) text += unescapeXml(tm[1]!);
    const complex = /<w:(tab|br|cr|drawing|object|pict|fldChar|instrText|sym|noBreakHyphen|softHyphen)\b/.test(xml);
    toks.push({ run: true, xml, rPr, text, complex });
    last = re.lastIndex;
  }
  if (last < body.length) toks.push({ run: false, xml: body.slice(last), rPr: '', text: '', complex: false });
  return toks;
}

const mkRun = (rPr: string, text: string): string => `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

/**
 * Slice on the concatenated run-text range [s,e):
 * before = runs preceding the range (preserved byte-for-byte) + prefix of the hit run;
 * middle = run fragments covered by the range (each with its own rPr, for red-lining/formatting);
 * after  = suffix of the hit run + runs after the range (preserved byte-for-byte).
 * ok=false means the range falls into a complex run (tabs/line breaks/drawings etc.) that cannot be split safely (caller must fall back).
 */
export function sliceRuns(toks: Tok[], s: number, e: number): { before: string; middle: { rPr: string; text: string }[]; after: string; ok: boolean } {
  let pos = 0;
  let before = '';
  let after = '';
  let ok = true;
  const middle: { rPr: string; text: string }[] = [];
  for (const tk of toks) {
    if (!tk.run) { if (pos <= s) before += tk.xml; else after += tk.xml; continue; }
    const L = tk.text.length;
    const start = pos;
    const end = pos + L;
    if (end <= s) before += tk.xml;
    else if (start >= e) after += tk.xml;
    else if (tk.complex) {
      // Hit a complex run (tab/line break/drawing…): keep it whole, do not add it to middle, and set ok=false so the caller falls back to whole-paragraph handling;
      // otherwise its text would be emitted again by spanRedline's delete/insert of the full quote, duplicating/corrupting the body.
      ok = false;
      if (start < s) before += tk.xml; else after += tk.xml;
    } else {
      const a = Math.max(0, s - start);
      const b = Math.min(L, e - start);
      if (a > 0) before += mkRun(tk.rPr, tk.text.slice(0, a));
      middle.push({ rPr: tk.rPr, text: tk.text.slice(a, b) });
      if (b < L) after += mkRun(tk.rPr, tk.text.slice(b));
    }
    pos = end;
  }
  return { before, middle, after, ok };
}

export { mkRun };
