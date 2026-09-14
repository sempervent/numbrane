"""Standard parameter taxonomy for generative art."""


from numbrane_python.params.types import (
    BoolParam,
    ChoiceParam,
    ColorParam,
    FloatParam,
    ImageSizeParam,
    IntParam,
    SeedParam,
    StringParam,
)


def get_taxonomy_schema() -> dict[str, list]:
    """Get standard taxonomy parameter definitions.

    Returns:
        Dictionary mapping taxonomy namespace to parameter definitions
    """
    taxonomy = {
        "meta": [
            StringParam("name", default="", description="Artwork name"),
            StringParam("author", default="", description="Author name"),
            StringParam("license", default="MIT", description="License"),
        ],
        "seed": [
            SeedParam("global", default=42, description="Global random seed"),
            IntParam("streams.field", 0, 2**31, 0, description="Field RNG stream seed"),
            IntParam("streams.sim", 0, 2**31, 0, description="Simulation RNG stream seed"),
            IntParam("streams.render", 0, 2**31, 0, description="Render RNG stream seed"),
            IntParam("streams.post", 0, 2**31, 0, description="Post-processing RNG stream seed"),
        ],
        "output": [
            ImageSizeParam("size", default="hd", description="Output size preset"),
            IntParam("width", 100, 10000, 1920, description="Output width"),
            IntParam("height", 100, 10000, 1080, description="Output height"),
            IntParam("dpi", 72, 600, 72, description="Output DPI"),
            ChoiceParam(
                "format", ["png", "jpg", "svg"], default="png", description="Output format"
            ),
            ColorParam("background", default=(0, 0, 0), description="Background color"),
            IntParam("aa_samples", 1, 16, 1, description="Anti-aliasing samples"),
        ],
        "composition": [
            IntParam("layering.count", 1, 10, 1, description="Number of layers"),
            ChoiceParam(
                "layering.blend_mode", ["over", "add", "multiply", "screen"], default="over"
            ),
            BoolParam("domain_warp.enabled", default=False, description="Enable domain warping"),
            FloatParam("domain_warp.strength", 0.0, 1.0, 0.2, description="Domain warp strength"),
            FloatParam("domain_warp.scale", 0.001, 0.1, 0.01, description="Domain warp scale"),
            BoolParam(
                "time_modulation.enabled", default=False, description="Enable time modulation"
            ),
            FloatParam(
                "time_modulation.frequency", 0.1, 10.0, 1.0, description="Time modulation frequency"
            ),
        ],
        "field": [
            ChoiceParam("type", ["noise", "curl", "vortex", "attractor"], default="noise"),
            FloatParam("scale", 0.001, 1.0, 0.1, description="Field scale"),
            FloatParam("strength", 0.1, 10.0, 1.0, description="Field strength"),
            IntParam("octaves", 1, 8, 4, description="Noise octaves"),
            FloatParam("lacunarity", 1.5, 3.0, 2.0, description="Lacunarity"),
            FloatParam("gain", 0.1, 1.0, 0.5, description="Gain"),
            BoolParam("warp.enabled", default=False, description="Enable field warping"),
            FloatParam("warp.strength", 0.0, 1.0, 0.3, description="Warp strength"),
            FloatParam("warp.scale", 0.001, 0.1, 0.01, description="Warp scale"),
            FloatParam("vector.curl_scale", 0.1, 2.0, 0.5, description="Curl noise scale"),
            FloatParam("vector.vortex_strength", 0.1, 5.0, 1.0, description="Vortex strength"),
        ],
        "sim": [
            ChoiceParam("type", ["particles", "agents", "ca", "rd"], default="particles"),
            IntParam("steps", 100, 10000, 1000, description="Simulation steps"),
            FloatParam("dt", 0.001, 1.0, 0.1, description="Time step"),
            ChoiceParam("integrator", ["euler", "rk2", "rk4"], default="rk2"),
            IntParam("count", 10, 1000, 100, description="Particle/agent count"),
            FloatParam(
                "branching.probability", 0.0, 0.1, 0.01, description="Branching probability"
            ),
            FloatParam("branching.angle", 0.0, 180.0, 45.0, description="Branching angle"),
            BoolParam("collision.enabled", default=False, description="Enable collision detection"),
            FloatParam("collision.radius", 0.1, 10.0, 1.0, description="Collision radius"),
            ChoiceParam("constraints.bounds", ["none", "wrap", "kill", "bounce"], default="none"),
        ],
        "geom": [
            ChoiceParam(
                "kind", ["polyline", "hatch", "points", "ribbons", "tubes"], default="polyline"
            ),
            FloatParam("stroke.width", 0.1, 10.0, 2.0, description="Stroke width"),
            FloatParam("stroke.opacity", 0.0, 1.0, 1.0, description="Stroke opacity"),
            FloatParam("stroke.taper", 0.0, 1.0, 0.0, description="Stroke taper"),
            FloatParam("stroke.jitter", 0.0, 5.0, 0.0, description="Stroke jitter"),
            ChoiceParam("stroke.cap", ["round", "square", "butt"], default="round"),
            ChoiceParam("stroke.join", ["round", "miter", "bevel"], default="round"),
            BoolParam("stroke.texture.stippling", default=False, description="Enable stippling"),
            FloatParam("stroke.texture.dash_length", 0.0, 50.0, 0.0, description="Dash length"),
        ],
        "color": [
            ColorParam("palette", default="void", description="Color palette"),
            ChoiceParam(
                "mode",
                ["indexed", "gradient", "mapped"],
                default="indexed",
                description="Color mode",
            ),
            ChoiceParam("mapping.by", ["speed", "age", "curvature", "sdf"], default="speed"),
            ColorParam("bg.color", default=(0, 0, 0), description="Background color"),
            FloatParam("bg.opacity", 0.0, 1.0, 1.0, description="Background opacity"),
        ],
        "post": [
            BoolParam("bloom.enabled", default=False, description="Enable bloom"),
            FloatParam("bloom.threshold", 0.0, 1.0, 0.8, description="Bloom threshold"),
            FloatParam("bloom.intensity", 0.0, 1.0, 0.3, description="Bloom intensity"),
            IntParam("bloom.radius", 1, 50, 10, description="Bloom radius"),
            BoolParam("vignette.enabled", default=False, description="Enable vignette"),
            FloatParam("vignette.strength", 0.0, 1.0, 0.3, description="Vignette strength"),
            FloatParam("vignette.radius", 0.1, 1.0, 0.7, description="Vignette radius"),
            BoolParam("grain.enabled", default=False, description="Enable film grain"),
            FloatParam("grain.strength", 0.0, 0.5, 0.1, description="Grain strength"),
            BoolParam(
                "chromatic_aberration.enabled",
                default=False,
                description="Enable chromatic aberration",
            ),
            FloatParam(
                "chromatic_aberration.strength", 0.0, 10.0, 2.0, description="Aberration strength"
            ),
            BoolParam("emboss.enabled", default=False, description="Enable emboss"),
            FloatParam("emboss.strength", 0.0, 2.0, 1.0, description="Emboss strength"),
            BoolParam("palette_map.enabled", default=False, description="Enable palette mapping"),
        ],
        "anim": [
            BoolParam("enabled", default=False, description="Enable animation"),
            IntParam("fps", 1, 120, 30, description="Frames per second"),
            FloatParam("duration", 0.1, 60.0, 5.0, description="Animation duration (seconds)"),
            BoolParam("loop", default=True, description="Loop animation"),
            ChoiceParam("driver", ["time", "noise_phase", "orbit"], default="time"),
            ChoiceParam(
                "easing.type", ["linear", "ease_in", "ease_out", "ease_in_out"], default="linear"
            ),
        ],
    }

    return taxonomy


def create_taxonomy_params() -> list:
    """Create flat list of taxonomy parameters.

    Returns:
        List of Param objects with taxonomy paths
    """
    taxonomy = get_taxonomy_schema()
    params = []

    for namespace, param_defs in taxonomy.items():
        for param_def in param_defs:
            # Ensure path includes namespace
            if not param_def.path.startswith(namespace + "."):
                param_def.path = f"{namespace}.{param_def.path}"
            params.append(param_def)

    return params
