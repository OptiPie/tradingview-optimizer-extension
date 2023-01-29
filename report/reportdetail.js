const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});

let strategyID = params.strategyID; 

chrome.storage.local.get("report-data-" + strategyID, function (item) {
  var reportDetailData = []
  var values = Object.values(item)[0].reportData

  for (const [key, value] of Object.entries(values)){
    var reportDetail = {
      "parameters" : key,
      "netProfitAmount" : value.netProfit.amount,
      "netProfitPercent": value.netProfit.percent,
      "closedTrades": value.closedTrades,
      "percentProfitable": value.percentProfitable,
      "profitFactor": value.profitFactor,
      "maxDrawdownAmount": value.maxDrawdown.amount,
      "maxDrawdownPercent": value.maxDrawdown.percent,
      "averageTradeAmount": value.averageTrade.amount,
      "averageTradePercent": value.averageTrade.percent,
      "avgerageBarsInTrades": value.avgerageBarsInTrades,
    }
    reportDetailData.push(reportDetail)
  }

  var $table = $('#table')
  $table.bootstrapTable('showLoading')

  setTimeout(() => {
    $table.bootstrapTable('load', reportDetailData)
    $table.bootstrapTable('hideLoading')  
  }, 250);
  

});

// CustomSort function to handle non numeric chars and dash/hyphen confusion
function customSort(sortName, sortOrder, data) {
  var order = sortOrder === 'desc' ? -1 : 1
  data.sort(function (a, b) {
      var aa = ""
      var bb = ""
      // Check if number is negative with regex, rebuild and remove non-numeric chars
      if(a[sortName].charAt(0).match(/\D/) != null ){
        aa = '-' + a[sortName].substring(1, a[sortName].length)
        aa = +((aa + '').replace(/[^0-9.-]+/g,""))
      }else{
        aa = +((a[sortName] + '').replace(/[^0-9.-]+/g,""))
      }
      
      if(b[sortName].charAt(0).match(/\D/) != null ){
        bb = '-' + b[sortName].substring(1, b[sortName].length)
        bb = +((bb + '').replace(/[^0-9.-]+/g,""))
      }else{
        bb = +((b[sortName] + '').replace(/[^0-9.-]+/g,""))
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