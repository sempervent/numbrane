"""Composition recipe system."""

# Import lazily to avoid circular dependencies
__all__ = [
    "Recipe",
    "RecipeSketch",
    "RecipeOutput",
    "RecipeComposite",
    "RecipeCompat",
    "CompatibilityChecker",
    "CompatibilityReport",
    "CompatibilityIssue",
    "RecipeRunner",
    "load_recipe",
]


def __getattr__(name):
    """Lazy imports."""
    if name == "Recipe":
        from numbrane_python.compose.recipe import Recipe

        return Recipe
    elif name == "RecipeSketch":
        from numbrane_python.compose.recipe import RecipeSketch

        return RecipeSketch
    elif name == "RecipeOutput":
        from numbrane_python.compose.recipe import RecipeOutput

        return RecipeOutput
    elif name == "RecipeComposite":
        from numbrane_python.compose.recipe import RecipeComposite

        return RecipeComposite
    elif name == "RecipeCompat":
        from numbrane_python.compose.recipe import RecipeCompat

        return RecipeCompat
    elif name == "CompatibilityChecker":
        from numbrane_python.compose.compat import CompatibilityChecker

        return CompatibilityChecker
    elif name == "CompatibilityReport":
        from numbrane_python.compose.compat import CompatibilityReport

        return CompatibilityReport
    elif name == "CompatibilityIssue":
        from numbrane_python.compose.compat import CompatibilityIssue

        return CompatibilityIssue
    elif name == "RecipeRunner":
        from numbrane_python.compose.runner import RecipeRunner

        return RecipeRunner
    elif name == "load_recipe":
        from numbrane_python.compose.recipe import load_recipe

        return load_recipe
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
