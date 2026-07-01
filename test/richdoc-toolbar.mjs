/** 验证 RichDoc 新增工具栏功能真的改 DOM。 */
import { openApp, createReporter } from './harness.mjs';

const { page, errors, teardown } = await openApp({ storage: { 'oa.fmt': 'word' } });
const r = createReporter();

const answers = ['2,2', '演示', '样例'];
let ai = 0;
page.on('dialog', async (d) => { await d.accept(d.type() === 'prompt' ? (answers[ai++] ?? '') : undefined); });

await page.waitForSelector('.rd-page');

/** 每个断言前重置为已知内容,避免上一步的 DOM 改动影响选区偏移。 */
async function resetDoc() {
  await page.evaluate(() => {
    const el = document.querySelector('.rd-page');
    el.innerHTML = '<h2>标题演示段</h2><p>这是一段用于测试的正文文字内容示例。</p>';
    el.focus();
  });
}
/** 选中某元素首个文本节点的 [from,to)。 */
async function selectIn(sel, from, to) {
  await page.evaluate(({ sel, from, to }) => {
    const el = document.querySelector(sel);
    const tn = el.firstChild;
    const range = document.createRange();
    range.setStart(tn, from); range.setEnd(tn, Math.min(to, tn.length));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { sel, from, to });
}
const click = (title) => page.click(`.rd-btn[title="${title}"]`);

// 上标(styleWithCSS 下产出 <sup> 或 vertical-align:super)
await resetDoc(); await selectIn('.rd-page p', 0, 4); await click('上标');
r.ok('上标', await page.evaluate(() => { const p = document.querySelector('.rd-page p'); return !!p.querySelector('sup') || /vertical-align:\s*super/.test(p.innerHTML); }));

// 增大字号
await resetDoc(); await selectIn('.rd-page p', 5, 9); await click('增大字号');
r.ok('增大字号 → pt', await page.evaluate(() => !!document.querySelector('.rd-page span[style*="pt"]')));

// 两端对齐
await resetDoc(); await selectIn('.rd-page p', 0, 6); await click('两端对齐');
r.ok('两端对齐 → justify', await page.evaluate(() => /justify/.test(document.querySelector('.rd-page p').getAttribute('style') || '')));

// 增加缩进
await resetDoc(); await selectIn('.rd-page p', 0, 3); await click('增加缩进');
r.ok('增加缩进', await page.evaluate(() => /margin/.test(document.querySelector('.rd-page').innerHTML) || !!document.querySelector('.rd-page blockquote')));

// 行距
await resetDoc(); await selectIn('.rd-page h2', 0, 2); await page.selectOption('.rd-sel.ico', '2.0');
r.ok('行距 2.0', await page.evaluate(() => /line-height:\s*2/.test(document.querySelector('.rd-page h2').getAttribute('style') || '')));

// 标题3
await resetDoc(); await selectIn('.rd-page p', 0, 2); await page.selectOption('.rd-sel[title="样式"]', 'h3');
r.ok('样式 → h3', await page.evaluate(() => !!document.querySelector('.rd-page h3')));

// 引用
await resetDoc(); await selectIn('.rd-page p', 0, 2); await page.selectOption('.rd-sel[title="样式"]', 'blockquote');
r.ok('样式 → blockquote', await page.evaluate(() => !!document.querySelector('.rd-page blockquote')));

// 插入表格(dialog 返回 2,2)
await resetDoc();
await page.evaluate(() => {
  const el = document.querySelector('.rd-page p');
  const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
});
await click('插入表格');
await page.waitForTimeout(120);
r.ok('插入表格 2×2', await page.evaluate(() => { const t = document.querySelector('.rd-page .rd-tbl'); return !!t && t.querySelectorAll('td').length === 4; }));

// 分隔线
await resetDoc();
await page.evaluate(() => { const s = window.getSelection(); const rg = document.createRange(); rg.selectNodeContents(document.querySelector('.rd-page p')); rg.collapse(false); s.removeAllRanges(); s.addRange(rg); document.dispatchEvent(new Event('selectionchange')); });
await click('分隔线');
r.ok('分隔线 → <hr>', await page.evaluate(() => !!document.querySelector('.rd-page hr')));

r.ok('无控制台报错', errors.length === 0, errors.join(' | '));
const fails = r.done();
await teardown();
process.exit(fails);
