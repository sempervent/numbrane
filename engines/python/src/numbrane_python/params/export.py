"""Schema export (JSON Schema, Markdown)."""

from typing import Any

from numbrane_python.params.schema import ParamSchema
from numbrane_python.params.types import (
    BoolParam,
    ChoiceParam,
    ColorParam,
    FloatParam,
    IntParam,
    Param,
    StringParam,
    Vec2Param,
    Vec3Param,
)


def export_schema_json(schema: ParamSchema) -> dict[str, Any]:
    """Export schema as JSON Schema.

    Args:
        schema: Parameter schema

    Returns:
        JSON Schema dictionary
    """
    json_schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "title": schema.name,
        "description": schema.description,
        "properties": {},
        "required": [],
    }

    for param in schema.params:
        prop = _param_to_json_schema_property(param)
        json_schema["properties"][param.path] = prop

    return json_schema


def export_schema_markdown(schema: ParamSchema) -> str:
    """Export schema as Markdown documentation.

    Args:
        schema: Parameter schema

    Returns:
        Markdown string
    """
    lines = [
        f"# {schema.name}",
        "",
        schema.description or "",
        "",
        "## Parameters",
        "",
        "| Path | Type | Default | Description |",
        "|------|------|---------|-------------|",
    ]

    for param in sorted(schema.params, key=lambda p: p.path):
        param_dict = param.to_dict()
        type_info = param_dict.get("type", "unknown")
        default = str(param_dict.get("default", ""))
        desc = param_dict.get("description", "")

        # Add range/choices info
        if hasattr(param, "min_val") and hasattr(param, "max_val"):
            type_info += f" [{param.min_val}, {param.max_val}]"
        elif hasattr(param, "choices"):
            type_info += f" {param.choices}"

        lines.append(f"| `{param.path}` | {type_info} | `{default}` | {desc} |")

    if schema.constraints:
        lines.extend(
            [
                "",
                "## Constraints",
                "",
            ]
        )
        for constraint in schema.constraints:
            lines.append(f"- {constraint.description}")

    return "\n".join(lines)


def _param_to_json_schema_property(param: Param) -> dict[str, Any]:
    """Convert parameter to JSON Schema property."""
    prop = {
        "description": param.description,
    }

    if isinstance(param, (FloatParam, IntParam)):
        if isinstance(param, FloatParam):
            prop["type"] = "number"
        else:
            prop["type"] = "integer"

        prop["minimum"] = param.min_val
        prop["maximum"] = param.max_val
        if hasattr(param, "step") and param.step:
            prop["multipleOf"] = param.step

    elif isinstance(param, BoolParam):
        prop["type"] = "boolean"

    elif isinstance(param, ChoiceParam):
        prop["type"] = "string"
        prop["enum"] = param.choices

    elif isinstance(param, StringParam):
        prop["type"] = "string"
        if hasattr(param, "pattern") and param.pattern:
            prop["pattern"] = param.pattern

    elif isinstance(param, ColorParam):
        prop["type"] = "string"
        prop["enum"] = param.palette_names

    elif isinstance(param, (Vec2Param, Vec3Param)):
        prop["type"] = "array"
        prop["items"] = {"type": "number"}
        prop["minItems"] = len(param.min_val)
        prop["maxItems"] = len(param.max_val)

    else:
        prop["type"] = "object"

    prop["default"] = param.default

    return prop
