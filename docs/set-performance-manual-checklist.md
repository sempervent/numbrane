# Set performance — verification checklist

## Verified today (automated / software-only)

- [x] Fixture `pieces/live/set-performance-fixture/set.json` resolves four distinct scenes (`set_integration.test.ts`).
- [x] Orchestrator queue replacement, mid-transition queue, minimum dwell (`set_orchestrator.test.ts`).
- [x] Edge realignment on scene reorder (`set_score_edges.test.ts`).
- [x] Set composer persistence round-trip via localStorage (`set_score_ui.test.ts`).
- [x] Perform status view reflects queued scenes (`set_score_ui.test.ts`).
- [x] Studio `#set-score-chrome` lives outside `#stage-wrap`; hidden when `controls-hidden` (`set_score_ui.test.ts`).
- [x] Rehearse-style morph mid-progress + capture candidate without mutating Set JSON (`set_score_workflow.test.ts`).
- [x] Automatic dwell advancement under simulated beats (`set_score_workflow.test.ts`).
- [x] MIDI timing health flag on orchestrator snapshot (`set_score_workflow.test.ts`).
- [x] Legacy 0.1.0 set navigation with dwell-aware ticks (`live_transport.test.ts`).

### Studio UI walkthrough (manual in browser when convenient)

1. Open Studio — confirm top nav **Create | Set | Rehearse | Perform** (Rehearse visible without scrolling).
2. **Create** → Generate/Animate/React sub-bar; author a visual as before.
3. **Set** → open/load Set (`?dev` for fixture in development); confirm horizontal score chain A → B → C → D.
4. Select **→** between scenes; configure Advance (Manual/Automatic), quantization dropdown, single morph duration + unit.
5. **Rehearse** tab → **Rehearse** button visible immediately → start → **Advance** / **Capture This** when morphing.
6. **Perform** tab → **Enter Perform** → **Advance** dominant; Tab hides all chrome on canvas.
7. Optional: capture screenshots at 1440×900 for Create / Set / Rehearse / Perform.

## Deferred hardware verification

- Physical MIDI controller mapping (Advance via hardware — clock/status only wired today).
- Real MIDI clock at venue; long rehearsal with external transport.
- OBS / multi-monitor capture of full-screen output.
- Physical multi-hour live show soak.

## Original rehearsal scenarios (still apply once hardware is available)

1. Build or load at least four visually distinct scenes.
2. Arrange ordered Set with mixed manual/automatic edges.
3. Configure different morph durations per edge.
4. Rehearse from start and from `before_transition` on a middle edge.
5. Queue B, replace with C before launch — B never appears.
6. Queue C during A→B morph — B completes and dwells before B→C.
7. Confirm animation continues through long morphs.
8. Capture morph state; confirm Set JSON unchanged until explicit save/apply.
9. MIDI clock: quantized launch on bar boundaries.
10. Stop MIDI — internal timing continues without time reset.
11. OBS output — artwork only, no Set names or countdowns on canvas.
