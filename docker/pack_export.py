"""PFL pack export — atomic, fail-closed batch render under artifacts/pfl-packs/."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.pack_export_lib import (  # noqa: E402
    anim_duration,
    contact_label,
    item_stem,
    slugify,
    still_size,
)

ValidatePiece = Callable[[str], str]


@dataclass
class PackExportContext:
    root: Path
    python: Path
    cli: Path
    cwd: Path
    validate_piece: ValidatePiece
    preview: bool


class PackExportFailure(Exception):
    def __init__(self, message: str, *, item_id: str | None = None, errors: list[str] | None = None):
        super().__init__(message)
        self.item_id = item_id
        self.errors = errors or [message]


def _run_render(
    ctx: PackExportContext,
    piece: str,
    seed: int,
    width: int,
    height: int,
    frame: int,
    out: Path,
    params: dict[str, Any],
    quality: str,
) -> None:
    import os

    env = os.environ.copy()
    env["NUMBRANE_RENDER_PARAMS"] = json.dumps(params)
    env["NUMBRANE_RENDER_QUALITY"] = quality
    r = subprocess.run(
        [
            str(ctx.python),
            str(ctx.cli),
            "render",
            piece,
            "--seed",
            str(seed),
            "--width",
            str(width),
            "--height",
            str(height),
            "--frame",
            str(frame),
            "--format",
            "png",
            "-o",
            str(out),
        ],
        cwd=str(ctx.cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if r.returncode != 0 or not out.exists():
        detail = (r.stderr or r.stdout or "render failed").strip().split("\n")[-1][:240]
        raise PackExportFailure(f"still render failed for {piece}: {detail}")


def _encode_frames(
    frames_dir: Path,
    anim_out: Path,
    fmt: str,
    fps: int,
) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise PackExportFailure("ffmpeg not installed — required for pack animation export")
    if not any(frames_dir.glob("frame_*.png")):
        raise PackExportFailure("no animation frames produced")
    pattern = str(frames_dir / "frame_%05d.png")
    if fmt == "webm":
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            str(fps),
            "-i",
            pattern,
            "-c:v",
            "libvpx-vp9",
            "-b:v",
            "0",
            "-crf",
            "32",
            "-pix_fmt",
            "yuv420p",
            str(anim_out),
        ]
    else:
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            str(fps),
            "-i",
            pattern,
            "-loop",
            "0",
            "-q:v",
            "50",
            str(anim_out),
        ]
    enc = subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
    if enc.returncode != 0 or not anim_out.exists():
        raise PackExportFailure((enc.stderr or "ffmpeg encode failed").strip()[:240])


def export_pfl_pack(
    *,
    artifacts: Path,
    pack: dict[str, Any],
    performance_set: dict[str, Any],
    preview: bool,
    python: Path,
    cli: Path,
    cwd: Path,
    validate_piece: ValidatePiece,
) -> dict[str, Any]:
    """Export pack into artifacts/pfl-packs/<slug>/; replace prior export atomically on success."""
    name = str(pack.get("name") or "PFL Pack")
    slug = slugify(name)
    final_root = artifacts / "pfl-packs" / slug
    staging = artifacts / "pfl-packs" / f".staging-{uuid.uuid4().hex[:12]}"
    stills = staging / "stills"
    anims = staging / "animations"
    recipes = staging / "recipes"
    perf = staging / "performance"
    for d in (stills, anims, recipes, perf):
        d.mkdir(parents=True, exist_ok=True)

    items_raw = pack.get("items") or []
    if not isinstance(items_raw, list) or not items_raw:
        raise PackExportFailure("pack has no items")

    ctx = PackExportContext(
        root=staging,
        python=python,
        cli=cli,
        cwd=cwd,
        validate_piece=validate_piece,
        preview=preview,
    )
    quality = "draft" if preview else "final"
    contact_rows: list[tuple[int, str, int, Path]] = []
    written: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        for idx, raw in enumerate(items_raw):
            if not isinstance(raw, dict):
                raise PackExportFailure(f"item {idx + 1} is not an object", item_id=str(idx))
            item_id = str(raw.get("id") or f"item-{idx + 1}")
            order = idx + 1
            piece = str(raw.get("pieceId") or raw.get("piece") or "")
            if not piece:
                raise PackExportFailure("missing pieceId", item_id=item_id)
            try:
                ctx.validate_piece(piece)
            except Exception as exc:
                raise PackExportFailure(f"invalid piece {piece!r}: {exc}", item_id=item_id) from exc

            seed = int(raw.get("seed", 42)) & 0xFFFFFFFF
            params = dict(raw.get("parameters") or {})
            if raw.get("styleId"):
                params.setdefault("pfl_style", raw["styleId"])
            kind = str(raw.get("kind") or "still")
            stem = item_stem(order, piece, seed)

            recipe_path = recipes / f"{stem}.json"
            recipe_path.write_text(
                json.dumps(
                    {
                        "item_id": item_id,
                        "order": order,
                        "piece": piece,
                        "seed": seed,
                        "frame": int(raw.get("frame", 0)),
                        "parameters": params,
                        "kind": kind,
                        "animArc": raw.get("animArc"),
                        "durationSec": raw.get("durationSec"),
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            preset = str(raw.get("stillPreset") or pack.get("still_preset") or "projection-16x9")
            sw, sh = still_size(preset, preview)
            still_out = stills / f"{stem}.png"
            try:
                _run_render(
                    ctx,
                    piece,
                    seed,
                    sw,
                    sh,
                    int(raw.get("frame", 0)),
                    still_out,
                    params,
                    quality,
                )
            except PackExportFailure as exc:
                exc.item_id = item_id
                raise

            contact_rows.append((order, piece, seed, still_out))
            written.append(
                {
                    "item_id": item_id,
                    "order": order,
                    "kind": "still",
                    "path": str(still_out.relative_to(staging)),
                }
            )

            if kind not in {"animation", "react"}:
                continue

            dur = anim_duration(
                str(raw.get("animPreset") or "loop-12s"),
                float(raw.get("durationSec") or 12),
                preview,
            )
            fps = 8 if preview else 24
            nframes = max(4, min(240, int(dur * fps)))
            fmt = str(raw.get("animFormat") or "webp")
            if fmt not in {"webp", "webm", "apng"}:
                fmt = "webp"
            aw, ah = still_size(preset, False)
            aw, ah = (min(aw, 480), min(ah, 270)) if preview else (min(aw, 1920), min(ah, 1080))
            job = staging / f".tmp-anim-{order}"
            frames_dir = job / "frames"
            frames_dir.mkdir(parents=True, exist_ok=True)
            try:
                for fi in range(nframes):
                    fout = frames_dir / f"frame_{fi:05d}.png"
                    fr = int(raw.get("frame", 0)) + fi
                    _run_render(ctx, piece, seed, aw, ah, fr, fout, params, "draft" if preview else quality)
                anim_out = anims / f"{stem}.{fmt}"
                _encode_frames(frames_dir, anim_out, fmt, fps)
                written.append(
                    {
                        "item_id": item_id,
                        "order": order,
                        "kind": "animation",
                        "path": str(anim_out.relative_to(staging)),
                    }
                )
            finally:
                shutil.rmtree(job, ignore_errors=True)

        perf_set = performance_set or {
            "protocol_version": "0.1.0",
            "set_id": f"pfl-packs-{slug}",
            "name": name,
            "scenes": [],
            "cues": [],
        }
        (perf / "set.json").write_text(json.dumps(perf_set, indent=2) + "\n", encoding="utf-8")

        contact = staging / "contact-sheet.png"
        try:
            from PIL import Image, ImageDraw

            cell = 220
            cols = min(4, max(1, len(contact_rows)))
            rows = max(1, (len(contact_rows) + cols - 1) // cols)
            sheet = Image.new("RGB", (cols * cell + 20, rows * (cell + 36) + 20), (12, 12, 14))
            draw = ImageDraw.Draw(sheet)
            for i, (order, piece_id, seed, thumb) in enumerate(contact_rows):
                r, c = divmod(i, cols)
                x, y = 10 + c * cell, 10 + r * (cell + 36)
                im = Image.open(thumb).convert("RGB")
                im.thumbnail((cell - 8, cell - 8))
                sheet.paste(im, (x + 4, y + 4))
                label = contact_label(order, piece_id, seed)
                draw.text((x + 4, y + cell - 2), label[:42], fill=(200, 205, 215))
            sheet.save(contact)
        except Exception as exc:
            raise PackExportFailure(f"contact sheet failed: {exc}") from exc

        pack_out = dict(pack)
        pack_out["pack_id"] = f"pfl-packs/{slug}"
        pack_out["output_root"] = f"artifacts/pfl-packs/{slug}"
        pack_out["exports"] = written
        (staging / "manifest.json").write_text(json.dumps(pack_out, indent=2) + "\n", encoding="utf-8")

        if final_root.exists():
            shutil.rmtree(final_root)
        staging.rename(final_root)

        return {
            "ok": True,
            "slug": slug,
            "path": f"artifacts/pfl-packs/{slug}",
            "manifest_url": f"/api/artifact/pfl-packs/{slug}/manifest.json",
            "contact_sheet_url": f"/api/artifact/pfl-packs/{slug}/contact-sheet.png",
        }
    except PackExportFailure as exc:
        errors.extend(exc.errors)
        shutil.rmtree(staging, ignore_errors=True)
        return {
            "ok": False,
            "slug": slug,
            "path": "",
            "error": str(exc),
            "errors": errors,
            "failed_item_id": exc.item_id,
        }
    except Exception as exc:
        shutil.rmtree(staging, ignore_errors=True)
        return {
            "ok": False,
            "slug": slug,
            "path": "",
            "error": str(exc),
            "errors": [str(exc)],
        }
