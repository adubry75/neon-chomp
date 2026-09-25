# Decisions / deviations from docs/DESIGN.md
- **Plain Canvas 2D instead of Phaser.** The sim is pure TS and rendering is a thin layer, so a framework added weight without adding much. The glow comes from pre-blurred wall layers plus a full-screen bloom pass.
- **Ghost AI:** faithful to the arcade: scatter/chase timers, per-ghost targeting (including the Pinky/Inky "up" bug), no-reverse, the up>left>down>right tie-break, Elroy mode, dot counters, no-up tiles on the classic maze. Frightened times are kinder than the arcade's.
- **Key fruit:** coins rain into the maze instead of opening a secret room.
- **Orange freeze:** touching a frozen ghost shatters it and sends it home. It does not slide.
- **Maze Eater:** the void rises through a fixed maze instead of an endless scroller. Cores appear one at a time, and each one eaten pushes the void back.
- **Ghost Squad fog-of-war** is skipped, because every player shares one screen.
- **Procedural mazes:** the left half is built as a lattice graph (spanning tree + loops + dead-end repair), then mirrored. It is validated for symmetry, connectivity, no dead ends and 1-wide corridors (tested on 1000 seeds).
- **Hit-stop** freezes the whole sim briefly on big events (ghost eats, boss hits), so it is part of the deterministic simulation, not just a visual effect.
