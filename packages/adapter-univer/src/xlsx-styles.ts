/**
 * xl/styles.xml 编辑器 —— 把抽象格式(加粗/斜体/字色/填充/对齐/数字格式)登记成
 * numFmt / font / fill + 一条 cellXfs <xf>,返回单元格应使用的新 s 索引。
 *
 * 设计:
 *  - 就地补丁:只重写 numFmts/fonts/fills/cellXfs 四个 section,其余(borders/cellStyleXfs/
 *    cellStyles/dxfs/tableStyles…)原样保留,绝不整段重排丢字段。
 *  - 继承基样式:新 <xf> 以单元格原 s 指向的 xf 为底,只覆盖被改动的属性(颜色/字号/名称尽量沿用)。
 *  - 去重:相同的 numFmt/font/fill/xf 复用已存在索引,不重复登记。
 *  - 缺省合成:遇到 <styleSheet/>(空)时合成最小合法骨架(Excel 要求 fills[0]=none、fills[1]=gray125)。
 */

export interface AbstractCellStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string; // 字体色 #rrggbb
  bgColor?: string; // 填充色 #rrggbb
  align?: 'left' | 'center' | 'right';
  numberFormat?: string; // 数字格式,如 0% / "¥"#,##0.00
}

const DEFAULT_FONT = '<font><sz val="11"/><name val="Calibri"/></font>';
const DEFAULT_FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
];
const DEFAULT_BORDER = '<border/>';
const DEFAULT_STYLE_XF = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>';
const DEFAULT_CELL_XF = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';

/** #abc / #aabbcc → AARRGGBB(默认不透明 FF)。 */
export function toArgb(color: string): string {
  let h = color.replace(/^#/, '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) h = 'FF' + h;
  return h.toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const attrOf = (el: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(el)?.[1];

/** 取出某 section 的子元素数组;section 不存在返回 null,自闭合返回 []。 */
function sectionItems(xml: string, tag: string, itemTag: string): string[] | null {
  const open = new RegExp(`<${tag}\\b[^>]*?(/?)>`).exec(xml);
  if (!open) return null;
  if (open[1] === '/') return [];
  const start = open.index + open[0].length;
  const end = xml.indexOf(`</${tag}>`, start);
  if (end < 0) return [];
  const inner = xml.slice(start, end);
  const re = new RegExp(`<${itemTag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${itemTag}>)`, 'g');
  return [...inner.matchAll(re)].map((m) => m[0]);
}

interface FontModel {
  bold?: boolean;
  italic?: boolean;
  sz?: string;
  name?: string;
  colorRgb?: string;
}
function parseFont(el: string): FontModel {
  return {
    bold: /<b\b[^>]*\/?>/.test(el),
    italic: /<i\b[^>]*\/?>/.test(el),
    sz: attrOf(/<sz\b[^>]*\/?>/.exec(el)?.[0] ?? '', 'val'),
    name: attrOf(/<name\b[^>]*\/?>/.exec(el)?.[0] ?? '', 'val'),
    colorRgb: attrOf(/<color\b[^>]*\/?>/.exec(el)?.[0] ?? '', 'rgb'),
  };
}
function buildFont(m: FontModel): string {
  let s = '<font>';
  if (m.bold) s += '<b/>';
  if (m.italic) s += '<i/>';
  if (m.sz) s += `<sz val="${m.sz}"/>`;
  else s += '<sz val="11"/>';
  if (m.colorRgb) s += `<color rgb="${m.colorRgb}"/>`;
  if (m.name) s += `<name val="${m.name}"/>`;
  else s += '<name val="Calibri"/>';
  s += '</font>';
  return s;
}

interface XfModel {
  numFmtId: string;
  fontId: string;
  fillId: string;
  borderId: string;
  xfId: string;
  alignment?: string; // 完整 <alignment .../> 子元素
}
function parseXf(el: string): XfModel {
  const align = /<alignment\b[^>]*\/>/.exec(el)?.[0] ?? /<alignment\b[\s\S]*?<\/alignment>/.exec(el)?.[0];
  return {
    numFmtId: attrOf(el, 'numFmtId') ?? '0',
    fontId: attrOf(el, 'fontId') ?? '0',
    fillId: attrOf(el, 'fillId') ?? '0',
    borderId: attrOf(el, 'borderId') ?? '0',
    xfId: attrOf(el, 'xfId') ?? '0',
    ...(align ? { alignment: align } : {}),
  };
}

export class XlsxStyles {
  private numFmts: string[];
  private fonts: string[];
  private fills: string[];
  private cellXfs: string[];
  dirty = false;

  constructor(private readonly originalXml: string) {
    this.numFmts = sectionItems(originalXml, 'numFmts', 'numFmt') ?? [];
    this.fonts = sectionItems(originalXml, 'fonts', 'font') ?? [];
    this.fills = sectionItems(originalXml, 'fills', 'fill') ?? [];
    this.cellXfs = sectionItems(originalXml, 'cellXfs', 'xf') ?? [];
    if (!this.fonts.length) this.fonts = [DEFAULT_FONT];
    if (!this.fills.length) this.fills = [...DEFAULT_FILLS];
    if (!this.cellXfs.length) this.cellXfs = [DEFAULT_CELL_XF];
  }

  private nextNumFmtId(): number {
    let max = 163; // 自定义 numFmtId 从 164 起
    for (const el of this.numFmts) {
      const id = parseInt(attrOf(el, 'numFmtId') ?? '0', 10);
      if (id > max) max = id;
    }
    return max + 1;
  }
  private ensureNumFmt(code: string): string {
    for (const el of this.numFmts) {
      if (attrOf(el, 'formatCode') === escapeXml(code)) return attrOf(el, 'numFmtId')!;
    }
    const id = String(this.nextNumFmtId());
    this.numFmts.push(`<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`);
    this.dirty = true;
    return id;
  }
  private ensureItem(arr: string[], el: string): number {
    const i = arr.indexOf(el);
    if (i >= 0) return i;
    arr.push(el);
    this.dirty = true;
    return arr.length - 1;
  }

  /** 以 baseIdx(单元格原 s)为底应用 style,返回应写入单元格的新 s 索引。 */
  resolveXf(baseIdx: number | undefined, style: AbstractCellStyle): number {
    const base = parseXf(this.cellXfs[baseIdx ?? 0] ?? this.cellXfs[0] ?? DEFAULT_CELL_XF);
    let { numFmtId, fontId, fillId } = base;

    const wantNumFmt = style.numberFormat != null;
    if (wantNumFmt) numFmtId = this.ensureNumFmt(style.numberFormat!);

    const wantFont = style.bold != null || style.italic != null || style.color != null;
    if (wantFont) {
      const fm = parseFont(this.fonts[parseInt(base.fontId, 10)] ?? this.fonts[0] ?? DEFAULT_FONT);
      if (style.bold != null) fm.bold = style.bold;
      if (style.italic != null) fm.italic = style.italic;
      if (style.color != null) fm.colorRgb = toArgb(style.color);
      fontId = String(this.ensureItem(this.fonts, buildFont(fm)));
    }

    const wantFill = style.bgColor != null;
    if (wantFill) {
      const fill = `<fill><patternFill patternType="solid"><fgColor rgb="${toArgb(style.bgColor!)}"/><bgColor indexed="64"/></patternFill></fill>`;
      fillId = String(this.ensureItem(this.fills, fill));
    }

    const wantAlign = style.align != null;
    const alignment = wantAlign ? `<alignment horizontal="${style.align!}"/>` : base.alignment;

    const flags = [
      `numFmtId="${numFmtId}"`,
      `fontId="${fontId}"`,
      `fillId="${fillId}"`,
      `borderId="${base.borderId}"`,
      `xfId="${base.xfId}"`,
    ];
    if (wantNumFmt) flags.push('applyNumberFormat="1"');
    if (wantFont) flags.push('applyFont="1"');
    if (wantFill) flags.push('applyFill="1"');
    if (wantAlign) flags.push('applyAlignment="1"');
    const open = `<xf ${flags.join(' ')}`;
    const xf = alignment ? `${open}>${alignment}</xf>` : `${open}/>`;
    return this.ensureItem(this.cellXfs, xf);
  }

  /** 把改动后的四个 section 写回 styles.xml(其余 section 原样保留);未改动则原样返回。 */
  toXml(): string {
    if (!this.dirty) return this.originalXml;
    const selfClosing = /<styleSheet\b[^>]*\/>/.exec(this.originalXml);
    if (selfClosing) {
      const attrs = selfClosing[0].replace(/^<styleSheet/, '').replace(/\/>$/, '');
      const body =
        (this.numFmts.length ? section('numFmts', this.numFmts) : '') +
        section('fonts', this.fonts) +
        section('fills', this.fills) +
        `<borders count="1">${DEFAULT_BORDER}</borders>` +
        `<cellStyleXfs count="1">${DEFAULT_STYLE_XF}</cellStyleXfs>` +
        section('cellXfs', this.cellXfs);
      const built = `<styleSheet${attrs}>${body}</styleSheet>`;
      return this.originalXml.slice(0, selfClosing.index) + built + this.originalXml.slice(selfClosing.index + selfClosing[0].length);
    }
    let xml = this.originalXml;
    xml = replaceSection(xml, 'fonts', this.fonts);
    xml = replaceSection(xml, 'fills', this.fills);
    xml = replaceSection(xml, 'cellXfs', this.cellXfs);
    if (this.numFmts.length) {
      const existing = new RegExp('<numFmts\\b[^>]*?(/?)>').exec(xml);
      if (existing) xml = replaceSection(xml, 'numFmts', this.numFmts);
      else {
        const fontsAt = /<fonts\b/.exec(xml);
        if (fontsAt) xml = xml.slice(0, fontsAt.index) + section('numFmts', this.numFmts) + xml.slice(fontsAt.index);
      }
    }
    return xml;
  }
}

function section(tag: string, items: string[]): string {
  return `<${tag} count="${items.length}">${items.join('')}</${tag}>`;
}
/** 就地替换某 section 的整体内容(保留其余 XML);section 不存在则原样返回。 */
function replaceSection(xml: string, tag: string, items: string[]): string {
  const open = new RegExp(`<${tag}\\b[^>]*?(/?)>`).exec(xml);
  if (!open) return xml;
  const body = section(tag, items);
  if (open[1] === '/') {
    return xml.slice(0, open.index) + body + xml.slice(open.index + open[0].length);
  }
  const close = `</${tag}>`;
  const closeIdx = xml.indexOf(close, open.index);
  if (closeIdx < 0) return xml;
  return xml.slice(0, open.index) + body + xml.slice(closeIdx + close.length);
}
