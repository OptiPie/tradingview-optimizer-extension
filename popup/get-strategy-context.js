(function () {
    let strategyName = document.querySelector("div[class*=dialog] div")?.getAttribute("data-dialog-name")
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
