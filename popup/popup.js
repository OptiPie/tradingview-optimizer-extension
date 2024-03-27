// Popup action event types
const lockOptimizeButton = 'lockOptimizeButton'
const unlockOptimizeButton = 'unlockOptimizeButton'
const getParameterNames = 'getParameterNames'

let optimize = document.getElementById("optimize");
let addParameter = document.getElementById("addParameter");

// Initialize popup html according to last user parameter count state
chrome.storage.local.get("userParameterCount", ({ userParameterCount }) => {
  for (let i = 1; i < userParameterCount; i++) {
    addParameterBlock()
  }
  setLastUserParameters(userParameterCount)
});

// Tab event listeners to change body width 
addTabEventListeners()

// Save Inputs EventListener for first parameters as default
addSaveInputEventListener(0)

// Add Parameter Button Event Listener
addParameter.addEventListener("click", async () => {
  addParameterBlock()
});

// Add start optimize event listener
optimize.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  var userInputs = new Object({
    parameters : [],
    timeFrames: [],
  })
  // err is handled as value
  var err = await CreateUserInputsMessage(userInputs)

  if (err.message == '') {
    chrome.storage.local.set({ "userInputs": userInputs });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['injector.js']
    });
  } else if (err.message === 'missing-parameters') {
    chrome.runtime.sendMessage({
      notify: {
        type: "warning",
        content: "Fill all parameter inputs accordingly & Use dot '.' decimal separator"
      }
    });
  } else if (err.message === 'wrong-parameter-values') {
    chrome.runtime.sendMessage({
      notify: {
        type: "warning",
        content: "'Start' value must be less than 'End' value"
      }
    });
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  var properties = Object.keys(message)
  var values = Object.values(message)
  // popupAction type defines popup html UI actions according to event type
  if (properties[0] === 'popupAction') {
    var popupAction = values[0]
    switch (popupAction.event) {
      case lockOptimizeButton:
        document.querySelector("#optimize").setAttribute("disabled", "")
        break;
      case unlockOptimizeButton:
        document.querySelector("#optimize").removeAttribute("disabled", "")
        break;
      case getParameterNames:
        autoFillParameters(popupAction.message.parameterNames);
        break;
    }
  }
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
          "maxprofit": value.maxProfit,
          "detail": reportDetailHtml(value.strategyID)
        }
        reportData.push(report)
      }
    }
    var $table = $('#table')
    $table.bootstrapTable({ data: reportData })
    $table.bootstrapTable('load', reportData)
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

injectPlusFeatures()

function injectPlusFeatures() {
  var user = GetMembershipInfo()
  if (user.is_membership_active) {
    getCurrentTab().then(function (tab) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['plus-injector.js']
      });
    })

    let stopOptimization = document.getElementById("stop")
    stopOptimization.addEventListener("click", async (clickEvent) => {
      getCurrentTab().then(function (tab) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: stopOptimizationEvent,
          args: [JSON.stringify(clickEvent)],
        });
      })
      stopOptimization.setAttribute("disabled", "")
    })
    stopOptimization.style.display = 'block'

    $('#selectTimeFrame').multiselect({
      buttonClass: 'form-select',
      templates: {
        button: '<button type="button" class="multiselect dropdown-toggle" data-bs-toggle="dropdown"><span class="multiselect-selected-text"></span></button>',
      },
      buttonWidth: '85.75px',
      nonSelectedText: 'Time',
      maxHeight: "270",
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
      }
    });
  } else {
    chrome.storage.local.set({ "parameterNames": null });
  }
}

// dispatch stop optimization event for plus users by clicking stop button
function stopOptimizationEvent(clickEvent) {
  var event = JSON.parse(clickEvent)
  var evt = new CustomEvent("StopOptimizationEvent", {
    detail: {
      event: event
    }
  });
  window.dispatchEvent(evt);
}


async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

function autoFillParameters(parameterNames) {
  if (parameterNames.length < 1) {
    chrome.storage.local.set({ "parameterNames": null });
    return
  }
  // hide labels, show selectors
  var labels = document.querySelectorAll('label[for="inputStart"]')
  labels.forEach(label => {
    label.style.display = 'none'
  });

  var autoFillSelects = document.querySelectorAll("#selectAutoFill")
  for (let i = 0; i < autoFillSelects.length; i++) {
    const autoFillSelect = autoFillSelects[i];
    if (autoFillSelect.options.length > 1) {
      continue;
    }
    autoFillSelect.style.display = 'inline-block'
    for (var j = 0; j < parameterNames.length; j++) {
      var parameterName = parameterNames[j];
      var parameterNameIndex = j;
      let option = new Option(parameterName, parameterNameIndex);
      autoFillSelect.add(option);
    }
    // default selection by paramaeter order
    autoFillSelect.selectedIndex = i + 1
  }
  chrome.storage.local.set({ "parameterNames": parameterNames });
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
      document.getElementById("skeleton").style.display = 'none'
      document.getElementById("login").style.display = 'block'
    }, 250);
    return
  }
  var userInfo;
  userInfo = await getUserInfo(token)
  setTimeout(() => {
    document.getElementById("skeleton").style.display = 'none'
    document.getElementById("profile").style.display = 'block'
  }, 250);
  document.getElementById("userEmail").innerText = userInfo.email
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
    console.log(response)
  })
});

let logoutButton = document.getElementById("logoutButton");
logoutButton.addEventListener("click", async () => {
  document.getElementById("skeleton").style.display = 'block'
  document.getElementById("profile").style.display = 'none'
  chrome.runtime.sendMessage({ type: "getAuthToken", isInteractive: false }, function (response) {
    var url = 'https://accounts.google.com/o/oauth2/revoke?token=' + response.token;
    window.fetch(url);
  })

  chrome.runtime.sendMessage({ type: "clearAllCachedAuthTokens" })
  setTimeout(() => {
    document.getElementById("skeleton").style.display = 'none'
    document.getElementById("login").style.display = 'block'
  }, 250);
});


//#endregion

function addParameterBlock() {
  var parameters = document.getElementById("parameters")
  var parameterCount = parameters.children.length

  if (parameterCount < 4) {
    // Hide Last Remove Div for added parameters
    if (parameterCount > 1) {
      var removeDiv = "#remove" + parameterCount + ""
      parameters.lastElementChild.querySelector(removeDiv).style = 'display:none;'
    }

    // Add Parameter Block
    var orderOfParameter = parameterCount + 1
    var divToAppend = addParameterBlockHtml(orderOfParameter)
    parameters.insertAdjacentHTML('beforeend', divToAppend)

    // Enable auto fill plus feature if eligible  
    setTimeout(() => {
      chrome.storage.local.get("parameterNames", ({ parameterNames }) => {
        if (parameterNames != null && parameterNames.length > 0) {
          autoFillParameters(parameterNames)
        }
      });
    }, 250);

    // Increment User's Last Parameter Count State    
    chrome.storage.local.set({ "userParameterCount": parameterCount + 1 });

    // Add Remove Button Event Listener
    addRemoveParameterBlockEventListener(parameterCount)

    // Save Inputs EventListener for rest of the parameters
    addSaveInputEventListener(parameterCount)
  }
}

function addParameterBlockHtml(orderOfParameter) {
  return '<div class="row g-2 pb-2">\
    <div class="col-8">\
      <label for="inputStart" class="form-label">' + orderOfParameter + '. Parameter</label>\
      <select class="form-select-sm" aria-label="Select Parameter" id="selectAutoFill">\
      <option selected disabled>Select Parameter</option>\
    </select>\
      <div class="input-group input-group">\
        <input type="text" aria-label="Start" placeholder="Start" class="form-control" id="inputStart">\
        <input type="text" aria-label="End" placeholder="End" class="form-control" id="inputEnd">\
      </div>\
    </div>\
    <div class="col-4 mt-auto">\
      <div class="text-end" id="remove' + orderOfParameter + '">\
        <label for="close" class="form-label text-muted">Remove</label>\
        <button type="button" class="btn-close align-text-top remove-parameters" aria-label="Close"></button>\
      </div>\
      <input type="text" aria-label="Step" placeholder="Step" class="form-control"\
        id="inputStep">\
    </div>\
  </div>'
}

function addRemoveParameterBlockEventListener(parameterCount) {
  document.querySelectorAll(".btn-close.remove-parameters")[parameterCount - 1].addEventListener("click", async (evt) => {
    // Remove the selected row from incoming event 
    var evtPath = eventPath(evt)
    for (let i = 0; i < evtPath.length; i++) {
      const element = evtPath[i];
      if (element.className == "row g-2 pb-2") {
        element.remove()
        break;
      }
    }

    var parameters = document.getElementById("parameters")
    var parameterCount = parameters.children.length

    // Decrement User's Last Parameter Count State    
    chrome.storage.local.set({ "userParameterCount": parameterCount });
    //Clear user parameter values from storage
    var start = "inputStart" + parameterCount
    var end = "inputEnd" + parameterCount
    var step = "inputStep" + parameterCount
    chrome.storage.local.set({ [start]: null, [end]: null, [step]: null });


    //Show previously added hidden remove button
    if (parameterCount > 1) {
      var removeDiv = "#remove" + parameterCount + ""
      parameters.lastElementChild.querySelector(removeDiv).style = 'display:block;'
    }
  });
}

// Retrieve and set user parameters from last saved state
async function setLastUserParameters(parameterCount) {
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
  });
  document.querySelectorAll("#inputEnd")[parameterCount].addEventListener("blur", function (e) {
    var end = "inputEnd" + parameterCount
    var value = document.querySelectorAll("#inputEnd")[parameterCount].value
    chrome.storage.local.set({ [end]: value });
  });
  document.querySelectorAll("#inputStep")[parameterCount].addEventListener("blur", function (e) {
    var step = "inputStep" + parameterCount
    var value = document.querySelectorAll("#inputStep")[parameterCount].value
    chrome.storage.local.set({ [step]: value });
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
// Create user inputs message, return err.message if validation fails 
async function CreateUserInputsMessage(userInputs) {
  var err = new Error("")
  var parameters = document.getElementById("parameters")

  var parameterCount = parameters.children.length
  var firstAutoFillOptions = parameters.children[0].querySelector("#selectAutoFill").options.length

  var parameterNamesObj = await chrome.storage.local.get("parameterNames")

  for (let i = 0; i < parameterCount; i++) {
    var inputStart = parameters.children[i].querySelector("#inputStart").value
    var inputEnd = parameters.children[i].querySelector("#inputEnd").value
    var inputStep = parameters.children[i].querySelector("#inputStep").value
    var index = parameters.children[i].querySelector("#selectAutoFill").selectedIndex - 1
    var parameterName = parameters.children[i].querySelector("#selectAutoFill").selectedOptions[0].innerText

    if (!isNumeric(inputStart) || !isNumeric(inputEnd) || !isNumeric(inputStep)) {
      err.message = "missing-parameters"
      return err
    }

    var start = parseFloat(inputStart)
    var end = parseFloat(inputEnd)
    var step = parseFloat(inputStep)

    if (start >= end || step <= 0) {
      err.message = "wrong-parameter-values"
      return err
    }

    // no selection for parameter name, autofill parameter name in order for plus users 
    if (index == -1 && firstAutoFillOptions > 1) {
      parameterName = parameterNamesObj?.parameterNames[i]
    }

    // autoFill feature is not active
    if (firstAutoFillOptions <= 1) {
      parameterName = null
    }

    userInputs.parameters.push({ start: inputStart, end: inputEnd, stepSize: inputStep, parameterIndex: index, parameterName: parameterName })
  }
  
  var selected = []
  $('#selectTimeFrame option:selected').each(function () {
    selected.push([$(this).val(), $(this).data('order')]);
  });

  if (selected.length > 0) {
    userInputs.timeFrames = selected
  } 
  return err
}

// plus membership
function GetMembershipInfo() {
  return {
    email: "john@example.com",
    is_membership_active: false,
    is_membership_paused: false,
    is_membership_canceled: false,
  }
}

var TimeFrameMap = new Map([
  ['1 second', '1s'],
  ['5 seconds', '5s'],
  ['10 seconds', '10s'],
  ['15 seconds', '15s'],
  ['30 seconds', '30s'],
  ['1 minute', '1m'],
  ['3 minutes', '3m'],
  ['5 minutes', '5m'],
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

function isNumeric(str) {
  if (typeof str != "string") {
    return false
  }
  return !isNaN(str) &&
    !isNaN(parseFloat(str))
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