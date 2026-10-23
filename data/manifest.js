/* ============================================================
   NEET PG 2026 — rounds manifest
   ------------------------------------------------------------
   To publish a new round:
     1. py tools/build_round.py --pdf <mcc.pdf> --id round-2 --label "Round 2"
            --released 2026-11-14 --source-url <mcc pdf link>
     2. copy the Round 1 entry below and change id / label / file / dates.
   Each round file is loaded only when its tab is selected.
   ============================================================ */

window.NEETPG_MANIFEST = {
  exam: "NEET PG 2026",
  scoreSource: {
    label: "NEET-PG 2026 Published Result (NBE)",
    url: "https://natboard.edu.in/",
  },
  rounds: [
    {
      id: "round-1",
      label: "Round 1",
      file: "data/round-1.js",
      released: "2026-10-24",
      sourceUrl:
        "https://cdnbbsr.s3waas.gov.in/s3e0f7a4d0ef9b84b83b693bbf3feb8e6e/uploads/2026/10/202610231277301968.pdf",
    },
    // Placeholders: flip available to true (and add the file) when MCC publishes.
    { id: "round-2", label: "Round 2", available: false },
    { id: "round-3", label: "Round 3", available: false },
    { id: "round-4", label: "Round 4", available: false },
    { id: "stray", label: "Stray Round", available: false },
  ],
};
