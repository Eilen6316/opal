/**
 * 真实 Agent 端到端:验证 提问→回答、操作→diff、全局上下文(选区外也能答)。
 * 前置:
 *   1) npm run build -w apps/desktop && npm run build -w apps/mcp-server
 *   2) 起本机服务:node apps/mcp-server/dist/serve.js
 *   3) 设环境变量(BYOK,密钥不入库):
 *        OTTERPATCH_TEST_KEY=sk-...        必填
 *        OTTERPATCH_TEST_PROVIDER=deepseek (默认 deepseek)
 *        OTTERPATCH_TEST_MODEL=deepseek-v4-flash
 * 运行:node test/excel-agent.mjs   (服务未起或无 Key 时自动跳过)
 */
import { openApp, sleep, createReporter } from './harness.mjs';

const KEY = process.env.OTTERPATCH_TEST_KEY;
const PROVIDER = process.env.OTTERPATCH_TEST_PROVIDER || 'deepseek';
const MODEL = process.env.OTTERPATCH_TEST_MODEL || 'deepseek-v4-flash';
const SERVE = 'http://localhost:4319';

if (!KEY) {
  console.log('skip excel-agent: 未设 OTTERPATCH_TEST_KEY');
  process.exit(0);
}
try {
  const h = await fetch(SERVE + '/health').then((r) => r.json());
  if (!h.ok) throw new Error('health not ok');
} catch {
  console.log(`skip excel-agent: 本机服务 ${SERVE} 未运行(先 node apps/mcp-server/dist/serve.js)`);
  process.exit(0);
}

const rep = createReporter();
const { page, teardown } = await openApp({
  storage: { 'oa.server': SERVE, 'oa.apiKey': KEY, 'oa.provider': PROVIDER, 'oa.model': MODEL },
});

// Cursor 式对话流:消息累积,不切屏。每次取"最新"一条断言。
const ask = async (text) => {
  const before = await page.locator('.answer-bubble, .diff-turn').count();
  await page.locator('textarea').fill(text);
  await page.locator('.send').click();
  await page.waitForFunction((n) => document.querySelectorAll('.answer-bubble, .diff-turn').length > n, before, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
};
const lastAnswer = async () => ((await page.locator('.answer-bubble').last().textContent()) || '').replace(/\s+/g, '');

try {
  await page.waitForSelector('.univer-host canvas', { timeout: 15000 }).catch(() => {});
  await sleep(2500);
  const host = await page.locator('.univer-host').boundingBox();

  // 1) 操作 → diff(干净上下文,避免被分析型历史带成回答)
  await page.mouse.move(host.x + 90, host.y + 150);
  await page.mouse.down();
  await page.mouse.move(host.x + 300, host.y + 250, { steps: 6 });
  await page.mouse.up();
  await sleep(300);
  await ask('把销量列里明显异常的那个值标红加粗');
  rep.ok('operation -> diff in thread', (await page.locator('.diff-turn .change').count()) >= 1);

  // 2) 接受 → 结果回写(committed 标记 + 进投影历史)
  const accept = page.locator('.diff-turn .bulk .btn.ok').last();
  if (await accept.count()) await accept.click();
  await sleep(500);
  rep.ok('accepted change shows committed tag', (await page.locator('.committed-tag').count()) >= 1);

  // 3) 提问 → 回答(同一对话流追加,不切屏)
  await page.mouse.click(host.x + 60, host.y + 150);
  await sleep(300);
  await ask('销量这一列的平均值大概是多少?');
  rep.ok('question -> answer bubble in same thread', (await page.locator('.answer-bubble').count()) >= 1);

  // 4) 全局上下文 + 多轮累积
  await ask('整张表里金额最大的是哪一行?');
  rep.ok('global question answered using whole sheet', /57000|第4行|1500/.test(await lastAnswer()), (await lastAnswer()).slice(0, 50));
  rep.ok('thread accumulates (3 user bubbles)', (await page.locator('.msg-user').count()) === 3);
} finally {
  await teardown();
}

process.exit(rep.done());
