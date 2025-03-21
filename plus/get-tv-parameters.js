var parameterType = {
    Selectable: "Selectable",
    Numeric: "Numeric",
    Checkbox: "Checkbox"
}

// await execution 
async function run() {
    await getTvParameters();
}

// get tradingview parameters from strategy window for plus users
run();

async function getTvParameters() {
    var tvParameters = [];
    var parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='content'] div");

    for (let i = 0; i < parameterNameElements.length; i++) {
        var className = parameterNameElements[i].className;
        var parameterName = parameterNameElements[i].innerText;

        // handle selectable and numeric parameters
        if (className.includes("cell") && className.includes("first")) {
            var selectableParameter = parameterNameElements[i].nextSibling?.querySelector("span[data-role='listbox']");
            if (selectableParameter != null) {
                var options = await injectAndRetrieveOptions(i);
                tvParameters.push({
                    type: parameterType.Selectable,
                    name: parameterName,
                    options: options
                });
            } else {
                tvParameters.push({
                    type: parameterType.Numeric,
                    name: parameterName
                });
            }
        } // handle checkboxes
        else if (className.includes("cell") && className.includes("fill")) {
            tvParameters.push({
                type: parameterType.Checkbox,
                name: parameterName
            });
        }
    }
    chrome.runtime.sendMessage({
        popupAction: {
            event: "getTvParameters",
            message: { tvParameters }
        }
    });
}

function injectAndRetrieveOptions(index) {
    return new Promise((resolve) => {
        function eventCallback(event) {
            if (event.source !== window || event.data.type !== "GetSelectableParameterOptionsEvent") return;
            window.removeEventListener("message", eventCallback);
            resolve(event.data.options);
        }

        window.addEventListener("message", eventCallback);

        // Inject script and set parameter-index
        var script = document.createElement("script");
        script.src = chrome.runtime.getURL("plus/get-selectable-parameter-options.js");
        script.id = "get-selectable-parameter-key";
        script.setAttribute("parameter-index", index);
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    });
}
