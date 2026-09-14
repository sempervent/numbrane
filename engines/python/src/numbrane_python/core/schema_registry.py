"""Schema registry integration with sketch registry."""

from numbrane_python.core.registry import get_registry as get_sketch_registry
from numbrane_python.params.schema import get_registry as get_schema_registry


def register_sketch_schemas():
    """Register schemas from discovered sketches."""
    sketch_registry = get_sketch_registry()
    schema_registry = get_schema_registry()

    for sketch_name in sketch_registry.list():
        sketch_info = sketch_registry.get(sketch_name)
        if not sketch_info:
            continue

        # Try to get schema from sketch module
        module = sketch_info.module

        # Check for get_schema function
        if hasattr(module, "get_schema"):
            try:
                schema = module.get_schema()
                defaults = None
                presets = None

                # Get defaults
                if hasattr(module, "defaults"):
                    defaults = module.defaults()
                elif sketch_info.config_class:
                    config = sketch_info.config_class()
                    defaults = config.model_dump() if hasattr(config, "model_dump") else {}

                # Get presets
                if hasattr(module, "presets"):
                    presets = module.presets()
                elif sketch_info.presets_func:
                    presets = sketch_info.presets_func()

                # Register schema
                schema_registry.register(sketch_name, schema, defaults, presets)
            except Exception as e:
                print(f"Warning: Failed to register schema for {sketch_name}: {e}")
