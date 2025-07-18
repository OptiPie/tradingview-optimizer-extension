var isInjected = InjectScriptIntoDOM()

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
  var message = event.data
  if (message.type === "ReportDataEvent") {
    // Unlock optimize button
    chrome.runtime.sendMessage({
      popupAction: {
        event: "unlockOptimizeButton"
      }
    });
    var reportKey = "report-data-" + message.detail.strategyID
    if (Object.keys(message.detail.reportData).length > 0) {
      chrome.storage.local.set({ [reportKey]: message.detail }, function () {
        chrome.runtime.sendMessage({
          notify: {
            type: "success",
            content: "Optimization Completed Successfully & Added to Reports"
          }
        });
      })
    } else {
      chrome.runtime.sendMessage({
        notify: {
          type: "warning",
          content: "Optimization Failed - Try again and follow the steps carefully"
        }
      });
    }
    
    window.removeEventListener("message", sleepEventCallback);
    window.removeEventListener("message", reportDataEventCallback);
  }
}

window.addEventListener("message", sleepEventCallback, false)

// Add ReportData Callback if script.js injected successfully
if (isInjected) {
  window.addEventListener("message", reportDataEventCallback, false);
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