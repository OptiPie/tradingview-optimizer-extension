const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});
let wfaID = params.wfaID;

// TODO: replace mock with real chrome.storage.local.get("wfa-" + wfaID)
// DUMMY: inSample/outSample point at real existing report-data-* ids so the iframes render live.
// IS/OOS are staggered so toggling on a window swaps between two different real reports.
const wfaReport = {
  wfaID: wfaID || "mock",
  strategyName: "EMA Cross",
  symbol: "BTCUSDT",
  timePeriod: "1h",
  config: { isPct: 70, oosPct: 30 },
  windows: [
    { inSample: "1781214860323", outSample: "1781037527038", winner: { params: "50, 10", isProfit: "+22%", oosProfit: "+6%" } },
    { inSample: "1781037527038", outSample: "1781037394175", winner: { params: "48, 12", isProfit: "+18%", oosProfit: "+4%" } },
    { inSample: "1781037394175", outSample: "1780856826531", winner: { params: "52, 8", isProfit: "+25%", oosProfit: "-2%" } },
    { inSample: "1780856826531", outSample: "1781214860323", winner: { params: "50, 10", isProfit: "+20%", oosProfit: "+8%" } }
  ]
}

let currentPage = "summary"   // "summary" or a 0-based window index
let currentSample = "is"      // "is" | "oos"

const summaryEl = document.getElementById("wfaSummary")
const windowEl = document.getElementById("wfaWindow")
const frameEl = document.getElementById("wfaReportFrame")

// pager: Summary + one numbered page per window
function buildPager() {
  const pager = document.getElementById("wfaPager")
  pager.appendChild(makePagerItem("Summary", "summary"))
  wfaReport.windows.forEach((_, i) => pager.appendChild(makePagerItem(String(i + 1), i)))
}

function makePagerItem(label, page) {
  const li = document.createElement("li")
  li.className = "page-item"
  const a = document.createElement("a")
  a.className = "page-link"
  a.href = "#"
  a.textContent = label
  a.addEventListener("click", (e) => {
    e.preventDefault()
    goToPage(page)
  })
  li.appendChild(a)
  return li
}

function goToPage(page) {
  currentPage = page
  // active state: pager item 0 = summary, items 1..n = windows
  document.querySelectorAll("#wfaPager .page-item").forEach((li, idx) => {
    const isActive = (page === "summary" && idx === 0) || (page === idx - 1)
    li.classList.toggle("active", isActive)
  })
  if (page === "summary") {
    summaryEl.style.display = "block"
    windowEl.style.display = "none"
    return
  }
  summaryEl.style.display = "none"
  windowEl.style.display = "block"
  // every window opens on its in-sample view by default
  currentSample = "is"
  document.getElementById("wfaSampleIs").checked = true
  loadFrame()
}

// point the iframe at the current window's IS or OOS child report
function loadFrame() {
  const w = wfaReport.windows[currentPage]
  const id = currentSample === "is" ? w.inSample : w.outSample
  frameEl.src = `reportdetail.html?strategyID=${id}&embedded=1`
}

// iframes don't auto-size to content (they're replaced elements) — measure and set the height
// ourselves so the page has ONE scrollbar, not a nested one. ResizeObserver catches the report's
// async table render + later height changes (search / paginate / sort). Works because same-origin.
let frameResizeObserver = null
frameEl.addEventListener("load", () => {
  if (frameResizeObserver) frameResizeObserver.disconnect()
  const doc = frameEl.contentDocument
  if (!doc) return
  const fit = () => { frameEl.style.height = doc.documentElement.scrollHeight + "px" }
  frameResizeObserver = new ResizeObserver(fit)
  frameResizeObserver.observe(doc.body)
  fit()
})

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

document.querySelectorAll('input[name="wfaSample"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    currentSample = radio.id === "wfaSampleOos" ? "oos" : "is"
    loadFrame()
  })
})

// --- Summary (page 1) ---------------------------------------------------------
// "+22%" -> 22, "-2%" -> -2 ; robust to the leading + and the trailing %
function parseProfit(s) { return parseFloat(String(s).replace(/[^0-9.\-]/g, "")) || 0 }
function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }
function fmtSignedPct(v) { return (v >= 0 ? "+" : "") + v.toFixed(1) + "%" }

function renderSummary() {
  const { windows, config } = wfaReport
  const total = windows.length
  const isVals = windows.map(w => parseProfit(w.winner.isProfit))
  const oosVals = windows.map(w => parseProfit(w.winner.oosProfit))
  const avgIs = avg(isVals)
  const avgOos = avg(oosVals)
  const profitable = oosVals.filter(v => v > 0).length
  // Pardo WFE (length-normalized): (avgOOS / avgIS) x (isPct / oosPct); meaningless if avg IS <= 0
  const wfe = avgIs > 0 ? (avgOos / avgIs) * (config.isPct / config.oosPct) : null

  // pills live in the HTML; JS only fills their text
  document.getElementById("metaSymbol").textContent = wfaReport.symbol
  document.getElementById("metaTimeframe").textContent = wfaReport.timePeriod
  document.getElementById("metaStrategy").textContent = wfaReport.strategyName
  document.getElementById("metaSplit").textContent = `${config.isPct} / ${config.oosPct} split`
  document.getElementById("metaWindows").textContent = `${total} windows`

  const avgOosEl = document.getElementById("kpiAvgOos")
  avgOosEl.textContent = fmtSignedPct(avgOos)
  avgOosEl.classList.add(avgOos >= 0 ? "text-success" : "text-danger")
  document.getElementById("kpiProfitable").textContent =
    `${profitable}/${total} (${Math.round(profitable / total * 100)}%)`
  document.getElementById("kpiWfe").textContent = wfe === null ? "—" : wfe.toFixed(2)

  const rows = document.getElementById("wfaWindowRows")
  const rowTemplate = document.getElementById("wfaRowTemplate")
  windows.forEach((w, i) => {
    const tr = rowTemplate.content.firstElementChild.cloneNode(true)
    tr.querySelector('[data-cell="window"]').textContent = i + 1
    tr.querySelector('[data-cell="params"]').textContent = w.winner.params
    tr.querySelector('[data-cell="is"]').textContent = w.winner.isProfit
    const oos = tr.querySelector('[data-cell="oos"]')
    oos.textContent = w.winner.oosProfit
    oos.classList.add(parseProfit(w.winner.oosProfit) >= 0 ? "text-success" : "text-danger")
    // clicking a breakdown row jumps straight to that window (same as the pager)
    tr.addEventListener("click", () => goToPage(i))
    rows.appendChild(tr)
  })
}

// update non-functional UI components for free/plus users
updateUserUI()
buildPager()
renderSummary()
goToPage("summary")
