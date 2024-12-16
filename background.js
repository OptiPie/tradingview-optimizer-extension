// Background Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  var properties = Object.keys(message)
  var values = Object.values(message)
  // Notify type represents chrome notification request
  if (properties[0] === 'notify') {
    var notification = values[0]
    if (notification.type === 'warning') {
      chrome.notifications.create(`notify-${Date.now()}`, {
        title: 'OptiPie - Warning',
        message: notification.content,
        iconUrl: 'images/warning30.png',
        type: 'basic'
      });
    } else if (notification.type === 'success') {
      chrome.notifications.create(`notify-${Date.now()}`, {
        title: 'OptiPie - Success',
        message: notification.content,
        iconUrl: 'images/success30.png',
        type: 'basic'
      });
    }
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.type === "getAuthToken") {
    chrome.identity.getAuthToken({ interactive: request.isInteractive }, function (token) {
      sendResponse({ token: token });
    });
  }
  return true
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.type === "clearAllCachedAuthTokens") {
    chrome.identity.getAuthToken({ interactive: false }, function (token) {
      chrome.identity.removeCachedAuthToken({ token: token }, function () { });
      chrome.identity.clearAllCachedAuthTokens();
    });
  }
  return true
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SleepEventStart") {
      const delay = message.delay || 3000;
      setTimeout(() => {
          sendResponse({ type: "SleepEventComplete" });
      }, delay);
      // Return true to indicate that the response will be sent asynchronously
      return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update"){
    chrome.tabs.create({url: "https://optipie.app", active: true});
  }
})

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    "userParameterCount": 1, "inputStart0": null, "inputEnd0": null, "inputStep0": null,
    "userTimeFrames": null, "selectAutoFill0": null
  }, function () {
    console.log("User parameter count state set to 0 at start up");
  });
})