"""python -m seed_data.generator [--seed 26264] [--base seed_data/tiny] [--output seed_data]"""

import argparse
import json
from pathlib import Path

from .world import World

SEED_DATA = Path(__file__).resolve().parents[1]
JSON_FILES = ("bureaus", "categories", "users", "institutions", "cases", "reviews", "overlaps", "alerts", "ground_truth")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the synthetic Unicomply seed data (deterministic for a given seed).")
    parser.add_argument("--seed", type=int, default=26264)
    parser.add_argument("--base", type=Path, default=SEED_DATA / "tiny", help="the hand-written hero world to extend")
    parser.add_argument("--output", type=Path, default=SEED_DATA)
    args = parser.parse_args()

    files, summary = World(args.seed, args.base, SEED_DATA / "abbreviations.json").build()
    args.output.mkdir(parents=True, exist_ok=True)
    for name in JSON_FILES:
        text = json.dumps(files[name], ensure_ascii=False, indent=1) + "\n"
        (args.output / f"{name}.json").write_text(text, encoding="utf-8")
    print(json.dumps({"seed": args.seed, "output": str(args.output), **summary}, indent=1))


if __name__ == "__main__":
    main()
