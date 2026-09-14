"""Fitness functions for aesthetic scoring."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class ScoreResult:
    """Result of fitness scoring."""

    total_score: float
    component_scores: dict[str, float] = None
    metadata: dict[str, Any] = None

    def __post_init__(self):
        """Initialize defaults."""
        if self.component_scores is None:
            self.component_scores = {}
        if self.metadata is None:
            self.metadata = {}


class FitnessFunction(ABC):
    """Base class for fitness functions."""

    @abstractmethod
    def score(
        self, image: np.ndarray, config: dict[str, Any], metadata: dict[str, Any] | None = None
    ) -> ScoreResult:
        """Score an image.

        Args:
            image: Image array (H, W, 3) uint8
            config: Configuration dictionary
            metadata: Optional metadata

        Returns:
            ScoreResult
        """
        pass


class BuiltInFitness:
    """Built-in fitness metrics."""

    @staticmethod
    def edge_density(image: np.ndarray) -> float:
        """Calculate edge density.

        Args:
            image: Image array (H, W, 3)

        Returns:
            Edge density score [0.0, 1.0]
        """
        # Convert to grayscale
        gray = np.mean(image, axis=2).astype(np.float32)

        # Sobel edge detection
        from scipy import ndimage

        sobel_x = ndimage.sobel(gray, axis=1)
        sobel_y = ndimage.sobel(gray, axis=0)
        edges = np.sqrt(sobel_x**2 + sobel_y**2)

        # Normalize
        edge_density = np.mean(edges) / 255.0
        return float(np.clip(edge_density, 0.0, 1.0))

    @staticmethod
    def entropy(image: np.ndarray) -> float:
        """Calculate image entropy (information content).

        Args:
            image: Image array (H, W, 3)

        Returns:
            Entropy score [0.0, 1.0]
        """
        # Convert to grayscale
        gray = np.mean(image, axis=2).astype(np.uint8)

        # Calculate histogram
        hist, _ = np.histogram(gray, bins=256, range=(0, 256))
        hist = hist / hist.sum()

        # Calculate entropy
        hist = hist[hist > 0]  # Remove zeros
        entropy = -np.sum(hist * np.log2(hist))

        # Normalize to [0, 1] (max entropy is log2(256) = 8)
        normalized = entropy / 8.0
        return float(np.clip(normalized, 0.0, 1.0))

    @staticmethod
    def symmetry_score(image: np.ndarray, axis: str = "both") -> float:
        """Calculate symmetry score.

        Args:
            image: Image array (H, W, 3)
            axis: "horizontal", "vertical", or "both"

        Returns:
            Symmetry score [0.0, 1.0]
        """
        h, w = image.shape[:2]
        gray = np.mean(image, axis=2).astype(np.float32)

        scores = []

        if axis in ["horizontal", "both"]:
            # Horizontal symmetry
            top = gray[: h // 2, :]
            bottom = np.flipud(gray[h // 2 :, :])
            if top.shape != bottom.shape:
                min_h = min(top.shape[0], bottom.shape[0])
                top = top[:min_h, :]
                bottom = bottom[:min_h, :]
            diff = np.abs(top - bottom)
            score_h = 1.0 - np.mean(diff) / 255.0
            scores.append(score_h)

        if axis in ["vertical", "both"]:
            # Vertical symmetry
            left = gray[:, : w // 2]
            right = np.fliplr(gray[:, w // 2 :])
            if left.shape != right.shape:
                min_w = min(left.shape[1], right.shape[1])
                left = left[:, :min_w]
                right = right[:, :min_w]
            diff = np.abs(left - right)
            score_v = 1.0 - np.mean(diff) / 255.0
            scores.append(score_v)

        return float(np.clip(np.mean(scores), 0.0, 1.0))

    @staticmethod
    def color_diversity(image: np.ndarray) -> float:
        """Calculate color diversity.

        Args:
            image: Image array (H, W, 3)

        Returns:
            Color diversity score [0.0, 1.0]
        """
        # Reshape to (N, 3)
        pixels = image.reshape(-1, 3)

        # Quantize colors
        quantized = (pixels // 32) * 32  # 8 levels per channel

        # Count unique colors
        unique_colors = len(np.unique(quantized.reshape(-1, 3), axis=0))

        # Normalize (max unique colors is 8^3 = 512)
        diversity = unique_colors / 512.0
        return float(np.clip(diversity, 0.0, 1.0))

    @staticmethod
    def spatial_balance(image: np.ndarray) -> float:
        """Calculate spatial balance (center of mass).

        Args:
            image: Image array (H, W, 3)

        Returns:
            Balance score [0.0, 1.0] (1.0 = perfectly centered)
        """
        gray = np.mean(image, axis=2).astype(np.float32)
        h, w = gray.shape

        # Calculate center of mass
        y_coords, x_coords = np.ogrid[:h, :w]
        total_mass = np.sum(gray)

        if total_mass == 0:
            return 0.5

        center_x = np.sum(x_coords * gray) / total_mass
        center_y = np.sum(y_coords * gray) / total_mass

        # Distance from center
        center_x_norm = center_x / w
        center_y_norm = center_y / h

        # Distance from (0.5, 0.5)
        distance = np.sqrt((center_x_norm - 0.5) ** 2 + (center_y_norm - 0.5) ** 2)

        # Score: 1.0 when centered, 0.0 when at corner
        balance = 1.0 - distance * 2.0
        return float(np.clip(balance, 0.0, 1.0))


class CompositeFitness(FitnessFunction):
    """Composite fitness function combining multiple metrics."""

    def __init__(
        self,
        metrics: dict[str, float],  # metric_name -> weight
        goals: dict[str, dict[str, Any]] | None = None,  # e.g., {"biologicalness": {"min": 0.6}}
    ):
        """Initialize composite fitness.

        Args:
            metrics: Dictionary of metric names to weights
            goals: Optional goal constraints
        """
        self.metrics = metrics
        self.goals = goals or {}

    def score(
        self, image: np.ndarray, config: dict[str, Any], metadata: dict[str, Any] | None = None
    ) -> ScoreResult:
        """Score image using composite metrics.

        Args:
            image: Image array
            config: Configuration
            metadata: Optional metadata

        Returns:
            ScoreResult
        """
        component_scores = {}
        total_score = 0.0
        total_weight = sum(self.metrics.values())

        # Calculate each metric
        for metric_name, weight in self.metrics.items():
            if metric_name == "edge_density":
                score = BuiltInFitness.edge_density(image)
            elif metric_name == "entropy":
                score = BuiltInFitness.entropy(image)
            elif metric_name == "symmetry":
                score = BuiltInFitness.symmetry_score(image)
            elif metric_name == "color_diversity":
                score = BuiltInFitness.color_diversity(image)
            elif metric_name == "spatial_balance":
                score = BuiltInFitness.spatial_balance(image)
            else:
                score = 0.0

            component_scores[metric_name] = score
            total_score += score * weight

        # Normalize
        if total_weight > 0:
            total_score /= total_weight

        # Apply goal constraints (penalize if goals not met)
        for goal_name, constraints in self.goals.items():
            if goal_name in component_scores:
                score = component_scores[goal_name]
                if "min" in constraints and score < constraints["min"]:
                    total_score *= 0.5  # Penalty
                if "max" in constraints and score > constraints["max"]:
                    total_score *= 0.5  # Penalty

        return ScoreResult(
            total_score=float(total_score),
            component_scores=component_scores,
            metadata={"goals": self.goals},
        )
