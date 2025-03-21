// Select all input values
var tvInputsContainer = "div[data-name='indicator-properties-dialog'] div[class*='content' i]"
var tvInputsQuery = `${tvInputsContainer} input, ${tvInputsContainer} span[role*='button' i]`
var tvInputs = document.querySelectorAll(tvInputsQuery)
console.log(tvInputs)
var maxProfit = -99999
// user parameters and time frames
var userNumericInputs = [], userCheckboxInputs = [], userSelectableInputs = []
var userInputs = [] // combined user inputs of above
var userTimeFrames = []
var optimizationResults = new Map();

//parameter types
var parameterType = {
    Selectable: "Selectable",
    Numeric: "Numeric",
    Checkbox: "Checkbox"
}

var sleep = (ms) => new Promise((resolve) => {
    const handler = (event) => {
        if (event.data.type === "SleepEventComplete") {
            window.removeEventListener("message", handler);
            resolve();
        }
    };
    window.addEventListener("message", handler);

    // Notify injector.js about the sleep request with the delay
    window.postMessage({ type: "SleepEventStart", delay: ms }, "*");
});

// Run Optimization Process 
Process()

async function Process() {
    var shouldStop = false;
    //Construct UserInputs with callback
    var userInputsEventCallback = (event) => {
        var message = event.data
        if (message.type === "UserInputsEvent") {
            window.removeEventListener("message", userInputsEventCallback);

            for (let i = 0; i < message.detail.parameters.length; i++) {
                const parameter = message.detail.parameters[i];
                switch (parameter.type) {
                    case parameterType.Numeric:
                        userNumericInputs.push(parameter)
                        break;
                    case parameterType.Checkbox:
                        userCheckboxInputs.push(parameter)
                        break;
                    case parameterType.Selectable:
                        userSelectableInputs.push(parameter)
                        break;
                }
                userInputs.push(parameter)
            }
            userTimeFrames = message.detail.timeFrames
        }
    }

    window.addEventListener("message", userInputsEventCallback);

    var stopOptimizationEventCallback = (event) => {
        var message = event.data
        if (message.type === "StopOptimizationEvent") {
            window.removeEventListener("message", stopOptimizationEventCallback)
            shouldStop = message.detail.event.isTrusted
        }
    }

    window.addEventListener("message", stopOptimizationEventCallback);

    //Wait for UserInputsEvent Callback
    await sleep(750)
    // sort userInputs before starting optimization 
    userNumericInputs.sort(function (a, b) {
        return a.parameterIndex - b.parameterIndex;
    });
    // Total Loop Size: Step(N) * Step(N+1) * ...Step(Nth)
    var ranges = [];

    // Create user input ranges with given step size for each parameter
    userNumericInputs.forEach((element, index) => {
        var range = 0
        // fix index for free users
        if (element.parameterIndex == -1) {
            element.parameterIndex = index
        }
        if (index == 0) {
            range = (element.end - element.start) / element.stepSize
            var roundedRange = Math.round(range * 100) / 100
            ranges.push(roundedRange)
        } else {
            range = ((element.end - element.start) / element.stepSize)
            var roundedRange = (Math.round(range * 100) / 100) + 1
            ranges.push(roundedRange)
        }
    });

    if (userTimeFrames == null || userTimeFrames.length <= 0) {
        // no time frame selection or free user flow

        await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
        //await OptimizeCheckboxes(() => OptimizeNumerics())
        await SendReport()
    } else {
        for (let i = 0; i < userTimeFrames.length; i++) {
            // open time intervals dropdown and change it
            await sleep(500)

            var timeIntervalDropdown = document.querySelector("#header-toolbar-intervals div[class*='menuContent' i]")
            // check if user has favorite time frames selected
            if (timeIntervalDropdown == null) {
                timeIntervalDropdown = document.querySelector("#header-toolbar-intervals div[class*='arrow' i]")
            }
            timeIntervalDropdown.click()

            var timeIntervalQuery = `div[data-value='${userTimeFrames[i][0]}']`
            await sleep(1000)
            document.querySelector(timeIntervalQuery).click()
            await sleep(1000)

            await OptimizeNumerics()
            await SendReport()
            // reset global variables for new strategy optimization and for new timeframe
            optimizationResults = new Map();
            maxProfit = -99999
        }
    }

    // Optimize numeric inputs in the strategey for the currently chosen timeframe
    async function OptimizeNumerics() {
        shouldStop = false;
        await SetUserIntervals()

        // Base call function
        const baseCall = async () => {
            for (let j = 0; j < ranges[0]; j++) {
                if (shouldStop) {
                    break;
                }
                await OptimizeParams(userNumericInputs[0].parameterIndex, userNumericInputs[0].stepSize);
            }
        };

        // Wrapper function for subsequent calls to build nested for loops
        const wrapSubsequentCalls = async (baseCall, index) => {
            if (index >= ranges.length) {
                // start executing after wrapping everything in place
                await baseCall()
                return;
            }

            const currentCall = async () => {
                for (let j = 0; j < ranges[index]; j++) {
                    if (shouldStop) {
                        break;
                    }
                    await baseCall();
                    await ResetInnerOptimizeOuterParameter(ranges, j, index);
                }
            };

            await wrapSubsequentCalls(currentCall, index + 1); // recursive call for the next level
        };

        // Function to execute nested loops
        const executeNestedLoops = async () => {
            await wrapSubsequentCalls(baseCall, 1); // Wrap and execute subsequent calls recursively starting from index 1
        };

        // Call the function to execute the nested loops
        await executeNestedLoops()
    }

    // Optimize checkbox inputs in the strategey for the currently chosen timeframe 
    async function OptimizeCheckboxes(nextFunction) {
        var checkBoxesLength = userCheckboxInputs.length

        for (let i = 0; i < 2 ** checkBoxesLength; i++) {
            let binaryString = i.toString(2).padStart(checkBoxesLength, '0')
            let binaryArray = binaryString.split('').map(Number)

            for (let j = 0; j < binaryArray.length; j++) {
                var value = binaryArray[j];
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)

                if (tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 0) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
                if (!tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 1) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
            }

            await sleep(500)

            if (nextFunction) {
                await nextFunction();
            }
        }
    }

    // Optimize selectable inputs in the strategey for the currently chosen timeframe 
    async function OptimizeSelectables(nextFunction) {
        var selectablesLength = userSelectableInputs.length
        for (let i = 0; i < selectablesLength; i++) {
            var selectableInput = userSelectableInputs[i]

            for (let j = 0; j < selectableInput.options.length; j++) {
                let option = selectableInput.options[j]
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)
                // open up dropdown
                tvInputs[selectableInput.parameterIndex].querySelector("span").click()
                await sleep(500)
                // click on dropdown option
                document.querySelector(`div[class*=menuBox i] div[id*='${option}' i]`).click()

                await sleep(500)
                
                if (nextFunction) {
                    await nextFunction();
                }
            }
        }
    }

}

// SendReport sends the report after optimization
async function SendReport() {
    //Add ID, StrategyName, Parameters and MaxProfit to Report Message
    var strategyName = document.querySelector("div[class*=strategyGroup]")?.innerText
    var strategyTimePeriod = ""

    var timePeriodGroup = document.querySelectorAll("div[class*=innerWrap] div[class*=group]")
    if (timePeriodGroup.length > 1) {
        selectedPeriod = timePeriodGroup[1].querySelector("button[aria-checked*=true]")

        // Check if favorite time periods exist  
        if (selectedPeriod != null) {
            strategyTimePeriod = selectedPeriod.querySelector("div[class*=value]")?.innerHTML
        } else {
            strategyTimePeriod = timePeriodGroup[1].querySelector("div[class*=value]")?.innerHTML
        }
    }

    var title = document.querySelector("title")?.innerText
    var strategySymbol = title.split(' ')[0]
    var optimizationResultsObject = Object.fromEntries(optimizationResults);
    var userInputsToString = ""

    userNumericInputs.forEach((element, index) => {
        if (element.parameterName != null) {
            userInputsToString += element.parameterName + ": "
        }
        if (index == userNumericInputs.length - 1) {
            userInputsToString += element.start + "→" + element.end
        } else {
            userInputsToString += element.start + "→" + element.end + "<br>"
        }
    })

    var reportDataMessage = {
        "strategyID": Date.now(),
        "created": Date.now(),
        "strategyName": strategyName,
        "symbol": strategySymbol,
        "timePeriod": strategyTimePeriod,
        "parameters": userInputsToString,
        "maxProfit": maxProfit,
        "reportData": optimizationResultsObject
    }
    // Send Optimization Report to injector
    window.postMessage({ type: "ReportDataEvent", detail: reportDataMessage }, "*");
}

// Set User Given Intervals Before Optimization Starts
async function SetUserIntervals() {
    for (let i = 0; i < userNumericInputs.length; i++) {
        var userInput = userNumericInputs[i]
        var startValue = userInput.start - userInput.stepSize

        if (isFloat(startValue)) {
            var precision = getFloatPrecision(userInput.stepSize)
            startValue = fixPrecision(startValue, precision)
        }

        // reset by step size in case of a user input is as same as current tv input value 
        if (userInput.start == tvInputs[userInput.parameterIndex].value) {
            await OptimizeParams(userInput.parameterIndex, "-" + userInput.stepSize)
        } else {
            ChangeTvInput(tvInputs[userInput.parameterIndex], startValue)
        }

        await OptimizeParams(userInput.parameterIndex, userInput.stepSize)

        await sleep(250);
    }
    //TO-DO: Inform user about Parameter Intervals are set and optimization starting now.
}

// Optimize strategy for given tvParameterIndex, increment parameter and observe mutation 
async function OptimizeParams(tvParameterIndex, stepSize) {
    function newReportData() {
        return new Object({
            netProfit: {
                amount: 0,
                percent: ""
            },
            closedTrades: 0,
            percentProfitable: "",
            profitFactor: 0.0,
            maxDrawdown: {
                amount: 0,
                percent: ""
            },
            averageTrade: {
                amount: 0,
                percent: ""
            },
            avgerageBarsInTrades: 0,
            detailedParameters: []
        });
    }

    var reportData = newReportData()

    tvInputs[tvParameterIndex].dispatchEvent(new MouseEvent('mouseover', { 'bubbles': true }));

    await sleep(150)
    // Calculate new step value
    var newStepValue = parseFloat(tvInputs[tvParameterIndex].value) + parseFloat(stepSize)
    if (isFloat(newStepValue)) {
        var precision = getFloatPrecision(stepSize)
        newStepValue = fixPrecision(newStepValue, precision)
    }
    ChangeTvInput(tvInputs[tvParameterIndex], newStepValue)

    await sleep(200)

    // Click on "Ok" button
    var okButton = document.querySelector("button[data-name='submit-button' i]")
    if (okButton == null) {
        okButton = document.querySelector("span[class*='submit' i] button")
    }
    okButton.click()

    // Observe mutation for new Test results, validate it and save it to optimizationResults Map
    const p1 = new Promise((resolve, reject) => {
        var observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation.type === 'childList') {
                    if (mutation.addedNodes.length > 0 && mutation.addedNodes[0].className.includes("reportContainer")) {
                        var result = saveOptimizationReport(reportData, mutation.addedNodes[0])
                        resolve(result)
                        observer.disconnect()
                        return false
                    }
                }

                return true
            });
        });

        var element = document.querySelector("div[class*=backtesting i][class*=deep-history i]")
        let options = {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
            attributes: true,
            attributeOldValue: true
        }
        observer.observe(element, options);
    });

    const p2 = new Promise((resolve, reject) => {
        setTimeout(() => {
            // expected error type, kind of warning
            reject("Timeout exceeded")
        }, 10 * 1000);
    });

    // Promise race the obvervation with 10 sec timeout in case of Startegy Test Overview window fails to load
    await Promise.race([p1, p2])
        .then()
        .catch((error) => {
            console.log(`Rejected: ${error}`)
        });

    await sleep(100)
    // Re-open strategy settings window
    var reportTitleButton = document.querySelector("button[data-strategy-title*='report' i]")
    if (reportTitleButton == null) {
        reportTitleButton = document.querySelector("div[class*='strategyGroup' i] button")
    }
    reportTitleButton.click()
    await sleep(50)
    var settingsButton = document.querySelector("div[aria-label*='settings' i]")
    // if different language is set, select second popup menu item
    if (settingsButton == null) {
        settingsButton = document.querySelector("div[class*='mainContent' i] > div:nth-child(2) div[role*='menuItem' i]")
    }

    settingsButton.click()

    await sleep(100)
    tvInputs = document.querySelectorAll(tvInputsQuery)
}

function saveOptimizationReport(reportData, mutation) {
    var result = GetParametersFromWindow()
    var parameters = result.parameters
    if (!optimizationResults.has(parameters) && parameters != "ParameterOutOfRange") {
        var error = ReportBuilder(reportData, mutation)
        if (error != null) {
            return error.message
        }
        reportData.detailedParameters = result.detailedParameters
        optimizationResults.set(parameters, reportData)
        //Update Max Profit
        replacedNDashProfit = reportData.netProfit.amount.replace("−", "-")
        profit = Number(replacedNDashProfit.replace(/[^0-9-\.]+/g, ""))
        if (profit > maxProfit) {
            maxProfit = profit
        }
        return ("Optimization param added to map: " + parameters + " Profit: " + optimizationResults.get(parameters).netProfit.amount)
    } else if (optimizationResults.has(parameters)) {
        return ("Optimization param already exist " + parameters)
    } else {
        return ("Parameter is out of range, omitted")
    }
}

// Reset & Optimize (tvParameterIndex)th parameter to starting value  
async function ResetAndOptimizeParameter(tvParameterIndex, resetValue, stepSize) {
    ChangeTvInput(tvInputs[tvParameterIndex], resetValue)
    await sleep(300)
    await OptimizeParams(tvParameterIndex, stepSize)
}

// Reset & Optimize Inner Loop parameter, Optimize Outer Loop parameter
async function ResetInnerOptimizeOuterParameter(ranges, rangeIteration, index) {
    var previousTvParameterIndex = userNumericInputs[index - 1].parameterIndex
    var currentTvParameterIndex = userNumericInputs[index].parameterIndex

    var resetValue = userNumericInputs[index - 1].start - userNumericInputs[index - 1].stepSize

    var previousStepSize = userNumericInputs[index - 1].stepSize
    var currentStepSize = userNumericInputs[index].stepSize
    //Reset and optimze inner
    await ResetAndOptimizeParameter(previousTvParameterIndex, resetValue, previousStepSize)
    // Optimize outer unless it's last iteration
    if (rangeIteration != ranges[index] - 1) {
        await OptimizeParams(currentTvParameterIndex, currentStepSize)
    }
}

// Change TvInput value in Tv Strategy Options Window
function ChangeTvInput(input, value) {
    const event = new Event('input', { bubbles: true })
    const previousValue = input.value

    input.value = value
    input._valueTracker.setValue(previousValue)
    input.dispatchEvent(event)
}

// Get Currently active parameters from Tv Strategy Options Window and format them
function GetParametersFromWindow() {
    var parameters = "";
    var result = new Object({
        parameters: "",
        detailedParameters: []
    });
    for (let i = 0; i < userInputs.length; i++) {
        var userInput = userInputs[i]
        var parameterValue;
        switch (userInput.type) {
            case parameterType.Numeric:
                if (userInput.start > parseFloat(tvInputs[userInput.parameterIndex].value) || parseFloat(tvInputs[userInput.parameterIndex].value) > userInput.end) {
                    parameters = "ParameterOutOfRange"
                    break
                }
                parameterValue = tvInputs[userInput.parameterIndex].value
                break;
            case parameterType.Checkbox:
                if (tvInputs[userInput.parameterIndex].checked) {
                    parameterValue = "On"
                } else {
                    parameterValue = "Off"
                }
                break;
            case parameterType.Selectable:
                parameterValue = tvInputs[userInput.parameterIndex].innerText
                break;
        }

        if (i == userInputs.length - 1) {
            parameters += parameterValue
        } else {
            parameters += parameterValue + ", "
        }

        if (userInput.parameterName != null) {
            result.detailedParameters.push({
                name: userInput.parameterName,
                value: parameterValue,
            })
        }
    }
    result.parameters = parameters
    return result
}

// Build Report data from performance overview
function ReportBuilder(reportData, mutation) {
    var reportDataSelector;
    // if mutation is nil, save the same report as there is no report data update
    if (mutation != null) {
        reportDataSelector = document.querySelectorAll("div div[class^='containerCell' i] > div:nth-child(2)")
    }

    if (reportDataSelector == null || reportDataSelector.length <= 0) {
        return new Error("report data is not available")
    }

    var valueSelector = "[class*='value' i]"
    var currencySelector = "[class*='currency' i]"
    var changeSelector = "[class*='change' i]"
    //1. Column
    reportData.netProfit.amount = reportDataSelector[0].querySelector(valueSelector)?.innerText + ' ' + reportDataSelector[0].querySelector(currencySelector)?.innerText
    reportData.netProfit.percent = reportDataSelector[0].querySelector(changeSelector)?.innerText
    //2. 
    reportData.maxDrawdown.amount = reportDataSelector[1].querySelector(valueSelector)?.innerText + ' ' + reportDataSelector[1].querySelector(currencySelector)?.innerText
    reportData.maxDrawdown.percent = reportDataSelector[1].querySelector(changeSelector)?.innerText
    //3.
    reportData.closedTrades = reportDataSelector[2].querySelector(valueSelector)?.innerText
    //4.
    reportData.percentProfitable = reportDataSelector[3].querySelector(valueSelector)?.innerText
    //4.
    reportData.profitFactor = reportDataSelector[4].querySelector(valueSelector)?.innerText

    //5. Deprecated
    //reportData.averageTrade.amount = reportDataSelector[5].querySelector(valueSelector).innerText + ' ' + reportDataSelector[5].querySelector(currencySelector).innerText
    //reportData.averageTrade.percent = reportDataSelector[5].querySelector(changeSelector).innerText
    //6. Deprecated
    //reportData.avgerageBarsInTrades = reportDataSelector[6].querySelector(valueSelector).innerText
}


// isFloat to check whether given number is float or not
function isFloat(number) {
    if (String(number).includes(".")) {
        return true
    }
    return false
}

// getFloatPrecision to get precision of given float number
function getFloatPrecision(number) {
    if (isFloat(number)) {
        return String(number).split(".")[1].length
    } else {
        // default precision value
        return 2
    }

}

// fixPrecision handles js floating arithmetic precision problem
function fixPrecision(value, precision) {
    var multiplier = Math.pow(10, precision)
    return Math.round(value * multiplier) / multiplier
}
//Mutation Observer Code for console debugging purposes
/*
        var observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation.type === 'characterData') {
                    if(mutation.oldValue != mutation.target.data){
                        console.log(mutation)
                        observer.disconnect()
                        return false
                    }
                }
                return true
            });
        });

        var element = document.querySelector("div[class*=backtesting][class*=deep-history]")
        let options = {
            attributes: false,
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
            attributes: true,
            attributeOldValue: true
        }
        observer.observe(element, options);
*/