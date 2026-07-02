/**
 * sectPr 外科补丁 —— 页面级版式(分栏/页边距/纸张方向)写进 word/document.xml 末尾的节属性。
 * 只动 body 级最后一个 <w:sectPr>(整篇文档的版面),已有标签就地替换、缺失则按 OOXML
 * 元素顺序(pgSz → pgMar → cols)插入;文档其余部分零触碰 —— 与词级红线同一条护城河。
 */

export interface PagePatch {
  /** 分栏数(2=双栏,IEEE/论文版式;1=恢复单栏)。 */
  columns?: number;
  /** 页边距预设。 */
  margin?: 'narrow' | 'normal' | 'moderate' | 'wide';
  /** 纸张方向。 */
  orient?: 'portrait' | 'landscape';
}

/** 页边距预设 → twips(1cm ≈ 567)。与 Word 内置预设对齐。 */
const MARGINS: Record<string, { top: number; right: number; bottom: number; left: number }> = {
  normal: { top: 1440, right: 1800, bottom: 1440, left: 1800 }, // 2.54 / 3.18 cm(Word 默认)
  narrow: { top: 720, right: 720, bottom: 720, left: 720 }, // 1.27 cm
  moderate: { top: 1440, right: 1080, bottom: 1440, left: 1080 }, // 2.54 / 1.91 cm
  wide: { top: 1440, right: 2880, bottom: 1440, left: 2880 }, // 2.54 / 5.08 cm
};

const setAttr = (tag: string, name: string, value: string): string => {
  const re = new RegExp(`${name}="[^"]*"`);
  if (re.test(tag)) return tag.replace(re, `${name}="${value}"`);
  return tag.replace(/\/>$|>$/, (m) => ` ${name}="${value}"${m}`);
};

/** 对 document.xml 应用页面级补丁;返回新 xml 与是否发生变化。 */
export function patchSectPr(xml: string, patch: PagePatch): { xml: string; changed: boolean } {
  if (patch.columns == null && !patch.margin && !patch.orient) return { xml, changed: false };
  // body 级 sectPr = </w:body> 前的最后一个;没有就造一个最小的
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodyEnd < 0) return { xml, changed: false };
  const sectRe = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g;
  let last: { start: number; end: number; text: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = sectRe.exec(xml))) { if (m.index < bodyEnd) last = { start: m.index, end: m.index + m[0].length, text: m[0] }; }

  let sect = last ? (last.text.endsWith('/>') ? last.text.replace(/\/>$/, '></w:sectPr>').replace('></w:sectPr>', '></w:sectPr>') : last.text) : '<w:sectPr></w:sectPr>';
  if (sect.endsWith('/>')) sect = sect.slice(0, -2) + '></w:sectPr>';

  const inner = (): string => /<w:sectPr\b[^>]*>([\s\S]*)<\/w:sectPr>/.exec(sect)?.[1] ?? '';
  const replaceTag = (tag: string, next: string | null, insertAfter: string[]): void => {
    const re = new RegExp(`<w:${tag}\\b[^>]*/?>(?:[\\s\\S]*?</w:${tag}>)?`);
    const body = inner();
    if (re.test(body)) {
      sect = sect.replace(body, next == null ? body.replace(re, '') : body.replace(re, next));
      return;
    }
    if (next == null) return;
    // 按元素顺序插入:紧跟 insertAfter 里最后一个已存在的标签;都不存在就放最前
    for (const after of insertAfter) {
      const ar = new RegExp(`<w:${after}\\b[^>]*/?>(?:[\\s\\S]*?</w:${after}>)?`);
      const am = ar.exec(inner());
      if (am) { sect = sect.replace(am[0], am[0] + next); return; }
    }
    sect = sect.replace(/<w:sectPr\b[^>]*>/, (s) => s + next);
  };

  // 纸张方向:改 pgSz 的 orient 并保证宽高与方向一致(横向 w>h)
  if (patch.orient) {
    const body = inner();
    const pg = /<w:pgSz\b[^>]*\/?>/.exec(body)?.[0] ?? '<w:pgSz w:w="11906" w:h="16838"/>'; // A4 纵向默认
    const w = parseInt(/w:w="(\d+)"/.exec(pg)?.[1] ?? '11906', 10);
    const h = parseInt(/w:h="(\d+)"/.exec(pg)?.[1] ?? '16838', 10);
    const landscape = patch.orient === 'landscape';
    const [nw, nh] = landscape === w > h ? [w, h] : [h, w]; // 方向不符则交换宽高
    let next = setAttr(setAttr(pg, 'w:w', String(nw)), 'w:h', String(nh));
    next = landscape ? setAttr(next, 'w:orient', 'landscape') : next.replace(/\s*w:orient="[^"]*"/, '');
    replaceTag('pgSz', next, []);
  }
  // 页边距:整组替换(保留已有 header/footer/gutter)
  if (patch.margin && MARGINS[patch.margin]) {
    const mg = MARGINS[patch.margin]!;
    const body = inner();
    const old = /<w:pgMar\b[^>]*\/?>/.exec(body)?.[0] ?? '<w:pgMar w:header="851" w:footer="992" w:gutter="0"/>';
    let next = old;
    next = setAttr(next, 'w:top', String(mg.top));
    next = setAttr(next, 'w:right', String(mg.right));
    next = setAttr(next, 'w:bottom', String(mg.bottom));
    next = setAttr(next, 'w:left', String(mg.left));
    replaceTag('pgMar', next, ['pgSz']);
  }
  // 分栏:cols(等宽,栏间距 425 twips ≈ 0.75cm);1 栏=移除 num(Word 默认单栏)
  if (patch.columns != null) {
    const n = Math.max(1, Math.min(3, Math.floor(patch.columns)));
    const next = n <= 1 ? '<w:cols w:space="425"/>' : `<w:cols w:num="${n}" w:space="425" w:equalWidth="1"/>`;
    replaceTag('cols', next, ['pgMar', 'pgSz']);
  }

  let out: string;
  if (last) out = xml.slice(0, last.start) + sect + xml.slice(last.end);
  else out = xml.slice(0, bodyEnd) + sect + xml.slice(bodyEnd);
  return { xml: out, changed: out !== xml };
}
