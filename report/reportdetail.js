const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});

let strategyID = params.strategyID;

// update non-functional UI components for free/plus users
updateUserUI();

chrome.storage.local.get("report-data-" + strategyID, function (item) {
  var reportDetailData = []
  var timePeriodValue = Object.values(item)[0].timePeriod
  var values = Object.values(item)[0].reportData
  var detailedParameters = Object.values(values)[0].detailedParameters
  var timePeriod = document.querySelector("#timePeriod")
  timePeriod.textContent = timePeriodValue
  
  for (const [key, value] of Object.entries(values)) {
    var reportDetail = {
      "parameters": key,
      "netProfitAmount": value.netProfit.amount,
      "netProfitPercent": value.netProfit.percent,
      "maxDrawdownAmount": value.maxDrawdown.amount,
      "maxDrawdownPercent": value.maxDrawdown.percent,
      "closedTrades": value.closedTrades,
      "percentProfitable": value.percentProfitable,
      "profitFactor": value.profitFactor,
      "averageTradeAmount": value.averageTrade.amount,
      "averageTradePercent": value.averageTrade.percent,
      "avgerageBarsInTrades": value.avgerageBarsInTrades,
    }
    value.detailedParameters.forEach((element, index) => {
      index += 1
      reportDetail['parameter' + index] = element.value
    });
    reportDetailData.push(reportDetail)
  }
  var $table = $('#table')
  $table.bootstrapTable('showLoading')

  setTimeout(() => {
    $table.bootstrapTable('load', reportDetailData)
    $table.bootstrapTable('hideLoading')
    hideDropDownParameters()
    detailedParameters.forEach((detailedParameter, index) => {
      var parameterName = `parameter${index + 1}`
      $table.bootstrapTable('showColumn', parameterName);
      $table.bootstrapTable('updateColumnTitle', {
        field: parameterName,
        title: detailedParameter.name
      })
      // update drop down parameter names accordingly and make them visible again
      document.querySelector(`input[data-field='${parameterName}']`).nextElementSibling.innerText = detailedParameter.name
      document.querySelector(`input[data-field='${parameterName}']`).parentElement.style.display = 'block'
    });
  }, 250);
  const $downloadReportButton = $('#download-report')

  $downloadReportButton.click(function () {
    downloadCSVReport(reportDetailData)
  })
});

// hides all drop down parameters initially
function hideDropDownParameters() {
  var dropdownLabels = document.querySelectorAll(".dropdown-menu-right label")
  for (let i = 0; i < dropdownLabels.length; i++) {
    var label = dropdownLabels[i]
    // omit all parameters columnn
    if (label.querySelector("input").getAttribute("data-field") == 'parameters') {
      continue;
    }
    // hide parameters on initial phase
    if (label.querySelector("input").getAttribute("data-field").startsWith("parameter")) {
      label.style.display = 'none'
    }
  }
}

// non-functional UI changes made with storage
function updateUserUI(){
  chrome.storage.local.get("isPlusUser", ({ isPlusUser }) => {
    if(isPlusUser){
      // show plus logo
      var logo = document.getElementById("normalLogo")
      logo.style.cssText = 'display:none !important';
      var plusLogo = document.getElementById("plusLogo")
      plusLogo.style.cssText = 'display:block !important'
      // remove plus upgrade button 
      var plusUpgrade = document.getElementById("plusUpgrade")
      plusUpgrade.style.display = 'none'
    }else{
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

function downloadCSVReport(reportDetailData) {
  const csv = convertReportToCSV(reportDetailData)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `report-${strategyID}.csv`);

  link.click();
}

function convertReportToCSV(reportDetailData) {
  const keys = Object.keys(reportDetailData[0]);
  var result = keys.map((key) => {
    return key.toUpperCase();
  }).join(",") + "\n";

  for (var i = 0; i < reportDetailData.length; i++) {
    var line = [];
    for (var j = 0; j < keys.length; j++) {
      var value = reportDetailData[i][keys[j]];
      // Enclose the value with "" if contains comma, to preserve format
      if (typeof value === 'string' && value.indexOf(',') !== -1) {
        value = '"' + value + '"';
      }
      line.push(value);
    }
    result += line.join(",") + "\n";
  }
  return result;
}

// CustomSort function to handle non numeric chars and dash/hyphen confusion
function customSort(sortName, sortOrder, data) {
  var order = sortOrder === 'desc' ? -1 : 1
  data.sort(function (a, b) {
    var aa = ""
    var bb = ""
    // Check if number is negative with regex, rebuild and remove non-numeric chars
    if (a[sortName].charAt(0).match(/\D/) != null && a[sortName].charAt(0) != '+') {
      aa = '-' + a[sortName].substring(1, a[sortName].length)
      aa = +((aa + '').replace(/[^0-9.-]+/g, ""))
    } else {
      aa = +((a[sortName] + '').replace(/[^0-9.-]+/g, ""))
    }

    if (b[sortName].charAt(0).match(/\D/) != null && b[sortName].charAt(0) != '+') {
      bb = '-' + b[sortName].substring(1, b[sortName].length)
      bb = +((bb + '').replace(/[^0-9.-]+/g, ""))
    } else {
      bb = +((b[sortName] + '').replace(/[^0-9.-]+/g, ""))
    }

    if (aa < bb) {
      return order * -1
    }
    if (aa > bb) {
      return order
    }
    return 0
  })
}
