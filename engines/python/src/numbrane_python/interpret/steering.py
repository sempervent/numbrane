"""Steering utilities for "more like this" workflows."""

from typing import Any

from numbrane_python.interpret.parser import IntentParser


def derive_meta_from_artifact(
    artifact_id: str,
    repo: Any,
    intent_text: str | None = None,
) -> dict[str, float]:
    """Derive meta-controls from artifact and apply intent delta.

    Args:
        artifact_id: Artifact ID
        repo: Repository
        intent_text: Optional intent text for delta

    Returns:
        Meta-control dictionary
    """
    # Get artifact
    artifact = repo.get_artifact(artifact_id)
    if not artifact:
        raise ValueError(f"Artifact '{artifact_id}' not found")

    # Get job that produced this artifact
    cursor = repo.conn.cursor()
    cursor.execute(
        """
        SELECT j.request_json, p.provenance_json
        FROM jobs j
        LEFT JOIN provenance p ON j.id = p.job_id
        WHERE j.artifact_id = ?
        ORDER BY j.created_at DESC
        LIMIT 1
    """,
        (artifact_id,),
    )
    row = cursor.fetchone()

    if not row:
        raise ValueError(f"No job found for artifact '{artifact_id}'")

    request_json = row[0]
    provenance_json = row[1] if row[1] else None

    import json

    request = json.loads(request_json)

    # Extract meta from request or provenance
    base_meta = request.get("meta", {})

    if provenance_json:
        provenance = json.loads(provenance_json)
        # Check if provenance has resolved meta
        if "resolved_meta" in provenance:
            base_meta = provenance["resolved_meta"]

    # If no meta found, use defaults
    if not base_meta:
        base_meta = {
            "violence": 0.5,
            "entropy": 0.5,
            "symmetry": 0.5,
            "rigidity": 0.5,
            "weirdness": 0.5,
            "cosmicness": 0.5,
            "biologicalness": 0.5,
        }

    # Apply intent delta if provided
    if intent_text:
        parser = IntentParser()
        intent_result = parser.parse(intent_text)

        # Apply deltas from intent
        for control, delta in intent_result.explanation.get("applied_deltas", {}).items():
            if control in base_meta:
                base_meta[control] += delta
            else:
                base_meta[control] = 0.5 + delta

        # Clamp to [0, 1]
        for control in base_meta:
            base_meta[control] = max(0.0, min(1.0, base_meta[control]))

    return base_meta


def explain_steering(
    artifact_id: str,
    intent_text: str | None,
    repo: Any,
) -> dict[str, Any]:
    """Explain steering operation.

    Args:
        artifact_id: Artifact ID
        intent_text: Intent text
        repo: Repository

    Returns:
        Explanation dictionary
    """
    # Get base meta
    base_meta = derive_meta_from_artifact(artifact_id, repo, intent_text=None)

    explanation = {
        "artifact_id": artifact_id,
        "base_meta": base_meta,
        "intent": intent_text,
        "delta": {},
        "final_meta": base_meta,
    }

    if intent_text:
        parser = IntentParser()
        intent_result = parser.parse(intent_text)

        explanation["delta"] = intent_result.explanation.get("applied_deltas", {})
        explanation["final_meta"] = derive_meta_from_artifact(artifact_id, repo, intent_text)
        explanation["intent_explanation"] = intent_result.explanation

    return explanation
