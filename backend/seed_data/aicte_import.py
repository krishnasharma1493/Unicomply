"""Build `aicte_registry.json` from AICTE's public Approved Institutes list (python -m seed_data.aicte_import).

Input:  seed_data/aicte_raw/AICTE_Approved_Colleges_Master.xlsx (see aicte_raw/SOURCE.md), read with the standard library.
Output: seed_data/aicte_registry.json, committed, so the demo never needs the raw file or the network.

The list has no state column, and its rows are grouped by state in the order the scraper's threads finished. Each state's rows
are contiguous, and the size of each state's block is known, so `STATE_BLOCKS` records where the six demo states start. They are
specific to this exact file: the SHA-256 is checked first, and each block is checked against its state's districts.
"""

import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from xml.etree import ElementTree

from .generator.noise import acronym, name_norm

SEED_DATA = Path(__file__).resolve().parent
RAW = SEED_DATA / "aicte_raw" / "AICTE_Approved_Colleges_Master.xlsx"
OUT = SEED_DATA / "aicte_registry.json"
RAW_SHA256 = "94259ae96a8835a64d05d713a19d7497676ade83b3b60ff772639d7e83d79d87"
SHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# state -> (first data row, number of rows, region, a district every genuine block is dominated by)
STATE_BLOCKS: Dict[str, Tuple[int, int, str, str]] = {
    "Delhi": (1782, 95, "north_western", "SOUTH DELHI"),
    "Gujarat": (2409, 561, "western", "AHMEDABAD"),
    "Madhya Pradesh": (4764, 790, "central", "BHOPAL"),
    "Maharashtra": (6284, 1705, "western", "PUNE"),
    "Tamil Nadu": (10262, 1338, "southern", "COIMBATORE"),
    "Uttar Pradesh": (11600, 1123, "northern", "MEERUT"),
}
# Rows whose district is a typo in AICTE's own list: dropped rather than guessed at.
WRONG_DISTRICT = {("Delhi", "KARBI ANGLONG")}

UNIVERSITY_OWNERSHIP = ("University", "Central University")
HOTEL = re.compile(r"\b(HOTEL|CATERING|HOSPITALITY|CULINARY)\b")
PHARMACY = re.compile(r"\bPHARM")
POLYTECHNIC = re.compile(r"\b(POLYTECHNIC|POLYTECHNICS)\b")
ENGINEERING = re.compile(r"\b(ENGG|ENGINEERING|TECHNOLOGY|TECHNOLOGICAL|TECHNICAL|IT)\b")
MANAGEMENT = re.compile(r"\b(MANAGEMENT|BUSINESS|MBA|PGDM|BBA|B SCHOOL|ADMINISTRATION)\b")
UNIVERSITY = re.compile(r"\b(UNIVERSITY|VISHWAVIDYALAYA|VIDYAPEETH|VIDYAPITH)\b")
DEPARTMENT_OF_A_UNIVERSITY = re.compile(r"^(UNIVERSITY (INSTITUTE|SCHOOL|POLYTECHNIC|DEPARTMENT|COLLEGE)|DEPARTMENT OF)\b")

# A trust family is a brand that runs several institutions in one state. AICTE's list has no trust column, so the only evidence
# is a distinctive shared name; this hand-reviewed list is the whole of it. A family needs two or more members in one state.
BRANDS = [
    "Maharaja Agrasen", "Bharati Vidyapeeth", "Sinhgad", "Symbiosis", "K J Somaiya|K.J.Somaiya", "Welingkar", "Technocrats",
    "RKDF", "Oriental", "Truba", "Sagar Institute", "Lakshmi Narain", "Acropolis", "IPS Academy", "Prestige", "Bansal",
    "Gyan Ganga", "Shri Ram Institute|Shri Ram Group", "Radiant", "Dhanalakshmi Srinivasan", "PSG", "Sri Ramakrishna",
    "Kongu", "SRM", "Karpagam", "Hindusthan", "Jeppiaar", "Saveetha", "Sona", "Bannari Amman", "Sri Krishna",
    "ABES", "Galgotias", "Raj Kumar Goel", "IMS ", "Sharda", "Amity", "JSS ", "GL Bajaj|G L Bajaj", "Mahatma Gandhi Mission|MGM",
    "D Y Patil|Dr D Y Patil|Dr\\. ?D\\. ?Y\\. ?Patil", "Vishwakarma", "AISSMS", "JSPM", "Zeal", "Sandip", "Modern Education Society",
    "Thakur", "Atharva", "Don Bosco", "Fr\\. ?Agnel", "Rajarshi Shahu", "Navsahyadri", "Pillai", "Sanjivani", "Kalasalingam",
]
# University -> its constituent campuses and colleges, all in the list under their own AICTE IDs. A child becomes a university
# department of its parent (the parent must itself be in the list: no parent record is invented).
UNIVERSITY_CHILDREN = {
    "1-43673888924": ["1-43664723507", "1-43655372414", "1-43661808458"],  # Bharati Vidyapeeth
    "1-43656086434": ["1-43659469563", "1-43663309440"],                   # Anna University
    "1-43665280899": ["1-44119283563"],                                    # Dhanalakshmi Srinivasan University
    "1-43664341090": ["1-43656753344"],                                    # Netaji Subhas University of Technology
    "1-43656320034": ["1-43665219344"],                                    # Jamia Millia Islamia
    "1-43662140699": ["1-43656123426", "1-43658374971"],                   # Symbiosis International (Pune)
}
GENERIC_START = re.compile(r"^(Government|Govt)\b")

LOWER = {"of", "and", "the", "for", "in", "at", "to", "be", "a", "an", "&"}
# Plain misspellings in AICTE's list (the AICTE ID is what identifies an institution, so the name can be read properly).
SPELLING = {"UNVIERSITY": "University", "INSTITUE": "Institute", "INSTITITE": "Institute", "INSTTITUTE": "Institute", "INSTITUTION": "Institution"}
UPPER = {
    "IIT", "IIM", "NIT", "MBA", "BBA", "BCA", "MCA", "PGDM", "AICTE", "UP", "MP", "NCR", "II", "III", "IV", "ITI", "BMS", "BIMS",
    "GGSIPU", "IMS", "IET", "KIET", "ABES", "AKG", "JSS", "MIT", "SRM", "VIT", "PSG", "SSN", "RVS", "DY", "KJ", "JBP", "LNCT", "SGSITS",
}


def mojibake(text: str) -> str:
    """Fix `Mandal’s` that was read as `Mandalâ\x80\x99s`."""
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def title(text: str) -> str:
    """'MAHARAJA AGRASEN INSTITUTE OF TECHNOLOGY' -> 'Maharaja Agrasen Institute of Technology', initials and acronyms kept."""
    words = []
    text = re.sub(r",(?=\S)", ", ", mojibake(text).strip())
    for n, token in enumerate(re.split(r"(\s+)", text)):
        if not token.strip():
            words.append(" ")
            continue
        core = re.sub(r"[^A-Za-z]", "", token)
        if core.upper() in SPELLING and core.upper() != "INSTITUTION":
            words.append(token.upper().replace(core.upper(), SPELLING[core.upper()]))
        elif token.lower() in LOWER and n:
            words.append(token.lower())
        elif core.upper() == "DR":
            words.append("Dr." if token.endswith(".") else "Dr")
        elif core.upper() in UPPER or re.fullmatch(r"(?:[A-Z]\.)+[A-Z]?\.?", token) or (len(core) >= 2 and not re.search(r"[AEIOUY]", core.upper())):
            words.append(token.upper() if core.upper() in UPPER or not token.islower() else token)
        elif token.startswith("(") and token.endswith(")") and len(core) <= 6:
            words.append(token.upper())
        else:
            words.append("-".join(part[:1].upper() + part[1:].lower() for part in token.split("-")))
    return re.sub(r"\s+", " ", "".join(words)).strip()


def clean_name(raw: str) -> str:
    """Stray characters AICTE's list carries: wrapping quotes, a quote used as an apostrophe, a leading serial code ('126-', '122,', '370 ')."""
    name = mojibake(raw).strip().strip('"').strip()
    name = re.sub(r'(?<=[A-Za-z])"(?=s\b)', "'", name, flags=re.IGNORECASE)
    name = re.sub(r"^\d{1,4}\s*[,\-.]\s*", "", name)
    return re.sub(r"^\d{3}\s+(?=[A-Za-z])", "", name)


def classify(name: str, ownership: str) -> Optional[str]:
    """The institution type from the name (the list has no program column); None when the name does not say."""
    n = " ".join(re.findall(r"[A-Z0-9]+", name.upper().replace("&", " AND ")))
    if HOTEL.search(n):
        return "hotel_management"
    if PHARMACY.search(n):
        return "pharmacy"
    if POLYTECHNIC.search(n):
        return "polytechnic"
    if ownership.endswith(UNIVERSITY_OWNERSHIP) or "University" in ownership:
        if UNIVERSITY.search(n) and not DEPARTMENT_OF_A_UNIVERSITY.match(n) and not re.search(r"\b(INSTITUTE|SCHOOL|COLLEGE|FACULTY) OF\b", n):
            return "university"
    if ENGINEERING.search(n):
        return "engineering"
    if MANAGEMENT.search(n):
        return "management"
    return None


def read_rows(path: Path) -> List[Dict[str, str]]:
    """Rows of the first sheet as {column letter: text}; the file stores its strings inline, but shared strings are read too."""
    with zipfile.ZipFile(path) as archive:
        shared: List[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(t.text or "" for t in si.iter(f"{SHEET}t")) for si in ElementTree.fromstring(archive.read("xl/sharedStrings.xml")).iter(f"{SHEET}si")]
        sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iter(f"{SHEET}row"):
        cells: Dict[str, str] = {}
        for cell in row.iter(f"{SHEET}c"):
            column = re.match(r"[A-Z]+", cell.get("r") or "")
            value = cell.find(f"{SHEET}v")
            if cell.get("t") == "s" and value is not None:
                text = shared[int(value.text or 0)]
            elif cell.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in cell.iter(f"{SHEET}t"))
            else:
                text = value.text if value is not None and value.text else ""
            if column:
                cells[column.group()] = text
        rows.append(cells)
    return rows


def state_rows(rows: List[Dict[str, str]]) -> List[Tuple[str, str, Dict[str, str]]]:
    """(state, region, row) for every row in the demo states; refuses a file that is not the one the blocks were found in."""
    data = rows[1:]
    taken: List[Tuple[int, int]] = []
    out = []
    for state, (start, size, region, home) in STATE_BLOCKS.items():
        block = data[start:start + size]
        if len(block) != size or Counter(r.get("D", "") for r in block).most_common(1)[0][0] != home:
            raise SystemExit(f"{state}: rows {start}..{start + size} are not the {state} block; the raw file has changed")
        if any(start < b + s and b < start + size for b, s in taken):
            raise SystemExit(f"{state}: block overlaps another state")
        taken.append((start, size))
        out.extend((state, region, r) for r in block)
    return out


def build() -> dict:
    if hashlib.sha256(RAW.read_bytes()).hexdigest() != RAW_SHA256:
        raise SystemExit(f"{RAW.name} is not the file STATE_BLOCKS was found in (sha256 mismatch)")
    rows = read_rows(RAW)
    examined = state_rows(rows)
    kept: Dict[Tuple[str, str], dict] = {}
    dropped: Counter = Counter()
    for state, region, r in sorted(examined, key=lambda t: t[2]["A"]):
        pid, raw_name, district = r["A"].strip(), mojibake(r.get("B", "")).strip(), r.get("D", "").strip().upper()
        if (state, district) in WRONG_DISTRICT:
            dropped["district is a typo in the source"] += 1
            continue
        inst_type = classify(raw_name, r.get("E", ""))
        if inst_type is None:
            dropped["name does not say what kind of institution it is"] += 1
            continue
        name = title(clean_name(raw_name))
        key = (name_norm(name), district)
        if key in kept:
            dropped["same name twice in one district"] += 1
            continue
        address = title(r.get("C", "")) or district.title()
        found = re.search(r"(?<!\d)(\d{3})\s?(\d{3})(?!\d)", r.get("C", ""))
        kept[key] = {
            "permanent_id": pid,
            "name": name,
            "name_norm": key[0],
            "acronym": acronym(name)[:20],
            "address": f"{address}, {title(district)}, {state}"[:300],
            "district": title(district),
            "state": state,
            "pin": f"{found.group(1)}{found.group(2)}" if found else "",
            "region": region,
            "inst_type": inst_type,
            "year_est": None,
            "trust_id": None,
            "parent_id": None,
            "is_active": True,
        }
    institutions = sorted(kept.values(), key=lambda i: i["permanent_id"])
    by_pid = {i["permanent_id"]: i for i in institutions}
    link_universities(by_pid)
    trusts = link_trusts(institutions)
    return {
        "source": "AICTE Approved Institutes, academic year 2024-25 (facilities.aicte-india.org), see aicte_raw/SOURCE.md",
        "examined": len(examined),
        "dropped": dict(sorted(dropped.items())),
        "by_state": dict(sorted(Counter(i["state"] for i in institutions).items())),
        "by_type": dict(sorted(Counter(i["inst_type"] for i in institutions).items())),
        "trusts": trusts,
        "twin_pairs": twin_pairs(institutions),
        "institutions": institutions,
    }


def link_universities(by_pid: Dict[str, dict]) -> None:
    for parent, children in UNIVERSITY_CHILDREN.items():
        if parent not in by_pid or any(c not in by_pid for c in children):
            missing = [p for p in [parent, *children] if p not in by_pid]
            raise SystemExit(f"university link names an institution that is not in the list: {missing}")
        by_pid[parent]["inst_type"] = "university"
        for child in children:
            by_pid[child]["parent_id"] = parent
            by_pid[child]["inst_type"] = "university_department"


def link_trusts(institutions: List[dict]) -> List[dict]:
    """One trust per (brand, state) with two or more members; universities and their departments are linked by parent instead."""
    trusts: List[dict] = []
    for brand in BRANDS:
        pattern = re.compile(rf"^(?:{brand})", re.IGNORECASE)
        by_state: Dict[str, List[dict]] = {}
        for i in institutions:
            if i["trust_id"] is None and i["parent_id"] is None and i["inst_type"] not in ("university", "university_department") and pattern.match(i["name"]):
                by_state.setdefault(i["state"], []).append(i)
        families = {state: members for state, members in sorted(by_state.items()) if len({m["name_norm"] for m in members}) >= 2}
        label = title(re.split(r"\|", brand)[0].replace("\\", "").replace("?", "").strip())
        for state, members in families.items():
            suffix = f" ({state})" if len(families) > 1 else ""  # a trust name is unique
            trusts.append({"id": len(trusts) + 1, "name": f"{label} Group of Institutions{suffix}", "address": f"{members[0]['district']}, {state}", "state": state})
            for m in members:
                m["trust_id"] = trusts[-1]["id"]
    return trusts


def twin_pairs(institutions: List[dict]) -> List[List[str]]:
    """Two genuine institutions with the same name in two states: the 'same name, other state' hard negatives."""
    by_name: Dict[str, List[dict]] = {}
    for i in institutions:
        by_name.setdefault(i["name_norm"], []).append(i)
    pairs = []
    for name, group in sorted(by_name.items()):
        if len(group) == 2 and group[0]["state"] != group[1]["state"] and not GENERIC_START.match(group[0]["name"]) and len(name) >= 24:
            pairs.append([g["permanent_id"] for g in sorted(group, key=lambda g: g["permanent_id"])])
    return pairs


def main() -> None:
    registry = build()
    OUT.write_text(json.dumps(registry, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in registry.items() if k != "institutions"}, indent=1))
    print(f"wrote {OUT.name}: {len(registry['institutions'])} institutions", file=sys.stderr)


if __name__ == "__main__":
    main()
