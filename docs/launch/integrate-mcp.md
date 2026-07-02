# Let your agent edit Office files safely (MCP integration)

Target audience: Claude Code / Cursor / any MCP-client users who want their agent to edit
`.xlsx` / `.docx` / `.drawio` files **without** giving it raw file write access.

## Why not just let the agent write the file?

Because a model round-trip rewrites parts it never meant to touch (fonts, themes, numbering,
metadata — on a real 531 KB docx, 11/31 OOXML parts changed). OtterPatch gives your agent a
propose → review → surgical-commit protocol instead: only the edits you accept land, everything
else stays byte-identical, and Word edits arrive as native tracked changes.

## 1. Install & register

```bash
npm install && npm run typecheck        # build once
```

Register the MCP server (BYOK — bring any of the 8 supported providers' keys):

```jsonc
// .mcp.json / Claude Code MCP settings
{
  "mcpServers": {
    "otterpatch": {
      "command": "otterpatch-mcp",
      "env": { "OtterPatch_API_KEY": "sk-..." }   // or pass apiKey per call
    }
  }
}
```

## 2. The four tools your agent gets

| Tool | What it does |
|---|---|
| `otterpatch_skills` | list built-in document skills (incl. domain playbooks) |
| `otterpatch_propose` | intent + selection context → constrained ChangeSet + reviewable diff |
| `otterpatch_diff` | ChangeSet → human-readable diff (for your own review UI) |
| `otterpatch_commit` | ChangeSet + file (base64) + accepted edit ids → surgically patched file + fidelity report |

The contract your agent must respect: **propose is the only mutation path**, and commit takes an
explicit `acceptedEditIds` subset — put a human (or your own policy check) between the two.

## 3. Headless one-liner (CI / scripts)

```bash
otterpatch-run --format excel --intent "fill amount = qty × price" --in book.xlsx --out book.out.xlsx
# streams JSON events: propose:start → diff:done → commit:done {"touchedParts":["xl/worksheets/sheet1.xml"]}
```

## 4. What "safe" means here, concretely

- Every quote/A1/cell-id anchor is verified against a shadow copy before you ever see the diff;
  the model repairs unlandable anchors in-turn (`propose → observe → repair`).
- `commit` reports `appliedEditIds` + `droppedEdits` (with reasons) — nothing is silently skipped.
- The fidelity report tells you exactly which OOXML parts were touched.

## 5. Extend it with your own domain knowledge

Drop a standard `SKILL.md` (Anthropic Agent Skills compatible) and install it at runtime — a
markdown checklist is enough to teach the agent your house style (e.g. your company's report
format). See [docs/skills.md](../skills.md).
