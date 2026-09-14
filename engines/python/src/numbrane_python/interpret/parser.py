"""Intent parser for natural language to meta-control translation."""

import re
from dataclasses import dataclass, field

from numbrane_python.interpret.lexicon import (
    INTENSIFIERS,
    NEGATION_WORDS,
    PHRASE_INDEX,
    TREND_WORDS,
)


@dataclass
class IntentMapping:
    """Mapping from phrase to meta-control effects."""

    phrase: str
    effects: dict[str, float]
    intensity: float = 1.0
    negated: bool = False
    explanation: str = ""


@dataclass
class IntentResolutionResult:
    """Result of intent resolution."""

    meta: dict[str, float]
    confidence: dict[str, float] = field(default_factory=dict)
    explanation: dict[str, any] = field(default_factory=dict)
    mappings: list[IntentMapping] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class IntentParser:
    """Deterministic parser for natural language intent to meta-controls."""

    def __init__(self):
        """Initialize parser."""
        self.phrase_index = PHRASE_INDEX
        self.intensifiers = INTENSIFIERS
        self.negation_words = NEGATION_WORDS
        self.trend_words = TREND_WORDS

    def parse(self, intent_text: str) -> IntentResolutionResult:
        """Parse intent text into meta-control vector.

        Args:
            intent_text: Natural language intent description

        Returns:
            IntentResolutionResult with resolved meta-controls
        """
        intent_text = intent_text.lower().strip()

        # Split into phrases (comma-separated or "and"/"but" separated)
        phrases = self._split_phrases(intent_text)

        # Parse each phrase
        mappings: list[IntentMapping] = []
        for phrase in phrases:
            mapping = self._parse_phrase(phrase)
            if mapping:
                mappings.append(mapping)

        # Combine mappings into final meta vector
        meta = self._combine_mappings(mappings)

        # Build explanation
        explanation = self._build_explanation(mappings, meta)

        # Calculate confidence (based on phrase matches)
        confidence = self._calculate_confidence(mappings)

        return IntentResolutionResult(
            meta=meta,
            confidence=confidence,
            explanation=explanation,
            mappings=mappings,
        )

    def _split_phrases(self, text: str) -> list[str]:
        """Split text into phrases.

        Args:
            text: Input text

        Returns:
            List of phrase strings
        """
        # Split on commas, "and", "but"
        parts = re.split(r"[,;]|\s+and\s+|\s+but\s+", text)
        return [p.strip() for p in parts if p.strip()]

    def _parse_phrase(self, phrase: str) -> IntentMapping | None:
        """Parse a single phrase.

        Args:
            phrase: Phrase to parse

        Returns:
            IntentMapping or None
        """
        phrase = phrase.strip().lower()
        if not phrase:
            return None

        # Check for negation
        negated = any(word in phrase for word in self.negation_words)

        # Extract intensifier
        intensity = 1.0
        intensifier_match = None
        for intensifier, multiplier in self.intensifiers.items():
            if phrase.startswith(intensifier + " "):
                intensity = multiplier
                intensifier_match = intensifier
                phrase = phrase[len(intensifier) + 1 :].strip()
                break

        # Remove negation words
        for neg_word in self.negation_words:
            phrase = re.sub(rf"\b{neg_word}\b\s*", "", phrase)

        # Remove trend words (for still images, resolve to target)
        for trend_word in self.trend_words:
            phrase = re.sub(rf"\b{trend_word}\b\s*", "", phrase)

        phrase = phrase.strip()

        # Look up phrase in index
        if phrase in self.phrase_index:
            mapping = self.phrase_index[phrase]
            effects = mapping.effects.copy()

            # Apply intensity
            if intensity != 1.0:
                effects = {k: v * intensity for k, v in effects.items()}

            # Apply negation
            if negated:
                effects = {k: -v for k, v in effects.items()}

            explanation_parts = []
            if intensifier_match:
                explanation_parts.append(f"intensified by '{intensifier_match}'")
            if negated:
                explanation_parts.append("negated")

            return IntentMapping(
                phrase=phrase,
                effects=effects,
                intensity=intensity,
                negated=negated,
                explanation=", ".join(explanation_parts) if explanation_parts else "direct match",
            )

        # Try partial matches (word-by-word)
        words = phrase.split()
        if len(words) > 1:
            # Try to match any word
            for word in words:
                if word in self.phrase_index:
                    mapping = self.phrase_index[word]
                    effects = mapping.effects.copy()

                    # Apply intensity
                    if intensity != 1.0:
                        effects = {k: v * intensity for k, v in effects.items()}

                    # Apply negation
                    if negated:
                        effects = {k: -v for k, v in effects.items()}

                    return IntentMapping(
                        phrase=phrase,
                        effects=effects,
                        intensity=intensity,
                        negated=negated,
                        explanation=f"matched word '{word}'",
                    )

        return None

    def _combine_mappings(self, mappings: list[IntentMapping]) -> dict[str, float]:
        """Combine multiple mappings into final meta vector.

        Args:
            mappings: List of intent mappings

        Returns:
            Combined meta-control dictionary
        """
        # Start with neutral values (0.5 for all controls)
        meta = {
            "violence": 0.5,
            "entropy": 0.5,
            "symmetry": 0.5,
            "rigidity": 0.5,
            "weirdness": 0.5,
            "cosmicness": 0.5,
            "biologicalness": 0.5,
        }

        # Apply each mapping as a delta
        for mapping in mappings:
            for control, delta in mapping.effects.items():
                if control in meta:
                    meta[control] += delta

        # Clamp to [0, 1]
        for control in meta:
            meta[control] = max(0.0, min(1.0, meta[control]))

        return meta

    def _build_explanation(
        self, mappings: list[IntentMapping], meta: dict[str, float]
    ) -> dict[str, any]:
        """Build explanation of intent resolution.

        Args:
            mappings: List of intent mappings
            meta: Final meta-control vector

        Returns:
            Explanation dictionary
        """
        applied_deltas = {}
        phrase_effects = {}

        for mapping in mappings:
            phrase_effects[mapping.phrase] = []
            for control, delta in mapping.effects.items():
                if control not in applied_deltas:
                    applied_deltas[control] = 0.0
                applied_deltas[control] += delta
                phrase_effects[mapping.phrase].append(control)

        return {
            "applied_deltas": applied_deltas,
            "phrase_effects": phrase_effects,
            "mappings": [
                {
                    "phrase": m.phrase,
                    "effects": m.effects,
                    "intensity": m.intensity,
                    "negated": m.negated,
                    "explanation": m.explanation,
                }
                for m in mappings
            ],
        }

    def _calculate_confidence(self, mappings: list[IntentMapping]) -> dict[str, float]:
        """Calculate confidence scores.

        Args:
            mappings: List of intent mappings

        Returns:
            Confidence dictionary
        """
        if not mappings:
            return {"overall": 0.0}

        # Confidence based on number of successful matches
        # and how direct the matches were
        total_confidence = 0.0
        for mapping in mappings:
            # Direct phrase match = 1.0, word match = 0.7
            if mapping.explanation == "direct match":
                total_confidence += 1.0
            else:
                total_confidence += 0.7

        overall = min(1.0, total_confidence / max(1, len(mappings)))

        return {
            "overall": overall,
            "matches": len(mappings),
        }
