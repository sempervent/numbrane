"""Sketch registry and discovery."""

import importlib
import importlib.util
import inspect
from pathlib import Path
from typing import Any

from pydantic import BaseModel


class SketchInfo:
    """Information about a discovered sketch."""

    def __init__(
        self,
        name: str,
        module: Any,
        config_class: type[BaseModel],
        render_func: callable,
        animate_func: callable | None = None,
        preview_overrides_func: callable | None = None,
        param_space_func: callable | None = None,
        presets_func: callable | None = None,
    ):
        """Initialize sketch info.

        Args:
            name: Sketch name
            module: Python module
            config_class: Pydantic config class
            render_func: render(config, ctx) function
            animate_func: Optional animate(config, ctx) function
            preview_overrides_func: Optional preview_overrides(config) function
            param_space_func: Optional param_space() function returning ParamSpace
            presets_func: Optional presets() function returning dict[str, dict]
        """
        self.name = name
        self.module = module
        self.config_class = config_class
        self.render_func = render_func
        self.animate_func = animate_func
        self.preview_overrides_func = preview_overrides_func
        self.param_space_func = param_space_func
        self.presets_func = presets_func


class SketchRegistry:
    """Registry for discovered sketches."""

    def __init__(self):
        """Initialize empty registry."""
        self._sketches: dict[str, SketchInfo] = {}

    def register(self, sketch_info: SketchInfo) -> None:
        """Register a sketch.

        Args:
            sketch_info: Sketch information
        """
        self._sketches[sketch_info.name] = sketch_info

    def get(self, name: str) -> SketchInfo | None:
        """Get sketch by name.

        Args:
            name: Sketch name

        Returns:
            SketchInfo or None if not found
        """
        return self._sketches.get(name)

    def list(self) -> list[str]:
        """List all registered sketch names.

        Returns:
            List of sketch names
        """
        return sorted(self._sketches.keys())

    def discover_builtin(self) -> None:
        """Discover built-in sketches from numbrane_python/sketches/."""
        sketches_dir = Path(__file__).parent.parent / "sketches"
        if not sketches_dir.exists():
            return

        # Discover top-level sketches
        for sketch_file in sketches_dir.glob("*.py"):
            if sketch_file.name == "__init__.py":
                continue

            try:
                self._load_sketch_module(sketch_file.stem, sketch_file)
            except Exception as e:
                print(f"Warning: Failed to load sketch {sketch_file.stem}: {e}")

        # Discover mashup sketches
        mashups_dir = sketches_dir / "mashups"
        if mashups_dir.exists():
            for sketch_file in mashups_dir.glob("*.py"):
                if sketch_file.name == "__init__.py":
                    continue

                try:
                    # Use full path for module name to avoid conflicts
                    self._load_sketch_module(sketch_file.stem, sketch_file)
                except Exception as e:
                    print(f"Warning: Failed to load mashup sketch {sketch_file.stem}: {e}")

    def discover_path(self, path: Path) -> None:
        """Discover sketches from a directory.

        Args:
            path: Directory to search for sketch modules
        """
        if not path.exists():
            return

        for sketch_file in path.glob("*.py"):
            try:
                self._load_sketch_module(sketch_file.stem, sketch_file)
            except Exception as e:
                print(f"Warning: Failed to load sketch {sketch_file.stem}: {e}")

    def _load_sketch_module(self, name: str, path: Path) -> None:
        """Load a sketch module and register it.

        Args:
            name: Sketch name
            path: Path to sketch module
        """
        # Import module
        spec = importlib.util.spec_from_file_location(name, path)
        if spec is None or spec.loader is None:
            raise ValueError(f"Could not load module {name}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # Find required components
        config_class = None
        render_func = None
        animate_func = None
        preview_overrides_func = None
        param_space_func = None
        presets_func = None

        for attr_name in dir(module):
            attr = getattr(module, attr_name)

            # Find config class (Pydantic model)
            if (
                inspect.isclass(attr)
                and issubclass(attr, BaseModel)
                and attr_name.endswith("Config")
            ):
                config_class = attr

            # Find render function
            if (
                callable(attr)
                and attr_name == "render"
                and inspect.signature(attr).parameters.keys() >= {"config", "ctx"}
            ):
                render_func = attr

            # Find animate function
            if (
                callable(attr)
                and attr_name == "animate"
                and inspect.signature(attr).parameters.keys() >= {"config", "ctx"}
            ):
                animate_func = attr

            # Find preview_overrides function
            if callable(attr) and attr_name == "preview_overrides":
                preview_overrides_func = attr

            # Find param_space function
            if callable(attr) and attr_name == "param_space":
                param_space_func = attr

            # Find presets function
            if callable(attr) and attr_name == "presets":
                presets_func = attr

            # Find get_schema function (new schema system)
            if callable(attr) and attr_name == "get_schema":
                # Store in module for later access
                pass

            # Find defaults function
            if callable(attr) and attr_name == "defaults":
                # Store in module for later access
                pass

        if config_class is None:
            raise ValueError(f"Sketch {name} missing Config class")
        if render_func is None:
            raise ValueError(f"Sketch {name} missing render function")

        sketch_info = SketchInfo(
            name=name,
            module=module,
            config_class=config_class,
            render_func=render_func,
            animate_func=animate_func,
            preview_overrides_func=preview_overrides_func,
            param_space_func=param_space_func,
            presets_func=presets_func,
        )

        self.register(sketch_info)


# Global registry instance
_registry = SketchRegistry()


def get_registry() -> SketchRegistry:
    """Get the global sketch registry."""
    return _registry
