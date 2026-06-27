/**
 * word/document.xml 段落级红线变换:在文档 XML 里按文本定位命中的 <w:p>,
 * 把该段整段编译成 Word 原生修订(w:ins/w:del),保留其 <w:pPr>;未命中段落原样透传。
 * 这样配合外科写回(只改 word/document.xml、其余部件字节不变),Agent 的正文改动落成可审阅修订。
 * v1 限制:命中段重建时会把多 run 合并为红线 run(段内细粒度格式暂未逐 run 保留)。
 */
import { buildRedlineXml, diffWords, type RedlineOptions } from './redline.js';

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/** 一个 <w:p> 的可见文本 = 其所有 <w:t> 内容拼接(已反转义)。 */
function paraText(para: string): string {
  let t = '';
  for (const m of para.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) t += unescapeXml(m[1]!);
  return t;
}

function rebuildPara(para: string, runs: string): string {
  const open = /^<w:p\b[^>]*>/.exec(para)?.[0] ?? '<w:p>';
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(para)?.[0] ?? '';
  return open + pPr + runs + '</w:p>';
}

export interface ParaEdit {
  old: string; // 段内要替换的原文(来自 flow 锚点的 quote.text)
  new: string; // 替换成的新文(来自 replaceText.text)
}

/** 对 document.xml 应用一组段落级文本替换,命中段编译成红线。返回新 XML + 改动段数。 */
export function redlineDocumentXml(
  documentXml: string,
  edits: ParaEdit[],
  opts: RedlineOptions = {},
): { xml: string; changed: number } {
  let id = opts.idStart ?? 1;
  let changed = 0;
  const xml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para) => {
    const text = paraText(para);
    for (const e of edits) {
      if (!e.old || !text.includes(e.old)) continue;
      const next = text.replace(e.old, e.new);
      if (next === text) continue;
      const runs = buildRedlineXml(text, next, { ...opts, idStart: id });
      id += diffWords(text, next).filter((s) => s.op !== 'equal').length;
      changed++;
      return rebuildPara(para, runs);
    }
    return para;
  });
  return { xml, changed };
}
