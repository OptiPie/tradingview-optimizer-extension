// Background Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  var properties = Object.keys(message)
  var values = Object.values(message)
  // Notify type represents chrome notification request
  if(properties[0] === 'notify'){
    var notification = values[0]
    if(notification.type === 'warning'){
      chrome.notifications.create(`notify-${Date.now()}`, {
        title: 'OptiPie - Warning',
        message: notification.content,
        iconUrl: 'images/warning30.png',
        type: 'basic'
      });
    }else if(notification.type === 'success'){
      chrome.notifications.create(`notify-${Date.now()}`, {
        title: 'OptiPie - Success',
        message: notification.content,
        iconUrl: 'images/success30.png',
        type: 'basic'
      });
    }
  }
});


chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ "userParameterCount": 1, "inputStart0": null, "inputEnd0": null, "inputStep0": null }, function () {
    console.log("User parameter count state set to 0 at start up"); 
  });  
})