"""NUMBRANE local render/seed/export API for Dockerized Studio.

Narrow endpoints only — no arbitrary command execution.
Artifacts land under ARTIFACTS_DIR (bind-mounted to ./artifacts on the host).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

ROOT = Path(os.environ.get("NUMBRANE_ROOT", "/src"))
ARTIFACTS = Path(os.environ.get("ARTIFACTS_DIR", "/artifacts"))
CLI = ROOT / "tools" / "numbrane_cli.py"
PYTHON = Path(os.environ.get("VIRTUAL_ENV", str(ROOT / "engines/python/.venv"))) / "bin" / "python"
if not PYTHON.exists():
    PYTHON = Path("python")

PIECE_RE = re.compile(r"^[a-z0-9][a-z0-9_/-]{0,120}$")
SAFE_NAME = re.compile(r"^[a-zA-Z0-9_./-]{1,200}$")
RENDERER_VERSION = "1"

app = FastAPI(title="NUMBRANE Render", version="0.2.0")

# Bounded in-memory preview cache (key -> bytes + meta)
_CACHE: OrderedDict[str, tuple[bytes, dict[str, str]]] = OrderedDict()
_CACHE_MAX = 48


def _ensure_artifacts() -> Path:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    return ARTIFACTS


def _validate_piece(piece: str) -> str:
    if not PIECE_RE.match(piece) or ".." in piece:
        raise HTTPException(400, "invalid piece id")
    return piece


def _digest(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _apply_preview_budgets(piece: str, params: dict[str, Any], quality: str) -> dict[str, Any]:
    """Same algorithm, lower budget for draft/preview quality. Final = full complexity."""
    out = dict(params)
    if quality == "final":
        return out
    # draft is a coarser budget than preview; both preserve mathematics
    draft = quality == "draft"
    if piece == "fields/flow-hatching":
        out["line_spacing"] = max(float(out.get("line_spacing", 4)), 14.0 if draft else 9.0)
        out["streamline_steps"] = min(int(out.get("streamline_steps", 24)), 6 if draft else 10)
        out["density"] = min(float(out.get("density", 1.0)), 0.28 if draft else 0.42)
        out["field_octaves"] = min(int(out.get("field_octaves", 4)), 2 if draft else 3)
    if piece == "particles/noodles":
        out["num_particles"] = min(int(out.get("num_particles", 200)), 18 if draft else 40)
        out["max_steps"] = min(int(out.get("max_steps", 2000)), 80 if draft else 180)
        out["field_octaves"] = min(int(out.get("field_octaves", 4)), 1 if draft else 2)
    if piece.startswith("reaction-diffusion"):
        # Preview still needs enough settle to look like evolved lace/coral/worms,
        # not the raw IC. Final quality leaves settle_steps untouched (early return).
        out["iterations"] = min(int(out.get("iterations", 400)), 400 if draft else 1200)
        if "settle_steps" in out:
            out["settle_steps"] = min(int(out["settle_steps"]), 900 if draft else 2200)
        else:
            out.setdefault("settle_steps", 700 if draft else 1800)
        out.setdefault("settle_cap", 1400 if draft else 3200)
    if piece == "growth/slime-mold":
        out["steps"] = min(int(out.get("steps", 200)), 50 if draft else 120)
    if piece == "growth/differential-growth":
        out["steps"] = min(int(out.get("steps", 200)), 40 if draft else 100)
    if piece == "fractals/strange-attractors":
        out["steps"] = min(int(out.get("steps", 80000)), 12_000 if draft else 40_000)
        out["burn_in"] = min(int(out.get("burn_in", 1000)), 200 if draft else 600)
    if "voronoi" in piece:
        out["num_points"] = min(int(out.get("num_points", 50)), 24 if draft else 40)
    if "truchet" in piece:
        out["tile_scale"] = max(float(out.get("tile_scale", 1.0)), 1.6 if draft else 1.25)
    return out


def _cache_get(key: str) -> tuple[bytes, dict[str, str]] | None:
    item = _CACHE.get(key)
    if item is None:
        return None
    _CACHE.move_to_end(key)
    return item


def _cache_put(key: str, data: bytes, meta: dict[str, str]) -> None:
    _CACHE[key] = (data, meta)
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)


class RenderBody(BaseModel):
    piece: str
    seed: int = 42
    width: int = Field(default=1920, ge=64, le=8192)
    height: int = Field(default=1080, ge=64, le=8192)
    frame: int = Field(default=0, ge=0, le=100_000)
    format: Literal["png", "svg"] = "png"
    quality: Literal["draft", "preview", "final"] = "preview"
    parameters: dict[str, Any] = Field(default_factory=dict)
    recipe: dict[str, Any] = Field(default_factory=dict)

    @field_validator("piece")
    @classmethod
    def piece_ok(cls, v: str) -> str:
        return _validate_piece(v)


class SeedCreateBody(BaseModel):
    piece: str
    seed: int = 42
    width: int = Field(default=256, ge=32, le=2048)
    height: int = Field(default=256, ge=32, le=2048)
    frame: int = Field(default=0, ge=0, le=100_000)
    name: str = "seed"

    @field_validator("piece")
    @classmethod
    def piece_ok(cls, v: str) -> str:
        return _validate_piece(v)

    @field_validator("name")
    @classmethod
    def name_ok(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_-]{1,64}$", v):
            raise HTTPException(400, "invalid name")
        return v


class ExportAnimBody(BaseModel):
    piece: str
    seed: int = 42
    width: int = Field(default=1280, ge=64, le=4096)
    height: int = Field(default=720, ge=64, le=4096)
    fps: int = Field(default=30, ge=1, le=60)
    start_frame: int = Field(default=0, ge=0, le=100_000)
    end_frame: int | None = Field(default=None, ge=1, le=100_000)
    duration_sec: float = Field(default=4.0, ge=0.1, le=60.0)
    format: Literal["webp", "apng", "webm", "gif"] = "webp"
    quality: float = Field(default=0.8, ge=0.1, le=1.0)
    loop: bool = True
    parameters: dict[str, Any] = Field(default_factory=dict)

    @field_validator("piece")
    @classmethod
    def piece_ok(cls, v: str) -> str:
        return _validate_piece(v)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "numbrane-render", "renderer": RENDERER_VERSION}


@app.post("/api/render")
def api_render(body: RenderBody) -> Response:
    """Deterministic still render via numbrane CLI."""
    params = dict(body.parameters or {})
    if isinstance(body.recipe, dict) and body.recipe.get("parameters"):
        merged = dict(body.recipe["parameters"])
        merged.update(params)
        params = merged
    params = _apply_preview_budgets(body.piece, params, body.quality)

    recipe_digest = _digest(
        {
            "piece": body.piece,
            "seed": body.seed,
            "frame": body.frame,
            "width": body.width,
            "height": body.height,
            "quality": body.quality,
            "format": body.format,
            "parameters": params,
            "renderer": RENDERER_VERSION,
        }
    )
    cache_key = f"{recipe_digest}:{body.format}"
    cached = _cache_get(cache_key)
    if cached is not None:
        data, meta = cached
        return Response(content=data, media_type=meta["media"], headers=meta)

    out_dir = _ensure_artifacts() / "studio-export"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time() * 1000)
    out = out_dir / f"export-{stamp}.{body.format}"
    args = [
        str(PYTHON),
        str(CLI),
        "render",
        body.piece,
        "--seed",
        str(body.seed),
        "--width",
        str(body.width),
        "--height",
        str(body.height),
        "--frame",
        str(body.frame),
        "--format",
        body.format,
        "-o",
        str(out),
    ]
    env = os.environ.copy()
    if params:
        env["NUMBRANE_RENDER_PARAMS"] = json.dumps(params)
    env["NUMBRANE_RENDER_QUALITY"] = body.quality
    t0 = time.perf_counter()
    r = subprocess.run(
        args,
        cwd=str(ROOT / "engines/python"),
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    render_ms = int((time.perf_counter() - t0) * 1000)
    if r.returncode != 0 or not out.exists():
        raise HTTPException(500, r.stderr or r.stdout or "render failed")
    data = out.read_bytes()
    render_digest = hashlib.sha256(data).hexdigest()[:16]
    media = "image/svg+xml" if body.format == "svg" else "image/png"
    headers = {
        "X-Numbrane-Piece": body.piece,
        "X-Numbrane-Seed": str(body.seed),
        "X-Numbrane-Frame": str(body.frame),
        "X-Numbrane-Recipe-Digest": recipe_digest,
        "X-Numbrane-Render-Digest": render_digest,
        "X-Numbrane-Render-Ms": str(render_ms),
        "X-Numbrane-Quality": body.quality,
        "X-Numbrane-Renderer": RENDERER_VERSION,
        "media": media,
    }
    _cache_put(cache_key, data, headers)
    return Response(
        content=data,
        media_type=media,
        headers={k: v for k, v in headers.items() if k != "media"},
    )


@app.post("/api/seed")
def api_seed_create(body: SeedCreateBody) -> JSONResponse:
    """Create a Seed Artifact under ./artifacts/seeds/."""
    out_dir = _ensure_artifacts() / "seeds" / f"{body.name}-{body.seed}-f{body.frame}"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    args = [
        str(PYTHON),
        str(CLI),
        "seed",
        "create",
        body.piece,
        "--seed",
        str(body.seed),
        "--width",
        str(body.width),
        "--height",
        str(body.height),
        "--frame",
        str(body.frame),
        "-o",
        str(out_dir),
    ]
    r = subprocess.run(
        args,
        cwd=str(ROOT / "engines/python"),
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if r.returncode != 0 or not out_dir.exists():
        raise HTTPException(500, r.stderr or r.stdout or "seed create failed")
    return JSONResponse(
        {
            "path": str(out_dir.relative_to(_ensure_artifacts())),
            "absolute": str(out_dir),
            "piece": body.piece,
            "seed": body.seed,
            "frame": body.frame,
        }
    )


def _frame_count(body: ExportAnimBody) -> int:
    if body.end_frame is not None:
        return max(1, body.end_frame - body.start_frame)
    return max(1, int(body.fps * body.duration_sec))


@app.post("/api/export")
def api_export_anim(body: ExportAnimBody) -> Response:
    """Render deterministic logical frames, then encode with FFmpeg."""
    n = _frame_count(body)
    if n > 600:
        raise HTTPException(400, "too many frames (max 600)")
    job = _ensure_artifacts() / "anim-export" / uuid.uuid4().hex[:12]
    frames_dir = job / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    params = _apply_preview_budgets(
        body.piece,
        dict(body.parameters or {}),
        "preview" if body.width <= 960 else "final",
    )
    params["construction_animate"] = True
    params["construction_frames"] = n
    if params:
        env["NUMBRANE_RENDER_PARAMS"] = json.dumps(params)
    try:
        for i in range(n):
            frame = body.start_frame + i
            out = frames_dir / f"frame_{i:05d}.png"
            args = [
                str(PYTHON),
                str(CLI),
                "render",
                body.piece,
                "--seed",
                str(body.seed),
                "--width",
                str(body.width),
                "--height",
                str(body.height),
                "--frame",
                str(frame),
                "--format",
                "png",
                "-o",
                str(out),
            ]
            r = subprocess.run(
                args,
                cwd=str(ROOT / "engines/python"),
                env=env,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            if r.returncode != 0 or not out.exists():
                raise HTTPException(
                    500, f"frame {frame} failed: {r.stderr or r.stdout or 'unknown'}"
                )

        ext = body.format
        encoded = job / f"out.{ext}"
        pattern = str(frames_dir / "frame_%05d.png")
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise HTTPException(500, "ffmpeg not installed in render image")

        if body.format == "webm":
            cmd = [
                ffmpeg,
                "-y",
                "-framerate",
                str(body.fps),
                "-i",
                pattern,
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                str(int(35 - body.quality * 20)),
                "-pix_fmt",
                "yuv420p",
                str(encoded),
            ]
            media = "video/webm"
        elif body.format == "webp":
            loop = "0" if body.loop else "1"
            cmd = [
                ffmpeg,
                "-y",
                "-framerate",
                str(body.fps),
                "-i",
                pattern,
                "-c:v",
                "libwebp",
                "-lossless",
                "0",
                "-quality",
                str(int(body.quality * 100)),
                "-loop",
                loop,
                "-an",
                str(encoded),
            ]
            media = "image/webp"
        elif body.format == "apng":
            cmd = [
                ffmpeg,
                "-y",
                "-framerate",
                str(body.fps),
                "-i",
                pattern,
                "-plays",
                "0" if body.loop else "1",
                "-f",
                "apng",
                str(encoded),
            ]
            media = "image/apng"
        else:  # gif
            cmd = [
                ffmpeg,
                "-y",
                "-framerate",
                str(body.fps),
                "-i",
                pattern,
                "-gifflags",
                "+transdiff",
                "-loop",
                "0" if body.loop else "-1",
                str(encoded),
            ]
            media = "image/gif"

        enc = subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
        if enc.returncode != 0 or not encoded.exists():
            raise HTTPException(500, enc.stderr or "ffmpeg encode failed")

        published = (
            _ensure_artifacts()
            / "anim-export"
            / f"{body.piece.replace('/', '_')}-s{body.seed}.{ext}"
        )
        published.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(encoded, published)
        data = encoded.read_bytes()
        return Response(
            content=data,
            media_type=media,
            headers={
                "X-Numbrane-Artifact": str(published.relative_to(_ensure_artifacts())),
                "X-Numbrane-Frames": str(n),
                "X-Numbrane-Recipe-Digest": _digest(
                    {
                        "piece": body.piece,
                        "seed": body.seed,
                        "parameters": params,
                        "fps": body.fps,
                        "n": n,
                    }
                ),
            },
        )
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)


class PackExportBody(BaseModel):
    pack: dict[str, Any]
    performance_set: dict[str, Any] = Field(default_factory=dict)
    preview: bool = False


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return (s or "pfl-pack")[:48]


def _still_size(preset: str, preview: bool) -> tuple[int, int]:
    table = {
        "episode-16x9": (3840, 2160),
        "projection-16x9": (1920, 1080),
        "square": (2160, 2160),
        "portrait": (2160, 3840),
    }
    w, h = table.get(preset, (1920, 1080))
    if preview:
        return max(320, w // 6), max(180, h // 6)
    return w, h


def _anim_duration(preset: str, fallback: float, preview: bool) -> float:
    table = {"loop-6s": 6.0, "loop-12s": 12.0, "section-20s": 20.0, "section-30s": 30.0}
    d = float(table.get(preset, fallback or 12.0))
    return min(d, 2.0) if preview else d


@app.post("/api/pack/export")
def api_pack_export(body: PackExportBody) -> dict[str, Any]:
    """Export a PFL production pack under artifacts/pfl-packs/<slug>/."""
    pack = dict(body.pack or {})
    name = str(pack.get("name") or "PFL Pack")
    slug = _slugify(name)
    root = _ensure_artifacts() / "pfl-packs" / slug
    stills = root / "stills"
    anims = root / "animations"
    recipes = root / "recipes"
    perf = root / "performance"
    for d in (stills, anims, recipes, perf):
        d.mkdir(parents=True, exist_ok=True)

    items = list(pack.get("items") or [])
    contact_thumbs: list[Path] = []
    written: list[dict[str, Any]] = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        n = idx + 1
        piece = str(item.get("pieceId") or item.get("piece") or "")
        if not piece:
            continue
        try:
            _validate_piece(piece)
        except HTTPException:
            continue
        seed = int(item.get("seed", 42)) & 0xFFFFFFFF
        params = dict(item.get("parameters") or {})
        if item.get("styleId"):
            params.setdefault("pfl_style", item["styleId"])
        kind = str(item.get("kind") or "still")
        stem = f"{n:02d}-{piece.replace('/', '_')}-s{seed}"
        recipe_path = recipes / f"{stem}.json"
        recipe_path.write_text(
            json.dumps(
                {
                    "piece": piece,
                    "seed": seed,
                    "frame": int(item.get("frame", 0)),
                    "parameters": params,
                    "kind": kind,
                    "animArc": item.get("animArc"),
                    "durationSec": item.get("durationSec"),
                },
                indent=2,
            )
        )

        # Always render a still preview (used for contact sheet + stills/)
        sw, sh = _still_size(str(item.get("stillPreset") or pack.get("still_preset") or "projection-16x9"), body.preview)
        still_out = stills / f"{stem}.png"
        env = os.environ.copy()
        env["NUMBRANE_RENDER_PARAMS"] = json.dumps(params)
        quality = "draft" if body.preview else "final"
        r = subprocess.run(
            [
                str(PYTHON),
                str(CLI),
                "render",
                piece,
                "--seed",
                str(seed),
                "--width",
                str(sw),
                "--height",
                str(sh),
                "--frame",
                str(int(item.get("frame", 0))),
                "--format",
                "png",
                "-o",
                str(still_out),
            ],
            cwd=str(ROOT / "engines/python"),
            env={**env, "NUMBRANE_RENDER_QUALITY": quality},
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if r.returncode == 0 and still_out.exists():
            contact_thumbs.append(still_out)
            written.append({"n": n, "kind": "still", "path": str(still_out.relative_to(root))})

        if kind in {"animation", "react"}:
            if body.preview:
                # Short animated webp stub for preview packs
                dur = _anim_duration(
                    str(item.get("animPreset") or "loop-6s"),
                    float(item.get("durationSec") or 6),
                    True,
                )
                fps = 8
                nframes = max(4, int(dur * fps))
                job = root / f".tmp-anim-{n}"
                frames_dir = job / "frames"
                frames_dir.mkdir(parents=True, exist_ok=True)
                try:
                    for fi in range(nframes):
                        fout = frames_dir / f"frame_{fi:05d}.png"
                        fr = int(item.get("frame", 0)) + fi
                        subprocess.run(
                            [
                                str(PYTHON),
                                str(CLI),
                                "render",
                                piece,
                                "--seed",
                                str(seed),
                                "--width",
                                str(min(sw, 480)),
                                "--height",
                                str(min(sh, 270)),
                                "--frame",
                                str(fr),
                                "--format",
                                "png",
                                "-o",
                                str(fout),
                            ],
                            cwd=str(ROOT / "engines/python"),
                            env={**env, "NUMBRANE_RENDER_QUALITY": "draft"},
                            capture_output=True,
                            text=True,
                            timeout=60,
                            check=False,
                        )
                    ffmpeg = shutil.which("ffmpeg")
                    anim_out = anims / f"{stem}.webp"
                    if ffmpeg and any(frames_dir.glob("*.png")):
                        subprocess.run(
                            [
                                ffmpeg,
                                "-y",
                                "-framerate",
                                str(fps),
                                "-i",
                                str(frames_dir / "frame_%05d.png"),
                                "-loop",
                                "0",
                                "-q:v",
                                "60",
                                str(anim_out),
                            ],
                            capture_output=True,
                            text=True,
                            timeout=60,
                            check=False,
                        )
                        if anim_out.exists():
                            written.append(
                                {
                                    "n": n,
                                    "kind": "animation",
                                    "path": str(anim_out.relative_to(root)),
                                }
                            )
                finally:
                    shutil.rmtree(job, ignore_errors=True)
            else:
                dur = _anim_duration(
                    str(item.get("animPreset") or "loop-12s"),
                    float(item.get("durationSec") or 12),
                    False,
                )
                fps = 24
                nframes = min(240, max(8, int(dur * fps)))
                fmt = str(item.get("animFormat") or "webp")
                if fmt not in {"webp", "webm", "apng"}:
                    fmt = "webp"
                aw, ah = _still_size(
                    str(item.get("stillPreset") or "projection-16x9"), False
                )
                aw, ah = min(aw, 1920), min(ah, 1080)
                job = root / f".tmp-anim-{n}"
                frames_dir = job / "frames"
                frames_dir.mkdir(parents=True, exist_ok=True)
                try:
                    for fi in range(nframes):
                        fout = frames_dir / f"frame_{fi:05d}.png"
                        fr = int(item.get("frame", 0)) + fi
                        subprocess.run(
                            [
                                str(PYTHON),
                                str(CLI),
                                "render",
                                piece,
                                "--seed",
                                str(seed),
                                "--width",
                                str(aw),
                                "--height",
                                str(ah),
                                "--frame",
                                str(fr),
                                "--format",
                                "png",
                                "-o",
                                str(fout),
                            ],
                            cwd=str(ROOT / "engines/python"),
                            env=env,
                            capture_output=True,
                            text=True,
                            timeout=120,
                            check=False,
                        )
                    ffmpeg = shutil.which("ffmpeg")
                    anim_out = anims / f"{stem}.{fmt}"
                    if ffmpeg and any(frames_dir.glob("*.png")):
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
                        subprocess.run(
                            cmd, capture_output=True, text=True, timeout=180, check=False
                        )
                        if anim_out.exists():
                            written.append(
                                {
                                    "n": n,
                                    "kind": "animation",
                                    "path": str(anim_out.relative_to(root)),
                                }
                            )
                finally:
                    shutil.rmtree(job, ignore_errors=True)

    # Performance set
    perf_set = body.performance_set or {}
    if not perf_set:
        perf_set = {
            "protocol_version": "0.1.0",
            "set_id": f"pfl-packs-{slug}",
            "name": name,
            "scenes": [],
            "cues": [],
        }
    (perf / "set.json").write_text(json.dumps(perf_set, indent=2) + "\n")

    # Contact sheet
    contact = root / "contact-sheet.png"
    try:
        from PIL import Image, ImageDraw

        cell = 220
        cols = min(4, max(1, len(contact_thumbs)))
        rows = max(1, (len(contact_thumbs) + cols - 1) // cols)
        sheet = Image.new(
            "RGB", (cols * cell + 20, rows * (cell + 36) + 20), (12, 12, 14)
        )
        draw = ImageDraw.Draw(sheet)
        for i, thumb in enumerate(contact_thumbs):
            r, c = divmod(i, cols)
            x, y = 10 + c * cell, 10 + r * (cell + 36)
            im = Image.open(thumb).convert("RGB")
            im.thumbnail((cell - 8, cell - 8))
            sheet.paste(im, (x + 4, y + 4))
            item = items[i] if i < len(items) else {}
            label = (
                f"{i + 1:02d}  {str(item.get('pieceId', '')).split('/')[-1]}  "
                f"s{item.get('seed', '')}"
            )
            draw.text((x + 4, y + cell - 2), label[:42], fill=(200, 205, 215))
        sheet.save(contact)
    except Exception:
        contact.write_bytes(b"")

    pack_out = dict(pack)
    pack_out["pack_id"] = f"pfl-packs/{slug}"
    pack_out["output_root"] = f"artifacts/pfl-packs/{slug}"
    pack_out["exports"] = written
    manifest = root / "manifest.json"
    manifest.write_text(json.dumps(pack_out, indent=2) + "\n")

    return {
        "ok": True,
        "slug": slug,
        "path": f"artifacts/pfl-packs/{slug}",
        "manifest_url": f"/api/artifact/pfl-packs/{slug}/manifest.json",
        "contact_sheet_url": f"/api/artifact/pfl-packs/{slug}/contact-sheet.png",
    }


@app.get("/api/artifact/{path:path}")
def get_artifact(path: str) -> FileResponse:
    if ".." in path or path.startswith("/"):
        raise HTTPException(400, "invalid path")
    target = (_ensure_artifacts() / path).resolve()
    if not str(target).startswith(str(_ensure_artifacts().resolve())):
        raise HTTPException(400, "path escape")
    if not target.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(target)
