// Select all input values
var tvInputsContainer = "div[data-name='indicator-properties-dialog'] div[class*='content' i]"
var tvInputsQuery = `${tvInputsContainer} input:not([aria-activedescendant*='time_input' i]), ${tvInputsContainer} button[role*='combobox' i], ${tvInputsContainer} div[data-name*='color' i]`
var tvInputs = document.querySelectorAll(tvInputsQuery)
// user parameters and time frames
var userNumericInputs = [], userCheckboxInputs = [], userSelectableInputs = []
var userInputs = [] // combined user inputs of above
var userTimeFrames = [] // time frames chosen by the user
var optimizationHistory = new Map(); // holds whether parameter has been already optimized or not
var maxProfit = -999999
var optimizationTimeout = 15 * 1000; // default timeout in milliseconds

// reportDataMessage defined globally and initiated from start
var reportDataMessage;

//parameter types
var ParameterType = {
    Selectable: "Selectable",
    Numeric: "Numeric",
    Checkbox: "Checkbox",
    DatePicker: "DatePicker" // not supported atm
}

var isReportDataEmptySelector = "div[class*='emptyStateIcon' i]"

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
        let message = event.data
        if (message.type === "UserInputsEvent") {
            window.removeEventListener("message", userInputsEventCallback);

            for (let i = 0; i < message.detail.parameters.length; i++) {
                let parameter = message.detail.parameters[i];
                switch (parameter.type) {
                    case ParameterType.Numeric:
                        userNumericInputs.push(parameter)
                        break;
                    case ParameterType.Checkbox:
                        userCheckboxInputs.push(parameter)
                        break;
                    case ParameterType.Selectable:
                        userSelectableInputs.push(parameter)
                        break;
                }
                userInputs.push(parameter)
            }
            userTimeFrames = message.detail.timeFrames

            // Extract settings and set optimization timeout
            if (message.detail.settings?.isLongRunningOptimizations) {
                optimizationTimeout = 60 * 1000; // 60 seconds
            }
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
        reportDataMessage = prepareInitialReport()
        await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
        updateReport({ status: "FINISHED", isFinal: true })
        await PublishReport()
    } else {
        for (let i = 0; i < userTimeFrames.length; i++) {
            // open time intervals dropdown and change it
            await sleep(500)

            let timeIntervalDropdown = document.querySelector("#header-toolbar-intervals div[class*='menuContent' i]")
            // check if user has favorite time frames selected
            if (timeIntervalDropdown == null) {
                timeIntervalDropdown = document.querySelector("#header-toolbar-intervals div[class*='arrow' i]")
            }
            timeIntervalDropdown.click()

            let timeIntervalQuery = `div[data-value='${userTimeFrames[i][0]}']`
            await sleep(1000)
            document.querySelector(timeIntervalQuery).click()
            await sleep(1000)
            reportDataMessage = prepareInitialReport()
            await sleep(500)
            try {
                await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
            } catch (err) {
                console.log(err)
                // catch the error, continue with the next time-frame
            }

            let isFinalOptimization = (i === userTimeFrames.length - 1)
            updateReport({ status: "FINISHED", isFinal: isFinalOptimization })
            await PublishReport()

            // reset global variables for new strategy optimization and for new timeframe
            optimizationHistory = new Map();
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
        if (!isOptimizationCalled(userCheckboxInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }
        let checkBoxesLength = userCheckboxInputs.length

        for (let i = 0; i < 2 ** checkBoxesLength; i++) {
            let binaryString = i.toString(2).padStart(checkBoxesLength, '0')
            let binaryArray = binaryString.split('').map(Number)

            for (let j = 0; j < binaryArray.length; j++) {
                let value = binaryArray[j];
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)

                if (tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 0) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
                if (!tvInputs[userCheckboxInputs[j].parameterIndex].checked && value == 1) {
                    tvInputs[userCheckboxInputs[j].parameterIndex].click()
                }
            }

            await sleep(250)

            if (nextFunction) {
                await nextFunction();
            }
            if (shouldStop) {
                return
            }
        }
    }

    // Optimize selectable inputs in the strategey for the currently chosen timeframe 
    async function OptimizeSelectables(nextFunction) {
        if (!isOptimizationCalled(userSelectableInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }

        // cartesian product to build up all selectable combinations
        let selectableInputCombinations = generateCombinationsFromInputs(userSelectableInputs)

        for (let i = 0; i < selectableInputCombinations.length; i++) {
            let selectableInputCombination = selectableInputCombinations[i]
            for (let j = 0; j < selectableInputCombination.length; j++) {
                let option = selectableInputCombination[j].option
                let parameterIndex = selectableInputCombination[j].parameterIndex
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)
                // open up dropdown
                tvInputs[parameterIndex].click()

                await sleep(500)
                let ddOptionsWrapper = document.querySelector("div[class*='mainContent' i]")
                let reactPropsKey = Object.keys(ddOptionsWrapper).find(key => key.includes("reactProps"));

                let ddOptions = ddOptionsWrapper[reactPropsKey].children.props.children
                // click on dropdown
                for (let i = 0; i < ddOptions.length; i++) {
                    const ddOptionVal = ddOptions[i].props.item.value
                    if (ddOptionVal === option) {
                        document.getElementById(ddOptions[i].props.id).click()
                        break
                    }
                }
                await sleep(250)
            }
            if (nextFunction) {
                await nextFunction();
            }
            if (shouldStop) {
                return
            }
        }
    }

    function generateCombinationsFromInputs(inputs) {
        const allOptions = inputs.map(input =>
            input.options.map(option => ({
                option,
                parameterIndex: input.parameterIndex
            }))
        );

        return allOptions.reduce((acc, current) => {
            return acc.flatMap(existing => current.map(opt => [...existing, opt]));
        }, [[]]);
    }


    function isOptimizationCalled(inputs) {
        if (inputs == null || inputs.length == 0) {
            return false;
        }
        return true;
    }

}

// PublishReport publishes the report after optimization is complete
async function PublishReport() {
    // Send Optimization Report to injector
    window.postMessage({ type: "ReportDataEvent", detail: reportDataMessage }, "*");
}

// prepareInitialReport populates initial report before starting a fresh optimization
function prepareInitialReport() {
    //Add ID, StrategyName, Parameters and MaxProfit to Report Message
    let strategyName = document.querySelector("div[class*=strategyGroup]")?.innerText
    let strategyTimePeriod = ""

    let timePeriodGroup = document.querySelectorAll("div[class*=innerWrap] div[class*=group]")
    if (timePeriodGroup.length > 1) {
        selectedPeriod = timePeriodGroup[1].querySelector("button[aria-checked*=true]")

        // Check if favorite time periods exist  
        if (selectedPeriod != null) {
            strategyTimePeriod = selectedPeriod.querySelector("div[class*=value]")?.innerHTML
        } else {
            strategyTimePeriod = timePeriodGroup[1].querySelector("div[class*=value]")?.innerHTML
        }
    }

    let title = document.querySelector("title")?.innerText
    let strategySymbol = title.split(' ')[0]

    let userInputsToString = ""

    userInputs.forEach((element, index) => {
        if (element.parameterName != null) {
            let fullName = element.parameterName;
            let displayName = fullName
            let needsTooltip = false;

            if (fullName.length > 22) {
                displayName = displayName.substring(0, 22) + '...';
                needsTooltip = true
            }

            if (needsTooltip) {
                userInputsToString += `<strong 
                    data-bs-toggle="tooltip" 
                    title="${fullName}"
                    >${displayName}</strong>: `;
            } else {
                userInputsToString += `<strong>${displayName}</strong>: `;
            }
        }
        switch (element.type) {
            case ParameterType.Numeric:
                if (index == userInputs.length - 1) {
                    userInputsToString += element.start + "→" + element.end
                } else {
                    userInputsToString += element.start + "→" + element.end + "<br>"
                }
                break;
            case ParameterType.Checkbox:
                if (index == userInputs.length - 1) {
                    userInputsToString += "on/off"
                } else {
                    userInputsToString += "on/off" + "<br>"
                }
                break;
            case ParameterType.Selectable:
                if (index == userInputs.length - 1) {
                    userInputsToString += element.options
                } else {
                    userInputsToString += element.options + "<br>"
                }
                break;
        }

    })

    let dateRange = document.querySelector(`div[class*='backtesting' i] div[class*='dateRange' i] 
        span[class*='container' i]`)?.innerText

    let reportDataMessage = {
        "strategyID": Date.now(),
        "created": Date.now(),
        "strategyName": strategyName,
        "symbol": strategySymbol,
        "timePeriod": strategyTimePeriod,
        "parameters": userInputsToString,
        "maxProfit": maxProfit, // NOT READY
        "reportData": [], // NOT READY
        "status": "STARTED",
        "dateRange": dateRange // solely for analytics 
    }

    // Send update that optimization has started
    window.postMessage({ type: "ReportDataEvent", detail: reportDataMessage }, "*");

    return reportDataMessage
}

// Set User Given Intervals Before Optimization Starts
async function SetUserIntervals() {
    for (let i = 0; i < userNumericInputs.length; i++) {
        let userInput = userNumericInputs[i]
        let startValue = userInput.start - userInput.stepSize

        if (isFloat(startValue)) {
            let precision = getFloatPrecision(userInput.stepSize)
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

// Optimize strategy for given tvParameterIndex, increment parameter, observe mutation 
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

    let reportData = newReportData();
    let optimizationResult = new Map();

    tvInputs[tvParameterIndex].dispatchEvent(new MouseEvent('mouseover', { 'bubbles': true }));

    await sleep(150)
    // Calculate new step value
    let newStepValue = parseFloat(tvInputs[tvParameterIndex].value) + parseFloat(stepSize)
    if (isFloat(newStepValue)) {
        let precision = getFloatPrecision(stepSize)
        newStepValue = fixPrecision(newStepValue, precision)
    }
    ChangeTvInput(tvInputs[tvParameterIndex], newStepValue)

    await sleep(200)

    // Click on "Ok" button
    let okButton =
        document.querySelector("button[data-name='submit-button' i]") ||
        document.querySelector("span[class*='submit' i] button");

    okButton.click()

    let isBacktestUpdated = false
    // check if deep backtesting is enabled
    let isBacktestingOn = document.querySelector("span[class*='deepBacktesting' i]") != null
    if (isBacktestingOn === true) {
        await sleep(500)
        let backtestUpdateButton = document.querySelector("div[data-qa-id*='backtesting-updated' i] button")
        if (backtestUpdateButton != null) {
            backtestUpdateButton.click()
            isBacktestUpdated = true
        }
    }

    let observer;
    // Observe mutation for new Test results, validate it and save it to optimizationResults Map
    const p1 = new Promise((resolve, reject) => {
        observer = new MutationObserver(function (mutations) {
            mutations.every(function (mutation) {
                if (mutation?.type === 'characterData' && mutation?.target?.isConnected) {
                    let reportContainer = mutation.target?.parentElement?.parentElement?.parentElement?.parentElement
                    var result = saveOptimizationReport(optimizationResult, reportData)
                    resolve(result)
                    observer.disconnect()
                    return false

                }
                return true
            });
        });

        let element = document.querySelector("div[class*=backtesting i] div[class*=reportContainer i]")
        if (element == null) {
            // fallback scenario for selector naming convention
            element = document.querySelector("div[class*=backtesting i] div[class*=report-container i]")
        }

        let isReportDataEmpty = document.querySelector(isReportDataEmptySelector) != null
        if (element == null || isReportDataEmpty) {
            // scenario where report data is missing for the iteration, e.g. "No Data" widget shown 
            resolve({ skipIteration: true })
            return
        }

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
            observer.disconnect()
            resolve({ timedOut: true })
        }, optimizationTimeout);
    });

    // Promise race the obvervation with 15 sec timeout in case of Startegy Test Overview window fails to load
    const finalOptimizationResult = await Promise.race([p1, p2])

    if (finalOptimizationResult?.timedOut) {
        // try to save if optimization data is the same as previous, after timeout
        tryToSaveOptimizationReport(isBacktestingOn, isBacktestUpdated, optimizationResult, reportData)
    }

    if (finalOptimizationResult?.skipIteration) {
        // due to skipped iteration without timeout, wait for report container to update itself
        await sleep(optimizationTimeout)
        // try to save if optimization data is available, after backup timeout
        tryToSaveOptimizationReport(isBacktestingOn, isBacktestUpdated, optimizationResult, reportData)
    }

    await sleep(100)
    // Send single optimization result as a batch, update maxProfit and Optimization result before hand
    let optimizationResultsObject = Object.fromEntries(optimizationResult);

    updateReport({
        status: "IN_PROGRESS",
        maxProfit,
        reportData: optimizationResultsObject
    });
    PublishReport()

    // Re-open strategy settings window
    let reportTitleButton =
        document.querySelector("button[data-strategy-title*='report' i]") ||
        document.querySelector("div[class*='strategyGroup' i] button");

    reportTitleButton.click()
    await sleep(50)

    let settingsButton =
        document.querySelector("div[aria-label*='settings' i]") ||
        // if different language is set, select shortcut label selector "+ P" or select second popup menu item
        document.querySelector('div[aria-keyshortcuts*="+P"]') ||
        document.querySelector('div[aria-keyshortcuts*="+ P"]') ||
        document.querySelector("div[class*='mainContent' i] > div:nth-child(2) div[role*='menuItem' i]");

    settingsButton.click()

    await sleep(150)
    tvInputs = document.querySelectorAll(tvInputsQuery)
}

function saveOptimizationReport(optimizationResult, reportData) {
    let result = GetParametersFromWindow()
    let parameters = result.parameters
    if (!optimizationHistory.has(parameters) && parameters != "ParameterOutOfRange") {
        let error = ReportBuilder(reportData)
        if (error != null) {
            return error.message
        }
        reportData.detailedParameters = result.detailedParameters
        optimizationHistory.set(parameters, true)
        optimizationResult.set(parameters, reportData)
        //Update Max Profit
        replacedNDashProfit = reportData.netProfit.amount.replace("−", "-")
        profit = Number(replacedNDashProfit.replace(/[^0-9-\.]+/g, ""))
        if (profit > maxProfit) {
            maxProfit = profit
        }
        return ("Optimization param added to map")
    } else if (optimizationHistory.has(parameters)) {
        return ("Optimization param already exist " + parameters)
    } else {
        return ("Parameter is out of range, omitted")
    }
}

// Reset & Optimize (tvParameterIndex)th parameter to starting value  
async function resetAndOptimizeParameter(tvParameterIndex, resetValue, stepSize) {
    ChangeTvInput(tvInputs[tvParameterIndex], resetValue)
    await sleep(300)
    await OptimizeParams(tvParameterIndex, stepSize)
}

// Reset & Optimize Inner Loop parameter, Optimize Outer Loop parameter
async function ResetInnerOptimizeOuterParameter(ranges, rangeIteration, index) {
    let previousTvParameterIndex = userNumericInputs[index - 1].parameterIndex
    let currentTvParameterIndex = userNumericInputs[index].parameterIndex

    let resetValue = userNumericInputs[index - 1].start - userNumericInputs[index - 1].stepSize

    let previousStepSize = userNumericInputs[index - 1].stepSize
    let currentStepSize = userNumericInputs[index].stepSize
    //Reset and optimze inner
    await resetAndOptimizeParameter(previousTvParameterIndex, resetValue, previousStepSize)
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
    let parameters = "";
    let result = new Object({
        parameters: "",
        detailedParameters: []
    });
    for (let i = 0; i < userInputs.length; i++) {
        let userInput = userInputs[i]
        let parameterValue;
        switch (userInput.type) {
            case ParameterType.Numeric:
                if (userInput.start > parseFloat(tvInputs[userInput.parameterIndex].value) || parseFloat(tvInputs[userInput.parameterIndex].value) > userInput.end) {
                    parameters = "ParameterOutOfRange"
                    break
                }
                parameterValue = tvInputs[userInput.parameterIndex].value
                break;
            case ParameterType.Checkbox:
                if (tvInputs[userInput.parameterIndex].checked) {
                    parameterValue = "On"
                } else {
                    parameterValue = "Off"
                }
                break;
            case ParameterType.Selectable:
                parameterValue = tvInputs[userInput.parameterIndex].innerText
                break;
        }

        if (parameters == "ParameterOutOfRange") {
            // return this as an expected error, parameters are omitted for occurence 
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
function ReportBuilder(reportData) {
    let reportDataSelector;

    reportDataSelector = document.querySelectorAll("div div[class^='containerCell' i] > div:nth-child(2)")

    let valueSelector = "[class*='value' i]"
    let currencySelector = "[class*='currency' i]"
    let changeSelector = "[class*='change' i]"
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

// Mutates (or adds) top-level fields on your global report object
function updateReport(updates) {
    reportDataMessage = { ...reportDataMessage, ...updates };
}

function implies(a, b) {
    return !a || b;
}

// Helper function to try saving optimization report during expected failure scenarios
function tryToSaveOptimizationReport(isBacktestingOn, isBacktestUpdated, optimizationResult, reportData) {
    let isReportDataEmpty = document.querySelector(isReportDataEmptySelector) != null
    if (!isReportDataEmpty && implies(isBacktestingOn, isBacktestUpdated)) {
        saveOptimizationReport(optimizationResult, reportData)
    }
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
    let multiplier = Math.pow(10, precision)
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