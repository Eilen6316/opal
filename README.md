# Office Agent Workbench

> Agent-driven, reviewable **safe-commit layer** for Office files.
> Circle a region → say what you want → review the diff → high-fidelity write-back.
> (Think: opening a PR against your `.xlsx` / `.docx`.)

> ⚠️ Early scaffold — under active development.

## Why

Agents shouldn't edit your Office files directly. Here an agent only **proposes** a
structured `ChangeSet`; the system validates it, applies it to a shadow copy, shows a
**reviewable diff** (accept/reject per block), then writes back **surgically** — only the
touched OOXML parts change, the rest stays byte-identical.

Validated on a real 531 KB `.docx`: surgical write-back kept **30/31 parts byte-identical**,
whereas a model round-trip rewrote 11/31. See `packages/writeback-surgical`.

## Structure

```text
packages/core/                format-agnostic abstraction layer
                              (Anchor / ChangeSet / Diff / Skill / Adapter / Transaction / Writeback)
packages/adapter-univer/      Excel adapter (Univer) — WIP
packages/writeback-surgical/  surgical OOXML write-back — validated + tested
apps/desktop/                 progressive-disclosure cockpit UI (Vite + React; Electron later)
experiments/                  fidelity / intent-coverage experiments
```

## Develop

```bash
npm install
npm run typecheck                          # tsc -b across packages/*
npm run dev                                # cockpit UI → http://localhost:5173
npm test -w @office-agent/writeback-surgical
```

## Status

- [x] Monorepo scaffold; core abstraction layer (typechecks)
- [x] Surgical OOXML write-back (implemented + tested)
- [ ] Univer adapter: circle → ChangeSet → shadow → diff → write-back (first closed loop)
- [ ] Agent turn (BYOK / local model): intent → ChangeSet

## License

[Apache-2.0](./LICENSE).
