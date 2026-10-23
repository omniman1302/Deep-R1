# NEET PG 2026 — Allotment Explorer

A fast, single-page viewer for MCC NEET PG 2026 seat allotment data. Filter by quota,
course, category, state, institute, rank and score; sort any column; export what you
see as CSV. Round 1 is loaded, and new rounds drop in with one command.

Live data in this build: **Round 1 — 28,723 allotments · 1,823 institutes · 36 states/UTs**.

## What's inside

```
index.html            page shell
assets/styles.css     design system (light + dark)
assets/app.js         filters, sorting, paging, CSV export, URL state
data/manifest.js      list of rounds shown in the UI
data/round-1.js       Round 1 dataset (~1 MB, dictionary-encoded)
data/scores.js        NEET PG 2026 rank -> score runs (from the NBE result PDF)
tools/                PDF -> data pipeline (Python + PyMuPDF)
```

Everything is static: no build step, no server, no database. Opening `index.html`
straight from disk works, and GitHub Pages serves it as-is.

## Adding a round (Round 2, 3, …)

```powershell
py tools\build_round.py --pdf "C:\path\to\mcc-round-2.pdf" `
    --id round-2 --label "Round 2" --released 2026-11-14 `
    --source-url "https://cdnbbsr.s3waas.gov.in/.../round2.pdf"
```

Then add the entry to `data/manifest.js`:

```js
{
  id: "round-2",
  label: "Round 2",
  file: "data/round-2.js",
  released: "2026-11-14",
  sourceUrl: "https://…",
},
```

Reload — a new tab appears, the data file only downloads when that tab is opened.

### Rebuilding the rank → score table

Only needed if NBE re-publishes its result (or for a new exam year):

```powershell
py tools\build_round.py --scores-pdf "NEET-PG 2026 Published Result_DS.pdf"
```

## How the parsing works

* `tools/parse_allotment.py` reads the MCC PDF. The pages are landscape with rotated
  text, so word coordinates are transformed into display space; the table's own vector
  lines give exact column and row boundaries. Every page is cross-checked by S.No, so
  missing or duplicated rows are impossible to miss.
* `tools/states.py` derives the state from the institute string (explicit state name,
  then city, then district) — 1,823/1,823 institutes resolve.
* `tools/parse_scores.py` turns the NBE result PDF into `[rank, score]` runs: rank →
  marks is monotonic, so 265,765 candidates collapse into 625 runs.
* `tools/build_round.py` glues it together and writes the compact round file
  (dictionary-encoded institutes/courses/categories).

## Local preview

```powershell
py -m http.server 8765
# open http://127.0.0.1:8765/
```

## Deploying to GitHub Pages

1. Create a repository (e.g. `neet-pg-2026`) on GitHub.
2. Upload the contents of this folder (drag the files into the repo's *Add file → Upload files*).
3. **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
4. The site appears at `https://<user>.github.io/neet-pg-2026/`.

## Data notes

* Allotment data: MCC provisional seat allotment PDFs (link in the page footer).
* Score column: mapped from the official NBE published result for the same All India rank.
* Nothing is edited — text is reproduced as published, only whitespace artefacts from
  the PDF's line wrapping are tidied.
* Unofficial project; not affiliated with MCC, MoHFW or NBE.
