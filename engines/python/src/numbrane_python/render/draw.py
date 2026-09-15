"""Drawing primitives."""

import numpy as np


def draw_line(
    canvas: np.ndarray,
    p1: tuple[float, float],
    p2: tuple[float, float],
    width: float,
    color: np.ndarray,
    antialias: bool = True,
) -> None:
    """Draw a line on canvas.

    Args:
        canvas: Canvas array (H, W, C)
        p1: Start point (x, y)
        p2: End point (x, y)
        width: Line width
        color: Color array (C,)
        antialias: Whether to antialias
    """
    x1, y1 = p1
    x2, y2 = p2

    # Clip to canvas bounds
    h, w = canvas.shape[:2]
    x1 = np.clip(x1, 0, w - 1)
    y1 = np.clip(y1, 0, h - 1)
    x2 = np.clip(x2, 0, w - 1)
    y2 = np.clip(y2, 0, h - 1)

    # Bresenham-like line drawing with width
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)

    if dx == 0 and dy == 0:
        draw_point(canvas, p1, width, color, antialias)
        return

    # Draw thick line by drawing multiple points
    steps = max(int(np.hypot(dx, dy)), 1)
    for i in range(steps + 1):
        t = i / steps
        x = x1 + (x2 - x1) * t
        y = y1 + (y2 - y1) * t
        draw_point(canvas, (x, y), width, color, antialias)


def draw_polyline(
    canvas: np.ndarray,
    points: np.ndarray,
    width: float,
    color: np.ndarray,
    antialias: bool = True,
) -> None:
    """Draw a polyline on canvas.

    Args:
        canvas: Canvas array (H, W, C)
        points: Array of (x, y) points (N, 2)
        width: Line width
        color: Color array (C,)
        antialias: Whether to antialias
    """
    if len(points) < 2:
        return

    for i in range(len(points) - 1):
        draw_line(canvas, tuple(points[i]), tuple(points[i + 1]), width, color, antialias)


def draw_point(
    canvas: np.ndarray,
    pos: tuple[float, float],
    radius: float,
    color: np.ndarray,
    antialias: bool = True,
) -> None:
    """Draw a point (circle) on canvas.

    Args:
        canvas: Canvas array (H, W, C)
        pos: Position (x, y)
        radius: Circle radius
        color: Color array (C,)
        antialias: Whether to antialias
    """
    x, y = pos
    h, w = canvas.shape[:2]

    # Create circle mask
    r = int(np.ceil(radius))
    if r <= 0:
        return

    # Clip to canvas
    x_min = max(0, int(x - r))
    x_max = min(w, int(x + r + 1))
    y_min = max(0, int(y - r))
    y_max = min(h, int(y + r + 1))

    if x_min >= x_max or y_min >= y_max:
        return

    # Create local coordinates
    xx, yy = np.meshgrid(np.arange(x_min, x_max), np.arange(y_min, y_max), indexing="xy")

    dist = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)

    if antialias:
        # Smooth falloff
        mask = np.clip(1.0 - (dist / radius), 0, 1)
    else:
        mask = (dist <= radius).astype(float)

    # Apply color
    mask_3d = mask[..., np.newaxis]
    canvas[y_min:y_max, x_min:x_max] = (
        canvas[y_min:y_max, x_min:x_max] * (1 - mask_3d) + color * mask_3d
    ).astype(np.uint8)


def draw_gradient(
    canvas: np.ndarray,
    color1: np.ndarray,
    color2: np.ndarray,
    direction: str = "vertical",
) -> None:
    """Draw a gradient background.

    Args:
        canvas: Canvas array
        color1: Start color
        color2: End color
        direction: 'vertical' or 'horizontal'
    """
    h, w = canvas.shape[:2]
    c1 = np.asarray(color1, dtype=np.float64).reshape(-1)
    c2 = np.asarray(color2, dtype=np.float64).reshape(-1)

    if direction == "vertical":
        t = np.linspace(0, 1, h, dtype=np.float64)[:, np.newaxis, np.newaxis]
    else:
        t = np.linspace(0, 1, w, dtype=np.float64)[np.newaxis, :, np.newaxis]

    gradient = c1 * (1.0 - t) + c2 * t
    canvas[:] = np.clip(gradient, 0, 255).astype(np.uint8)
