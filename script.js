// Select all input values
var tvInputsContainer = "div[data-name='indicator-properties-dialog'] div[class*='content' i]"
var tvInputsQuery = `${tvInputsContainer} input:not([aria-activedescendant*='time_input' i]), ${tvInputsContainer} button[role*='combobox' i], ${tvInputsContainer} div[data-name*='color' i]`
var tvInputs = document.querySelectorAll(tvInputsQuery)
// user parameters and time frames
var userNumericInputs = [], userCheckboxInputs = [], userSelectableInputs = []
var userInputs = [] // combined user inputs of above
var userTimeFrames = [] // time frames chosen by the user
var optimizationHistory = new Map(); // holds whether parameter has been already optimized or not
var bestResult = { profit: -999999, params: null } // best run so far; params retained for the WFA winner
var optimizationTimeout = 15 * 1000; // default timeout in milliseconds

// WFA run state — optType forks Process(); wfaContext enriches child reports while a window runs
var optType = "classic"
var wfaOptInputs = null
var wfaContext = null // { wfaID, windowIndex, sampleType } during a WFA window, else null
var currentSelectableValues = {} // parameterIndex -> option value being swept; feeds the OOS winner snapshot (innerText ≠ value)

// reportDataMessage defined globally and initiated from start
var reportDataMessage;

// stop signal — sleep() throws STOP_SIGNAL when shouldStop flips, unwinding the whole optimize stack to Process's catch
var shouldStop = false
var STOP_SIGNAL = "OPTIPIE_STOP"

// prototype value setter, cached once — bypasses React's per-instance value override on date inputs
var nativeInputSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

//parameter types
var ParameterType = {
    Selectable: "Selectable",
    Numeric: "Numeric",
    Checkbox: "Checkbox",
    DatePicker: "DatePicker" // not supported atm
}

var isReportDataEmptySelector = "div[class*='emptyState' i]"

var sleep = (ms) => {
    if (shouldStop) {
        throw STOP_SIGNAL
    }
    return new Promise((resolve) => {
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
};

// Run Optimization Process 
Process()

async function Process() {
    //Construct UserInputs with callback
    var userInputsEventCallback = (event) => {
        let message = event.data
        if (message.type === "UserInputsEvent") {
            window.removeEventListener("message", userInputsEventCallback);

            const detail = message.detail
            optType = detail.type
            const classicOptInputs = optType === "wfa" ? detail.wfaOptInputs.classicOptInputs : detail.classicOptInputs
            for (let i = 0; i < classicOptInputs.parameters.length; i++) {
                let parameter = classicOptInputs.parameters[i];
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
            userTimeFrames = classicOptInputs.timeFrames

            // Extract settings and set optimization timeout
            if (classicOptInputs.settings?.isLongRunningOptimizations) {
                optimizationTimeout = 60 * 1000; // 60 seconds
            }

            if (optType === "wfa") {
                wfaOptInputs = detail.wfaOptInputs
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
    try {
        await sleep(750)
        // sort userInputs before starting optimization
        userNumericInputs.sort(function (a, b) {
            return a.parameterIndex - b.parameterIndex;
        });
        // Total Loop Size: Step(N) * Step(N+1) * ...Step(Nth)
        var ranges = buildNumericRanges(userNumericInputs);
        switch (optType) {
            case "wfa":
                await RunWFA()
                break;

            default:
                // TODO(tech-debt): extract the no-timeframe / timeframe branches into their own functions, like RunWFA
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
                            if (err === STOP_SIGNAL) {
                                throw err
                            }
                            console.log(err)
                            // catch the error, continue with the next time-frame
                        }

                        let isFinalOptimization = (i === userTimeFrames.length - 1)
                        updateReport({ status: "FINISHED", isFinal: isFinalOptimization })
                        await PublishReport()

                        // reset global variables for new strategy optimization and for new timeframe
                        optimizationHistory = new Map();
                        bestResult = { profit: -999999, params: null }
                    }
                }
        }
    } catch (e) {
        if (e !== STOP_SIGNAL) {
            throw e
        }
        shouldStop = false
        if (reportDataMessage != null) {
            updateReport({ status: "FINISHED", isFinal: true })
            await PublishReport()
        }
        if (optType === "wfa") {
            let stoppedWfaID = null
            if (wfaContext != null) {
                stoppedWfaID = wfaContext.wfaID
            }
            wfaContext = null
            window.postMessage({ type: "WfaDataEvent", detail: { status: "FINISHED", wfaID: stoppedWfaID } }, "*")
        }
    }

    // Optimize numeric inputs in the strategey for the currently chosen timeframe
    // activeNumericInputs/activeRanges default to the globals; WFA-OOS passes a pinned single-combo set
    async function OptimizeNumerics(activeNumericInputs = userNumericInputs, activeRanges = ranges) {
        shouldStop = false;
        await SetUserIntervals(activeNumericInputs)

        // Base call function
        const baseCall = async () => {
            for (let j = 0; j < activeRanges[0]; j++) {
                if (shouldStop) {
                    break;
                }
                await OptimizeParams(activeNumericInputs[0].parameterIndex, activeNumericInputs[0].stepSize);
            }
        };

        // Wrapper function for subsequent calls to build nested for loops
        const wrapSubsequentCalls = async (baseCall, index) => {
            if (index >= activeRanges.length) {
                // start executing after wrapping everything in place
                await baseCall()
                return;
            }

            const currentCall = async () => {
                for (let j = 0; j < activeRanges[index]; j++) {
                    if (shouldStop) {
                        break;
                    }
                    await baseCall();
                    await ResetInnerOptimizeOuterParameter(activeRanges, j, index, activeNumericInputs);
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
    async function OptimizeCheckboxes(nextFunction, activeCheckboxInputs = userCheckboxInputs) {
        if (!isOptimizationCalled(activeCheckboxInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }
        let checkBoxesLength = activeCheckboxInputs.length

        for (let i = 0; i < 2 ** checkBoxesLength; i++) {
            let binaryString = i.toString(2).padStart(checkBoxesLength, '0')
            let binaryArray = binaryString.split('').map(Number)

            for (let j = 0; j < binaryArray.length; j++) {
                let value = binaryArray[j];
                // renew tv inputs
                tvInputs = document.querySelectorAll(tvInputsQuery)

                if (tvInputs[activeCheckboxInputs[j].parameterIndex].checked && value == 0) {
                    tvInputs[activeCheckboxInputs[j].parameterIndex].click()
                }
                if (!tvInputs[activeCheckboxInputs[j].parameterIndex].checked && value == 1) {
                    tvInputs[activeCheckboxInputs[j].parameterIndex].click()
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
    async function OptimizeSelectables(nextFunction, activeSelectableInputs = userSelectableInputs) {
        if (!isOptimizationCalled(activeSelectableInputs)) {
            if (nextFunction) {
                await nextFunction();
            }
            return
        }

        // cartesian product to build up all selectable combinations
        let selectableInputCombinations = generateCombinationsFromInputs(activeSelectableInputs)

        for (let i = 0; i < selectableInputCombinations.length; i++) {
            let selectableInputCombination = selectableInputCombinations[i]
            for (let j = 0; j < selectableInputCombination.length; j++) {
                let option = selectableInputCombination[j].option
                let parameterIndex = selectableInputCombination[j].parameterIndex
                currentSelectableValues[parameterIndex] = option // save the real value here for the OOS winner snapshot
                await selectOptionByValue(parameterIndex, option)
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

    // WFA orchestrator — sequential rolling windows; each = full IS grid then OOS single-combo run.
    // Per window dual-publish: enriched child ReportDataEvent + parent WfaDataEvent upsert.
    async function RunWFA() {
        const wfaID = prepareInitialWFAReport()
        const windows = computeWindows(wfaOptInputs.config, wfaOptInputs.dateRange, wfaOptInputs.windows)

        for (let i = 0; i < windows.length; i++) {
            const win = windows[i]

            // IS: full grid over the in-sample range → winner by IS profit
            wfaContext = { wfaID, windowIndex: i, sampleType: "is" }
            await setBacktestDateRange(win.is.start, win.is.end)
            optimizationHistory = new Map()
            bestResult = { profit: -999999, params: null }
            reportDataMessage = prepareInitialReport()
            // announce the child up front so the WFA page can render the IS report while it streams
            postWFAWindow(wfaID, {
                windowIndex: i,
                is: { reportID: reportDataMessage.strategyID, start: win.is.start, end: win.is.end }
            })
            await OptimizeCheckboxes(() => OptimizeSelectables(() => OptimizeNumerics()))
            updateReport({ status: "FINISHED", isFinal: false })
            await PublishReport()
            const isWinner = bestResult
            let isProfit = isWinner.profit
            if (isProfit === -999999) {
                isProfit = null
            }
            postWFAWindow(wfaID, {
                windowIndex: i,
                winner: { params: isWinner.params, detailedParameters: isWinner.detailedParameters, isProfit: isProfit }
            })

            // OOS: single IS-winner combo over the out-of-sample range
            wfaContext = { wfaID, windowIndex: i, sampleType: "oos" }
            await setBacktestDateRange(win.oos.start, win.oos.end)
            optimizationHistory = new Map()
            bestResult = { profit: -999999, params: null }
            reportDataMessage = prepareInitialReport()
            // announce the OOS child up front too, same reason
            postWFAWindow(wfaID, {
                windowIndex: i,
                oos: { reportID: reportDataMessage.strategyID, start: win.oos.start, end: win.oos.end }
            })
            await pinAndRunOOS(isWinner.inputs)
            updateReport({ status: "FINISHED", isFinal: false })
            await PublishReport()
            const oosWinner = bestResult
            let oosProfit = oosWinner.profit
            if (oosProfit === -999999) {
                oosProfit = null
            }
            postWFAWindow(wfaID, {
                windowIndex: i,
                winner: { oosProfit: oosProfit }
            }, { isWindowFinal: true })
        }

        wfaContext = null
        window.postMessage({ type: "WfaDataEvent", detail: { status: "FINISHED", wfaID } }, "*")
    }

}

// PublishReport publishes the report after optimization is complete
async function PublishReport() {
    // Send Optimization Report to injector
    window.postMessage({ type: "ReportDataEvent", detail: reportDataMessage }, "*");
}

// formats the swept parameter spec as HTML
function buildParametersString() {
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

    return userInputsToString
}

// prepareInitialReport populates initial report before starting a fresh optimization
function prepareInitialReport() {
    //Add ID, StrategyName, Parameters and MaxProfit to Report Message
    let strategyName = document.querySelector("button[data-qa-id*='backtesting' i] span[class*='title' i]")?.textContent
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

    let userInputsToString = buildParametersString()

    let dateRange = document.querySelector(`div[class*='backtesting' i] div[class*='dateRange' i] 
        span[class*='container' i]`)?.innerText

    reportDataMessage = {
        "strategyID": Date.now(),
        "created": Date.now(),
        "strategyName": strategyName,
        "symbol": strategySymbol,
        "timePeriod": strategyTimePeriod,
        "parameters": userInputsToString,
        "maxProfit": bestResult.profit, // NOT READY
        "reportData": [], // NOT READY
        "status": "STARTED",
        "dateRange": dateRange // solely for analytics
    }

    // enrich as a WFA child when a window is running (classic leaves wfaContext null)
    if (wfaContext != null) {
        reportDataMessage.type = "wfa"
        reportDataMessage.wfaID = wfaContext.wfaID
        reportDataMessage.windowIndex = wfaContext.windowIndex
        reportDataMessage.sampleType = wfaContext.sampleType
    }

    // Send update that optimization has started
    PublishReport();

    return reportDataMessage
}

// buildNumericRanges → per-parameter loop counts from start/end/step.
function buildNumericRanges(numericInputs) {
    let ranges = []
    numericInputs.forEach((element, index) => {
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
    })
    return ranges
}

// computeWindows derives rolling IS/OOS date windows from the total range + split.
// Rolling classic WFA: IS = T/(1 + N*oosRatio), OOS = IS*oosRatio, each window steps forward one OOS.
function computeWindows(config, dateRange, N) {
    const startMs = new Date(dateRange.start).getTime()
    const endMs = new Date(dateRange.end).getTime()
    const T = endMs - startMs
    const oosRatio = config.oosPct / config.isPct
    const IS = T / (1 + N * oosRatio)
    const OOS = IS * oosRatio

    const toISO = (ms) => new Date(ms).toISOString().slice(0, 10)
    let windows = []
    for (let i = 0; i < N; i++) {
        let isStart = startMs + i * OOS
        let isEnd = isStart + IS
        let oosEnd = isEnd + OOS
        windows.push({
            windowIndex: i,
            is: { start: toISO(isStart), end: toISO(isEnd) },
            oos: { start: toISO(isEnd), end: toISO(oosEnd) }
        })
    }
    return windows
}

// prepareInitialWFAReport mints the wfaID and posts the parent STARTED lifecycle event.
function prepareInitialWFAReport() {
    const wfaID = Date.now()

    let strategyName = document.querySelector("button[data-qa-id*='backtesting' i] span[class*='title' i]")?.textContent
    let title = document.querySelector("title")?.innerText
    let symbol = title.split(' ')[0]

    let timePeriod = ""
    let timePeriodGroup = document.querySelectorAll("div[class*=innerWrap] div[class*=group]")
    if (timePeriodGroup.length > 1) {
        let selectedPeriod = timePeriodGroup[1].querySelector("button[aria-checked*=true]")
        timePeriod = (selectedPeriod ?? timePeriodGroup[1]).querySelector("div[class*=value]")?.innerHTML
    }

    // account/instrument currency from the net-profit cell — constant across the whole run
    let currency = document.querySelectorAll("div div[class^='containerCell' i] > div:nth-child(2)")[0]?.querySelector("[class*='currency' i]")?.innerText

    window.postMessage({
        type: "WfaDataEvent",
        detail: {
            status: "STARTED",
            wfaID, created: wfaID,
            strategyName, symbol, timePeriod, currency,
            parameters: buildParametersString(),
            config: wfaOptInputs.config,
            dateRange: wfaOptInputs.dateRange,
            windowCount: wfaOptInputs.windows
        }
    }, "*")

    return wfaID
}

// postWFAWindow posts a parent IN_PROGRESS upsert for one window's IS or OOS slice.
function postWFAWindow(wfaID, windowData, extra) {
    window.postMessage({
        type: "WfaDataEvent",
        detail: { status: "IN_PROGRESS", wfaID, window: windowData, ...(extra || {}) }
    }, "*")
}

// Set User Given Intervals Before Optimization Starts
async function SetUserIntervals(activeNumericInputs = userNumericInputs) {
    for (let i = 0; i < activeNumericInputs.length; i++) {
        let userInput = activeNumericInputs[i]
        let startValue = parseFloat(userInput.start) + parseFloat(userInput.stepSize)
        
        if (isFloat(startValue)) {
            let precision = getFloatPrecision(userInput.stepSize)
            startValue = fixPrecision(startValue, precision)
        }
        
        // reset by step size in case of a user input is as same as current tv input value 
        if (userInput.start == tvInputs[userInput.parameterIndex].value) {
            await OptimizeParams(userInput.parameterIndex, userInput.stepSize)
            await sleep(150)
        } else {
            ChangeTvInput(tvInputs[userInput.parameterIndex], startValue)
        }

        await OptimizeParams(userInput.parameterIndex, "-" + userInput.stepSize)

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
    // for non-english users, badge presence is used as fallback since text content won't match 'deep'
    let isBacktestingOn = Array.from(document.querySelectorAll('[data-qa-id="date-range-menu"] span')).find(el => el.textContent.trim().toLowerCase() === 'deep') != null
        || document.querySelectorAll('[data-qa-id="date-range-menu"] span[class*="badge" i]').length > 0
    if (isBacktestingOn === true) {
        await sleep(500)
        let backtestUpdateButton = document.querySelector("div[data-qa-id*='backtesting-updated' i] button")
        if (backtestUpdateButton != null) {
            backtestUpdateButton.click()
        }
        // at this stage it's ensured that report tab is up-to-date
        isBacktestUpdated = true
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
        // fallback for maximized view where reportContainer exists but is hidden
        if (!element?.textContent?.trim()) {
            element = document.querySelector("div[class*=backtesting i]")
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
        await sleep(2000)
        // try to save if optimization data is available, after backup timeout
        tryToSaveOptimizationReport(isBacktestingOn, isBacktestUpdated, optimizationResult, reportData)
    }

    await sleep(100)
    // Send single optimization result as a batch, update maxProfit and Optimization result before hand
    let optimizationResultsObject = Object.fromEntries(optimizationResult);

    updateReport({
        status: "IN_PROGRESS",
        maxProfit: bestResult.profit,
        reportData: optimizationResultsObject
    });
    PublishReport()

    // Re-open strategy settings window
    let reportTitleButton =
        document.querySelector("div[class*='menuButton' i] button") ||
        document.querySelector("div[class*='menu-button' i] button");

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
        if (profit > bestResult.profit) {
            bestResult = { profit, params: parameters, detailedParameters: result.detailedParameters, inputs: snapshotWinningInputs() }
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
async function ResetInnerOptimizeOuterParameter(ranges, rangeIteration, index, activeNumericInputs = userNumericInputs) {
    let previousTvParameterIndex = activeNumericInputs[index - 1].parameterIndex
    let currentTvParameterIndex = activeNumericInputs[index].parameterIndex

    let resetValue = activeNumericInputs[index - 1].start - activeNumericInputs[index - 1].stepSize

    let previousStepSize = activeNumericInputs[index - 1].stepSize
    let currentStepSize = activeNumericInputs[index].stepSize
    //Reset and optimze inner
    await resetAndOptimizeParameter(previousTvParameterIndex, resetValue, previousStepSize)
    // Optimize outer unless it's last iteration
    if (rangeIteration != ranges[index] - 1) {
        await OptimizeParams(currentTvParameterIndex, currentStepSize)
    }
}

// selectOptionByValue opens a selectable's dropdown and clicks the option whose value matches (TV reactProps).
async function selectOptionByValue(parameterIndex, option) {
    // renew tv inputs
    tvInputs = document.querySelectorAll(tvInputsQuery)
    // open up dropdown
    tvInputs[parameterIndex].click()

    await sleep(600)
    let ddOptionsWrapper = document.querySelector("div[class*='mainContent' i]")
    if (ddOptionsWrapper == null) return
    let reactPropsKey = Object.keys(ddOptionsWrapper).find(key => key.includes("reactProps"));

    let ddOptions = ddOptionsWrapper[reactPropsKey].children.props.children.props.children
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

// snapshotWinningInputs captures the current (winning) combo as [{parameterIndex, type, value}] for the OOS pin.
// numeric/checkbox read live off the DOM; selectable reads the tracked value (DOM innerText ≠ option value).
function snapshotWinningInputs() {
    return userInputs.map(input => {
        let value
        switch (input.type) {
            case ParameterType.Checkbox:
                value = tvInputs[input.parameterIndex].checked
                break
            case ParameterType.Selectable:
                value = currentSelectableValues[input.parameterIndex]
                break
            default: // Numeric
                value = tvInputs[input.parameterIndex].value
        }
        return { parameterIndex: input.parameterIndex, type: input.type, value }
    })
}

// pinAndRunOOS applies the IS winner to every input, then fires ONE OptimizeParams to backtest + record the single OOS combo.
async function pinAndRunOOS(winnerInputs) {
    // a numeric drives the single backtest via its increment (popup guarantees >=1 numeric)
    let trigger = winnerInputs.find(w => w.type === ParameterType.Numeric)

    // set every non-trigger input to its winning value (no backtest yet)
    for (let w of winnerInputs) {
        if (w === trigger) continue
        tvInputs = document.querySelectorAll(tvInputsQuery)
        switch (w.type) {
            case ParameterType.Selectable:
                await selectOptionByValue(w.parameterIndex, w.value)
                break
            case ParameterType.Checkbox:
                if (tvInputs[w.parameterIndex].checked !== w.value) {
                    tvInputs[w.parameterIndex].click()
                }
                break
            case ParameterType.Numeric:
                ChangeTvInput(tvInputs[w.parameterIndex], w.value)
                break
        }
        await sleep(250)
    }

    // position the trigger one step below its winner; OptimizeParams increments it back → the single backtest
    let stepSize = userNumericInputs.find(n => n.parameterIndex === trigger.parameterIndex).stepSize
    let triggerStart = Number(trigger.value) - Number(stepSize)
    if (isFloat(triggerStart)) {
        let precision = getFloatPrecision(stepSize)
        triggerStart = fixPrecision(triggerStart, precision)
    }
    tvInputs = document.querySelectorAll(tvInputsQuery)
    ChangeTvInput(tvInputs[trigger.parameterIndex], triggerStart)
    await sleep(250)
    await OptimizeParams(trigger.parameterIndex, stepSize)
}

// setBacktestDateRange applies a custom backtest date range (per WFA window). PRELIMINARY — selectors/guards to harden.
async function setBacktestDateRange(start, end) {
    document.querySelector('[data-qa-id="date-range-menu"]')?.click()
    await sleep(500)
    document.querySelector('[data-qa-id="custom-date-range-item"]')?.click()
    await sleep(500)

    const dates = document.querySelectorAll('[data-qa-id="date-picker-wrapper"]')
    const startInput = dates[0].querySelector("input")
    const endInput = dates[1].querySelector("input")

    // write start, then a real focus transition to end so React commits start before end is written
    setDateInput(startInput, start)
    moveDateFocus(startInput, endInput)
    setDateInput(endInput, end)
    await sleep(250)

    // when the range already matches, Select is disabled and can't commit — dismiss via the close (X) instead
    const submitBtn = document.querySelector('[data-name*="custom-date-range-dialog" i] [data-qa-id*="submit-button" i]')
    const submitEnabled = submitBtn != null && submitBtn.disabled !== true && submitBtn.getAttribute("aria-disabled") !== "true"
    if (submitEnabled) {
        submitBtn.click()
    } else {
        document.querySelector('[data-name*="custom-date-range-dialog" i] button[data-qa-id="close" i]')?.click()
    }

    await sleep(1000) // let the backtest recompute settle before optimizing
}

// writes a date field through the prototype value setter so React's tracker registers it
function setDateInput(input, value) {
    input.focus()
    nativeInputSet.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

// moves focus between date fields via bubbling focusout/focusin — the events React commits onBlur/onFocus through
function moveDateFocus(from, to) {
    from.dispatchEvent(new Event('change', { bubbles: true }))
    from.dispatchEvent(new FocusEvent('blur', { bubbles: false, relatedTarget: to }))
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }))
    to.focus()
    to.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: from }))
    to.dispatchEvent(new FocusEvent('focus', { bubbles: false, relatedTarget: from }))
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
    let rawProfitableTrades = reportDataSelector[2].querySelector(changeSelector)?.innerText
    reportData.closedTrades = rawProfitableTrades?.includes('/') ? rawProfitableTrades.split('/')[1].trim() : rawProfitableTrades
    //4.
    reportData.percentProfitable = reportDataSelector[2].querySelector(valueSelector)?.innerText
    //4.
    reportData.profitFactor = reportDataSelector[3].querySelector(valueSelector)?.innerText

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