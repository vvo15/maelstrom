---
inclusion: manual
---
# stage-docs-sync

On-demand docs sync, owned by Stage. Run it from chat as `/stage-docs-sync`.
Kiro IDE 1.x has no manual trigger for v1 hooks, so this is a manually included steering
file, Kiro's documented replacement for manual hooks. In KIRO.md, describe it that way.

## Edit only KIRO.md

Write or overwrite `KIRO.md` at the repo root. Do not create, edit or delete any other file.
If a fix is needed elsewhere, list it at the end of your chat reply instead.

## Read these sources first

1. Every `docs/kiro-log/*.md` file (one per role).
2. Everything under `.kiro/specs/`, `.kiro/steering/` and `.kiro/hooks/`.
3. The last 50 commits: `git log -50 --format='%h %an %ad %s' --date=short --stat`.
4. Any file those sources name, when you need it to quote accurately (for example a
   `POWER.md`, a test file a log entry cites, or `.kiro/settings/mcp.json`).

## Write one section per question in the hackathon rules, in this order

1. **Kiro tools used (IDE, CLI, Web, Crew) and how they differed.**
2. **How we structured specs, and how spec-driven development compared with vibe coding.**
3. **Each hook and what it automated.** Give the file, trigger and matcher, and say what it caught
   or prevented.
4. **Our steering strategy.** Cover the global files, the per-module `fileMatch` files and the
   manual files.
5. **MCP servers and what they enabled.**
6. **What property-based testing caught.** Name the property, the counterexample or bug, and the fix.
7. **Which Powers we used or built.**

## Rules for every section

- Use evidence only. Every claim needs a source: a file path (with line or heading where
  useful), a commit hash, or a quote from a Kiro log. Quote real prompts, outputs and errors
  verbatim and keep each quote short.
- Name the role or person a piece of work came from, as the sources do.
- Link screenshots from `docs/kiro-log/img/` with relative paths, for example
  `![Hosted demo on a phone](docs/kiro-log/img/stage-hosted-phone.png)`. Only link files
  that exist.
- If a section has no evidence in the sources, write exactly `TODO: no evidence yet` as its body.
  Don't guess, and don't fill the gap with general Kiro marketing.
- Use the product name exactly as it appears in the `<title>` of `dashboard/index.html`.
  Leave internal identifiers unchanged: `SirenEvent`, the `SIREN_` canary prefix and `SIREN_LLM`.
- Never copy anything that looks like a credential, even a fake one; describe it instead.
- Plain, direct sentences. No filler or superlatives.

## When you finish

Reply in chat with a short list: sections filled, sections left as `TODO: no evidence yet`,
and which source each missing section would need (for example "Labyrinth's log has no PBT
entry").
