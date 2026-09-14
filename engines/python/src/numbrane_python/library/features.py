"""Feature extraction for similarity search."""


import numpy as np
from PIL import Image

from numbrane_python.library.models import RunFeatures


def extract_features(image: np.ndarray) -> RunFeatures:
    """Extract features from an image.

    Args:
        image: Image array (H, W, 3) uint8

    Returns:
        RunFeatures object
    """
    # Convert to PIL for easier manipulation
    pil_image = Image.fromarray(image)

    # Convert to grayscale for some features
    gray = pil_image.convert("L")
    gray_array = np.array(gray, dtype=np.float32)

    # 1. Luminance histogram (16 bins)
    hist, _ = np.histogram(gray_array, bins=16, range=(0, 256))
    hist = hist / hist.sum()  # Normalize
    luminance_histogram = hist.tolist()

    # 2. Edge density (simple gradient approximation)
    h, w = gray_array.shape
    grad_x = np.diff(gray_array, axis=1, prepend=gray_array[:, 0:1])
    grad_y = np.diff(gray_array, axis=0, prepend=gray_array[0:1, :])
    edge_magnitude = np.sqrt(grad_x**2 + grad_y**2)
    edge_density = float(np.mean(edge_magnitude) / 255.0)

    # 3. Color diversity
    pixels = image.reshape(-1, 3)
    # Quantize to reduce unique colors
    quantized = (pixels // 32) * 32
    unique_colors = len(np.unique(quantized.reshape(-1, 3), axis=0))
    color_diversity = float(min(unique_colors / 512.0, 1.0))  # Normalize

    # 4. Symmetry (horizontal and vertical)
    h, w = gray_array.shape
    # Horizontal symmetry
    top = gray_array[: h // 2, :]
    bottom = np.flipud(gray_array[h // 2 :, :])
    if top.shape != bottom.shape:
        min_h = min(top.shape[0], bottom.shape[0])
        top = top[:min_h, :]
        bottom = bottom[:min_h, :]
    diff_h = np.abs(top - bottom)
    symmetry_h = float(1.0 - np.mean(diff_h) / 255.0)

    # Vertical symmetry
    left = gray_array[:, : w // 2]
    right = np.fliplr(gray_array[:, w // 2 :])
    if left.shape != right.shape:
        min_w = min(left.shape[1], right.shape[1])
        left = left[:, :min_w]
        right = right[:, :min_w]
    diff_v = np.abs(left - right)
    symmetry_v = float(1.0 - np.mean(diff_v) / 255.0)

    # 5. Fractal proxy (multi-scale variance)
    scales = [1, 2, 4, 8]
    variances = []
    for scale in scales:
        if scale > min(h, w):
            break
        downsampled = gray_array[::scale, ::scale]
        variances.append(float(np.var(downsampled)))
    fractal_proxy = float(np.mean(variances) / (255.0**2)) if variances else 0.0

    # 6. Lineyness (ratio of thin edges vs filled areas)
    # Approximate by thresholding edge magnitude
    edge_threshold = np.percentile(edge_magnitude, 80)
    thin_edges = np.sum(edge_magnitude > edge_threshold)
    total_pixels = edge_magnitude.size
    lineyness = float(thin_edges / total_pixels) if total_pixels > 0 else 0.0

    return RunFeatures(
        luminance_histogram=luminance_histogram,
        edge_density=edge_density,
        color_diversity=color_diversity,
        symmetry_h=symmetry_h,
        symmetry_v=symmetry_v,
        fractal_proxy=fractal_proxy,
        lineyness=lineyness,
    )


def compute_similarity(features1: RunFeatures, features2: RunFeatures) -> float:
    """Compute similarity between two feature vectors.

    Uses cosine similarity.

    Args:
        features1: First feature set
        features2: Second feature set

    Returns:
        Similarity score [0.0, 1.0] (1.0 = identical)
    """
    vec1 = np.array(features1.to_vector())
    vec2 = np.array(features2.to_vector())

    # Cosine similarity
    dot = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    similarity = dot / (norm1 * norm2)

    # Normalize to [0, 1] (cosine similarity is [-1, 1])
    return float((similarity + 1.0) / 2.0)


def compute_similarity_vector(vec1: list[float], vec2: list[float]) -> float:
    """Compute similarity between two feature vectors.

    Args:
        vec1: First feature vector
        vec2: Second feature vector

    Returns:
        Similarity score [0.0, 1.0]
    """
    vec1_arr = np.array(vec1)
    vec2_arr = np.array(vec2)

    dot = np.dot(vec1_arr, vec2_arr)
    norm1 = np.linalg.norm(vec1_arr)
    norm2 = np.linalg.norm(vec2_arr)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    similarity = dot / (norm1 * norm2)
    return float((similarity + 1.0) / 2.0)
