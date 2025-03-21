var parameterIndex = document.querySelector("#get-selectable-parameter-key").getAttribute("parameter-index")

var selectableParameter = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='content'] div")[parameterIndex]
.nextSibling.querySelector("span[data-role='listbox']") 

var reactFiberKey = Object.keys(selectableParameter).find(key => key.includes("reactFiber"));

var options = selectableParameter[reactFiberKey].return.pendingProps.items

// Notify get-parameters.js about selectable-parameter key
window.postMessage({ type: "GetSelectableParameterOptionsEvent", options: options }, "*");