getParameterNames()

function getParameterNames() {    
    var parameterNames = []
    var parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='cell'][class*='first']")
    for (let i = 0; i < parameterNameElements.length; i++) {
        var parameterName = parameterNameElements[i].innerText
        parameterNames.push(parameterName)
    }
    chrome.runtime.sendMessage({
        popupAction: {
          event: "getParameterNames",
          message: {
            parameterNames: parameterNames
          }
        }
      });   
}
