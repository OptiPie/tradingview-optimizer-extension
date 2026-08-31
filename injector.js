// Outcomes of the inject attempt — caller notifies per case
var InjectResult = {
  Injected: "Injected",
  NoDialog: "NoDialog",
  StrategyMismatch: "StrategyMismatch"
}

var injectResult = InjectScriptIntoDOM()

var sleepEventCallback = (event) => {
  if (event.source !== window || event.data.type !== "SleepEventStart") {
    return;
  }

  const delay = event.data.delay;
  // Send SleepEvent to the background script
  chrome.runtime.sendMessage({ type: "SleepEventStart", delay }, (response) => {
    if (response.type === "SleepEventComplete") {
      // Notify script.js that the sleep is complete
      window.postMessage({ type: "SleepEventComplete" }, "*");
    }
  });
}

// Handle Optimization Report coming from script.js
// reportDataLock serializes the child-report writes: each message chains behind the previous, so a chunk's
// read-modify-write can't interleave with the next (same fix as wfaLock — the single-combo OOS exposed it).
var reportDataLock = Promise.resolve();
var reportDataEventCallback = (event) => {
  var message = event.data;
  if (message.type !== "ReportDataEvent") return;
  reportDataLock = reportDataLock.then(() => persistReportData(message.detail)).catch(e => console.log(e));
}

// persists one report update (STARTED announces, IN_PROGRESS merges a chunk, FINISHED closes out)
async function persistReportData(report) {
  const reportKey = "report-data-" + report.strategyID;
  const status = report.status;
  const isFinal = report.isFinal
  const newRow = report.reportData;

  if (status === "STARTED") {
    chrome.runtime.sendMessage({
      popupAction: { event: "reportStarted", message: { report: report } }
    });
    return;
  }

  if (status === "IN_PROGRESS") {
    // Merge each chunk into the existing reportData object, or initialize if missing/empty
    if (!(newRow && Object.keys(newRow).length > 0)) return;
    const items = await chrome.storage.local.get([reportKey]);
    let existingReport = items[reportKey];

    if (existingReport) {
      let existingData = existingReport.reportData;
      // If existingData is a non‐empty object, merge newRow into it
      if (existingData && Object.keys(existingData).length > 0) {
        existingReport.reportData = { ...existingData, ...newRow };
        existingReport.maxProfit = report.maxProfit
      } else {
        // If empty or undefined, just take newRow as the base
        existingReport.reportData = { ...newRow };
        existingReport.maxProfit = report.maxProfit
      }
    } else {
      // No report yet → initialize with the full incoming report object
      existingReport = report;
    }

    const now = Date.now();
    existingReport.lastUpdated = now;
    report.lastUpdated = now;

    await chrome.storage.local.set({ [reportKey]: existingReport });

    chrome.runtime.sendMessage({
      popupAction: { event: "reportUpdated", message: { report: report } }
    });
    return;
  }

  if (status === "FINISHED") {
    // Mark existing report status as finished
    const items = await chrome.storage.local.get([reportKey]);
    let existingReport = items[reportKey];

    if (existingReport != null) {
      const now = Date.now();
      existingReport.lastUpdated = now;
      existingReport.status = report.status;

      await chrome.storage.local.set({ [reportKey]: existingReport });

      //notify with the success (skip for wfa children)
      if (report.type !== "wfa") {
        chrome.runtime.sendMessage({
          notify: { type: "success", content: "Optimization Completed Successfully & Added to Reports" }
        });
      }
    } else if (report.type !== "wfa") {
      //notify with the warning (skip for wfa children — an empty OOS window is legitimate)
      chrome.runtime.sendMessage({
        notify: { type: "warning", content: "Optimization Failed & No Report Generated" }
      });
    }
    // Optimization is fully done → unlock (skip for wfa children)
    if (report.type !== "wfa") {
      chrome.runtime.sendMessage({
        popupAction: { event: "unlockOptimizeButton" }
      });
    }

    // send reportUpdate with 'FINISHED' status
    chrome.runtime.sendMessage({
      popupAction: { event: "reportUpdated", message: { report: report } }
    });
    // remove listeners after final optimization for multi-time frame support
    if (isFinal) {
      window.removeEventListener("message", sleepEventCallback);
      window.removeEventListener("message", reportDataEventCallback);
    }
    return;
  }
}

// WFA parent lifecycle — separate stream from the child reports. Persists status verbatim from script.js.
// wfaLock serializes the writes: each message chains behind the previous, so FINISHED can't run until the last IN_PROGRESS write has released.
var wfaLock = Promise.resolve();
var wfaDataEventCallback = (event) => {
  var message = event.data;
  if (message.type !== "WfaDataEvent") return;
  wfaLock = wfaLock.then(() => persistWfa(message.detail)).catch(e => console.log(e));
}

// persists one WFA parent update (STARTED creates, IN_PROGRESS upserts a window, FINISHED closes out)
async function persistWfa(detail) {
  const wfaKey = "wfa-" + detail.wfaID;

  if (detail.status === "STARTED") {
    // Create the thin parent up front; windows[] get filled by subsequent IN_PROGRESS upserts.
    const parent = {
      wfaID: detail.wfaID,
      created: detail.created,
      strategyName: detail.strategyName,
      symbol: detail.symbol,
      timePeriod: detail.timePeriod,
      currency: detail.currency,
      parameters: detail.parameters,
      config: detail.config,
      dateRange: detail.dateRange,
      windowCount: detail.windowCount,
      windows: {}, // keyed by windowIndex — upsert, no sparse-array risk
      status: detail.status,
      lastUpdated: Date.now()
    };
    await chrome.storage.local.set({ [wfaKey]: parent });
    notifyWfaUpdated(parent);
    return;
  }

  const items = await chrome.storage.local.get([wfaKey]);
  let parent = items[wfaKey];
  if (parent == null) return; // STARTED must land before any update

  if (detail.status === "IN_PROGRESS") {
    // Upsert the window entry, merging partial data (IS then OOS may arrive as separate updates)
    const w = detail.window;
    const prev = parent.windows[w.windowIndex] || { windowIndex: w.windowIndex };
    parent.windows[w.windowIndex] = {
      ...prev, ...w,
      is:     { ...(prev.is || {}),     ...(w.is || {}) },
      oos:    { ...(prev.oos || {}),    ...(w.oos || {}) },
      winner: { ...(prev.winner || {}), ...(w.winner || {}) }
    };
    parent.status = detail.status;
    parent.lastUpdated = Date.now();
    await chrome.storage.local.set({ [wfaKey]: parent });
    notifyWfaUpdated(parent);
    // detail.isWindowFinal → per-window progress rides the live-update above (system toast TBD)
    return;
  }

  if (detail.status === "FINISHED") {
    parent.status = detail.status;
    parent.lastUpdated = Date.now();
    await chrome.storage.local.set({ [wfaKey]: parent });
    // the SINGLE global completion + unlock + teardown listeners
    chrome.runtime.sendMessage({
      notify: { type: "success", content: "Walk-Forward Analysis Completed & Added to Reports" }
    });
    chrome.runtime.sendMessage({ popupAction: { event: "unlockOptimizeButton" } });
    window.removeEventListener("message", reportDataEventCallback);
    window.removeEventListener("message", wfaDataEventCallback);
    window.removeEventListener("message", sleepEventCallback);
    notifyWfaUpdated(parent);
    return;
  }
}

// Live-update signal so the WFA reports list / an open WFA report page refresh as windows land
function notifyWfaUpdated(parent) {
  chrome.runtime.sendMessage({ popupAction: { event: "wfaReportUpdated", message: { report: parent } } });
}

// Add callbacks if script.js injected successfully
if (injectResult === InjectResult.Injected) {
  window.addEventListener("message", reportDataEventCallback, false);
  window.addEventListener("message", wfaDataEventCallback, false);
  window.addEventListener("message", sleepEventCallback, false);
  // Lock optimize button to prevent accidental multiple submissions
  chrome.runtime.sendMessage({
    popupAction: {
      event: "lockOptimizeButton"
    }
  });
} else if (injectResult === InjectResult.NoDialog) {
  chrome.runtime.sendMessage({
    notify: {
      type: "warning",
      content: "Error Optimization - Open Strategy Settings on Tradingview.com"
    }
  });
} else if (injectResult === InjectResult.StrategyMismatch) {
  chrome.runtime.sendMessage({
    notify: {
      type: "warning",
      content: "Error Optimization - Strategy Tester doesn't match the open settings"
    }
  });
}

//Inject script into DOM to get access to React Props
function InjectScriptIntoDOM() {
  //Is TradingView Strategy Settings window opened validation
  if (document.querySelectorAll("div[data-name=indicator-properties-dialog]").length < 1) {
    return InjectResult.NoDialog
  }

  // dialog and report tab strategies should match
  let reportStrategyName = document.querySelector("button[data-qa-id*='backtesting' i] span[class*='title' i]")?.textContent?.trim()
  let dialogStrategyName = document.querySelector("div[data-name=indicator-properties-dialog]")?.getAttribute("data-dialog-name")?.trim()
  if (reportStrategyName !== dialogStrategyName) {
    return InjectResult.StrategyMismatch
  }


  var s = document.createElement('script');
  s.src = chrome.runtime.getURL('script.js');
  s.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // Forward the typed inputs to script.js verbatim (both classic and wfa); script.js owns windowing.
  chrome.storage.local.get("userInputs", ({ userInputs }) => {
    setTimeout(sendUserInputsMessage, 500, userInputs);
  });

  function sendUserInputsMessage(payload) {
    window.postMessage({ type: "UserInputsEvent", detail: payload }, "*");
  }
  return InjectResult.Injected
}




/* Glossary for variable naming
  Tv: TradingView
*/

/*Business Logic
    Get Input Intervals from user which will be optimized
    First input will always be incremented, 
    rest of the inputs will be incremented when first param finishes looping within given intervals
*/

/*Resources
  Thanks to @RobW https://stackoverflow.com/questions/9515704/use-a-content-script-to-access-the-page-context-variables-and-functions 
*/

/* Code block to truncate all local chrome storage
chrome.storage.local.get(null, function (items) {
  var allKeys = Object.keys(items);
  var values = Object.values(items)
  //chrome.storage.local.remove(allKeys, function () { })
  //console.log(allKeys);
  //console.log(values)
});
*/