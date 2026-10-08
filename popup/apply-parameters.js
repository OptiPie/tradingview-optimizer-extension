(function () {
    if (window.optipieApplyParametersInjected) {
        return
    }
    let overlapRoot = document.querySelector("#overlap-manager-root")
    if (overlapRoot == null) {
        return
    }
    window.optipieApplyParametersInjected = true

    const dialogQuery = "div[data-name='indicator-properties-dialog']"
    const buttonID = "optipie-apply-parameters"

    let observer = new MutationObserver(function () {
        addApplyButton()
    })
    observer.observe(overlapRoot, { childList: true, subtree: true })
    addApplyButton()

    // addApplyButton attaches the apply button to the right edge of an open strategy dialog
    function addApplyButton() {
        let dialog = document.querySelector(dialogQuery)
        if (dialog == null) {
            return
        }
        // strategies have a properties tab, indicators don't
        if (dialog.querySelector("#properties") == null) {
            return
        }
        let container = dialog.parentElement
        if (container.querySelector("#" + buttonID) != null) {
            return
        }

        let top = 0
        let tabs = dialog.querySelector("#indicator-properties-dialog-tabs")
        if (tabs != null) {
            top = tabs.getBoundingClientRect().bottom - container.getBoundingClientRect().top
        }

        let background = "#ffffff"
        let color = "#131722"
        let border = "#d1d4dc"
        let logoFilter = "none"
        if (document.documentElement.classList.contains("theme-dark")) {
            background = "#171717"
            color = "#d1d4dc"
            border = "#434651"
            logoFilter = "invert(1)"
        }

        let logo = document.createElement("img")
        logo.src = chrome.runtime.getURL("images/optipie_app_logo_cropped.png")
        logo.alt = "OptiPie"
        logo.style.cssText = `display: block; width: 54px; margin: 0 auto 4px; opacity: 0.55; filter: ${logoFilter};`

        let button = document.createElement("button")
        button.id = buttonID
        button.type = "button"
        button.appendChild(logo)
        button.appendChild(document.createTextNode(`Apply`))
        button.style.cssText = `position: absolute; left: 100%; top: ${top}px; padding: 6px 8px;
            background: ${background}; color: ${color}; border: 1px solid ${border}; border-left: none;
            border-radius: 0 8px 8px 0; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; line-height: 1.3;`
        button.addEventListener("click", function () {
            applyParameters()
        })
        container.appendChild(button)
    }

    // applyParameters writes the copied parameters into the open strategy dialog
    async function applyParameters() {
        let { copiedParameters } = await chrome.storage.local.get("copiedParameters")
        if (copiedParameters == null) {
            notify("warning", "Copy parameters from a report first")
            return
        }
        console.log(copiedParameters)
        let dialog = document.querySelector(dialogQuery)
        if (dialog == null) {
            return
        }
        if (dialog.querySelector("#inputs")?.getAttribute("aria-selected") !== "true") {
            notify("warning", "Switch to the Inputs tab to apply the parameters")
            return
        }
        let strategyName = dialog.getAttribute("data-dialog-name")
        if (strategyName !== copiedParameters.strategyName) {
            notify("warning", `Copied parameters belong to ${copiedParameters.strategyName}, not ${strategyName}`)
            return
        }

        let skipped = 0
        for (let i = 0; i < copiedParameters.inputs.length; i++) {
            let entry = copiedParameters.inputs[i]
            if (entry.type === "Unknown") {
                continue
            }
            if (copiedParameters.scope === "optimized" && !entry.isOptimized) {
                continue
            }
            let match = findDialogInput(copiedParameters.inputs, i)
            if (match == null) {
                skipped++
                continue
            }
            let isApplied = await applyValue(match, entry.value)
            if (!isApplied) {
                skipped++
            }
        }

        if (skipped === 1) {
            notify("warning", "Parameters applied, 1 input skipped")
        } else if (skipped > 1) {
            notify("warning", `Parameters applied, ${skipped} inputs skipped`)
        } else {
            notify("success", "Parameters applied")
        }
    }

    // findDialogInput matches a copied entry to the dialog by name, occurrence and type
    function findDialogInput(inputs, entryIndex) {
        let entry = inputs[entryIndex]
        let occurrence = 0
        for (let i = 0; i < entryIndex; i++) {
            if (inputs[i].name === entry.name) {
                occurrence++
            }
        }
        let sameName = readDialogInputs().filter(input => input.name === entry.name)
        let match = sameName[occurrence]
        if (match == null || match.type !== entry.type) {
            return null
        }
        return match
    }

    // readDialogInputs lists the dialog's inputs as [{name, type, control}], mirroring get-tv-parameters.js
    function readDialogInputs() {
        let dialogInputs = []
        let parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='content'] div");

        for (let i = 0; i < parameterNameElements.length; i++) {
            let className = parameterNameElements[i].className;
            let parameterName = parameterNameElements[i].innerText;

            // handle selectable and numeric parameters
            if (className.includes("cell") && className.includes("first")) {
                let valueCell = parameterNameElements[i].nextSibling
                let selectableParameter = valueCell?.querySelector("button[role='combobox']");
                let numericParameter = valueCell?.querySelector("input[inputmode*='numeric' i]");
                let stringParameter = valueCell?.querySelector("input[maxlength*='4096' i]");
                let dateParameter = valueCell?.querySelector("div[class*='datePicker' i]");
                let colorParameter = valueCell?.querySelector("div[class*='colorPicker' i]");

                if (selectableParameter != null) {
                    dialogInputs.push({ name: parameterName, type: "Selectable", control: selectableParameter })
                } else if (numericParameter != null) {
                    dialogInputs.push({ name: parameterName, type: "Numeric", control: numericParameter })
                } else if (dateParameter != null) {
                    dialogInputs.push({ name: parameterName, type: "Unknown", control: null })
                } else if (colorParameter != null) {
                    dialogInputs.push({ name: parameterName, type: "Unknown", control: null })
                } else if (stringParameter != null) {
                    dialogInputs.push({ name: parameterName, type: "Unknown", control: null })
                }
            } // handle checkboxes, skipping full width rows without one (e.g. text areas)
            else if (className.includes("cell") && className.includes("fill") && !className.includes("checkableTitle")
                && parameterNameElements[i].querySelector("input[type='checkbox']") != null) {
                let checkbox = parameterNameElements[i].querySelector("input[type='checkbox']")
                dialogInputs.push({ name: parameterName, type: "Checkbox", control: checkbox })
            }
        }
        return dialogInputs
    }

    // applyValue sets one dialog input to the copied value, returns false when it can't
    async function applyValue(match, value) {
        let control = match.control
        if (control == null) {
            return false
        }
        switch (match.type) {
            case "Numeric":
                if (control.value !== value) {
                    // focus, edit, then a real blur, which is what commits the value
                    control.focus()
                    control.value = value
                    control.dispatchEvent(new Event("input", { bubbles: true }))
                    control.dispatchEvent(new Event("change", { bubbles: true }))
                    control.blur()
                    await wait(100)
                }
                return true
            case "Checkbox":
                if (control.checked !== value) {
                    control.click()
                    await wait(100)
                }
                return true
            case "Selectable":
                return await selectOption(control, value)
        }
        return false
    }

    // selectOption opens a dropdown and clicks the option whose text matches
    async function selectOption(combobox, value) {
        if (combobox.innerText.trim() === value) {
            return true
        }
        combobox.click()
        let listbox = await waitForElement(combobox.getAttribute("aria-controls"))
        if (listbox == null) {
            return false
        }
        let options = listbox.querySelectorAll("[role='option']")
        for (let option of options) {
            if (option.textContent.trim() === value) {
                option.click()
                await wait(150)
                return true
            }
        }
        // close the dropdown when the option is missing
        combobox.click()
        await wait(150)
        return false
    }

    // waitForElement polls for an element by id for up to a second
    async function waitForElement(id) {
        for (let i = 0; i < 20; i++) {
            let element = document.getElementById(id)
            if (element != null) {
                return element
            }
            await wait(50)
        }
        return null
    }

    // wait resolves after the given milliseconds
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    // notify shows an extension notification
    function notify(type, content) {
        chrome.runtime.sendMessage({ notify: { type, content } })
    }
})()
