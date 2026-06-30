/**
 * Word「文档」工作区 —— 让 Word 在驾驶舱里成为一等公民:渲染可圈选的正文,捕获选区(quote),
 * 审阅期高亮命中的原文,接受时把"原文 → 改后"应用到文档(并标记改动段,呈现 tracked-changes 观感)。
 * 与 UniverSheet(表格)/DrawioBoard(画板)平级,由 App 的 fmt==='word' 渲染。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

export interface WordHandle {
  /** 整篇正文(供"没圈选时"给 Agent 全文上下文)。 */
  getText(): string;
  /** 把【原文 quote → 改后 replacement】应用到文档(替换首个命中段的该片段),返回是否命中。 */
  applyEdit(quote: string, replacement: string): boolean;
  /** 撤销:把 replacement 改回 quote(用于"撤销该回合")。 */
  revertEdit(quote: string, replacement: string): boolean;
}

interface Para { id: string; heading?: 1 | 2; text: string; changed?: boolean }

const DEMO_DOC: Para[] = [
  { id: 'p0', heading: 1, text: '项目周报 · 2026 年第 26 周' },
  { id: 'p1', text: '本周核心进展:OtterPatch 完成了 Excel 透视图的内联渲染,并新增了"需求模糊时主动澄清"的能力,Agent 在意图不清时会先给用户一张引导选择表。整体进度符合预期。' },
  { id: 'p2', text: '风险与问题:大模型在超长输出时偶发截断,目前已通过分批与容错解析缓解;Word 工作区此前只有占位界面,缺少端到端的圈选改写与修订审阅。' },
  { id: 'p3', heading: 2, text: '下周计划' },
  { id: 'p4', text: '一、让 Word 成为一等公民,支持圈选段落、用自然语言改写,并以修订(原文划除、新增标绿)逐条审阅后再落盘。二、补齐行为回归测试。三、用真实模型校准澄清的边界。' },
  { id: 'p5', text: '备注:本文档为演示数据,你可以圈选任意段落,让右侧的 Agent 帮你改写、润色或精简。' },
];

/** 把一段文本按 quote 命中处切片渲染,命中片段用 <mark> 高亮(审阅期定位用)。 */
function renderWithHighlight(text: string, quote: string | undefined): ReactNode {
  if (!quote || !text.includes(quote)) return text;
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  let idx = rest.indexOf(quote);
  while (idx >= 0) {
    if (idx > 0) out.push(rest.slice(0, idx));
    out.push(
      <mark key={k++} className="wd-hl">
        {quote}
      </mark>,
    );
    rest = rest.slice(idx + quote.length);
    idx = rest.indexOf(quote);
  }
  if (rest) out.push(rest);
  return out;
}

const STORAGE_KEY = 'oa.worddoc';

const WordDoc = forwardRef<WordHandle, { onSelection?: (quote: string) => void; highlightQuote?: string }>(
  function WordDoc({ onSelection, highlightQuote }, ref) {
    const [paras, setParas] = useState<Para[]>(() => {
      try {
        const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (Array.isArray(v) && v.length) return v as Para[];
      } catch {
        /* 用演示文档 */
      }
      return DEMO_DOC;
    });
    const pageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(paras));
      } catch {
        /* 配额满忽略 */
      }
    }, [paras]);

    // 审阅切换时,把命中段滚到可视区
    useEffect(() => {
      if (!highlightQuote) return;
      const el = pageRef.current?.querySelector('.wd-hl');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [highlightQuote]);

    useImperativeHandle(
      ref,
      (): WordHandle => ({
        getText: () => paras.map((p) => p.text).join('\n'),
        applyEdit: (quote, replacement) => {
          let hit = false;
          setParas((ps) =>
            ps.map((p) => {
              if (!hit && quote && p.text.includes(quote)) {
                hit = true;
                return { ...p, text: p.text.replace(quote, replacement), changed: true };
              }
              return p;
            }),
          );
          return quote ? paras.some((p) => p.text.includes(quote)) : false;
        },
        revertEdit: (quote, replacement) => {
          let hit = false;
          setParas((ps) =>
            ps.map((p) => {
              if (!hit && replacement && p.text.includes(replacement)) {
                hit = true;
                return { ...p, text: p.text.replace(replacement, quote), changed: false };
              }
              return p;
            }),
          );
          return true;
        },
      }),
      [paras],
    );

    const onMouseUp = (): void => {
      const q = (window.getSelection()?.toString() ?? '').trim();
      if (q) onSelection?.(q);
    };

    return (
      <div className="doc-page wd-page" ref={pageRef} onMouseUp={onMouseUp}>
        <div className="wd-sheet">
          {paras.map((p) =>
            p.heading === 1 ? (
              <h1 key={p.id} className={'wd-h1' + (p.changed ? ' wd-changed' : '')}>
                {renderWithHighlight(p.text, highlightQuote)}
              </h1>
            ) : p.heading === 2 ? (
              <h2 key={p.id} className={'wd-h2' + (p.changed ? ' wd-changed' : '')}>
                {renderWithHighlight(p.text, highlightQuote)}
              </h2>
            ) : (
              <p key={p.id} className={'wd-p' + (p.changed ? ' wd-changed' : '')}>
                {renderWithHighlight(p.text, highlightQuote)}
              </p>
            ),
          )}
        </div>
      </div>
    );
  },
);

export default WordDoc;
