# Neon Chomp – notes for Claude
- Read README.md, DECISIONS.md, ROADMAP.md first. The original design is in docs/DESIGN.md.
- Keep `src/sim/` pure (no DOM, no Math.random — use the World's `rng`). Determinism is tested.
- Add content (fruits, upgrades, modifiers) through `src/data/` tables where possible.
- After changes: `npx tsc -p .` and `npm test` must pass. Deliverable build: `npm run build:single`.
- Don't break the localStorage save shape without a migration (see README "Save data").
- When a choice deviates from docs/DESIGN.md, log it in DECISIONS.md.
