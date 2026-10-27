"""Configuration-backed matching weights and thresholds."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping, Optional

from app.matching.types import LevelWeights, PairWeights, ResolutionWeights, Thresholds

_ENV_KEYS = {
    "MATCH_T_AUTO": "t_auto",
    "MATCH_T_REVIEW": "t_review",
    "OVERLAP_T_PROBABLE": "t_probable",
    "OVERLAP_T_POSSIBLE": "t_possible",
}


def load_thresholds(
    path: Optional[Path] = None,
    overrides: Optional[Mapping[str, Optional[float]]] = None,
) -> Thresholds:
    source = path or Path(__file__).resolve().parents[2] / "seed_data" / "thresholds.json"
    try:
        data = json.loads(source.read_text(encoding="utf-8"))
        values = dict(data)
        for env_name, key in _ENV_KEYS.items():
            value = (overrides or {}).get(env_name)
            if value is not None:
                values[key] = float(value)
        thresholds = Thresholds(
            t_auto=float(values["t_auto"]),
            t_review=float(values["t_review"]),
            t_probable=float(values["t_probable"]),
            t_possible=float(values["t_possible"]),
            margin=float(values["margin"]),
            resolution=ResolutionWeights(**values["resolution"]),
            pair=PairWeights(**values["pair"]),
            level=LevelWeights(**values["level"]),
        )
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid matching thresholds in {source}: {exc}") from exc
    # Validate the combined file and env overrides using the same config rules.
    if thresholds.t_review >= thresholds.t_auto:
        raise ValueError("MATCH_T_REVIEW / t_review must be less than MATCH_T_AUTO / t_auto")
    if thresholds.t_possible >= thresholds.t_probable:
        raise ValueError("OVERLAP_T_POSSIBLE / t_possible must be less than OVERLAP_T_PROBABLE / t_probable")
    return thresholds
