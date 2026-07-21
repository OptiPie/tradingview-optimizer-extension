/**
 * WFA data model + event contracts — REFERENCE ONLY (imported nowhere).
 * .js over .json so each field can be annotated.
 * Parent lives at `wfa-{wfaID}`, children at `report-data-{childID}` in chrome.storage.local.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PARENT — key: `wfa-{wfaID}`   (injector.js builds + maintains; status applied VERBATIM)
// ─────────────────────────────────────────────────────────────────────────────
const wfaParent = {
  wfaID: 1737480000000,          // Date.now(), minted once by script.js
  created: 1737480000000,
  lastUpdated: 1737480123456,
  strategyName: "EMA Cross",
  symbol: "BTCUSDT",
  timePeriod: "1h",
  config: { isPct: 70, oosPct: 30 },                       // IS/OOS split only
  dateRange: { start: "2025-01-01", end: "2026-01-01" },   // total analysis range
  windowCount: 4,                                          // target N (fixed)
  status: "IN_PROGRESS",                                   // STARTED | IN_PROGRESS | FINISHED

  windows: {                     // KEYED by windowIndex (NOT an array) — clean upsert, no sparse risk.
    0: {                         // UI reads Object.values(windows) (iterates 0,1,2… for integer keys).
      windowIndex: 0,
      is:  { reportID: 1737480010000, start: "2025-01-01", end: "2025-05-15" }, // → report-data-{reportID} (full grid)
      oos: { reportID: 1737480020000, start: "2025-05-15", end: "2025-07-12" }, // → report-data-{reportID} (single combo)
      winner: { params: "50, 10", isProfit: "+22%", oosProfit: "+6%" }          // denormalized
    },
    1: {
      windowIndex: 1,
      is:  { reportID: 1737480030000, start: "2025-02-27", end: "2025-07-12" },
      oos: { reportID: 1737480040000, start: "2025-07-12", end: "2025-09-07" },
      winner: { params: "48, 12", isProfit: "+18%", oosProfit: "+4%" }
    }
    // … up to windowCount entries; live N/M = Object.keys(windows).length / windowCount
  }

  // NOTE: aggregates (avg OOS, profitable N/M, WFE) — OPEN: compute at render vs. store on parent
  // for the popup Reports LIST row. See memory project-wfa-data-structure "DISCREPANCY".
};

// ─────────────────────────────────────────────────────────────────────────────
// CHILD — key: `report-data-{childID}`   (script.js produces; classic report + enrichment)
// 2 per window (IS full grid + OOS single combo) = 2N total. Self-finalizes via own FINISHED.
// ─────────────────────────────────────────────────────────────────────────────
const wfaChild = {
  // classic report fields (unchanged):
  strategyID: 1737480010000,     // == childID (the storage key)
  created: 1737480010000,
  lastUpdated: 1737480011234,
  strategyName: "EMA Cross",
  symbol: "BTCUSDT",
  timePeriod: "1h",
  parameters: "50-52 step 2, 8-12 step 2",   // grid as string
  maxProfit: 22,
  reportData: { /* IS = full grid {combo -> metrics}; OOS = single combo (the winner) */ },
  status: "FINISHED",            // STARTED -> IN_PROGRESS -> FINISHED
  dateRange: "Jan 01 - May 15",  // this window's IS or OOS range

  // WFA enrichment (added at creation):
  type: "wfa",                   // filters it OUT of the classic Reports list
  wfaID: 1737480000000,          // FK -> parent
  windowIndex: 0,
  sampleType: "is"               // "is" | "oos"
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT CONTRACT — two independent postMessage streams (script.js -> injector.js)
// ─────────────────────────────────────────────────────────────────────────────

// (1) ReportDataEvent — per-window CHILD grids. Existing classic plumbing, just enriched.
//     detail = a `wfaChild` with status STARTED / IN_PROGRESS / FINISHED.
//     Classic FINISHED handler only touched by 2 guards: `if (report.type !== "wfa")` around notify + unlock.

// (2) WfaDataEvent — parent lifecycle (NEW). Injector never derives status — persists detail.status verbatim.
const wfaDataEvents = {
  started: {
    type: "WfaDataEvent",
    detail: {
      status: "STARTED",
      wfaID: 1737480000000, created: 1737480000000,
      strategyName: "EMA Cross", symbol: "BTCUSDT", timePeriod: "1h",
      config: { isPct: 70, oosPct: 30 },
      dateRange: { start: "2025-01-01", end: "2026-01-01" },
      windowCount: 4
    }
  },

  // TWO IN_PROGRESS emits per window — metrics arrive in two pieces, injector merges into windows[i]:
  inProgress_afterIS: {
    type: "WfaDataEvent",
    detail: {
      status: "IN_PROGRESS", wfaID: 1737480000000,
      window: {
        windowIndex: 0,
        is: { reportID: 1737480010000, start: "2025-01-01", end: "2025-05-15" },
        winner: { params: "50, 10", isProfit: "+22%" }
      }
    }
  },
  inProgress_afterOOS: {
    type: "WfaDataEvent",
    detail: {
      status: "IN_PROGRESS", wfaID: 1737480000000, isWindowFinal: true,
      window: {
        windowIndex: 0,
        oos: { reportID: 1737480020000, start: "2025-05-15", end: "2025-07-12" },
        winner: { oosProfit: "+6%" }
      }
    }
  },

  finished: {   // terminal — injector fires the ONE global completion + unlock + teardown
    type: "WfaDataEvent",
    detail: { status: "FINISHED", wfaID: 1737480000000 }
  }
};
