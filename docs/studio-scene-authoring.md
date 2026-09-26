# Studio Scene authoring

## What a Scene is

A **Scene** is the durable recipe for one visual configured to live on its own: piece (or composition), parameters, palette, seed, CREATE submode (Generate / Animate / React), and animation specification. It is stored as **`PersistedSceneRecipeV1`** in the browser Scene library (`localStorage` key `numbrane.studio.sceneLibrary.v1`).

At performance time, the same logical definition is emitted as a **`SceneDef`** entry inside a Set catalog. CREATE authors the recipe; SET arranges catalog snapshots; REHEARSE and PERFORM run them.

## Authoring vs runtime

| Authoring (persisted) | Runtime (not persisted) |
|----------------------|-------------------------|
| Recipe fields in `PersistedSceneRecipeV1` | Transport play/pause instant |
| Seed, params, animation spec | Animation clock position |
| Scene name and id | Morph / rehearsal draft overlays |

**Save Scene** writes authoring state. Preview may evolve without mutating the saved recipe until you save again.

**Restart** resets the live runtime clock and simulation for the current recipe; it does not randomize the seed.

## CREATE workflow

1. Choose **Generate**, **Animate**, or **React** (Create subbar).
2. Pick a visual (piece browser or config piece list).
3. Use **Preview** (Play / Pause / Restart).
4. Name the Scene, **Save Scene** or **Save As**.
5. **Add to Set** inserts a **snapshot** into the current Set draft catalog.
6. Open **SET** to order scenes and edges; **REHEARSE** uses the same live path as CREATE preview.

## Save / Load / Save As

- **Save Scene** — new id when unsaved; updates the open scene when already saved. Duplicate names are rejected unless you use Save As or rename.
- **Save As** — always creates a new id; original library entry unchanged.
- **Load scene…** — replaces authoring state from the library (prompts if dirty).

Legacy performance **captured** scenes are imported once into the library when Studio boots.

## Scene ↔ Set ownership

**SetDef 0.2.0** stores scenes in `scene_catalog` and references them by id in `sequence`. **Add to Set** copies the current `SceneDef` into the catalog at insertion time (snapshot semantics). Editing a saved Scene in CREATE later does **not** mutate scenes already in a Set unless you add again or edit the Set directly.

## Advanced

Detailed parameters, export, seed artifacts, locks, and pack tools live under **Advanced** in CREATE. Expert capability is unchanged; default surface emphasizes Scene identity and preview.

## Known limitations (this increment)

- Behavior macros and rich visual preset browser are deferred.
- Generate-mode Scenes persist still-frame configuration; autonomous motion expects Animate or React.
- No cloud sync for the Scene library.
