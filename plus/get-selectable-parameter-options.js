var parameterIndex = document.querySelector("#get-selectable-parameter-key").getAttribute("parameter-index")

var selectableParameterInput = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='content'] div")[parameterIndex]
.nextSibling.querySelector("button[role='combobox']").parentElement.parentElement

var reactPropsKey = Object.keys(selectableParameterInput).find(key => key.includes("reactProps"));

var options = selectableParameterInput[reactPropsKey].children.props.items

// Notify get-parameters.js about selectable-parameter key
window.postMessage({ type: "GetSelectableParameterOptionsEvent", options: options }, "*");