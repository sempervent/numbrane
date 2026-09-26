# Set performance — manual rehearsal checklist

1. Build or load at least four visually distinct scenes (different pieces/parameters).
2. Arrange them into an ordered Set (sequence + edges, or legacy multi-scene JSON).
3. Configure different morph durations per edge (bars/beats/seconds).
4. Mix manual and automatic advancement on consecutive edges.
5. Rehearse from the beginning (`rehearse` mode, transport playing).
6. Rehearse starting directly before a middle transition (`before_transition` entry).
7. Queue scene B, replace with C before launch — confirm B never appears visually.
8. Queue C during an running A→B morph — confirm B fully arrives and dwells before B→C.
9. Confirm autonomous animation continues throughout long morphs (no freeze at ~8s).
10. Use **Capture This** during a morph; confirm the Set JSON is unchanged.
11. Save the captured scene explicitly into captured-scenes storage and reuse in a new set.
12. With MIDI clock, confirm quantized launch and morph land on bar boundaries.
13. Stop MIDI clock — performance continues on internal timing without time reset.
14. Enter full-screen / OBS output — no UI, borders, or debug overlays on canvas.
15. Capture clean output in OBS (1920×1080 or stage viewport).
