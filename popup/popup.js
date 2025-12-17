// Popup action event types
const lockOptimizeButton = 'lockOptimizeButton'
const unlockOptimizeButton = 'unlockOptimizeButton'
const getTvParameters = 'getTvParameters'
const reportUpdated = 'reportUpdated'

let optimize = document.getElementById("optimize");
let addParameter = document.getElementById("addParameter");
let freeParameterLimit = 5
let plusParameterLimit = 20
// global lock flag
let _autoFillBusy = false;
// retrieve parameters from Tv initially before anything
let _resolveFirstFill;
const firstFillDone = new Promise(resolve => {
  _resolveFirstFill = resolve;
});

const ParameterType = {
  Selectable: "Selectable",
  Numeric: "Numeric",
  Checkbox: "Checkbox",
  DatePicker: "DatePicker" // not supported atm
}

// Get current settings from storage
async function getSettings() {
  const result = await chrome.storage.sync.get("settings");
  return result?.settings || { isLongRunningOptimizations: false };
}

// Initialize popup html according to last user parameter count state
async function initPopupParametersByState() {
  const { userParameterCount } = await new Promise((resolve) => {
    chrome.storage.local.get("userParameterCount", resolve);
  });

  for (let i = 1; i < userParameterCount; i++) {
    await addParameterBlock(plusParameterLimit);
  }

  setLastUserParameters(userParameterCount);

  setTimeout(() => {
    calculateIterations(); // update iteration based on last user parameters
  }, 500);
}

initPopupParametersByState()

// Tab event listeners to change body width 
addTabEventListeners()

// Save Inputs EventListener for first parameters as default
addSaveInputEventListener(0)
addSaveAutoFillSelectionListener(0)
updateUserUI()

// non-functional UI changes made with storage
function updateUserUI() {
  chrome.storage.local.get("isPlusUser", ({ isPlusUser }) => {
    if (isPlusUser) {
      // show plus logo
      var logo = document.getElementById("normalLogo")
      logo.style.cssText = 'display:none !important';
      var plusLogo = document.getElementById("plusLogo")
      plusLogo.style.cssText = 'display:block !important'
      // remove plus upgrade button 
      var plusUpgrade = document.getElementById("plusUpgrade")
      plusUpgrade.style.display = 'none'
    } else {
      // hide plus logo
      var plusLogo = document.getElementById("plusLogo")
      plusLogo.style.cssText = 'display:none !important'
      var logo = document.getElementById("normalLogo")
      logo.style.cssText = 'display:block !important';
      // add plus upgrade button 
      var plusUpgrade = document.getElementById("plusUpgrade")
      plusUpgrade.style.display = 'block'
    }
  });
}


// Add start optimize event listener
optimize.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  var userInputs = new Object({
    parameters: [],
    timeFrames: []
  })
  // err is handled as value
  var err = await CreateUserInputsMessage(userInputs)

  if (err != null) {
    switch (err.message) {
      case 'missing-parameters':
        chrome.runtime.sendMessage({
          notify: {
            type: "warning",
            content: "Fill all parameter inputs accordingly & Use dot '.' decimal separator"
          }
        });
        break;
      case 'wrong-parameter-values':
        chrome.runtime.sendMessage({
          notify: {
            type: "warning",
            content: "'Start' value must be less than 'End' value"
          }
        });
        break;
      case 'numeric-parameter-required':
        chrome.runtime.sendMessage({
          notify: {
            type: "warning",
            content: "At least 1 Numeric Input is required"
          }
        });
        break;
    }

    return
  }

  // Add settings to userInputs
  const settings = await getSettings();
  userInputs.settings = settings;

  chrome.storage.local.set({ "userInputs": userInputs });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['injector.js']
  });
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const properties = Object.keys(message);
    const values = Object.values(message);

    // popupAction type defines popup html UI actions according to event type
    if (properties[0] === 'popupAction') {
      const popupAction = values[0];

      switch (popupAction.event) {
        case lockOptimizeButton:
          document.querySelector("#optimize").setAttribute("disabled", "");
          break;

        case unlockOptimizeButton:
          document.querySelector("#optimize").removeAttribute("disabled", "");
          break;

        case getTvParameters:
          let tvParameters = popupAction.message.tvParameters;
          if (!tvParameters?.length) {
            chrome.storage.local.set({ tvParameters: null });
            return;
          }
          await autoFillParameters(tvParameters);
          chrome.storage.local.set({ "tvParameters": tvParameters });
          _resolveFirstFill();
          break;

        case reportUpdated:
          let strategyId = popupAction.message.report.strategyID
          let maxProfit = popupAction.message.report.maxProfit
          UpdateStrategyReportRow(strategyId, maxProfit)
          break;

      }
    }
  })();

  return false;
});


// Create Reports and Profile Tabs
createReportTable()

// Refresh Report Data Manually 
addRefreshDataEventListener()

//#region Report Tab & Table

async function createReportTable() {
  await sleep(200)

  chrome.storage.local.get(null, function (items) {
    var reportData = []

    if (items == null) {
      return
    }

    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith("report-data-")) {
        var date = new Date(value.created)
        var formattedDate = (date.getMonth() + 1).toString() + '/' + date.getDate() + '/' + date.getFullYear() + ' ' + ("0" + date.getHours()).slice(-2) + ':' + ("0" + date.getMinutes()).slice(-2)
        var report = {
          "strategyID": value.strategyID,
          "strategyName": value.strategyName,
          "date": formattedDate,
          "symbol": value.symbol,
          "timePeriod": value.timePeriod,
          "parameters": value.parameters,
          "maxProfit": value.maxProfit,
          "detail": reportDetailHtml(value.strategyID)
        }
        reportData.push(report)
      }
    }
    var $table = $('#table')
    $table.bootstrapTable({ data: reportData })
    $table.bootstrapTable('load', reportData)


    // init tool tip 
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.forEach(function (tooltipTriggerEl) {
      new bootstrap.Tooltip(tooltipTriggerEl)
    });
  });
}

function reportDetailHtml(strategyID) {
  return '<button id="report-detail-button" strategy-id="' + strategyID + '" type="button" class="btn btn-primary btn-sm"><i class="bi bi-clipboard2-data-fill"> Open</i></button>\
  <button id="remove-report" type="button" class="btn btn-danger btn-sm"><i class="bi bi-trash"></i></button>'
}

// Add Custom Styles to Columns 
function reportDetailButtonStyle(value, row, index) {
  return {
    css: {
      'text-align': 'center',
      'white-space': 'nowrap'
    }
  }
}

function maxProfitColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-all'
    }
  }
}

function parametersColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-word'
    }
  }
}

function symbolColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-all'
    }
  }
}

function strategyNameColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-word',
      'font-weight': '500'
    }
  }
}


window.openReportDetail = {
  // Set ReportDetail query string to build html report detail dynamically 
  'click #report-detail-button': function (e, value, row, index) {
    chrome.tabs.create({ url: 'report/reportdetail.html?strategyID=' + row.strategyID })

  },
  // Remove Report from both storage and table
  'click #remove-report': function (e, value, row, index) {
    var $table = $('#table')
    chrome.storage.local.remove(["report-data-" + row.strategyID])
    $table.bootstrapTable('remove', {
      field: 'strategyID',
      values: [row.strategyID]
    })
  }
}

//#endregion

//#region Profile Tab
let profileTab = document.getElementById("profile-tab")
profileTab.addEventListener("click", async () => {
  await createProfileTab()
})

ProcessPlusFeatures();

// wrap plus feature injector with google auth
async function ProcessPlusFeatures() {
  var token = ""
  await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "getAuthToken", isInteractive: false }, function (response) {
      if (Object.keys(response).length > 0) {
        token = response.token
      }
      resolve();
    })
  })
  if (token === "") {
    // clean parameter names
    chrome.storage.local.set({ "tvParameters": null });
    // Add Parameter Button Event Listener, with 'parameterLimit'
    addParameter.addEventListener("click", async () => {
      await addParameterBlock(freeParameterLimit)
    });
    chrome.storage.local.set({ "isPlusUser": false });
    updateUserUI()
    return
  }
  var userInfo;
  userInfo = await getUserInfo(token)
  await injectPlusFeatures(userInfo.email)
}

// inject plus features for eligible users
async function injectPlusFeatures(userEmail) {
  var parameterLimit = freeParameterLimit
  var user = await GetMembershipInfo(userEmail)
  if (user.is_membership_active) {
    chrome.storage.local.set({ "isPlusUser": true });
    updateUserUI()
    // show skeletons first for features
    showSkeleton("timeFrame", "time-frame")
    showSkeleton("stop", "stop")
    // change parameter limit up for plus users
    parameterLimit = plusParameterLimit
    await getCurrentTab().then(async (tab) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['plus/get-tv-parameters.js']
      });
    });
    let stopOptimization = document.getElementById("stop")
    stopOptimization.addEventListener("click", async (clickEvent) => {
      await getCurrentTab().then(function (tab) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: stopOptimizationEvent,
          args: [JSON.stringify(clickEvent)],
        });
      })
      stopOptimization.setAttribute("disabled", "")
    })
    setTimeout(() => {
      hideSkeleton("stop", "stop")
      stopOptimization.style.display = 'block'
    }, 300);

    $('#selectTimeFrame').multiselect({
      buttonClass: 'form-select',
      templates: {
        button: '<button type="button" class="multiselect dropdown-toggle" data-bs-toggle="dropdown"><span class="multiselect-selected-text"></span></button>',
      },
      buttonWidth: '85.75px',
      nonSelectedText: 'Time',
      maxHeight: "200",
      buttonText: function (options, select) {
        if (options.length === 0) {
          return 'Time';
        }
        else if (options.length > 3) {
          return '...';
        }
        else {
          var labels = [];
          options.each(function () {
            if ($(this).attr('label') !== undefined) {
              labels.push($(this).attr('label'));
            }
            else {
              var timeFrameTitle = TimeFrameMap.get($(this).html())
              labels.push(timeFrameTitle);
            }
          });
          return labels.join(', ') + '';
        }
      },
      onChange: async function (option, checked, select) {
        var timeFrameValue = option[0].value
        var userTimeFramesObj = await chrome.storage.local.get("userTimeFrames")
        var userTimeFrames = []
        if (Object.keys(userTimeFramesObj).length > 0 && userTimeFramesObj.userTimeFrames != null) {
          userTimeFrames = userTimeFramesObj.userTimeFrames
        }
        if (checked) {
          userTimeFrames.push(timeFrameValue)
        } else {
          for (let i = 0; i < userTimeFrames.length; i++) {
            if (userTimeFrames[i] == timeFrameValue) {
              userTimeFrames.splice(i, 1)
            }
          }
        }
        chrome.storage.local.set({ "userTimeFrames": userTimeFrames })
      }
    });
    chrome.storage.local.get("userTimeFrames", ({ userTimeFrames }) => {
      $('#selectTimeFrame').multiselect('select', userTimeFrames, false);
    });
    setTimeout(() => {
      hideSkeleton("timeFrame", "time-frame")
      document.getElementById("timeFrame").style.display = 'block'
    }, 200);
  } else {
    chrome.storage.local.set({ "isPlusUser": false });
  }
  // Add Parameter Button Event Listener, with 'parameterLimit'
  addParameter.addEventListener("click", async () => {
    await addParameterBlock(parameterLimit)
  });

  // dispatch stop optimization event for plus users by clicking stop button
  function stopOptimizationEvent(clickEvent) {
    var event = JSON.parse(clickEvent)
    window.postMessage({ type: "StopOptimizationEvent", detail: { event: event } }, "*");
  }
}

//
async function autoFillParameters(tvParameters) {
  if (_autoFillBusy) return;
  _autoFillBusy = true;

  try {
    // hide all the "Start" labels
    document
      .querySelectorAll('label[for="inputStart"]')
      .forEach(lbl => (lbl.style.display = 'none'));

    const selects = document.querySelectorAll("#selectAutoFill");

    // build an array of the tvParameter indices we actually want to fill
    const autoFillIndices = tvParameters
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.type !== ParameterType.DatePicker)
      .map(({ idx }) => idx);

    for (let i = 0; i < selects.length; i++) {
      const sel = selects[i];

      // only populate options once
      if (sel.options.length <= 1) {
        sel.style.display = "inline-block";
        tvParameters.forEach((param, j) => {
          const opt = new Option(param.name, j);
          if (param.type === ParameterType.DatePicker) opt.hidden = true;
          sel.add(opt);
        });
      }

      // check for a user-stored override
      const stored = await chrome.storage.local.get("selectAutoFill" + i);
      const userIdx = stored["selectAutoFill" + i];
      // decide which index to pick
      let pickIdx = null;
      if (
        userIdx != null &&
        tvParameters[userIdx]?.type !== ParameterType.DatePicker &&
        userIdx < tvParameters.length
      ) {
        pickIdx = userIdx;
      } else if (autoFillIndices[i] != null) {
        pickIdx = autoFillIndices[i];
      }

      // apply it
      if (pickIdx != null) {
        sel.value = pickIdx;
        const param = tvParameters[pickIdx];
        if (param.type === ParameterType.Checkbox) {
          transformInput({
            type: param.type,
            parameterIndex: i,
            parameterName: param.name,
          });
        } else if (param.type === ParameterType.Selectable) {
          transformInput({
            type: param.type,
            parameterIndex: i,
            parameterName: param.name,
            parameterOptions: param.options,
          });
        }
      }
    }
  } finally {
    _autoFillBusy = false;
  }
}

async function getParameterType(parameterIndex) {
  var tvParametersObj = await chrome.storage.local.get("tvParameters")
  var tvParameters = tvParametersObj.tvParameters
  return tvParameters[parameterIndex].type
}

function transformInput(input) {
  let inputRow = document.querySelectorAll("#parameters #wrapper")[input.parameterIndex]
  let $inputRow = $("#parameters #wrapper").eq(input.parameterIndex);

  let inputStart = inputRow.querySelector("#inputStart").parentElement
  let inputStep = inputRow.querySelector("#inputStep").parentElement
  let checkbox = inputRow.querySelector("#divCheckbox")
  let selectable = inputRow.querySelector("#divSelectParameter")
  let stepLabel = inputRow.querySelector("#header label[for*='step' i]");

  switch (input.type) {
    case ParameterType.Selectable:
      // hide step size label if it's first input
      if (input.parameterIndex == 0) {
        hideElement(stepLabel)
      }
      // hide numeric input
      hideElement(inputStart)
      hideElement(inputStep)
      // hide checkbox input
      checkbox.querySelector("label").textContent = "default"
      hideElement(checkbox)
      // show selectable input
      showWithTransition(selectable, "block");

      let $select = $inputRow.find('#selectParameter');

      // remove all existing options
      $select.find('option').remove();
      input.parameterOptions?.forEach(function (option) {
        $select.append(`<option value="${option.value}">${option.title}</option>`);
      });

      // rebuild the multiselect plugin unless it's empty or not initialized
      if ($select.data('multiselect')) {
        $select.multiselect('rebuild');
      }

      let storageKey = 'selectParameter' + input.parameterIndex

      $select.multiselect({
        buttonClass: 'form-select',
        buttonWidth: '25%',
        nonSelectedText: 'Select',
        templates: {
          button: `
          <button type="button" class="multiselect dropdown-toggle" data-bs-toggle="dropdown"><span class="multiselect-selected-text"></span></button>`,
        },
        maxHeight: 175,
        dropUp: true,
        buttonText: function (options, select) {
          if (options.length === 0) {
            return "Select " + input.parameterName;
          }
          else if (options.length > 3) {
            return '...';
          }
          else {
            var labels = [];
            options.each(function () {
              labels.push($(this).html());
            });
            return labels.join(', ') + '';
          }
        },
        onChange: async function (option, checked) {
          let selectedParameter = option[0].value

          chrome.storage.local.get([storageKey], function (result) {
            let selectedParameters = result[storageKey] || []; // fallback to empty if nothing there

            if (checked) {
              if (!selectedParameters.includes(selectedParameter)) {
                selectedParameters.push(selectedParameter);
              }
            } else {
              selectedParameters = selectedParameters.filter(item => item !== selectedParameter);
            }

            chrome.storage.local.set({ [storageKey]: selectedParameters });
          });
          calculateIterations()
        }
      });

      chrome.storage.local.get([storageKey], function (result) {
        let selectedParameters = result[storageKey] || []
        $select
          .val(selectedParameters)
          .trigger('change');

        $select.multiselect('refresh');
      });

      break;
    case ParameterType.Checkbox:
      // hide step size label if it's first input
      if (input.parameterIndex == 0) {
        hideElement(stepLabel)
      }
      // hide numeric input
      hideElement(inputStart)
      hideElement(inputStep)
      // hide selectable input
      hideElement(selectable)

      // show checkbox input
      checkbox.querySelector("label").textContent = input.parameterName
      showWithTransition(checkbox, "block");

      break;
    case ParameterType.Numeric:
      if (input.parameterIndex == 0) {
        showWithTransition(stepLabel, "block");
      }
      // hide checkbox input
      checkbox.querySelector("label").textContent = "default"
      hideElement(checkbox)
      // hide selectable input
      hideElement(selectable)
      // show numeric input
      showWithTransition(inputStart, "flex");
      showWithTransition(inputStep, "flex");
    default:
      break;
  }
}

async function createProfileTab() {
  var token = ""
  await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "getAuthToken", isInteractive: false }, function (response) {
      if (Object.keys(response).length > 0) {
        token = response.token
      }
      resolve();
    })
  })
  if (token === "") {
    setTimeout(() => {
      hideSkeleton("login", "profile")
    }, 250);
    return
  }
  var userInfo;
  userInfo = await getUserInfo(token)
  setTimeout(() => {
    hideSkeleton("profile", "profile")
  }, 250);
  document.querySelector("#freeUser #userEmail").innerText = userInfo.email
  var user = await GetMembershipInfo(userInfo.email)
  if (user.is_membership_active) {
    document.getElementById("freeUser").style.display = 'none'
    document.getElementById("paidUser").style.display = 'flex'
    document.querySelector("#paidUser #userEmail").innerText = userInfo.email
    var membershipPeriodEndDate = new Date(user.current_membership_period_end * 1000)
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var year = membershipPeriodEndDate.getFullYear();
    var month = months[membershipPeriodEndDate.getMonth()];
    var date = membershipPeriodEndDate.getDate();
    var time = date + ' ' + month + ' ' + year + ' '
    document.querySelector("#membershipRenewal h6").textContent = time;
  }
}

async function getUserInfo(token) {
  var userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
    .then(response => response.json())

  return userInfo
}


let loginButton = document.getElementById("loginButton");
loginButton.addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "getAuthToken", isInteractive: true }, function (response) {
  })
});

let logoutButtons = document.querySelectorAll("#logoutButton")
logoutButtons.forEach(logoutButton => {
  logoutButton.addEventListener("click", async () => {
    showSkeleton("profile", "profile")
    chrome.runtime.sendMessage({ type: "getAuthToken", isInteractive: false }, function (response) {
      var url = 'https://accounts.google.com/o/oauth2/revoke?token=' + response.token;
      window.fetch(url);
    })

    chrome.runtime.sendMessage({ type: "clearAllCachedAuthTokens" })
    setTimeout(() => {
      hideSkeleton("login", "profile")
    }, 250);
    chrome.storage.local.set({ "isPlusUser": false });
    updateUserUI()
  });
})



//#endregion

async function addParameterBlock(parameterLimit) {
  let parameters = document.getElementById("parameters")
  let parameterCount = parameters.children.length

  if (parameterCount < parameterLimit) {
    // Hide Last Remove Div for added parameters
    if (parameterCount > 1) {
      let removeDiv = "#remove" + parameterCount + ""
      parameters.lastElementChild.querySelector(removeDiv).style = 'display:none;'
    }

    // Add Parameter Block
    let orderOfParameter = parameterCount + 1
    let divToAppend = addParameterBlockHtml(orderOfParameter)
    parameters.insertAdjacentHTML('beforeend', divToAppend)


    // Enable auto fill plus feature if eligible  
    setTimeout(() => {
      (async () => {
        await firstFillDone;
        let tvParameters = await storageGetTvParameters()
        if (tvParameters != null && tvParameters.length > 0) {
          await autoFillParameters(tvParameters);
        }
      })();
    }, 250);

    // Increment User's Last Parameter Count State    
    chrome.storage.local.set({ "userParameterCount": parameterCount + 1 });

    // Add Remove Button Event Listener
    addRemoveParameterBlockEventListener(parameterCount)

    // Save Inputs EventListener for rest of the parameters
    addSaveInputEventListener(parameterCount)
    addSaveAutoFillSelectionListener(parameterCount)
    setTimeout(() => {
      calculateIterations()
    }, 300);
  }
}

function addParameterBlockHtml(orderOfParameter) {
  return '<div id="wrapper">\
  <div class="row g-2" id="header">\
    <div class="col-8">\
      <label for="inputStart" class="form-label">' + orderOfParameter + '. Parameter</label>\
      <select class="form-select-sm" aria-label="Select Parameter" id="selectAutoFill">\
      <option selected disabled>Select Parameter</option>\
    </select>\
    </div>\
    <div class="col-4">\
      <div class="text-end" id="remove' + orderOfParameter + '">\
        <label for="close" class="form-label text-muted">Remove</label>\
        <button type="button" class="btn-close align-text-top remove-parameters" aria-label="Close"></button>\
      </div>\
    </div>\
  </div>\
  <div class="row g-2 pb-2" id="content">\
    <div class="col-8">\
    <div class="form-check" id="divCheckbox">\
      <input class="form-check-input" type="checkbox" id="inputCheckbox" value="" checked>\
      <label class="form-check-label" for="inputCheckbox">\
        Default checkbox\
      </label>\
    </div>\
    <div class="btn-group select-parameter" id="divSelectParameter">\
    <select multiple="multiple" class="sm" id="selectParameter">\
      <option disabled>Select</option>\
    </select>\
    </div>\
    <div class="input-group input-group">\
      <input type="text" aria-label="Start" placeholder="Start" class="form-control" id="inputStart">\
      <input type="text" aria-label="End" placeholder="End" class="form-control" id="inputEnd">\
    </div>\
    </div>\
    <div class="col-4 mt-auto">\
      <input type="text" aria-label="Step" placeholder="Step" class="form-control"\
        id="inputStep">\
    </div>\
  </div>\
  </div>'
}

function addRemoveParameterBlockEventListener(parameterCount) {
  document.querySelectorAll(".btn-close.remove-parameters")[parameterCount - 1].addEventListener("click", async (evt) => {
    // Remove the selected row from incoming event 
    let evtPath = eventPath(evt)
    for (let i = 0; i < evtPath.length; i++) {
      const element = evtPath[i];
      // wrapper id corresponds to respective row to be deleted by the remove click 
      if (element.id == "wrapper") {
        element.remove()
        break;
      }
    }

    let parameters = document.getElementById("parameters")
    let parameterCount = parameters.children.length

    // Decrement User's Last Parameter Count State    
    chrome.storage.local.set({ "userParameterCount": parameterCount });
    //Clear user parameter values from storage
    let start = "inputStart" + parameterCount
    let end = "inputEnd" + parameterCount
    let step = "inputStep" + parameterCount
    let autoFill = "selectAutoFill" + parameterCount
    chrome.storage.local.set({ [start]: null, [end]: null, [step]: null, [autoFill]: null });


    //Show previously added hidden remove button
    if (parameterCount > 1) {
      let removeDiv = "#remove" + parameterCount + ""
      parameters.lastElementChild.querySelector(removeDiv).style = 'display:block;'
    }
    calculateIterations()
  });
}

// Retrieve and set user parameters from last saved state
function setLastUserParameters(parameterCount) {
  for (let i = 0; i < parameterCount; i++) {
    chrome.storage.local.get(["inputStart" + i], function (result) {
      var userValue = null
      if (result["inputStart" + i]) {
        userValue = result["inputStart" + i]
      }
      document.querySelectorAll("#inputStart")[i].value = userValue
    });

    chrome.storage.local.get(["inputEnd" + i], function (result) {
      var userValue = null
      if (result["inputEnd" + i]) {
        userValue = result["inputEnd" + i]
      }
      document.querySelectorAll("#inputEnd")[i].value = userValue
    });

    chrome.storage.local.get(["inputStep" + i], function (result) {
      var userValue = null
      if (result["inputStep" + i]) {
        userValue = result["inputStep" + i]
      }
      document.querySelectorAll("#inputStep")[i].value = userValue
    });
  }
}
// Save last user inputs to storage as state
function addSaveInputEventListener(parameterCount) {
  document.querySelectorAll("#inputStart")[parameterCount].addEventListener("blur", function (e) {
    var start = "inputStart" + parameterCount
    var value = document.querySelectorAll("#inputStart")[parameterCount].value
    chrome.storage.local.set({ [start]: value });
    calculateIterations()
  });
  document.querySelectorAll("#inputEnd")[parameterCount].addEventListener("blur", function (e) {
    var end = "inputEnd" + parameterCount
    var value = document.querySelectorAll("#inputEnd")[parameterCount].value
    chrome.storage.local.set({ [end]: value });
    calculateIterations()
  });
  document.querySelectorAll("#inputStep")[parameterCount].addEventListener("blur", function (e) {
    var step = "inputStep" + parameterCount
    var value = document.querySelectorAll("#inputStep")[parameterCount].value
    chrome.storage.local.set({ [step]: value });
    calculateIterations()
  });
}
// Save last user selected time frame(s) as state
function addSaveAutoFillSelectionListener(parameterCount) {
  document.querySelectorAll("#selectAutoFill")[parameterCount].addEventListener("change", async (event) => {
    let key = "selectAutoFill" + parameterCount
    let value = event.target.value
    let selectedText = event.target.options[event.target.selectedIndex].text;
    let tvParameter = await storageGetTvParameter(value)

    switch (tvParameter.type) {
      case ParameterType.Checkbox:
        transformInput({
          type: ParameterType.Checkbox,
          parameterIndex: parameterCount,
          parameterName: selectedText,
        });
        break;
      case ParameterType.Selectable:
        transformInput({
          type: ParameterType.Selectable,
          parameterIndex: parameterCount,
          parameterName: selectedText,
          parameterOptions: tvParameter.options,
        });
        break;
      case ParameterType.Numeric:
        transformInput({
          type: ParameterType.Numeric,
          parameterIndex: parameterCount,
          parameterName: selectedText,
        });
        break;
    }

    chrome.storage.local.set({ [key]: value });
    // timeout > 0.2s after input transformation is essential due to transition effect
    setTimeout(() => {
      calculateIterations()
    }, 250);


  });
}
// Dynamically change html body size 
function addTabEventListeners() {
  document.querySelector("#reports-tab").addEventListener("click", function () {
    document.body.style.width = '720px'
  })

  document.querySelector("#home-tab").addEventListener("click", function () {
    document.body.style.width = '560px'
  })

  document.querySelector("#profile-tab").addEventListener("click", function () {
    document.body.style.width = '560px'
  })
}
// Refresh table data with refresh button
function addRefreshDataEventListener() {
  document.querySelector("#refresh").addEventListener("click", function () {
    createReportTable()
  })
}

function calculateIterations() {
  let totalIterations = 1
  let isIterationValid = false
  let parameters = document.querySelectorAll("#parameters #content")
  let parameterCount = parameters.length

  let iterationValue = document.querySelector("#iteration #value")

  for (let i = 0; i < parameterCount; i++) {
    // check if parameter is numeric or others
    let checkbox = parameters[i].querySelector("#divCheckbox")
    let isCheckbox = window.getComputedStyle(checkbox).display != 'none'

    let selectParameter = parameters[i].querySelector("#divSelectParameter")
    let isSelectParameter = window.getComputedStyle(selectParameter).display != 'none'

    if (isCheckbox) {
      totalIterations *= 2
      isIterationValid = true
      continue
    } else if (isSelectParameter) {
      let selectedOptions = selectParameter.querySelector("#selectParameter")
      let selectedCount = [...selectedOptions.options].filter(opt => opt.selected).length;

      if (selectedCount != 0) {
        totalIterations *= selectedCount
        isIterationValid = true
      }
      continue
    }

    var inputStart = parameters[i].querySelector("#inputStart").value.trim()
    var inputEnd = parameters[i].querySelector("#inputEnd").value.trim()
    var inputStep = parameters[i].querySelector("#inputStep").value.trim()

    var err = validateParameterValues(inputStart, inputEnd, inputStep)
    if (err != null) {
      isIterationValid = false
      break
    }

    let difference = inputEnd - inputStart
    if (isDivisible(difference, inputStep)) {
      totalIterations *= (inputEnd - inputStart) / inputStep + 1
    } else {
      totalIterations *= customCeil((inputEnd - inputStart) / inputStep) + 1
    }

    isIterationValid = true
  };

  if (isIterationValid) {
    iterationValue.innerText = totalIterations
  } else {
    iterationValue.innerText = "-"
  }
}

// Create user inputs message, return err.message if validation fails 
async function CreateUserInputsMessage(userInputs) {
  let parameters = document.querySelectorAll("#parameters #wrapper")

  let isPlusUser = await storageIsPlusUser()

  let parameterCount = parameters.length
  let firstAutoFillOptions = parameters[0].querySelector("#selectAutoFill").options.length

  let tvParameters = await storageGetTvParameters()
  let numericTvParameters;

  // at least 1 numeric input is required 
  let containsNumericInput = false

  // retrieve numericParameters for free users
  if (!isPlusUser && firstAutoFillOptions <= 1) {
    numericTvParameters = await executeGetNumericTvParameters()
  }

  for (let i = 0; i < parameterCount; i++) {
    let parameterIndex = parameters[i].querySelector("#selectAutoFill").selectedIndex - 1
    let parameterName = parameters[i].querySelector("#selectAutoFill").selectedOptions[0].innerText
    let parameterType = ParameterType.Numeric

    // plus user check & apply respective configuration 
    if (isPlusUser && firstAutoFillOptions > 1) {
      parameterType = tvParameters[parameterIndex].type
    }

    // no selection for parameter name, autofill parameter name in order for plus users 
    if (parameterIndex == -1 && firstAutoFillOptions > 1) {
      parameterName = tvParameters[i].name
    }
    // free user & autoFill feature is not active
    if (!isPlusUser && firstAutoFillOptions <= 1) {
      if (i >= numericTvParameters.length) {
        return new Error("missing-parameters")
      }
      parameterName = null
      parameterIndex = numericTvParameters[i].parameterIndex
    }

    switch (parameterType) {
      case ParameterType.Numeric:
        let inputStart = parameters[i].querySelector("#inputStart").value
        let inputEnd = parameters[i].querySelector("#inputEnd").value
        let inputStep = parameters[i].querySelector("#inputStep").value

        var err = validateParameterValues(inputStart, inputEnd, inputStep)
        if (err != null) {
          return err
        }
        userInputs.parameters.push({
          start: inputStart,
          end: inputEnd,
          stepSize: inputStep,
          parameterIndex: parameterIndex,
          parameterName: parameterName,
          type: parameterType
        })
        containsNumericInput = true
        break;
      case ParameterType.Checkbox:
        userInputs.parameters.push({
          parameterIndex: parameterIndex,
          parameterName: parameterName,
          type: parameterType
        })
        break;
      case ParameterType.Selectable:
        let selectParameter = parameters[i].querySelector("#selectParameter")
        let selectedValues = Array.from(selectParameter.selectedOptions).map(option => option.value);
        if (selectedValues.length == 0) {
          return new Error("missing-parameters")
        }
        userInputs.parameters.push({
          parameterIndex: parameterIndex,
          parameterName: parameterName,
          type: parameterType,
          options: selectedValues
        })
        break;
    }
  }
  if (!containsNumericInput) {
    return new Error("numeric-parameter-required")
  }

  var selected = []
  $('#selectTimeFrame option:selected').each(function () {
    selected.push([$(this).val(), $(this).data('order')]);
  });

  if (selected.length > 0) {
    userInputs.timeFrames = selected
  }

  return null
}

function UpdateStrategyReportRow(strategyId, maxProfit) {
  let row = document.querySelector(`[data-uniqueid*='${strategyId}']`)
  if (row == null) {
    // refresh table from scratch due to first iteration is missing
    createReportTable()
    return
  }

  let $table = $('#table')
  $table.bootstrapTable('updateByUniqueId', {
    id: strategyId,
    row: {
      "maxProfit": maxProfit
    }
  })
  row = document.querySelector(`[data-uniqueid*='${strategyId}']`)
  flashUpdatedRow(row)
}

async function storageIsPlusUser() {
  let isPlusUserObj = await chrome.storage.local.get("isPlusUser")
  return isPlusUserObj?.isPlusUser
}

async function storageGetTvParameters() {
  let tvParametersObj = await chrome.storage.local.get("tvParameters")
  return tvParametersObj?.tvParameters
}

async function storageGetTvParameter(index) {
  let tvParametersObj = await chrome.storage.local.get("tvParameters")
  return tvParametersObj?.tvParameters[index]
}

async function executeGetNumericTvParameters() {
  let result;
  await getCurrentTab().then(async (tab) => {
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: getNumericTvParameters,
      })
      .then(injectionResults => {
        if (injectionResults.length > 0) {
          result = injectionResults[0]?.result
        }
      });
  });
  return result
}

// getNumericTvInputs prepares only numeric inputs for free user flow
function getNumericTvParameters() {
  let numericTvParameters = []
  let parameterIndex = 0
  let parameterNameElements = document.querySelectorAll("div[data-name='indicator-properties-dialog'] div[class*='content'] div");

  for (let i = 0; i < parameterNameElements.length; i++) {
    let className = parameterNameElements[i].className;
    let parameterName = parameterNameElements[i].innerText;

    // handle selectable and numeric parameters
    if (className.includes("cell") && className.includes("first")) {
      let selectableParameter = parameterNameElements[i].nextSibling?.querySelector("button[role='combobox']");
      let numericParameter = parameterNameElements[i].nextSibling?.querySelector("input[inputmode*='numeric' i]");
      let stringParameter = parameterNameElements[i].nextSibling?.querySelector("input[maxlength*='4096' i]");
      let dateParameter = parameterNameElements[i].nextSibling?.querySelector("div[class*='datePicker' i]");
      let colorParameter = parameterNameElements[i].nextSibling?.querySelector("div[class*='colorPicker' i]");

      if (selectableParameter != null) {
        parameterIndex++
      } else if (numericParameter != null) {
        numericTvParameters.push({
          type: "Numeric",
          name: parameterName,
          parameterIndex: parameterIndex
        });
        parameterIndex++
      } else if (dateParameter != null) {
        parameterIndex++
      } else if (colorParameter != null) {
        parameterIndex++
      }else if (stringParameter != null){
        parameterIndex++
      }
    } // handle checkboxes
    else if (className.includes("cell") && className.includes("fill") && !className.includes("checkableTitle")) {
      parameterIndex++
    }
  }

  return numericTvParameters
}

function flashUpdatedRow(row) {
  // 1) Cancel any existing flash animation on this row
  if (row._flashAnim) {
    row._flashAnim.cancel();
  }

  // 2) Kick off a new background-color animation
  const anim = row.animate([
    { backgroundColor: '#82caff' },   // start color
    { backgroundColor: 'transparent' } // end
  ], {
    duration: 1000,
    easing: 'ease-out',
    fill: 'forwards'
  });

  // 3) Clean up when it finishes or is cancelled
  anim.onfinish = anim.oncancel = () => {
    row.style.backgroundColor = '';
    delete row._flashAnim;
  };

  // 4) Store the animation on the row so we can cancel it next time
  row._flashAnim = anim;
}

// plus membership
async function GetMembershipInfo(userEmail) {

  const opGetMembershipInfoURL = "https://api-stg.optipie.app/api/v1/user/membership/"
  var request = opGetMembershipInfoURL + userEmail
  // Make a GET request to auth api
  var user = await fetch(request)
    .then(response => {
      if (!response.ok) {
        if (response.status === 404) {
          return {
            data: {
              email: userEmail,
              is_membership_active: false,
            }
          }
        }
        else {
          throw new Error('Network response was not ok');
        }
      }
      return response.json();
    })
    .then(response => {
      return response.data
    })
    .catch(error => {
      console.error("Error: ", error)
      return null
    });

  return user;
}
// Timeframe mapping from long to short name
var TimeFrameMap = new Map([
  ['1 second', '1s'],
  ['5 seconds', '5s'],
  ['10 seconds', '10s'],
  ['15 seconds', '15s'],
  ['30 seconds', '30s'],
  ['1 minute', '1m'],
  ['2 minutes', '2m'],
  ['3 minutes', '3m'],
  ['5 minutes', '5m'],
  ['10 minutes', '10m'],
  ['15 minutes', '15m'],
  ['30 minutes', '30m'],
  ['45 minutes', '45m'],
  ['1 hour', '1h'],
  ['2 hours', '2h'],
  ['3 hours', '3h'],
  ['4 hours', '4h'],
  ['1 day', 'D'],
  ['1 week', 'W'],
  ['1 month', 'M'],
  ['3 months', '3M'],
  ['6 months', '6M'],
  ['12 months', '12M'],
]);

//#region Helpers 

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

function hideSkeleton(elementToShow, skeletonId) {
  document.getElementById("skeleton-" + skeletonId).style.display = 'none'
  document.getElementById(elementToShow).style.display = 'block'
}

function showSkeleton(elementToHide, skeletonId) {
  document.getElementById("skeleton-" + skeletonId).style.display = 'block'
  document.getElementById(elementToHide).style.display = 'none'
}

function showWithTransition(el, displayType = "block") {
  el.style.display = displayType;
  el.classList.add("with-transition");

  // Force reflow to kick off transition
  void el.offsetWidth;

  el.classList.add("show");
}

// hideElement along with transition class
function hideElement(el) {
  el.classList.remove("show", "with-transition");
  el.style.display = "none";
}


function isNumeric(str) {
  if (typeof str != "string") {
    return false
  }
  return !isNaN(str) &&
    !isNaN(parseFloat(str))
}

// validateParameterValues returns specific error if validation fails 
function validateParameterValues(inputStart, inputEnd, inputStep) {
  if (!isNumeric(inputStart) || !isNumeric(inputEnd) || !isNumeric(inputStep)) {
    return new Error("missing-parameters")
  }

  var start = parseFloat(inputStart)
  var end = parseFloat(inputEnd)
  var step = parseFloat(inputStep)

  if (start >= end || step <= 0) {
    return new Error("wrong-parameter-values")
  }

  return null
}

function isDivisible(a, b) {
  if (b === 0) {
    return false;
  }
  return a % b === 0;
}

// customCeil to mitigate js floating arithmetic problem
function customCeil(value, precision = 5) {
  const rounded = Math.round(value * precision) / precision;
  return Number.isInteger(rounded) ? rounded : Math.ceil(rounded);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function dateSorter(a, b) {
  var aa = new Date(a)
  var bb = new Date(b)
  return aa - bb
}

// Reference: https://stackoverflow.com/questions/39245488/event-path-is-undefined-running-in-firefox
function eventPath(evt) {
  var path = (evt.composedPath && evt.composedPath()) || evt.path,
    target = evt.target;

  if (path != null) {
    // Safari doesn't include Window, but it should.
    return (path.indexOf(window) < 0) ? path.concat(window) : path;
  }

  if (target === window) {
    return [window];
  }

  function getParents(node, memo) {
    memo = memo || [];
    var parentNode = node.parentNode;

    if (!parentNode) {
      return memo;
    }
    else {
      return getParents(parentNode, memo.concat(parentNode));
    }
  }

  return [target].concat(getParents(target), window);
}

//#endregion

//#region Settings Management

// Initialize settings on popup load
async function initializeSettings() {
  const settings = await chrome.storage.sync.get("settings");
  const isLongRunningOptimizations = settings?.settings?.isLongRunningOptimizations || false;

  // Set checkbox state
  const checkbox = document.getElementById("longRunningOptimizations");
  if (checkbox) {
    checkbox.checked = isLongRunningOptimizations;
  }
}

// Save settings to chrome.storage.sync
async function saveSettings(settingsObj) {
  await chrome.storage.sync.set({ settings: settingsObj });
}

// Prevent settings dropdown from closing when clicking inside it
const settingsDropdown = document.querySelector('#settingsDropdown + .dropdown-menu');
if (settingsDropdown) {
  settingsDropdown.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

// Add event listener for long-running optimizations toggle
const longRunningOptCheckbox = document.getElementById("longRunningOptimizations");
if (longRunningOptCheckbox) {
  longRunningOptCheckbox.addEventListener("change", async (event) => {
    const currentSettings = await getSettings();
    currentSettings.isLongRunningOptimizations = event.target.checked;
    await saveSettings(currentSettings);
  });
}

// Initialize settings when popup loads
initializeSettings();

//#endregion