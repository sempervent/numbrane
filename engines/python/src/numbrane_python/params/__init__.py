"""Enhanced parameter space system with taxonomy and schema."""

from numbrane_python.params.distributions import (
    DiscreteWeighted,
    Distribution,
    Grid,
    LogUniform,
    Normal,
    Uniform,
)
from numbrane_python.params.export import export_schema_json, export_schema_markdown
from numbrane_python.params.normalize import canonicalize_params, param_hash
from numbrane_python.params.sampler import LatinHypercubeSampler, RandomSampler, Sampler
from numbrane_python.params.schema import ParamSchema, SchemaRegistry
from numbrane_python.params.types import (
    AngleParam,
    BoolParam,
    ChoiceParam,
    ColorParam,
    FloatParam,
    ImageSizeParam,
    IntParam,
    ListParam,
    ObjectParam,
    OneOfParam,
    Param,
    SeedParam,
    StringParam,
    TimeParam,
    TupleParam,
    Vec2Param,
    Vec3Param,
)
from numbrane_python.params.validate import ConstraintViolation, validate_params

__all__ = [
    # Core
    "ParamSchema",
    "SchemaRegistry",
    # Types
    "Param",
    "FloatParam",
    "IntParam",
    "BoolParam",
    "ChoiceParam",
    "StringParam",
    "ColorParam",
    "Vec2Param",
    "Vec3Param",
    "AngleParam",
    "SeedParam",
    "ImageSizeParam",
    "TimeParam",
    "ListParam",
    "TupleParam",
    "OneOfParam",
    "ObjectParam",
    # Distributions
    "Distribution",
    "Uniform",
    "LogUniform",
    "Normal",
    "DiscreteWeighted",
    "Grid",
    # Utilities
    "canonicalize_params",
    "param_hash",
    "validate_params",
    "ConstraintViolation",
    "export_schema_json",
    "export_schema_markdown",
    # Samplers
    "Sampler",
    "RandomSampler",
    "LatinHypercubeSampler",
]
