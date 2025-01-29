// get tradingview parameters from strategy window for plus users
getTvParameters()

async function getTvParameters() {
  var tvParameters = []
  var parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='cell'][class*='first']")
  for (let i = 0; i < parameterNameElements.length; i++) {
    var parameterName = parameterNameElements[i].innerText

    var selectableParameter = parameterNameElements[i].nextSibling.querySelector("span[data-role='listbox']")
    if (selectableParameter != null) {
      // TO-DO inject sub-script to retrieve reactProps, to retrieve selectableParameter options
      var s = document.createElement('script');
      s.src = chrome.runtime.getURL('plus/get-selectable-parameter-options.js');
      s.id = "get-selectable-parameter-key"
      s.setAttribute("parameter-index", i)
      s.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);

      var GetSelectableParameterOptionsEventCallback = (event) => {
        var message = event.data
        if (message.type === "GetSelectableParameterOptionsEvent") {
          window.removeEventListener("message", GetSelectableParameterOptionsEventCallback)

          var parameter = {
            type: "Selectable",
            name: parameterName,
            options: message.options
          }
          tvParameters.push(parameter)
        }
      }

      window.addEventListener("message", GetSelectableParameterOptionsEventCallback);

      // wait callback to happen
      await sleep(150)
    } else {
      var parameter = {
        type: "Numeric",
        name: parameterName,
      }
      tvParameters.push(parameter)
    }


  }
  chrome.runtime.sendMessage({
    popupAction: {
      event: "getTvParameters",
      message: {
        tvParameters: tvParameters
      }
    }
  });
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}