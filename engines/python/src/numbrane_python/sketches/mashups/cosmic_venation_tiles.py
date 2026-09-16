from __future__ import annotations

"""Cosmic venation tiles - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam, AngleParam,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class CosmicVenationTilesConfig(BaseModel):
    """Configuration for cosmic venation tiles sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Growth parameters
    num_seeds: int = Field(default=5)
    growth_rate: float = Field(default=0.5)
    branch_angle: float = Field(default=45.0)
    branch_prob: float = Field(default=0.02)
    max_length: float = Field(default=500.0)

    # Tile parameters
    tile_size: int = Field(default=40)
    tile_set: str = Field(default="curves")
    tile_perturbation: float = Field(default=0.1)

    # Coupling parameters
    respect_tiles: bool = Field(default=True)
    breakthrough_prob: float = Field(default=0.01)
    tile_influence: float = Field(default=0.5)

    # Rendering
    vein_thickness: float = Field(default=2.0)
    palette: str = Field(default="deep_sea")
    tile_bg_color: tuple = Field(default=(20, 20, 40))
    vignette_strength: float = Field(default=0.3)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="cosmic_venation_tiles",
        description="Biological venation patterns colonizing a Truchet tile universe",
        params=[
            IntParam("num_seeds", 1, 20, 5, path="sim.growth.num_seeds"),
            FloatParam("growth_rate", 0.1, 2.0, 0.5, path="sim.growth.rate"),
            AngleParam("branch_angle", 10.0, 90.0, 45.0, path="sim.growth.branch_angle"),
            FloatParam("branch_prob", 0.0, 0.1, 0.02, path="sim.growth.branch_prob"),
            FloatParam("max_length", 100.0, 1000.0, 500.0, path="sim.growth.max_length"),
            IntParam("tile_size", 20, 200, 40, path="geom.tile.size"),
            ChoiceParam("tile_set", ["curves", "arcs", "maze"], default="curves", path="geom.tile.set"),
            FloatParam("tile_perturbation", 0.0, 0.5, 0.1, path="geom.tile.perturbation"),
            BoolParam("respect_tiles", True, path="composition.venation.respect_tiles"),
            FloatParam("breakthrough_prob", 0.0, 0.1, 0.01, path="composition.venation.breakthrough_prob"),
            FloatParam("tile_influence", 0.0, 1.0, 0.5, path="composition.venation.tile_influence"),
            FloatParam("vein_thickness", 0.5, 5.0, 2.0, path="geom.vein.thickness"),
            ColorParam("palette", "deep_sea", path="color.palette"),
            ColorParam("tile_bg_color", (20, 20, 40), path="color.tile.background"),
            FloatParam("vignette_strength", 0.0, 1.0, 0.3, path="post.vignette.strength"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = CosmicVenationTilesConfig()
    return config.model_dump()


def render(config: CosmicVenationTilesConfig, ctx: RenderContext) -> "RenderResult":
    """Render cosmic venation tiles."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.draw import draw_polyline, draw_line
    from numbrane_python.render.palettes import get_palette
    from numbrane_python.render.postfx import apply_vignette
    import numpy as np

    # Create canvas
    canvas = Canvas(ctx.width, ctx.height, 3)

    # Draw background
    canvas.fill_background(config.tile_bg_color)

    # Draw Truchet tiles
    tile_size = config.tile_size
    num_tiles_x = ctx.width // tile_size
    num_tiles_y = ctx.height // tile_size

    tile_layer = canvas.create_layer("tiles")
    vein_layer = canvas.create_layer("veins")
    edge_color = np.array([100, 100, 100], dtype=np.uint8)
    for y in range(num_tiles_y):
        for x in range(num_tiles_x):
            tile_x = x * tile_size
            tile_y = y * tile_size
            # Simple tile pattern - draw boundaries
            tile_color = np.array(config.tile_bg_color, dtype=np.uint8)
            # Fill tile
            x1, y1 = int(tile_x), int(tile_y)
            x2, y2 = int(min(tile_x + tile_size, ctx.width)), int(min(tile_y + tile_size, ctx.height))
            tile_layer[y1:y2, x1:x2] = tile_color
            # Draw tile boundary
            draw_line(tile_layer, (float(tile_x), float(tile_y)), (float(tile_x + tile_size), float(tile_y)), 1, edge_color)
            draw_line(tile_layer, (float(tile_x), float(tile_y)), (float(tile_x), float(tile_y + tile_size)), 1, edge_color)

    # Space colonization for venation
    palette = get_palette(config.palette)
    nodes = []

    # Initialize seed nodes
    for i in range(config.num_seeds):
        x = ctx.rng.random() * ctx.width
        y = ctx.rng.random() * ctx.height
        nodes.append({"pos": np.array([x, y]), "parent": None, "length": 0.0})

    # Growth simulation
    for step in range(int(config.max_length / config.growth_rate)):
        # Find closest node to grow from
        if not nodes:
            break

        # Sample random point
        target = np.array([ctx.rng.random() * ctx.width, ctx.rng.random() * ctx.height])

        # Find closest node
        closest = min(nodes, key=lambda n: np.linalg.norm(n["pos"] - target))
        if np.linalg.norm(closest["pos"] - target) > 50:
            continue

        # Grow towards target
        direction = target - closest["pos"]
        direction = direction / (np.linalg.norm(direction) + 1e-6)
        new_pos = closest["pos"] + direction * config.growth_rate

        # Check tile boundaries if respect_tiles
        if config.respect_tiles:
            tile_x = int(new_pos[0] / tile_size)
            tile_y = int(new_pos[1] / tile_size)
            if tile_x != int(closest["pos"][0] / tile_size) or tile_y != int(closest["pos"][1] / tile_size):
                if ctx.rng.random() > config.breakthrough_prob:
                    continue

        new_node = {
            "pos": new_pos,
            "parent": closest,
            "length": closest["length"] + config.growth_rate,
        }
        nodes.append(new_node)

        # Draw vein
        if closest["parent"] is not None:
            color = np.array(
                palette[int(new_node["length"] / config.max_length * (len(palette) - 1))],
                dtype=np.uint8,
            )
            draw_polyline(
                vein_layer,
                np.array([closest["pos"], new_node["pos"]]),
                config.vein_thickness,
                color,
            )

    # Apply post-processing
    image = canvas.get_image()
    if config.vignette_strength > 0:
        image = apply_vignette(image, config.vignette_strength)

    return RenderResult(
        image=image,
        seed=config.seed,
        sketch_name="cosmic_venation_tiles",
        config=config,
    )
