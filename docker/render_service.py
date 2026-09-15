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
    """Same algorithm, lower budget for preview quality."""
    out = dict(params)
    if quality != "preview":
        return out
    if piece == "fields/flow-hatching":
        out["line_spacing"] = max(float(out.get("line_spacing", 4)), 7.0)
        out["streamline_steps"] = min(int(out.get("streamline_steps", 24)), 12)
        out["density"] = min(float(out.get("density", 1.0)), 0.55)
    if piece.startswith("reaction-diffusion"):
        out["iterations"] = min(int(out.get("iterations", 400)), 220)
    if piece == "growth/slime-mold":
        out["steps"] = min(int(out.get("steps", 200)), 120)
    if piece == "fractals/strange-attractors":
        out["steps"] = min(int(out.get("steps", 80000)), 40000)
    if "voronoi" in piece:
        out["num_points"] = min(int(out.get("num_points", 50)), 40)
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
    quality: Literal["preview", "final"] = "preview"
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
