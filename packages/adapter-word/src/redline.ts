/**
 * Word redline (track-changes) generation — compiles a word-level diff of "original → revised"
 * into native Word revision markup: deletion → <w:del><w:delText>; insertion → <w:ins><w:r><w:t>;
 * unchanged → plain <w:r><w:t>.
 * This way Agent edits land in Word as native revisions that can be accepted/rejected one by one,
 * rather than direct text mutation — matching OtterPatch's "reviewable safe execution".
 * Clean-room implementation (uses only public OOXML semantics; copies no proprietary skill text).
 */
export interface RedlineOptions {
  author?: string;
  date?: string; // ISO, e.g. 2026-01-01T00:00:00Z (supplied by caller to keep output deterministic)
  idStart?: number;
}

export interface DiffSeg {
  op: 'equal' | 'del' | 'ins';
  text: string;
}

function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? [];
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Word-level LCS diff → equal/del/ins segments (adjacent segments with the same op are merged). */
export function diffWords(a: string, b: string): DiffSeg[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const raw: DiffSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      raw.push({ op: 'equal', text: A[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      raw.push({ op: 'del', text: A[i]! });
      i++;
    } else {
      raw.push({ op: 'ins', text: B[j]! });
      j++;
    }
  }
  while (i < n) raw.push({ op: 'del', text: A[i++]! });
  while (j < m) raw.push({ op: 'ins', text: B[j++]! });

  const out: DiffSeg[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.op === seg.op) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

/** Compile the diff into an in-paragraph OOXML revision run string (embedded inside a <w:p> in word/document.xml). */
export function buildRedlineXml(original: string, revised: string, opts: RedlineOptions = {}): string {
  const author = esc(opts.author ?? 'OtterPatch');
  const date = opts.date ?? '1970-01-01T00:00:00Z';
  let id = opts.idStart ?? 1;
  const run = (txt: string): string => `<w:r><w:t xml:space="preserve">${esc(txt)}</w:t></w:r>`;
  return diffWords(original, revised)
    .map((seg) => {
      if (seg.op === 'equal') return run(seg.text);
      if (seg.op === 'del') {
        return `<w:del w:id="${id++}" w:author="${author}" w:date="${date}"><w:r><w:delText xml:space="preserve">${esc(seg.text)}</w:delText></w:r></w:del>`;
      }
      return `<w:ins w:id="${id++}" w:author="${author}" w:date="${date}"><w:r><w:t xml:space="preserve">${esc(seg.text)}</w:t></w:r></w:ins>`;
    })
    .join('');
}
