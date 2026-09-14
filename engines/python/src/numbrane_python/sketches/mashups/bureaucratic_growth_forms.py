from __future__ import annotations

"""Bureaucratic growth forms - schema definition."""

from pydantic import BaseModel, Field
from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    IntParam, FloatParam, BoolParam, ChoiceParam, ColorParam, AngleParam, StringParam, ObjectParam,
)
from numbrane_python.core.ctx import RenderContext
from numbrane_python.core.render_result import RenderResult


class BureaucraticGrowthFormsConfig(BaseModel):
    """Configuration for bureaucratic growth forms sketch."""
    seed: int = Field(default=42)
    width: int = Field(default=1920)
    height: int = Field(default=1080)

    # Grammar parameters
    axiom: str = Field(default="F")
    rules: dict = Field(default={"F": "F[+F]F[-F]F"})
    iterations: int = Field(default=5)
    angle: float = Field(default=25.0)
    step_size: float = Field(default=10.0)

    # Constraint parameters
    box_count: int = Field(default=5)
    box_size: float = Field(default=200.0)
    rejection_mode: str = Field(default="redirect")
    redirection_angle: float = Field(default=45.0)
    strictness: float = Field(default=0.7)

    # Rendering
    stroke_width: float = Field(default=2.0)
    stroke_taper: float = Field(default=0.2)
    palette: str = Field(default="void")
    highlight_constraints: bool = Field(default=True)
    vignette_strength: float = Field(default=0.3)


def get_schema() -> ParamSchema:
    """Get parameter schema."""
    return ParamSchema(
        name="bureaucratic_growth_forms",
        description="L-system growth forced through rigid bounding box constraints",
        params=[
            StringParam("axiom", "F", path="sim.grammar.axiom"),
            ObjectParam("rules", [], path="sim.grammar.rules"),  # Simplified - would need proper dict handling
            IntParam("iterations", 1, 10, 5, path="sim.grammar.iterations"),
            AngleParam("angle", 0.0, 180.0, 25.0, path="sim.grammar.angle"),
            FloatParam("step_size", 1.0, 50.0, 10.0, path="sim.grammar.step_size"),
            IntParam("box_count", 1, 20, 5, path="composition.constraints.box_count"),
            FloatParam("box_size", 50.0, 500.0, 200.0, path="composition.constraints.box_size"),
            ChoiceParam("rejection_mode", ["kill", "redirect", "bounce"], default="redirect", path="composition.constraints.rejection_mode"),
            AngleParam("redirection_angle", 0.0, 180.0, 45.0, path="composition.constraints.redirection_angle"),
            FloatParam("strictness", 0.0, 1.0, 0.7, path="composition.constraints.strictness"),
            FloatParam("stroke_width", 0.5, 10.0, 2.0, path="geom.stroke.width"),
            FloatParam("stroke_taper", 0.0, 1.0, 0.2, path="geom.stroke.taper"),
            ColorParam("palette", "void", path="color.palette"),
            BoolParam("highlight_constraints", True, path="color.constraint.highlight"),
            FloatParam("vignette_strength", 0.0, 1.0, 0.3, path="post.vignette.strength"),
        ],
    )


def defaults() -> dict:
    """Get default values."""
    config = BureaucraticGrowthFormsConfig()
    return config.model_dump()


def render(config: BureaucraticGrowthFormsConfig, ctx: RenderContext) -> "RenderResult":
    """Render bureaucratic growth forms."""
    from numbrane_python.core.render_result import RenderResult
    from numbrane_python.render.canvas import Canvas
    from numbrane_python.render.draw import draw_line, draw_polyline, draw_circle
    from numbrane_python.render.palettes import get_palette
    from numbrane_python.render.postfx import apply_vignette
    import numpy as np

    canvas = Canvas(ctx.width, ctx.height, 3)
    layer = canvas.create_layer("main")

    # Generate L-system string
    current = config.axiom
    for _ in range(config.iterations):
        next_str = ""
        for char in current:
            next_str += config.rules.get(char, char)
        current = next_str

    # Create bounding boxes
    rng = ctx.rng.generator
    boxes = []
    for _ in range(config.box_count):
        x = rng.uniform(0, ctx.width - config.box_size)
        y = rng.uniform(0, ctx.height - config.box_size)
        boxes.append((x, y, x + config.box_size, y + config.box_size))

    # Draw boxes (forms)
    form_color = (200, 200, 200)
    for x1, y1, x2, y2 in boxes:
        # Draw box outline
        draw_line(layer, (x1, y1), (x2, y1), 1, form_color)
        draw_line(layer, (x2, y1), (x2, y2), 1, form_color)
        draw_line(layer, (x2, y2), (x1, y2), 1, form_color)
        draw_line(layer, (x1, y2), (x1, y1), 1, form_color)

        # Draw grid lines
        for i in range(3):
            y_line = y1 + (y2 - y1) * (i + 1) / 4
            draw_line(layer, (x1, y_line), (x2, y_line), 0.5, form_color)

    # Interpret L-system with constraints
    stack = []
    x, y = ctx.width / 2, ctx.height / 2
    angle = 0.0
    angle_rad = np.deg2rad(config.angle)

    palette = get_palette(config.palette)
    color = np.array(palette[0], dtype=np.uint8)

    points = []

    for char in current:
        if char == 'F':
            # Move forward
            new_x = x + np.cos(np.deg2rad(angle)) * config.step_size
            new_y = y + np.sin(np.deg2rad(angle)) * config.step_size

            # Check constraints
            in_box = False
            for bx1, by1, bx2, by2 in boxes:
                if bx1 <= new_x <= bx2 and by1 <= new_y <= by2:
                    in_box = True
                    break

            # Apply rejection mode
            if not in_box and rng.random() < config.strictness:
                if config.rejection_mode == "kill":
                    continue  # Skip this segment
                elif config.rejection_mode == "redirect":
                    # Redirect toward nearest box center
                    if boxes:
                        nearest_box = min(boxes, key=lambda b:
                            np.linalg.norm([(b[0]+b[2])/2 - new_x, (b[1]+b[3])/2 - new_y]))
                        center_x = (nearest_box[0] + nearest_box[2]) / 2
                        center_y = (nearest_box[1] + nearest_box[3]) / 2
                        angle = np.rad2deg(np.arctan2(center_y - y, center_x - x))
                        new_x = x + np.cos(np.deg2rad(angle)) * config.step_size
                        new_y = y + np.sin(np.deg2rad(angle)) * config.step_size
                elif config.rejection_mode == "bounce":
                    # Bounce off box edges
                    angle += config.redirection_angle

            # Draw segment
            width = config.stroke_width * (1.0 - config.stroke_taper * len(points) / len(current))
            draw_line(layer, (x, y), (new_x, new_y), width, color)
            x, y = new_x, new_y
            points.append((x, y))
        elif char == '+':
            angle += config.angle
        elif char == '-':
            angle -= config.angle
        elif char == '[':
            stack.append((x, y, angle))
        elif char == ']':
            x, y, angle = stack.pop()

    # Add rubber stamps
    if config.highlight_constraints:
        stamp_layer = canvas.create_layer("stamps")
        stamp_color = np.array([255, 0, 0], dtype=np.uint8)
        for bx1, by1, bx2, by2 in boxes:
            # Draw stamp in corner as filled circle
            stamp_x, stamp_y = int(bx1 + 20), int(by1 + 20)
            radius = 10
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx*dx + dy*dy <= radius*radius:
                        x, y = stamp_x + dx, stamp_y + dy
                        if 0 <= x < ctx.width and 0 <= y < ctx.height:
                            stamp_layer[y, x] = stamp_color

    # Apply post-processing
    image = canvas.composite()
    if config.vignette_strength > 0:
        from numbrane_python.render.postfx import apply_vignette
        image = apply_vignette(image, config.vignette_strength)

    return RenderResult(
        image=image,
        seed=ctx.rng.seed,
        sketch_name="bureaucratic_growth_forms",
        config=config,
    )


def presets() -> dict:
    """Return curated presets."""
    return {
        "anxious_containment": {
            "strictness": 0.9,
            "rejection_mode": "redirect",
            "box_count": 8,
        },
        "sparse_rejection": {
            "rejection_mode": "kill",
            "strictness": 0.3,
            "box_count": 3,
        },
        "bouncing_growth": {
            "rejection_mode": "bounce",
            "strictness": 0.5,
        },
    }
