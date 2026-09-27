# Studio recovery recon

## Symptom (human)

Studio reported **completely broken** after catalog/behavior/framing pass — navigation/tests hang, pieces fail after long runs.

## First bad technical event

1. **Live GENERATE black canvas:** `kickLiveSurface()` called `ensureLoopRunning()` after `finishLiveGenerate()` primed a paused snapshot, restarting RAF with simulation paused and corrupting the post/feedback present path (`meanLuminance ≈ 0`, tests timeout on `waitForStudioPresent`).
2. **Stuck scene apply:** failed `loadSet` / missing session returned without `markSceneCommitted`, leaving `committedSceneGeneration !== sceneGeneration`.

## Likely subsystem

Scene apply lifecycle + live GENERATE present priming (`runApplyPieceScene` → `finishLiveGenerate` → `kickLiveSurface`).

## Comparison f63296a vs b166a79

- f63296a: same missing commit on load failure; shorter animate boot.
- b166a79: `await paintFramesAsync(36)` blocked animate apply; registry ran spurious generate warmup steps for shader-native “immediate” pieces.

## Recovery changes (checkpoint)

- `resolveSceneApply()` on terminal error paths; `sceneApplyPhase` for watchdog gating.
- Live GENERATE: sync animation spec to session, adequate `paintFrames` prime, `stopLoop()` after prime, skip `kickLiveSurface` when paused generate snapshot.
- `finishLiveGenerate`: warmup only when `policy.interactive === "warmup"`.
- Non-blocking animate boot: sync `paintFrames(4)` + optional `paintFramesAsync`.
- `studio-golden-path.spec.ts` first E2E gate.

## Bisect note

GENERATE blackout introduced when live generate priming interacted with `kickLiveSurface` RAF restart (recent app.ts lifecycle work on branch). Stuck-generation bug latent since f63296a, exposed by marathon E2E.
