/**
 * 自控富文本「Word」编辑器 —— 取代 Univer Docs(其行内格式命令在嵌入态不生效)。
 * 基于 contentEditable + Selection/Range:工具栏(剪贴板/字体/字号/颜色/对齐/缩进/行距/列表/标题/插入…)真生效;
 * Agent 改动也由本组件【完全掌控】地落到文档:按 editId 包裹一个 <span data-edit>,可逐条精确还原。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { useT } from './i18n.js';
import {
  IconUndo, IconRedo, IconScissors, IconCopy, IconFormatBrush, IconStrikethrough,
  IconSuperscript, IconSubscript, IconFontGrow, IconFontShrink, IconFontColor, IconHighlighter,
  IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustify,
  IconIndentIncrease, IconIndentDecrease, IconBulletsRb, IconNumberingRb,
  IconLink, IconTable, IconImage, IconHorizontalRule, IconSearch, IconClearFormat,
} from './icons.js';

export interface DocFmt { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; font?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right' }

export interface RichDocHandle {
  /** 全文纯文本(供 Agent 上下文/定位)。 */
  getText(): string;
  /** 落一条 Agent 改动(文本改写 replacement 或格式 fmt),按 editId 包裹,可还原。 */
  applyEdit(editId: string, quote: string, opts: { replacement?: string; fmt?: DocFmt }): boolean;
  /** 按 editId 精确还原该条改动。 */
  revert(editId: string): void;
  /** 选中/滚动到某条改动。 */
  highlight(editId: string): void;
}

const FONTS = ['宋体', '黑体', '微软雅黑', '楷体', '仿宋', 'Arial', 'Times New Roman'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 22, 26, 36, 48, 72];
const LINE_SPACINGS = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'];

const DEMO_HTML = `
<h1>项目周报 · 2026 年第 26 周</h1>
<p>本周核心进展:OtterPatch 完成了 Excel 透视图的内联渲染,并新增了"需求模糊时主动澄清"的能力,Agent 在意图不清时会先给用户一张引导选择表。整体进度符合预期。</p>
<p>风险与问题:大模型在超长输出时偶发截断,目前已通过分批与容错解析缓解;Word 工作区已换成自控富文本编辑器,工具栏的字体/字号/加粗/对齐/缩进/行距/列表/插入表格图片都真生效。</p>
<h2>下周计划</h2>
<p>一、让 Agent 既能改写文字、也能改字体字号等格式;二、补齐行为回归测试;三、用真实模型校准澄清的边界。</p>
<p>备注:本文档为演示数据,你可以圈选任意文字,用顶部工具栏手动排版,或让右侧 Agent 帮你改写、润色、统一字体字号。</p>`;

const STORAGE_KEY = 'oa.richdoc';
const BLOCK_TAGS = /^(P|H1|H2|H3|LI|BLOCKQUOTE|DIV|TD|TH)$/;

/** 在 root 的文本里找到 quote 的 Range(跨文本节点)。 */
function findRange(root: HTMLElement, quote: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let acc = '';
  let n: Node | null;
  while ((n = walker.nextNode())) { nodes.push({ node: n as Text, start: acc.length }); acc += (n as Text).data; }
  const idx = acc.indexOf(quote);
  if (idx < 0) return null;
  const end = idx + quote.length;
  let sNode: Text | undefined, sOff = 0, eNode: Text | undefined, eOff = 0;
  for (const { node, start } of nodes) {
    const len = node.data.length;
    if (sNode === undefined && idx >= start && idx < start + len) { sNode = node; sOff = idx - start; }
    if (end > start && end <= start + len) { eNode = node; eOff = end - start; }
  }
  if (!sNode || !eNode) return null;
  const r = document.createRange();
  r.setStart(sNode, sOff);
  r.setEnd(eNode, eOff);
  return r;
}

function styleSpan(span: HTMLElement, fmt: DocFmt): void {
  if (fmt.bold) span.style.fontWeight = 'bold';
  if (fmt.italic) span.style.fontStyle = 'italic';
  if (fmt.underline) span.style.textDecoration = (span.style.textDecoration ? span.style.textDecoration + ' ' : '') + 'underline';
  if (fmt.strike) span.style.textDecoration = (span.style.textDecoration ? span.style.textDecoration + ' ' : '') + 'line-through';
  if (fmt.font) span.style.fontFamily = fmt.font;
  if (fmt.size) span.style.fontSize = fmt.size + 'pt';
  if (fmt.color) span.style.color = fmt.color;
}

const RichDoc = forwardRef<RichDocHandle, Record<string, never>>(function RichDoc(_props, ref) {
  const t = useT();
  const edRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null); // 工具栏控件(下拉/取色器)会夺走焦点丢选区,故随时记下编辑器内的选区以便恢复
  const painter = useRef<DocFmt | null>(null); // 格式刷:记住"源"格式,待下次划选套用
  // editId → 还原信息:替换的 DOM 片段(改前内容)或全文样式
  const undoMap = useRef<Map<string, { mode: 'span'; prior: DocumentFragment } | { mode: 'root'; priorStyle: string }>>(new Map());

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (edRef.current) edRef.current.innerHTML = saved && saved.trim() ? saved : DEMO_HTML;
    try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* 老浏览器忽略 */ }
    const onSel = (): void => {
      const s = window.getSelection();
      if (s && s.rangeCount && edRef.current && s.anchorNode && edRef.current.contains(s.anchorNode)) savedRange.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  /** 恢复最近一次编辑器内选区(点工具栏控件后用)。 */
  const restoreSel = (): void => {
    edRef.current?.focus();
    const r = savedRange.current;
    if (!r) return;
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };

  const persist = (): void => { try { if (edRef.current) localStorage.setItem(STORAGE_KEY, edRef.current.innerHTML); } catch { /* 配额满忽略 */ } };

  useImperativeHandle(ref, (): RichDocHandle => ({
    getText: () => edRef.current?.innerText ?? '',
    applyEdit: (editId, quote, opts) => {
      const root = edRef.current;
      if (!root) return false;
      // 全文格式:直接改根容器样式,记录改前内联样式以还原
      if (!quote && opts.fmt) {
        undoMap.current.set(editId, { mode: 'root', priorStyle: root.getAttribute('style') ?? '' });
        styleSpan(root, opts.fmt);
        persist();
        return true;
      }
      const range = findRange(root, quote);
      if (!range) return false;
      const span = document.createElement('span');
      span.setAttribute('data-edit', editId);
      if (opts.fmt) styleSpan(span, opts.fmt);
      span.textContent = opts.replacement ?? quote; // 文本改写=新文字;格式=原文(只加样式)
      const prior = range.cloneContents(); // 改前内容,供还原
      range.deleteContents();
      range.insertNode(span);
      undoMap.current.set(editId, { mode: 'span', prior });
      persist();
      return true;
    },
    revert: (editId) => {
      const root = edRef.current;
      const info = undoMap.current.get(editId);
      if (!root || !info) return;
      if (info.mode === 'root') { if (info.priorStyle) root.setAttribute('style', info.priorStyle); else root.removeAttribute('style'); }
      else {
        const span = root.querySelector(`[data-edit="${editId}"]`);
        if (span && span.parentNode) span.parentNode.replaceChild(info.prior.cloneNode(true), span);
      }
      undoMap.current.delete(editId);
      persist();
    },
    highlight: (editId) => {
      const span = edRef.current?.querySelector(`[data-edit="${editId}"]`) as HTMLElement | null;
      if (!span) return;
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.classList.add('rd-flash');
      setTimeout(() => span.classList.remove('rd-flash'), 1200);
    },
  }), []);

  // ── 工具栏:对当前选区真实生效(execCommand + CSS;先恢复选区) ──
  const exec = (cmd: string, val?: string): void => { restoreSel(); document.execCommand(cmd, false, val); persist(); };
  const setFont = (f: string): void => { if (f) exec('fontName', f); };

  /** 把选区字号设为 pt:execCommand fontSize 只支持 1-7,故临时关 styleWithCSS 产出 <font size=7>,再换成 CSS pt。 */
  const applySizePt = (pt: number): void => {
    const root = edRef.current; if (!root) return;
    restoreSel();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, 'true');
    root.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = document.createElement('span');
      s.style.fontSize = pt + 'pt';
      s.innerHTML = (f as HTMLElement).innerHTML;
      f.replaceWith(s);
    });
    persist();
  };
  const setSize = (pt: string): void => { if (pt) applySizePt(parseFloat(pt)); };

  /** 当前选区所在字号(pt),供增大/减小基准。 */
  const currentPt = (): number => {
    const s = window.getSelection();
    let el: Node | null = s?.anchorNode ?? null;
    if (el && el.nodeType === 3) el = el.parentElement;
    if (!(el instanceof HTMLElement)) return 12;
    return parseFloat(getComputedStyle(el).fontSize) * 0.75; // px→pt
  };
  /** 增大(dir>0)/减小 字号:沿常用字号阶梯走一档。 */
  const stepFont = (dir: number): void => {
    const cur = currentPt();
    let target: number;
    if (dir > 0) target = SIZES.find((s) => s > cur + 0.1) ?? SIZES[SIZES.length - 1];
    else { const smaller = SIZES.filter((s) => s < cur - 0.1); target = smaller.length ? smaller[smaller.length - 1] : SIZES[0]; }
    applySizePt(target);
  };

  /** 行距:落到选区涉及的段落块(找不到块则退回整页)。 */
  const setLineSpacing = (v: string): void => {
    if (!v) return;
    restoreSel();
    const root = edRef.current; if (!root) return;
    const s = window.getSelection();
    const range = s && s.rangeCount ? s.getRangeAt(0) : null;
    let blocks: HTMLElement[] = [];
    if (range) {
      blocks = (Array.from(root.querySelectorAll('p,h1,h2,h3,li,blockquote,div')) as HTMLElement[]).filter((el) => range.intersectsNode(el));
      if (blocks.length === 0) { // 光标折叠时 intersectsNode 可能落空,回溯最近块祖先
        let e: Node | null = range.startContainer;
        while (e && e !== root) { if (e instanceof HTMLElement && BLOCK_TAGS.test(e.tagName)) { blocks = [e]; break; } e = e.parentNode; }
      }
    }
    if (blocks.length === 0) root.style.lineHeight = v;
    else blocks.forEach((el) => { el.style.lineHeight = v; });
    persist();
  };

  const insertLink = (): void => {
    restoreSel();
    const url = window.prompt(t('链接地址'), 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
    persist();
  };

  const insertTable = (): void => {
    const spec = window.prompt(t('表格尺寸(行,列)'), '3,3');
    if (!spec) return;
    const m = spec.split(/[\s,，xX×*]+/).map((x) => parseInt(x.trim(), 10));
    const rows = m[0], cols = m[1];
    if (!rows || !cols || rows > 50 || cols > 20) return;
    let html = '<table class="rd-tbl"><tbody>';
    for (let i = 0; i < rows; i++) { html += '<tr>'; for (let j = 0; j < cols; j++) html += '<td><br></td>'; html += '</tr>'; }
    html += '</tbody></table><p><br></p>';
    restoreSel();
    document.execCommand('insertHTML', false, html);
    persist();
  };

  const onPickImg = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (): void => { restoreSel(); document.execCommand('insertImage', false, String(reader.result)); persist(); };
    reader.readAsDataURL(f);
  };

  /** 查找并全部替换(只走文本节点,不碰标签,安全)。 */
  const findReplace = (): void => {
    const root = edRef.current; if (!root) return;
    const find = window.prompt(t('查找内容'));
    if (!find) return;
    const repl = window.prompt(t('替换为'), '') ?? '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) texts.push(n as Text);
    let count = 0;
    for (const tn of texts) {
      if (tn.data.includes(find)) { count += tn.data.split(find).length - 1; tn.data = tn.data.split(find).join(repl); }
    }
    persist();
    window.alert(count ? `${t('已替换')} ${count}` : t('未找到匹配'));
  };

  // ── 格式刷:点按钮记住当前处格式 → 下次划选自动套用一次 ──
  const capturePaint = (): void => {
    const s = window.getSelection();
    let el: Node | null = s?.anchorNode ?? null;
    if (el && el.nodeType === 3) el = el.parentElement;
    if (!(el instanceof HTMLElement)) return;
    const cs = getComputedStyle(el);
    painter.current = {
      bold: parseInt(cs.fontWeight, 10) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: cs.textDecorationLine.includes('underline'),
      strike: cs.textDecorationLine.includes('line-through'),
      font: cs.fontFamily,
      size: Math.round(parseFloat(cs.fontSize) * 0.75 * 10) / 10,
      color: cs.color,
    };
    edRef.current?.classList.add('rd-painting');
  };
  const onEdMouseUp = (): void => {
    const fmt = painter.current;
    if (!fmt) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const range = s.getRangeAt(0);
    const span = document.createElement('span');
    styleSpan(span, fmt);
    try { range.surroundContents(span); }
    catch { span.appendChild(range.extractContents()); range.insertNode(span); }
    painter.current = null;
    edRef.current?.classList.remove('rd-painting');
    persist();
  };

  // 命令按钮(execCommand);cmd 直连
  const Btn = ({ cmd, val, title, children }: { cmd: string; val?: string; title: string; children: ReactNode }): ReactNode => (
    <button className="rd-btn" title={title} onMouseDown={(e) => { e.preventDefault(); exec(cmd, val); }}>{children}</button>
  );
  // 动作按钮(自定义处理);保住选区
  const ABtn = ({ act, title, children }: { act: () => void; title: string; children: ReactNode }): ReactNode => (
    <button className="rd-btn" title={title} onMouseDown={(e) => { e.preventDefault(); act(); }}>{children}</button>
  );

  return (
    <div className="rd-wrap">
      <div className="rd-toolbar">
        {/* 隐藏文件选择器:置首(display:none 不占位),使末组正确成为 :last-of-type,无尾随分隔线 */}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImg} />
        {/* ① 历史 */}
        <div className="rd-grp">
          <Btn cmd="undo" title={t('撤销')}><IconUndo size={15} /></Btn>
          <Btn cmd="redo" title={t('重做')}><IconRedo size={15} /></Btn>
        </div>
        {/* ② 剪贴板 */}
        <div className="rd-grp">
          <Btn cmd="cut" title={t('剪切')}><IconScissors size={15} /></Btn>
          <Btn cmd="copy" title={t('复制')}><IconCopy size={15} /></Btn>
          <ABtn act={capturePaint} title={t('格式刷')}><IconFormatBrush size={15} /></ABtn>
        </div>
        {/* ③ 字体 / 字号 */}
        <div className="rd-grp">
          <select className="rd-sel" title={t('字体')} defaultValue="" onChange={(e) => { setFont(e.target.value); e.currentTarget.selectedIndex = 0; }}>
            <option value="">{t('字体')}</option>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="rd-sel sm" title={t('字号')} defaultValue="" onChange={(e) => { setSize(e.target.value); e.currentTarget.selectedIndex = 0; }}>
            <option value="">{t('字号')}</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ABtn act={() => stepFont(1)} title={t('增大字号')}><IconFontGrow size={15} /></ABtn>
          <ABtn act={() => stepFont(-1)} title={t('减小字号')}><IconFontShrink size={15} /></ABtn>
        </div>
        {/* ④ 字符 */}
        <div className="rd-grp">
          <Btn cmd="bold" title={t('加粗')}><b>B</b></Btn>
          <Btn cmd="italic" title={t('斜体')}><i>I</i></Btn>
          <Btn cmd="underline" title={t('下划线')}><u>U</u></Btn>
          <Btn cmd="strikeThrough" title={t('删除线')}><IconStrikethrough size={15} /></Btn>
          <Btn cmd="superscript" title={t('上标')}><IconSuperscript size={15} /></Btn>
          <Btn cmd="subscript" title={t('下标')}><IconSubscript size={15} /></Btn>
          <label className="rd-color" title={t('字体颜色')}><IconFontColor size={15} /><input type="color" onChange={(e) => exec('foreColor', e.target.value)} /></label>
          <label className="rd-color hl" title={t('高亮')}><IconHighlighter size={15} /><input type="color" defaultValue="#ffe600" onChange={(e) => exec('hiliteColor', e.target.value)} /></label>
        </div>
        {/* ⑤ 段落:对齐 / 缩进 / 行距 / 列表 */}
        <div className="rd-grp">
          <Btn cmd="justifyLeft" title={t('左对齐')}><IconAlignLeft size={15} /></Btn>
          <Btn cmd="justifyCenter" title={t('居中')}><IconAlignCenter size={15} /></Btn>
          <Btn cmd="justifyRight" title={t('右对齐')}><IconAlignRight size={15} /></Btn>
          <Btn cmd="justifyFull" title={t('两端对齐')}><IconAlignJustify size={15} /></Btn>
          <Btn cmd="outdent" title={t('减少缩进')}><IconIndentDecrease size={15} /></Btn>
          <Btn cmd="indent" title={t('增加缩进')}><IconIndentIncrease size={15} /></Btn>
          <select className="rd-sel sm ico" title={t('行距')} defaultValue="" onChange={(e) => { setLineSpacing(e.target.value); e.currentTarget.selectedIndex = 0; }}>
            <option value="">{t('行距')}</option>
            {LINE_SPACINGS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <Btn cmd="insertUnorderedList" title={t('项目符号')}><IconBulletsRb size={15} /></Btn>
          <Btn cmd="insertOrderedList" title={t('编号')}><IconNumberingRb size={15} /></Btn>
        </div>
        {/* ⑥ 样式 */}
        <div className="rd-grp">
          <select className="rd-sel" title={t('样式')} defaultValue="" onChange={(e) => { if (e.target.value) exec('formatBlock', e.target.value); e.currentTarget.selectedIndex = 0; }}>
            <option value="">{t('样式')}</option>
            <option value="p">{t('正文')}</option>
            <option value="h1">{t('标题1')}</option>
            <option value="h2">{t('标题2')}</option>
            <option value="h3">{t('标题3')}</option>
            <option value="blockquote">{t('引用')}</option>
          </select>
        </div>
        {/* ⑦ 插入 */}
        <div className="rd-grp">
          <ABtn act={insertLink} title={t('超链接')}><IconLink size={15} /></ABtn>
          <ABtn act={insertTable} title={t('插入表格')}><IconTable size={15} /></ABtn>
          <ABtn act={() => fileRef.current?.click()} title={t('插入图片')}><IconImage size={15} /></ABtn>
          <Btn cmd="insertHorizontalRule" title={t('分隔线')}><IconHorizontalRule size={15} /></Btn>
        </div>
        {/* ⑧ 工具 */}
        <div className="rd-grp">
          <ABtn act={findReplace} title={t('查找替换')}><IconSearch size={15} /></ABtn>
          <Btn cmd="removeFormat" title={t('清除格式')}><IconClearFormat size={15} /></Btn>
        </div>
      </div>
      <div className="rd-scroll">
        <div className="rd-page" ref={edRef} contentEditable suppressContentEditableWarning onInput={persist} onMouseUp={onEdMouseUp} />
      </div>
    </div>
  );
});

export default RichDoc;
