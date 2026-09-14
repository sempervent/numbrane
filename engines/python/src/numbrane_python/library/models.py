"""Library data models."""

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class RunMetrics:
    """Computed metrics for a run."""

    edge_density: float = 0.0
    entropy: float = 0.0
    symmetry: float = 0.0
    color_diversity: float = 0.0
    spatial_balance: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunMetrics":
        """Create from dictionary."""
        return cls(**{k: v for k, v in data.items() if k in cls.__annotations__})


@dataclass
class RunFeatures:
    """Feature vector for similarity search."""

    luminance_histogram: list[float] = field(default_factory=lambda: [0.0] * 16)
    edge_density: float = 0.0
    color_diversity: float = 0.0
    symmetry_h: float = 0.0
    symmetry_v: float = 0.0
    fractal_proxy: float = 0.0
    lineyness: float = 0.0

    def to_vector(self) -> list[float]:
        """Convert to flat feature vector."""
        return list(self.luminance_histogram) + [
            self.edge_density,
            self.color_diversity,
            self.symmetry_h,
            self.symmetry_v,
            self.fractal_proxy,
            self.lineyness,
        ]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunFeatures":
        """Create from dictionary."""
        return cls(**{k: v for k, v in data.items() if k in cls.__annotations__})


@dataclass
class RunRecord:
    """Complete run record."""

    run_id: str
    sketch_name: str
    seed: int
    param_hash: str
    provenance_hash: str
    output_hash: str | None = None

    # Paths
    output_path: str = ""
    thumb_path: str = ""
    preview_path: str | None = None

    # Configs
    base_config: dict[str, Any] = field(default_factory=dict)
    meta_controls: dict[str, float] = field(default_factory=dict)
    resolved_config: dict[str, Any] = field(default_factory=dict)

    # Metadata
    tags: list[str] = field(default_factory=list)
    notes: str | None = None
    title: str | None = None

    # Metrics and features
    metrics: RunMetrics | None = None
    features: RunFeatures | None = None

    # Provenance
    provenance: dict[str, Any] = field(default_factory=dict)

    # Timestamps
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    # Version info
    sketch_version: str | None = None
    genart_version: str | None = None
    git_commit: str | None = None
    platform_info: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for storage."""
        data = asdict(self)
        # Convert datetime to ISO string
        data["created_at"] = self.created_at.isoformat()
        data["updated_at"] = self.updated_at.isoformat()
        # Convert nested objects
        if self.metrics:
            data["metrics"] = self.metrics.to_dict()
        if self.features:
            data["features"] = self.features.to_dict()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunRecord":
        """Create from dictionary."""
        # Convert ISO strings to datetime
        if "created_at" in data and isinstance(data["created_at"], str):
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        if "updated_at" in data and isinstance(data["updated_at"], str):
            data["updated_at"] = datetime.fromisoformat(data["updated_at"])
        # Convert nested objects
        if "metrics" in data and isinstance(data["metrics"], dict):
            data["metrics"] = RunMetrics.from_dict(data["metrics"])
        if "features" in data and isinstance(data["features"], dict):
            data["features"] = RunFeatures.from_dict(data["features"])
        return cls(
            **{
                k: v
                for k, v in data.items()
                if k in cls.__annotations__
                or k in ["created_at", "updated_at", "metrics", "features"]
            }
        )
