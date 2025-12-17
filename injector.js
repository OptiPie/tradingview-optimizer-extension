var isInjected = InjectScriptIntoDOM()

/*
chrome.storage.local.clear(() => {
  if (chrome.runtime.lastError) {
    console.error('Error clearing chrome.storage.local:', chrome.runtime.lastError);
  } else {
    console.log('All chrome.storage.local data has been cleared.');
  }
});
*/

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
var reportDataEventCallback = (event) => {
  var message = event.data;
  if (message.type !== "ReportDataEvent") return;

  const report = message.detail;
  const reportKey = "report-data-" + report.strategyID;
  const status = report.status;
  const isFinal = report.isFinal
  const newRow = report.reportData;

  switch (status) {
    case "IN_PROGRESS":
      // Merge each chunk into the existing reportData object, or initialize if missing/empty
      if (newRow && Object.keys(newRow).length > 0) {
        chrome.storage.local.get([reportKey], items => {
          let existingReport = items[reportKey];

          if (existingReport) {
            let existingData = existingReport.reportData;
            // If existingData is a non‐empty object, merge newRow into it
            if (existingData && Object.keys(existingData).length > 0) {
              existingReport.reportData = {
                ...existingData,
                ...newRow
              };
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

          // Update lastUpdated timestamp
          const now = Date.now();
          existingReport.lastUpdated = now;
          report.lastUpdated = now;

          chrome.storage.local.set({ [reportKey]: existingReport });

          chrome.runtime.sendMessage({
            popupAction: {
              event: "reportUpdated",
              message: {
                report: report
              }
            }
          });
        });
      }
      break;

    case "FINISHED":
      // Mark existing report status as finished
      chrome.storage.local.get([reportKey], items => {
        let existingReport = items[reportKey];

        const now = Date.now();
        existingReport.lastUpdated = now;
        existingReport.status = report.status;

        chrome.storage.local.set({ [reportKey]: existingReport });
      });

      // Optimization is fully done → unlock & success notify
      chrome.runtime.sendMessage({
        popupAction: { event: "unlockOptimizeButton" }
      });
      chrome.runtime.sendMessage({
        notify: {
          type: "success",
          content: "Optimization Completed Successfully & Added to Reports"
        }
      });
      // send reportUpdate with 'FINISHED' status
      chrome.runtime.sendMessage({
        popupAction: {
          event: "reportUpdated",
          message: {
            report: report
          }
        }
      });
      // remove listeners after final optimization for multi-time frame support 
      if (isFinal) {
        window.removeEventListener("message", sleepEventCallback);
        window.removeEventListener("message", reportDataEventCallback);
      }
      break;
  }
}

// Add callbacks if script.js injected successfully
if (isInjected) {
  window.addEventListener("message", reportDataEventCallback, false);
  window.addEventListener("message", sleepEventCallback, false);
  // Lock optimize button to prevent accidental multiple submissions
  chrome.runtime.sendMessage({
    popupAction: {
      event: "lockOptimizeButton"
    }
  });
} else {
  chrome.runtime.sendMessage({
    notify: {
      type: "warning",
      content: "Error Optimization - Open Strategy Settings on Tradingview.com"
    }
  });
}

//Inject script into DOM to get access to React Props
function InjectScriptIntoDOM() {
  //Is TradingView Strategy Settings window opened validation
  if (document.querySelectorAll("div[data-name=indicator-properties-dialog]").length < 1) {
    return false
  }
  var s = document.createElement('script');
  s.src = chrome.runtime.getURL('script.js');
  s.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(s);

  // Retrieve the UserInputs from local storage and send them as message to script.js
  chrome.storage.local.get("userInputs", ({ userInputs }) => {
    setTimeout(sendUserInputsMessage, 500, userInputs);
  });

  function sendUserInputsMessage(userInputs) {
    window.postMessage({ type: "UserInputsEvent", detail: userInputs }, "*");
  }
  return true
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