"""Lexicon for intent parsing."""

from dataclasses import dataclass


@dataclass
class PhraseMapping:
    """Mapping from phrase to meta-control effects."""

    phrase: str
    effects: dict[str, float]  # meta-control name -> delta
    aliases: list[str] = None


# Base phrase mappings
PHRASE_MAPPINGS: list[PhraseMapping] = [
    # Ritualistic / Sacred
    PhraseMapping(
        phrase="ritualistic",
        effects={"symmetry": 0.3, "rigidity": 0.2, "entropy": -0.2},
        aliases=["ritual", "sacred", "ceremonial", "holy", "divine", "spiritual"],
    ),
    PhraseMapping(
        phrase="sacred",
        effects={"symmetry": 0.25, "rigidity": 0.15, "entropy": -0.15},
        aliases=["holy", "divine", "spiritual"],
    ),
    # Violence / Aggression
    PhraseMapping(
        phrase="violent",
        effects={"violence": 0.4, "entropy": 0.2},
        aliases=["aggressive", "brutal", "fierce", "savage", "hostile"],
    ),
    PhraseMapping(
        phrase="aggressive",
        effects={"violence": 0.35, "entropy": 0.15},
        aliases=["brutal", "fierce"],
    ),
    # Calm / Restrained
    PhraseMapping(
        phrase="calm",
        effects={"violence": -0.3, "entropy": -0.2},
        aliases=["peaceful", "serene", "tranquil", "restrained", "gentle", "quiet"],
    ),
    PhraseMapping(
        phrase="restrained",
        effects={"violence": -0.25, "entropy": -0.15},
        aliases=["controlled", "disciplined"],
    ),
    # Organic / Biological
    PhraseMapping(
        phrase="organic",
        effects={"biologicalness": 0.4, "entropy": 0.1, "rigidity": -0.2},
        aliases=["biological", "living", "alive", "natural", "growing"],
    ),
    PhraseMapping(
        phrase="biological",
        effects={"biologicalness": 0.35, "entropy": 0.1},
        aliases=["living", "alive", "organic"],
    ),
    # Mechanical / Sterile
    PhraseMapping(
        phrase="mechanical",
        effects={"rigidity": 0.3, "biologicalness": -0.3, "symmetry": 0.1},
        aliases=["sterile", "artificial", "synthetic", "robotic", "precise"],
    ),
    PhraseMapping(
        phrase="sterile",
        effects={"rigidity": 0.25, "biologicalness": -0.25},
        aliases=["clean", "artificial"],
    ),
    # Cosmic / Vast
    PhraseMapping(
        phrase="cosmic",
        effects={"cosmicness": 0.4, "entropy": 0.15},
        aliases=["vast", "infinite", "spatial", "stellar", "nebular", "galactic"],
    ),
    PhraseMapping(
        phrase="vast",
        effects={"cosmicness": 0.3, "entropy": 0.1},
        aliases=["infinite", "spatial"],
    ),
    # Weird / Uncanny
    PhraseMapping(
        phrase="weird",
        effects={"weirdness": 0.4, "entropy": 0.15},
        aliases=["uncanny", "strange", "bizarre", "alien", "otherworldly"],
    ),
    PhraseMapping(
        phrase="uncanny",
        effects={"weirdness": 0.35, "entropy": 0.1},
        aliases=["strange", "bizarre"],
    ),
    # Boring / Bureaucratic
    PhraseMapping(
        phrase="boring",
        effects={"entropy": -0.3, "rigidity": 0.3, "weirdness": -0.2},
        aliases=["bureaucratic", "mundane", "dull", "tedious", "routine"],
    ),
    PhraseMapping(
        phrase="bureaucratic",
        effects={"entropy": -0.25, "rigidity": 0.25},
        aliases=["administrative", "formal"],
    ),
    # Chaotic
    PhraseMapping(
        phrase="chaotic",
        effects={"entropy": 0.4, "symmetry": -0.2, "rigidity": -0.2},
        aliases=["disordered", "random", "unpredictable", "turbulent"],
    ),
    # Precise
    PhraseMapping(
        phrase="precise",
        effects={"symmetry": 0.3, "rigidity": 0.25, "entropy": -0.15},
        aliases=["exact", "accurate", "ordered", "structured"],
    ),
    # Decaying
    PhraseMapping(
        phrase="decaying",
        effects={"entropy": 0.3, "rigidity": -0.2, "biologicalness": 0.1},
        aliases=["rotting", "decomposing", "eroding", "fragmenting"],
    ),
    # Cold
    PhraseMapping(
        phrase="cold",
        effects={"biologicalness": -0.2, "rigidity": 0.15, "cosmicness": 0.1},
        aliases=["frigid", "icy", "frozen", "sterile"],
    ),
    # Warm
    PhraseMapping(
        phrase="warm",
        effects={"biologicalness": 0.15, "entropy": 0.1},
        aliases=["heated", "glowing"],
    ),
    # Symmetrical
    PhraseMapping(
        phrase="symmetrical",
        effects={"symmetry": 0.4, "rigidity": 0.1},
        aliases=["balanced", "ordered", "regular"],
    ),
    # Asymmetrical
    PhraseMapping(
        phrase="asymmetrical",
        effects={"symmetry": -0.3, "entropy": 0.15},
        aliases=["unbalanced", "irregular"],
    ),
]

# Intensifiers
INTENSIFIERS: dict[str, float] = {
    "slightly": 0.5,
    "somewhat": 0.6,
    "moderately": 0.75,
    "very": 1.25,
    "extremely": 1.5,
    "incredibly": 1.75,
    "slightly more": 0.5,
    "more": 1.0,
    "less": -1.0,
    "slightly less": -0.5,
    "much more": 1.5,
    "much less": -1.5,
}

# Negation words
NEGATION_WORDS: list[str] = [
    "not",
    "no",
    "without",
    "lacking",
    "devoid",
]

# Trend words (for time-based, but resolve to target for still images)
TREND_WORDS: list[str] = [
    "increasingly",
    "gradually",
    "over time",
    "becoming",
    "tending toward",
]


def build_phrase_index() -> dict[str, PhraseMapping]:
    """Build index of all phrases and aliases to mappings.

    Returns:
        Dictionary mapping phrase/alias to PhraseMapping
    """
    index = {}
    for mapping in PHRASE_MAPPINGS:
        # Add main phrase
        index[mapping.phrase.lower()] = mapping
        # Add aliases
        if mapping.aliases:
            for alias in mapping.aliases:
                index[alias.lower()] = mapping
    return index


PHRASE_INDEX = build_phrase_index()
