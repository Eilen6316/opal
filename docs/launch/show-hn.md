# Show HN draft

> Status: draft — post after the hero GIF is recorded and CI badge is green.

**Title:** Show HN: OtterPatch – open a pull request against your .docx/.xlsx (agent proposes, you review, surgical write-back)

**Body:**

Hi HN — I've been building OtterPatch, an open-source (Apache-2.0) safe-commit layer for Office
documents. The idea in one line: **agents shouldn't edit your files; they should open PRs against
them.**

How it works:

1. You circle a region (cells / paragraphs / diagram nodes) and say what you want.
2. The agent proposes a structured ChangeSet — it never touches the file. It can read the full
   document through tools (`read_blocks`, `aggregate`, …) instead of guessing from a truncated
   prompt.
3. The system verifies every proposal against a shadow copy — quote anchors must land uniquely,
   formulas must recompute, diagram edges can't dangle — and feeds failures back so the model
   repairs its own mistakes in the same turn.
4. You review inline tracked changes (Word) or a before/after grid replay (Excel), accepting or
   rejecting per item.
5. The accepted subset is written back **surgically**: on a real 531 KB .docx, 30/31 OOXML parts
   stayed byte-identical (a model round-trip rewrote 11/31). Word edits land as native tracked
   changes, so the "PR review" continues in Word itself.

It also ships as an MCP server, so Claude Code / any MCP client can drive the propose → review →
commit loop against real files. BYOK, 8 providers (Claude, DeepSeek, GLM, Kimi, Doubao, MiniMax,
Gemini, OpenAI).

Everything is open source, no commercial plans — I want this to become the boring, trustworthy
plumbing layer for document agents. Repo: https://github.com/Eilen6316/otterpatch

Things I'd love feedback on: the anchor model (quotes vs positions), whether the review UX earns
trust, and what formats to prioritize next.

---

**发布检查清单**
- [ ] README 顶部 hero GIF(30 秒:上传 docx → 圈选 → 提案 → 行内审阅 → 写回 → Word 打开见原生修订)
- [ ] CI 徽章绿
- [ ] bench 分数写进 docs(可复现命令)
- [ ] `npm run prove-fidelity` 一键复现 30/31 保真度声明
