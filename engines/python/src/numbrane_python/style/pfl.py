"""PFL visual styles — curated art direction that preserves piece identity."""

from __future__ import annotations

from typing import Any

# Style id → render tendencies (palette, paper, composition bias, post).
PFL_STYLES: dict[str, dict[str, Any]] = {
    "pfl-signal": {
        "label": "PFL / Signal",
        "palette": "electric-cyan",
        "paper_style": "dark",
        "background": "near-black",
        "contrast": 1.15,
        "ink": 1.35,
        "composition": {"margin": 1.22, "center_bias": 0.55, "density_bias": 0.85},
        "post": {"bloom": 0.12, "vignette": 0.18},
    },
    "pfl-ritual": {
        "label": "PFL / Ritual",
        "palette": "bone-black",
        "paper_style": "warm-paper",
        "background": "warm-paper",
        "contrast": 1.05,
        "ink": 1.2,
        "composition": {"margin": 1.28, "center_bias": 0.85, "density_bias": 0.65},
        "post": {"bloom": 0.06, "vignette": 0.22},
    },
    "pfl-organism": {
        "label": "PFL / Organism",
        "palette": "muted-mineral",
        "paper_style": "dark",
        "background": "near-black",
        "contrast": 1.1,
        "ink": 1.25,
        "composition": {"margin": 1.15, "center_bias": 0.4, "density_bias": 0.95},
        "post": {"bloom": 0.1, "vignette": 0.14},
    },
    "pfl-machine": {
        "label": "PFL / Machine",
        "palette": "cold-technical",
        "paper_style": "dark",
        "background": "pure-black",
        "contrast": 1.25,
        "ink": 1.45,
        "composition": {"margin": 1.12, "center_bias": 0.5, "density_bias": 1.05},
        "post": {"bloom": 0.08, "vignette": 0.12},
    },
    "pfl-void": {
        "label": "PFL / Void",
        "palette": "monochrome-ink",
        "paper_style": "dark",
        "background": "pure-black",
        "contrast": 1.3,
        "ink": 1.5,
        "composition": {"margin": 1.35, "center_bias": 0.7, "density_bias": 0.55},
        "post": {"bloom": 0.04, "vignette": 0.28},
    },
    "pfl-afterimage": {
        "label": "PFL / Afterimage",
        "palette": "ember",
        "paper_style": "dark",
        "background": "near-black",
        "contrast": 1.08,
        "ink": 1.15,
        "composition": {"margin": 1.2, "center_bias": 0.45, "density_bias": 0.75},
        "post": {"bloom": 0.22, "vignette": 0.16},
    },
}


def apply_style_to_params(style_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """Merge a PFL style into render parameters without erasing piece-specific keys.

    Style keys (palette / paper / background / ink / composition bias) overwrite
    defaults when a style is explicitly selected. Algorithm fields are untouched.
    """
    style = PFL_STYLES.get(style_id)
    if not style:
        return dict(params)
    out = dict(params)
    out["palette"] = style["palette"]
    out["paper_style"] = style["paper_style"]
    out["background"] = style["background"]
    out["ink"] = style["ink"]
    comp = style.get("composition") or {}
    if "margin" in comp:
        out["margin"] = comp["margin"]
    if "density_bias" in comp:
        out["density"] = float(comp["density_bias"])
    if "center_bias" in comp:
        out["center_bias"] = float(comp["center_bias"])
    out["pfl_style"] = style_id
    post = style.get("post") or {}
    out["bloom_intensity"] = post.get("bloom", 0.1)
    out["vignette_strength"] = post.get("vignette", 0.15)
    return out


def list_styles() -> list[dict[str, str]]:
    return [{"id": k, "label": v["label"]} for k, v in PFL_STYLES.items()]
