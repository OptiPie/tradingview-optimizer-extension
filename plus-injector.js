getParameterNames()

function getParameterNames() {    
    var parameterNames = []
    var parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='cell'][class*='first']")
    for (let i = 0; i < parameterNameElements.length; i++) {
      // only register numeric parameters
      var parameterNumeric = parameterNameElements[i].nextSibling.querySelector("input[inputmode='numeric']") 
      if (parameterNumeric != null){
        var parameterName = parameterNameElements[i].innerText
        parameterNames.push(parameterName)
      }
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
