(function () {
    let strategyName;
    
    let reportStrategyName = document.querySelector("button[data-qa-id*='backtesting' i] span[class*='title' i]")?.textContent
    let dialogStrategyName = document.querySelector("div[data-name=indicator-properties-dialog]")?.getAttribute("data-dialog-name")

    if (dialogStrategyName) {
        strategyName = dialogStrategyName
    } else {
        strategyName = reportStrategyName
    }
    if (!strategyName) return

    let strategySymbol = document.querySelector("title")?.innerText?.split(' ')[0]

    let strategyInterval = null
    let timePeriodGroup = document.querySelectorAll("div[class*=innerWrap] div[class*=group]")
    if (timePeriodGroup.length > 1) {
        let selectedPeriod = timePeriodGroup[1].querySelector("button[aria-checked*=true]")
        if (selectedPeriod != null) {
            strategyInterval = selectedPeriod.querySelector("div[class*=value]")?.innerHTML
        } else {
            strategyInterval = timePeriodGroup[1].querySelector("div[class*=value]")?.innerHTML
        }
    }

    chrome.runtime.sendMessage({
        popupAction: {
            event: "getStrategyContext",
            message: { strategyName, strategySymbol, strategyInterval }
        }
    })
})()
