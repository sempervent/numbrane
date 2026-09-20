# PFL production pack workflow

NUMBRANE Studio can assemble a **PFL Pack** — ordered favorites with recipes — and export it through the Docker render service.

## Build a pack (Studio)

1. Open Studio (`/studio.html`) via Compose (`just compose-up` or your deployment recipe).
2. In **GENERATE**, explore pieces; use **Add to Pack** or **+ Anim section** for performance scenes.
3. **Favorites → Pack** bulk-adds saved favorites (still sections).
4. Open **PFL Pack** panel: set name (e.g. `Midnight PFL Pack`), still preset, reorder (↑↓), change kind (still / animation / react).
5. **Load Midnight fixture** loads the committed rehearsal pack from `pieces/pfl/midnight-pfl-pack/pack.json`.

Draft state persists in `localStorage` (`numbrane.studio.pack.v1`).

## Export

- **Build PFL Pack** — full-quality export under `artifacts/pfl-packs/<slug>/`.
- **Preview export** — draft resolution and short animations for quick inspection.

Export runs `POST /api/pack/export` on the render service. Outputs:

| Path | Purpose |
|------|---------|
| `manifest.json` | Pack + `exports[]` keyed by `item_id` |
| `stills/*.png` | One still per item (contact sheet source) |
| `animations/*` | WebP/WebM/APNG for animation/react items |
| `recipes/*.json` | Per-item recipe with `item_id` + order |
| `performance/set.json` | NAP live set (animation/react scenes) |
| `contact-sheet.png` | Grid labeled by **pack order**, not sparse index |

### Failed exports

Export is **fail-closed** and **atomic**:

- Work happens in a staging directory; the previous pack directory is replaced only after all items succeed.
- On failure: `ok: false`, `error`, optional `failed_item_id`, staging removed.
- A failed still/animation does **not** shift contact-sheet labels or manifest `exports` onto the wrong file.
- Missing **ffmpeg** fails when an animation/react section requires encoding.
- Invalid or unknown `pieceId` fails immediately for that item.

## Reload and edit

1. **Reload exported** reads `artifacts/pfl-packs/<slug>/manifest.json` via `/api/artifact/...`.
2. Replace an item: remove (×), add a new look from GENERATE, or change kind/preset in the panel.
3. Reorder with ↑↓ (updates performance set order on next export).
4. **Build PFL Pack** again; manifest `exports` realign to stable `item_id` values.

## Load `performance/set.json`

After export:

```text
artifacts/pfl-packs/midnight-pfl-pack/performance/set.json
```

Live / rehearsal:

```text
/live.html?set=midnight-pfl-pack
```

(Also served as `/sets/midnight-pfl-pack.json` from `pieces/live/midnight-pfl-pack/set.json` in dev/build.)

## Live Studio keyboard (Animate / React)

| Keys | Action |
|------|--------|
| `[` or `←` | Previous visualization (clean — no picker, no toast) |
| `]` or `→` | Next visualization |
| `?` | Keyboard reference (registry-backed) |
| `Tab` | Show/hide configuration |
| `Space` | Play / pause |
| `2` | ANIMATE mode |
| `` ` `` | Performance HUD (optional) |

With configuration hidden (`Tab`), chrome and meta strip stay off the canvas during switching.

Shortcuts do not fire while focus is in `input`, `textarea`, `select`, or contenteditable fields (except `Esc`).

## 15-minute PFL Studio Rehearsal Gate

1. Launch Compose Studio on `:8080` (or your pinned deployment).
2. Load **Midnight fixture** → preview export → full export; inspect `artifacts/pfl-packs/midnight-pfl-pack/`.
3. Reload exported manifest; replace one item; reorder two items; re-export; confirm `exports`/`recipes` match items.
4. Open `/live.html?set=midnight-pfl-pack` and verify scenes.
5. Enter **ANIMATE**; switch with `[` / `]` across shader, RD/slime-class, and geometry pieces.
6. Confirm no black/blank handoff, no stuck static frames, no overlay chrome while switching.
7. Open `?` shortcut menu — bindings match table above.
8. Pause/resume (`Space`), restart seed (`Shift+R`), toggle React on one scene (`3`), observe silence.
9. Leave Studio ~5 minutes; watch browser console for repeating errors.

Human checklist:

- [ ] No black or substantially blank transition frame
- [ ] No visualization unintentionally static while Animate is active
- [ ] Next/previous visualization keyboard controls work
- [ ] Keyboard switching does not display unwanted indicators/chrome
- [ ] Shortcut help accurately reflects implemented bindings
- [ ] Shortcuts do not fire while typing into editable controls
- [ ] No unrecoverable Studio state
- [ ] No runaway React response during silence
- [ ] Switching remains usable without restarting Studio
- [ ] Browser console contains no repeating exceptions
- [ ] Exported Midnight PFL Pack loads successfully
