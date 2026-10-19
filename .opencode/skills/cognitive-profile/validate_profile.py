#!/usr/bin/env python3
"""
Validates a cognitive-profile profile.json against schema.json and the
pairwise weight-sum business rule that plain JSON Schema cannot express.

Usage:
    python3 validate_profile.py <path-to-profile.json>
"""

import json
import sys
from pathlib import Path

import jsonschema

SCRIPT_DIR = Path(__file__).parent
SCHEMA_PATH = SCRIPT_DIR / "schema.json"

WEIGHT_PAIRS = [
    ("theory_first", "code_examples_first"),
    ("system_overview_first", "incremental_build_up"),
    ("narrative_explanation", "diagrams"),
    ("guided_steps", "exploratory_sandbox"),
    ("technical_precision", "real_world_analogies"),
]

TOLERANCE = 0.01
DELTA_MAX = 0.5


def validate(profile_path: Path) -> bool:
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)

    with open(profile_path) as f:
        profile = json.load(f)

    ok = True

    # 1. JSON Schema structural validation
    try:
        jsonschema.validate(instance=profile, schema=schema)
        print("[OK] Passes JSON Schema validation")
    except jsonschema.exceptions.ValidationError as e:
        print(f"[FAIL] Schema validation error: {e.message}")
        print(f"       Path: {list(e.path)}")
        ok = False

    # 2. Pairwise weight sums must equal 1.0
    weights = profile.get("cognitive_weights", {})
    for a, b in WEIGHT_PAIRS:
        if a not in weights or b not in weights:
            print(f"[FAIL] Missing weight key(s): {a} / {b}")
            ok = False
            continue
        total = weights[a] + weights[b]
        if abs(total - 1.0) > TOLERANCE:
            print(f"[FAIL] {a} + {b} = {total} (expected 1.0 +/- {TOLERANCE})")
            ok = False
        else:
            print(f"[OK] {a} + {b} = {total}")

    # 3. delta_max check across update_history (best-effort, only where changes are present)
    for entry in profile.get("update_history", []):
        if not entry.get("changes"):
            continue
        for change in entry["changes"]:
            if "field" in change:
                # Non-axis change (e.g. known_technologies proficiency or seniority_level).
                # No numeric delta_max applies here; just sanity-check required keys are present.
                if "previous_value" not in change or "new_value" not in change:
                    print(f"[FAIL] Malformed field-change entry: {change}")
                    ok = False
                else:
                    print(
                        f"[OK] Field '{change['field']}' changed "
                        f"{change['previous_value']} -> {change['new_value']}"
                    )
                continue

            prev = change.get("previous_score")
            new = change.get("new_score")
            if prev is None or new is None:
                continue
            delta = abs(new - prev)
            if delta > DELTA_MAX + TOLERANCE:
                print(
                    f"[FAIL] Axis '{change.get('axis')}' moved by {delta} "
                    f"(previous={prev}, new={new}), exceeds delta_max={DELTA_MAX}"
                )
                ok = False
            else:
                print(f"[OK] Axis '{change.get('axis')}' delta {delta} within bounds")

    # 4. Confidence accumulators (proficiency_confidence, seniority_level_confidence)
    #    must stay within [0, 1] — schema already enforces this, but check explicitly
    #    here too since these are easy to get wrong with the +0.15/-0.10 step logic.
    CONFIDENCE_BOUNDS = (0.0, 1.0)
    for tech in profile.get("background_context", {}).get("known_technologies", []):
        if "proficiency_confidence" not in tech:
            continue
        val = tech["proficiency_confidence"]
        lo, hi = CONFIDENCE_BOUNDS
        if not (lo - TOLERANCE <= val <= hi + TOLERANCE):
            print(f"[FAIL] {tech.get('name')}.proficiency_confidence = {val} (expected [{lo}, {hi}])")
            ok = False
        else:
            print(f"[OK] {tech.get('name')}.proficiency_confidence = {val}")

    seniority_conf = profile.get("background_context", {}).get("seniority_level_confidence")
    if seniority_conf is not None:
        lo, hi = CONFIDENCE_BOUNDS
        if not (lo - TOLERANCE <= seniority_conf <= hi + TOLERANCE):
            print(f"[FAIL] seniority_level_confidence = {seniority_conf} (expected [{lo}, {hi}])")
            ok = False
        else:
            print(f"[OK] seniority_level_confidence = {seniority_conf}")

    return ok


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 validate_profile.py <path-to-profile.json>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    result = validate(path)
    print()
    print("RESULT:", "VALID" if result else "INVALID")
    sys.exit(0 if result else 1)