"""
Build a rank -> score lookup from the NBE NEET-PG published result PDF.

The NBE PDF lists every candidate as  S.No / Application No / Roll No /
Total Score / Rank.  Score never decreases with rank, so we store the mapping
as runs of [firstRank, score] pairs - tiny file, instant lookup.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf

ROW_RE = re.compile(
    r"(\d{1,6})\s*\n\s*(PG\d+)\s*\n\s*(\d{6,})\s*\n\s*(\d{1,3})\s*\n\s*(\d{1,6})"
)


def parse_scores(path, progress=print):
    doc = pymupdf.open(path)
    pairs = []

    for page_no in range(doc.page_count):
        text = doc[page_no].get_text()
        for m in ROW_RE.finditer(text):
            score = int(m.group(4))
            rank = int(m.group(5))
            if 0 <= score <= 720 and 1 <= rank <= 500000:
                pairs.append((rank, score))
        if page_no % 500 == 0:
            progress(f"  page {page_no + 1}/{doc.page_count}: {len(pairs)} candidates")

    return pairs


def build_runs(pairs):
    """Collapse (rank, score) pairs into runs of constant score."""
    by_rank: dict[int, int] = {}
    for rank, score in pairs:
        by_rank.setdefault(rank, score)

    runs = []
    for rank in sorted(by_rank):
        score = by_rank[rank]
        if runs and score == runs[-1][1]:
            continue
        runs.append([rank, score])

    # sanity: scores must be non-increasing as rank grows
    violations = 0
    for i in range(1, len(runs)):
        if runs[i][1] > runs[i - 1][1]:
            violations += 1
    return runs, len(by_rank), violations


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    pairs = parse_scores(Path(args.pdf))
    runs, unique_ranks, violations = build_runs(pairs)
    print(f"{len(pairs)} rows · {unique_ranks} unique ranks · {len(runs)} runs · {violations} monotonicity violations")

    payload = json.dumps(runs, separators=(",", ":"))
    Path(args.out).write_text(
        "// NEET-PG 2026 rank -> score runs: [firstRank, score] pairs (score is constant\n"
        "// until the next entry). Generated from the official NBE published result.\n"
        f"window.NEETPG_SCORE_RUNS = {payload};\n",
        encoding="utf-8",
    )
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
