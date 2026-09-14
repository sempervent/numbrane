"""Post-processing effects."""


import numpy as np

try:
    from scipy import ndimage

    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


def apply_bloom(
    image: np.ndarray,
    threshold: float = 0.8,
    intensity: float = 0.3,
    radius: int = 10,
) -> np.ndarray:
    """Apply bloom effect.

    Args:
        image: Input image (H, W, 3) uint8
        threshold: Brightness threshold [0, 1]
        intensity: Bloom intensity
        radius: Blur radius

    Returns:
        Bloomed image
    """
    img_float = image.astype(np.float32) / 255.0

    # Extract bright areas
    brightness = np.mean(img_float, axis=2)
    bright_mask = brightness > threshold

    # Create bloom
    bloom = np.zeros_like(img_float)
    bloom[bright_mask] = img_float[bright_mask]

    # Blur bloom
    if HAS_SCIPY:
        for c in range(3):
            bloom[:, :, c] = ndimage.gaussian_filter(bloom[:, :, c], sigma=radius)
    else:
        # Simple box blur fallback (slow but works without scipy)
        kernel_size = int(radius * 2 + 1)
        kernel = np.ones((kernel_size, kernel_size)) / (kernel_size * kernel_size)
        for c in range(3):
            # Simple convolution
            h, w = bloom.shape[:2]
            pad = kernel_size // 2
            padded = np.pad(bloom[:, :, c], pad, mode="edge")
            blurred = np.zeros_like(bloom[:, :, c])
            for i in range(h):
                for j in range(w):
                    blurred[i, j] = np.mean(
                        padded[i : i + kernel_size, j : j + kernel_size] * kernel
                    )
            bloom[:, :, c] = blurred

    # Composite
    result = img_float + bloom * intensity
    return np.clip(result * 255, 0, 255).astype(np.uint8)


def apply_vignette(
    image: np.ndarray,
    strength: float = 0.5,
    radius: float = 0.7,
) -> np.ndarray:
    """Apply vignette effect.

    Args:
        image: Input image (H, W, 3) uint8
        strength: Vignette strength [0, 1]
        radius: Vignette radius [0, 1]

    Returns:
        Vignetted image
    """
    h, w = image.shape[:2]
    center_x, center_y = w / 2, h / 2
    max_dist = np.sqrt(center_x**2 + center_y**2)

    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((x - center_x) ** 2 + (y - center_y) ** 2) / (max_dist * radius)
    mask = np.clip(1.0 - dist * strength, 0, 1)[..., np.newaxis]

    result = image.astype(np.float32) * mask
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_chromatic_aberration(
    image: np.ndarray,
    strength: float = 2.0,
    direction: tuple[float, float] = (1.0, 0.0),
) -> np.ndarray:
    """Apply chromatic aberration.

    Args:
        image: Input image (H, W, 3) uint8
        strength: Aberration strength in pixels
        direction: Direction vector (dx, dy)

    Returns:
        Aberrated image
    """
    h, w = image.shape[:2]
    result = np.zeros_like(image)

    # Shift channels
    dx, dy = direction
    dx = int(dx * strength)
    dy = int(dy * strength)

    # Red channel
    if dx != 0 or dy != 0:
        result[:, :, 0] = np.roll(image[:, :, 0], (dy, dx), axis=(0, 1))
        result[:, :, 1] = image[:, :, 1]
        result[:, :, 2] = np.roll(image[:, :, 2], (-dy, -dx), axis=(0, 1))
    else:
        result = image

    return result


def apply_film_grain(
    image: np.ndarray,
    strength: float = 0.1,
    seed: int = 0,
) -> np.ndarray:
    """Apply film grain.

    Args:
        image: Input image (H, W, 3) uint8
        strength: Grain strength [0, 1]
        seed: Random seed

    Returns:
        Grainy image
    """
    rng = np.random.default_rng(seed)
    h, w = image.shape[:2]

    grain = rng.normal(0, strength * 255, (h, w, 3))
    result = image.astype(np.float32) + grain
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_palette_mapping(
    image: np.ndarray,
    palette: np.ndarray,
) -> np.ndarray:
    """Map image colors to palette.

    Args:
        image: Input image (H, W, 3) uint8
        palette: Palette colors (N, 3) uint8

    Returns:
        Mapped image
    """
    h, w = image.shape[:2]
    img_flat = image.reshape(-1, 3)

    # Find nearest palette color for each pixel
    distances = np.sum((img_flat[:, np.newaxis, :] - palette[np.newaxis, :, :]) ** 2, axis=2)
    nearest = np.argmin(distances, axis=1)

    result = palette[nearest].reshape(h, w, 3)
    return result


def apply_emboss(
    image: np.ndarray,
    strength: float = 1.0,
) -> np.ndarray:
    """Apply emboss effect (fake lighting).

    Args:
        image: Input image (H, W, 3) uint8
        strength: Emboss strength

    Returns:
        Embossed image
    """
    # Convert to grayscale for emboss
    gray = np.mean(image, axis=2).astype(np.float32)

    # Emboss kernel
    kernel = (
        np.array(
            [
                [-2, -1, 0],
                [-1, 1, 1],
                [0, 1, 2],
            ]
        )
        * strength
    )

    if HAS_SCIPY:
        embossed = ndimage.convolve(gray, kernel)
    else:
        # Simple convolution fallback
        h, w = gray.shape
        embossed = np.zeros_like(gray)
        k_h, k_w = kernel.shape
        pad_h, pad_w = k_h // 2, k_w // 2
        padded = np.pad(gray, ((pad_h, pad_h), (pad_w, pad_w)), mode="edge")
        for i in range(h):
            for j in range(w):
                embossed[i, j] = np.sum(padded[i : i + k_h, j : j + k_w] * kernel)
    embossed = np.clip(embossed + 128, 0, 255)

    # Apply to all channels
    result = image.astype(np.float32) * 0.7 + embossed[..., np.newaxis] * 0.3
    return np.clip(result, 0, 255).astype(np.uint8)
