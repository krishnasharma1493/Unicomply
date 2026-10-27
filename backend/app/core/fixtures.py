"""
Serve the shared contract fixtures (contract/fixtures/, #2) from stub routes.

Stubs let the frontend and /docs use every §5 endpoint before its real implementation
lands; each later issue replaces one stub and keeps the response model.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Type, TypeVar

from pydantic import BaseModel

CONTRACT_DIR = Path(__file__).resolve().parents[3] / "contract" / "fixtures"

M = TypeVar("M", bound=BaseModel)


@lru_cache(maxsize=None)
def load_fixture(name: str) -> Dict[str, Any]:
    """Raw JSON of `contract/fixtures/<name>.json` (e.g. "get_cases", "errors/not_found")."""
    data: Dict[str, Any] = json.loads((CONTRACT_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return data


def fixture(name: str, model: Type[M]) -> M:
    """The fixture parsed into its response model, so a stub can never drift from the contract."""
    return model.model_validate(load_fixture(name))
