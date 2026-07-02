/**
 * docx → HTML 导入(浏览器侧):真实 .docx 载入 Word 工作区,补上 hero 闭环缺的那一段——
 * 上传 → 工作区渲染 → 圈选/提案/行内审阅 → 外科写回 → 下载。
 * 解析口径与 adapter-word 一致(正则走 OOXML 文本),只求"常见文档看得对":
 * 段落(pStyle 标题/对齐/行距)+ run(加粗/斜体/下划线/删除线/字号/字体/颜色/高亮)。
 * 表格/图片/脚注等复杂构件 v1 先降级为占位说明,不静默丢内容。
 */
import { unzipSync, strFromU8 } from 'fflate';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** 取 <w:xxx w:val="…"/> 的 val。 */
const val = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<w:${tag}\\b[^>]*w:val="([^"]*)"`).exec(xml);
  return m ? m[1]! : null;
};
const has = (xml: string, tag: string): boolean => {
  const m = new RegExp(`<w:${tag}\\b([^>]*)/?>`).exec(xml);
  if (!m) return false;
  const v = /w:val="([^"]*)"/.exec(m[1] ?? '');
  return !v || !/^(false|0|none)$/i.test(v[1]!);
};

/** run 属性(w:rPr)→ 内联 style + 语义标签。 */
function runHtml(rXml: string): string {
  // w:t(保空格)+ w:br/w:tab;其余(图片/域)先忽略
  const texts: string[] = [];
  const re = /<w:(t|br|tab)\b[^>]*(?:\/>|>([\s\S]*?)<\/w:\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rXml))) {
    if (m[1] === 't') texts.push(esc(m[2] ?? ''));
    else if (m[1] === 'br') texts.push('<br/>');
    else texts.push('&emsp;');
  }
  let inner = texts.join('');
  if (!inner) return '';
  const pr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(rXml)?.[1] ?? '';
  const css: string[] = [];
  const sz = val(pr, 'sz'); // 半磅
  if (sz) css.push(`font-size:${parseInt(sz, 10) / 2}pt`);
  const font = /<w:rFonts\b[^>]*w:(?:eastAsia|ascii)="([^"]*)"/.exec(pr)?.[1];
  if (font) css.push(`font-family:${esc(font)}`);
  const color = val(pr, 'color');
  if (color && color !== 'auto') css.push(`color:#${color}`);
  const hi = val(pr, 'highlight');
  if (hi && hi !== 'none') css.push(`background-color:${hi}`);
  if (has(pr, 'b')) inner = `<b>${inner}</b>`;
  if (has(pr, 'i')) inner = `<i>${inner}</i>`;
  if (has(pr, 'u') && val(pr, 'u') !== 'none') inner = `<u>${inner}</u>`;
  if (has(pr, 'strike')) inner = `<s>${inner}</s>`;
  return css.length ? `<span style="${css.join(';')}">${inner}</span>` : inner;
}

/** 段落 → 块级 HTML(pStyle 映射标题;jc 对齐;spacing 行距)。 */
function paraHtml(pXml: string): string {
  const pr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(pXml)?.[1] ?? '';
  const style = val(pr, 'pStyle') ?? '';
  const tag = /^(heading?\s*1|1|h1|标题\s*1)$/i.test(style) || /heading1/i.test(style) ? 'h1'
    : /heading2|^2$|标题\s*2/i.test(style) ? 'h2'
    : /heading3|^3$|标题\s*3/i.test(style) ? 'h3'
    : /quote|引用/i.test(style) ? 'blockquote' : 'p';
  const css: string[] = [];
  const jc = val(pr, 'jc');
  if (jc === 'center') css.push('text-align:center');
  else if (jc === 'right' || jc === 'end') css.push('text-align:right');
  else if (jc === 'both' || jc === 'distribute') css.push('text-align:justify');
  const line = /<w:spacing\b[^>]*w:line="(\d+)"[^>]*w:lineRule="auto"/.exec(pr)?.[1];
  if (line) css.push(`line-height:${Math.round((parseInt(line, 10) / 240) * 100) / 100}`);
  const runs: string[] = [];
  const rr = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = rr.exec(pXml))) runs.push(runHtml(m[0]));
  const inner = runs.join('') || '<br/>'; // 空段占位,保持段落结构
  const attr = css.length ? ` style="${css.join(';')}"` : '';
  return `<${tag}${attr}>${inner}</${tag}>`;
}

export interface DocxImport { html: string; skipped: string[] }

/** .docx 字节 → { html, skipped }。抛错=不是合法 docx。 */
export function docxToHtml(bytes: Uint8Array): DocxImport {
  const files = unzipSync(bytes);
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('不是合法的 .docx(缺 word/document.xml)');
  const xml = strFromU8(doc);
  const body = /<w:body>([\s\S]*?)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const skipped: string[] = [];
  if (/<w:tbl\b/.test(body)) skipped.push('表格');
  if (/<w:drawing\b|<w:pict\b/.test(body)) skipped.push('图片/绘图');
  const parts: string[] = [];
  // 只取 body 顶层段落(表格内的 w:p 一并跳过:先按 tbl 区块剔除)
  const noTbl = body.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '<w:p><w:r><w:t>[表格:v1 暂以占位显示,写回不受影响]</w:t></w:r></w:p>');
  const pp = /<w:p\b[^>]*(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m: RegExpExecArray | null;
  while ((m = pp.exec(noTbl))) parts.push(m[1] != null ? paraHtml(m[0]) : '<p><br/></p>');
  const html = parts.join('\n');
  if (!html.trim()) throw new Error('文档没有可渲染的正文段落');
  return { html, skipped };
}
