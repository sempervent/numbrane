"""Canonicalization and hashing for parameters."""

import hashlib
import json
from typing import Any

import numpy as np


def canonicalize_params(params: dict[str, Any], precision: int = 6) -> dict[str, Any]:
    """Canonicalize parameter dictionary.

    Ensures:
    - Stable key ordering (sorted)
    - Normalized numeric formatting (rounded floats)
    - Consistent tuple/list representation
    - Normalized color values

    Args:
        params: Parameter dictionary
        precision: Decimal precision for floats

    Returns:
        Canonicalized dictionary
    """

    def canonicalize_value(value: Any) -> Any:
        """Canonicalize a single value."""
        if isinstance(value, (int, np.integer)):
            return int(value)
        elif isinstance(value, (float, np.floating)):
            # Round to precision
            rounded = round(float(value), precision)
            # Remove trailing zeros
            if rounded == int(rounded):
                return int(rounded)
            return rounded
        elif isinstance(value, (tuple, list)):
            # Normalize tuples/lists
            normalized = [canonicalize_value(v) for v in value]
            # Convert to tuple for consistency
            return tuple(normalized)
        elif isinstance(value, dict):
            # Recursively canonicalize nested dicts
            return canonicalize_params(value, precision)
        elif isinstance(value, bool):
            return value
        elif isinstance(value, str):
            # Normalize strings (strip, lowercase for some cases)
            return value.strip()
        elif value is None:
            return None
        else:
            # Convert to string for unknown types
            return str(value)

    # Sort keys and canonicalize values
    canonical = {}
    for key in sorted(params.keys()):
        canonical[key] = canonicalize_value(params[key])

    return canonical


def param_hash(params: dict[str, Any], precision: int = 6) -> str:
    """Compute SHA256 hash of canonicalized parameters.

    Args:
        params: Parameter dictionary
        precision: Decimal precision for floats

    Returns:
        Hexadecimal hash string
    """
    canonical = canonicalize_params(params, precision)

    # Serialize to JSON with stable formatting
    json_str = json.dumps(
        canonical,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )

    # Compute hash
    sha256 = hashlib.sha256()
    sha256.update(json_str.encode("utf-8"))
    return sha256.hexdigest()


def param_hash_short(params: dict[str, Any], length: int = 8) -> str:
    """Compute short hash of parameters.

    Args:
        params: Parameter dictionary
        length: Length of hash to return

    Returns:
        Short hexadecimal hash string
    """
    full_hash = param_hash(params)
    return full_hash[:length]
