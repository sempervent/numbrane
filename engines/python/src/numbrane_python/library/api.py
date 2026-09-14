"""High-level library API."""

import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from numbrane_python.library.db import get_library_db
from numbrane_python.library.features import extract_features
from numbrane_python.library.models import RunMetrics, RunRecord
from numbrane_python.library.paths import (
    ensure_run_path,
    get_config_path,
    get_features_path,
    get_metrics_path,
    get_notes_path,
    get_output_path,
    get_provenance_path,
    get_thumb_path,
)
from numbrane_python.library.query import compile_query, parse_query
from numbrane_python.meta.fitness import BuiltInFitness


def compute_run_id(
    sketch_name: str,
    resolved_config: dict[str, Any],
    seed: int,
    version_salt: str = "v1",
) -> str:
    """Compute stable run ID.

    Args:
        sketch_name: Sketch name
        resolved_config: Resolved configuration
        seed: Random seed
        version_salt: Version salt for determinism

    Returns:
        Run ID string
    """
    from numbrane_python.params.normalize import canonicalize_params, param_hash_short

    canonical = canonicalize_params(resolved_config)
    config_hash = param_hash_short(canonical)

    # Create ID from components
    id_parts = [sketch_name, config_hash, str(seed), version_salt]
    id_string = "_".join(id_parts)

    # Hash to get stable ID
    run_id_hash = hashlib.sha256(id_string.encode()).hexdigest()[:16]

    return f"{sketch_name}_{run_id_hash}"


def create_thumbnail(image: np.ndarray, size: tuple[int, int] = (256, 256)) -> np.ndarray:
    """Create thumbnail from image.

    Args:
        image: Image array (H, W, 3) uint8
        size: Thumbnail size (width, height)

    Returns:
        Thumbnail image array
    """
    pil_image = Image.fromarray(image)
    pil_image.thumbnail(size, Image.Resampling.LANCZOS)
    return np.array(pil_image)


def get_platform_info() -> dict[str, str]:
    """Get platform information.

    Returns:
        Platform info dictionary
    """
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "system": platform.system(),
        "machine": platform.machine(),
    }


def get_git_commit() -> str | None:
    """Get git commit hash if available.

    Returns:
        Git commit hash or None
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        pass
    return None


def register_run(
    sketch_name: str,
    seed: int,
    image: np.ndarray,
    base_config: dict[str, Any],
    resolved_config: dict[str, Any],
    meta_controls: dict[str, float] | None = None,
    provenance: dict[str, Any] | None = None,
    output_format: str = "png",
    title: str | None = None,
    tags: list[str] | None = None,
) -> RunRecord:
    """Register a run in the library.

    Args:
        sketch_name: Sketch name
        seed: Random seed
        image: Rendered image
        base_config: Base configuration
        resolved_config: Resolved configuration
        meta_controls: Meta-control values
        provenance: Provenance dictionary
        output_format: Output format (png, gif, mp4)
        title: Optional title
        tags: Optional tags

    Returns:
        RunRecord
    """
    from numbrane_python.params.normalize import canonicalize_params, param_hash

    db = get_library_db()

    # Compute hashes
    canonical = canonicalize_params(resolved_config)
    param_hash_short = param_hash(canonical)[:16]

    # Compute run ID
    run_id = compute_run_id(sketch_name, resolved_config, seed)

    # Ensure run path exists
    run_path = ensure_run_path(run_id)

    # Save output image
    output_path = get_output_path(run_id, output_format)
    pil_image = Image.fromarray(image)
    pil_image.save(output_path)

    # Compute output hash
    with open(output_path, "rb") as f:
        output_hash = hashlib.sha256(f.read()).hexdigest()

    # Create thumbnail
    thumb = create_thumbnail(image)
    thumb_path = get_thumb_path(run_id)
    Image.fromarray(thumb).save(thumb_path)

    # Extract features
    features = extract_features(image)
    features_path = get_features_path(run_id)
    with open(features_path, "w") as f:
        json.dump(features.to_dict(), f, indent=2)

    # Compute metrics
    metrics = RunMetrics(
        edge_density=BuiltInFitness.edge_density(image),
        entropy=BuiltInFitness.entropy(image),
        symmetry=BuiltInFitness.symmetry_score(image),
        color_diversity=BuiltInFitness.color_diversity(image),
        spatial_balance=BuiltInFitness.spatial_balance(image),
    )
    metrics_path = get_metrics_path(run_id)
    with open(metrics_path, "w") as f:
        json.dump(metrics.to_dict(), f, indent=2)

    # Save resolved config
    config_path = get_config_path(run_id)
    with open(config_path, "w") as f:
        json.dump(resolved_config, f, indent=2)

    # Save provenance
    if provenance is None:
        provenance = {}
    provenance["param_hash"] = param_hash_short
    provenance["output_hash"] = output_hash
    provenance_path = get_provenance_path(run_id)
    with open(provenance_path, "w") as f:
        json.dump(provenance, f, indent=2)

    # Compute provenance hash
    provenance_str = json.dumps(provenance, sort_keys=True)
    provenance_hash = hashlib.sha256(provenance_str.encode()).hexdigest()[:16]

    # Create record
    record = RunRecord(
        run_id=run_id,
        sketch_name=sketch_name,
        seed=seed,
        param_hash=param_hash_short,
        provenance_hash=provenance_hash,
        output_hash=output_hash,
        output_path=str(output_path),
        thumb_path=str(thumb_path),
        base_config=base_config,
        meta_controls=meta_controls or {},
        resolved_config=resolved_config,
        tags=tags or [],
        title=title,
        metrics=metrics,
        features=features,
        provenance=provenance,
        genart_version="0.1.0",  # Could read from package
        git_commit=get_git_commit(),
        platform_info=get_platform_info(),
    )

    # Save to database
    db.add_run(record)

    return record


def search_runs(query: str, limit: int | None = None) -> list[RunRecord]:
    """Search runs with query string.

    Args:
        query: Query string
        limit: Maximum results

    Returns:
        List of matching run records
    """
    db = get_library_db()

    # Parse and compile query
    ast = parse_query(query)
    where_clause, params = compile_query(ast, db)

    return db.search_runs(where_clause, params, limit)


def find_similar(run_id: str, k: int = 12) -> list[tuple[RunRecord, float]]:
    """Find similar runs.

    Args:
        run_id: Reference run ID
        k: Number of similar runs to return

    Returns:
        List of (run_record, similarity_score) tuples
    """
    db = get_library_db()

    # Get reference run
    ref_run = db.get_run(run_id)
    if not ref_run or not ref_run.features:
        return []

    # Get all feature vectors
    all_vectors = db.get_all_feature_vectors()

    if run_id not in all_vectors:
        return []

    ref_vector = all_vectors[run_id]

    # Compute similarities
    similarities = []
    for other_id, other_vector in all_vectors.items():
        if other_id == run_id:
            continue

        from numbrane_python.library.features import compute_similarity_vector

        similarity = compute_similarity_vector(ref_vector, other_vector)
        similarities.append((other_id, similarity))

    # Sort by similarity
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Get top k
    results = []
    for other_id, similarity in similarities[:k]:
        other_run = db.get_run(other_id)
        if other_run:
            results.append((other_run, similarity))

    return results


def get_run(run_id: str) -> RunRecord | None:
    """Get a run record.

    Args:
        run_id: Run identifier

    Returns:
        Run record or None
    """
    db = get_library_db()
    return db.get_run(run_id)


def tag_run(run_id: str, tags: list[str], mode: str = "set") -> None:
    """Tag a run.

    Args:
        run_id: Run identifier
        tags: Tags to add/remove
        mode: "add", "remove", or "set"
    """
    db = get_library_db()
    run = db.get_run(run_id)
    if not run:
        raise ValueError(f"Run {run_id} not found")

    if mode == "set":
        new_tags = tags
    elif mode == "add":
        new_tags = list(set(run.tags + tags))
    elif mode == "remove":
        new_tags = [t for t in run.tags if t not in tags]
    else:
        raise ValueError(f"Invalid mode: {mode}")

    db.update_run_tags(run_id, new_tags)


def note_run(run_id: str, notes: str | None, mode: str = "set") -> None:
    """Add/edit notes for a run.

    Args:
        run_id: Run identifier
        notes: Notes text
        mode: "set" or "edit" (edit appends)
    """
    db = get_library_db()
    run = db.get_run(run_id)
    if not run:
        raise ValueError(f"Run {run_id} not found")

    if mode == "set":
        new_notes = notes
    elif mode == "edit":
        existing = run.notes or ""
        new_notes = existing + "\n\n" + (notes or "")
    else:
        raise ValueError(f"Invalid mode: {mode}")

    db.update_run_notes(run_id, new_notes)

    # Also save to notes.md
    notes_path = get_notes_path(run_id)
    if new_notes:
        notes_path.write_text(new_notes)
    elif notes_path.exists():
        notes_path.unlink()


def replay_run(run_id: str, verify: bool = True) -> dict[str, Any]:
    """Replay a run and verify determinism.

    Args:
        run_id: Run identifier
        verify: Whether to verify determinism

    Returns:
        Replay result dictionary
    """
    from numbrane_python.core.config import Quality
    from numbrane_python.core.ctx import RenderContext
    from numbrane_python.core.registry import get_registry
    from numbrane_python.core.rng import RNG

    db = get_library_db()
    run = db.get_run(run_id)
    if not run:
        raise ValueError(f"Run {run_id} not found")

    # Re-render
    registry = get_registry()
    registry.discover_builtin()
    sketch_info = registry.get(run.sketch_name)
    if not sketch_info:
        raise ValueError(f"Sketch {run.sketch_name} not found")

    config_obj = sketch_info.config_class(**run.resolved_config)
    config_obj.seed = run.seed

    rng = RNG(run.seed)
    quality = Quality(mode="final", supersample=2)
    ctx = RenderContext(
        rng=rng,
        width=config_obj.width,
        height=config_obj.height,
        quality=quality,
        output_dir=Path("/tmp"),  # Temp output
    )

    result = sketch_info.render_func(config_obj, ctx)

    # Verify
    result_dict = {
        "run_id": run_id,
        "replayed": True,
        "matches": False,
    }

    if verify:
        # Compare hashes
        import hashlib

        replayed_hash = hashlib.sha256(result.image.tobytes()).hexdigest()

        if replayed_hash == run.output_hash:
            result_dict["matches"] = True
            result_dict["message"] = "Deterministic replay successful"
        else:
            result_dict["matches"] = False
            result_dict["message"] = "Hash mismatch - possible nondeterminism"
            result_dict["original_hash"] = run.output_hash
            result_dict["replayed_hash"] = replayed_hash

    return result_dict
