"""
Parse an MCC NEET-PG seat-allotment PDF into structured rows.

MCC allotment PDFs are landscape pages whose text is drawn rotated, so word
coordinates are transformed into "display" space before the grid is built.
Cell borders are drawn as vector lines; those lines give exact column and row
boundaries, which is far more reliable than guessing from text positions.

Usage:
    py tools/parse_allotment.py --pdf <allotment.pdf> --out rows.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf


def cluster(values, tol=2.0):
    values = sorted(values)
    groups: list[list[float]] = []
    for value in values:
        if groups and value - groups[-1][-1] <= tol:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [sum(g) / len(g) for g in groups]


def page_grid(page):
    """Return (column_x_boundaries, row_y_boundaries) in display space."""
    height = page.mediabox.height
    vx, hy = [], []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            (x0, y0), (x1, y1) = item[1], item[2]
            if abs(y0 - y1) < 0.5:
                vx.append(height - (y0 + y1) / 2)
            elif abs(x0 - x1) < 0.5:
                hy.append((x0 + x1) / 2)
    return cluster(vx), cluster(hy)


def page_rows(page):
    """Yield one list of 8 cell strings per table row on the page."""
    height = page.mediabox.height
    columns, row_bounds = page_grid(page)
    if len(columns) < 9 or len(row_bounds) < 3:
        return

    words = []
    for w in page.get_text("words"):
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
        words.append((height - y1, x0, height - y0, x1, text))

    buckets: dict[tuple[int, int], list[tuple]] = {}
    for dx0, dy0, dx1, dy1, text in words:
        cx, cy = (dx0 + dx1) / 2, (dy0 + dy1) / 2
        if cy < row_bounds[0] - 1 or cy > row_bounds[-1] + 1:
            continue
        if cx < columns[0] - 1 or cx > columns[-1] + 1:
            continue
        ri = ci = None
        for i in range(len(row_bounds) - 1):
            if row_bounds[i] - 1 <= cy <= row_bounds[i + 1] + 1:
                ri = i
                break
        for j in range(len(columns) - 1):
            if columns[j] - 1 <= cx <= columns[j + 1] + 1:
                ci = j
                break
        if ri is None or ci is None:
            continue
        buckets.setdefault((ri, ci), []).append((dx0, dy0, dx1, dy1, text))

    for ri in range(len(row_bounds) - 1):
        cells = []
        for ci in range(8):
            items = buckets.get((ri, ci), [])
            if not items:
                cells.append("")
                continue
            items.sort(key=lambda t: (round(t[1], 0), t[0]))
            lines, current, current_y = [], [], None
            for dx0, dy0, dx1, dy1, text in items:
                if current_y is None or abs(dy0 - current_y) <= 2.5:
                    current.append((dx0, text))
                    current_y = dy0 if current_y is None else current_y
                else:
                    lines.append(current)
                    current = [(dx0, text)]
                    current_y = dy0
            if current:
                lines.append(current)
            cells.append(" ".join(" ".join(t for _, t in sorted(line)) for line in lines).strip())
        yield cells


def clean(text):
    text = text.replace("\u00ad", "").replace("\ufb01", "fi").replace("\ufb02", "fl")
    text = re.sub(r"\s+", " ", text).strip()
    # tidy wrap artefacts: "Delhi , X" / "Radio-Diagnosis /Radiology" / "Delhi,ABVIMS"
    text = re.sub(r"\s+([,;:.])", r"\1", text)
    text = re.sub(r"\s+/", "/", text)
    text = re.sub(r",(?=[A-Za-z(])", ", ", text)
    text = re.sub(r",(\s*,)+", ",", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" ,")


def parse_pdf(path, progress=print):
    doc = pymupdf.open(path)
    rows = []
    seen_sno = 0

    for page_no in range(doc.page_count):
        for cells in page_rows(doc[page_no]):
            sno = cells[0].strip()
            rank = cells[1].strip()
            if not sno.isdigit() or not rank.replace(",", "").isdigit():
                continue
            sno = int(sno)
            if sno <= seen_sno:
                continue
            seen_sno = sno
            rows.append({
                "sno": sno,
                "rank": int(rank.replace(",", "")),
                "quota": clean(cells[2]),
                "institute": clean(cells[3]),
                "course": clean(cells[4]),
                "allottedCategory": clean(cells[5]),
                "candidateCategory": clean(cells[6]),
                "remarks": clean(cells[7]),
            })
        if page_no % 100 == 0:
            progress(f"  page {page_no + 1}/{doc.page_count} · {len(rows)} rows")

    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    rows = parse_pdf(Path(args.pdf))
    bad = [r for r in rows if not isinstance(r["rank"], int) or r["rank"] <= 0]
    print(f"{len(rows)} rows · {len(bad)} bad ranks")
    Path(args.out).write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"-> {args.out}")


if __name__ == "__main__":
    sys.exit(main())
