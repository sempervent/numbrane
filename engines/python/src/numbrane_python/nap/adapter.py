"""Convert a simple NAP recipe dict into RenderContext + sketch config kwargs."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from numbrane_python.core.config import Quality
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.rng import MASK, numpy_rng_from_nap_seed
from numbrane_python.rng import Rng


def recipe_to_render_context(
    recipe: dict[str, Any],
    *,
    output_dir: Path | None = None,
    frame: int = 0,
    time: float = 0.0,
    quality: Quality | None = None,
) -> tuple[RenderContext, dict[str, Any]]:
    """Adapt a NAP recipe into a engine ``RenderContext`` and config kwargs.

    Expected recipe shape (minimal)::

        {
          "seed": <u32>,
          "parameters": {
            "width": 1920,
            "height": 1080,
            ...sketch-specific keys...
          }
        }

    Dotted keys such as ``output.width`` / ``output.height`` are also accepted.
    The returned config kwargs always include ``seed``, ``width``, and ``height``.
    """
    seed = int(recipe.get("seed", 0)) & MASK
    params = dict(recipe.get("parameters") or {})

    width = int(params.pop("width", params.pop("output.width", recipe.get("width", 1920))))
    height = int(params.pop("height", params.pop("output.height", recipe.get("height", 1080))))

    # Prefer NAP-derived numpy RNG so sketches stay deterministic vs NAP seed.
    rng = numpy_rng_from_nap_seed(seed)
    ctx = RenderContext(
        rng=rng,
        width=width,
        height=height,
        frame=frame,
        time=time,
        quality=quality,
        output_dir=output_dir,
    )

    config_kwargs: dict[str, Any] = {
        "seed": seed,
        "width": width,
        "height": height,
        **params,
    }
    return ctx, config_kwargs


def nap_rng(seed: int) -> Rng:
    """Construct the protocol NAP xoshiro RNG from a u32 seed."""
    return Rng(int(seed) & MASK)
