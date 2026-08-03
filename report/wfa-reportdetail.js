const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});
let wfaID = params.wfaID;

// TODO - TO BE REMOVED
chrome.storage.local.get("wfa-" + wfaID, function (item) {
  console.log(item)
})

let wfaReport   // filled from storage in the init at the bottom

let currentPage = "summary"   // "summary" or a 0-based window index
let currentSample = "is"      // "is" | "oos"

const summaryEl = document.getElementById("wfaSummary")
const windowEl = document.getElementById("wfaWindow")
const frameEl = document.getElementById("wfaReportFrame")

// pager: Summary + one numbered page per window
function buildPager() {
  const pager = document.getElementById("wfaPager")
  pager.innerHTML = "" // clear before rebuild — live updates re-run this as windows land
  pager.appendChild(makePagerItem("Summary", "summary"))
  wfaReport.windows.forEach((_, i) => pager.appendChild(makePagerItem(String(i + 1), i)))
}

// pager active state: item 0 = summary, items 1..n = windows
function highlightPager(page) {
  document.querySelectorAll("#wfaPager .page-item").forEach((li, idx) => {
    const isActive = (page === "summary" && idx === 0) || (page === idx - 1)
    li.classList.toggle("active", isActive)
  })
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
  highlightPager(page)
  // the pager is shared by both pages but they align differently: summary content sits
  // in a centered .container, window content aligns to the iframe. Let the pager borrow
  // whichever context is active instead of hunting a fixed padding.
  const pagerNav = document.getElementById("wfaPager").parentElement
  if (page === "summary") {
    summaryEl.style.display = "block"
    windowEl.style.display = "none"
    pagerNav.classList.add("container")
    pagerNav.classList.remove("ps-4")
    return
  }
  summaryEl.style.display = "none"
  windowEl.style.display = "block"
  pagerNav.classList.remove("container")
  pagerNav.classList.add("ps-4")
  // every window opens on its in-sample view by default
  currentSample = "is"
  document.getElementById("wfaSampleIs").checked = true
  loadFrame()
}

// point the iframe at the current window's IS or OOS child report
function loadFrame() {
  const w = wfaReport.windows[currentPage]
  let id = w.is?.reportID
  let range = w.is
  if (currentSample === "oos") {
    id = w.oos?.reportID
    range = w.oos
  }

  // show which dates this IS/OOS view covers, next to the sample toggle
  const rangeEl = document.getElementById("wfaSampleDateRange")
  if (range && range.start) {
    document.getElementById("wfaSampleStart").textContent = range.start
    document.getElementById("wfaSampleEnd").textContent = range.end
    rangeEl.style.display = ""
  } else {
    rangeEl.style.display = "none"
  }

  if (id == null) {
    frameEl.removeAttribute("src") // this window's OOS didn't run
    return
  }
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
  // measure body (content), not documentElement (<html> stretches to the iframe viewport, so it never shrinks)
  const fit = () => { frameEl.style.height = doc.body.scrollHeight + "px" }
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

// one-shot flash cue, self-expiring so a reused element can flash again
function flash(el) {
  el.classList.add("wfa-flash")
  el.addEventListener("animationend", () => el.classList.remove("wfa-flash"), { once: true })
}

document.querySelectorAll('input[name="wfaSample"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    currentSample = radio.id === "wfaSampleOos" ? "oos" : "is"
    loadFrame()
  })
})

// --- Summary (page 1) ---------------------------------------------------------
function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }
// signed profit amount with currency: 5309 -> "+5,309 USD", -803 -> "-803 USD"
function fmtSignedProfit(v) {
  let sign = ""
  if (v >= 0) {
    sign = "+"
  }
  let currency = ""
  if (wfaReport.currency) {
    currency = " " + wfaReport.currency
  }
  return sign + Math.round(v).toLocaleString() + currency
}

// mirror of popup.js computeWfe — update both if the formula changes
function computeWfe(avgIs, avgOos, config) {
  return (avgOos / avgIs) * (config.isPct / config.oosPct)
}

// mirror of popup.js computeProfitable
function computeProfitable(oosDone) {
  const winners = oosDone.filter(w => w.winner.oosProfit > 0).length
  return `${winners}/${oosDone.length} (${Math.round(winners / oosDone.length * 100)}%)`
}

function renderSummary() {
  const { windows, config } = wfaReport
  const total = windows.length
  // aggregates count only windows whose winner has landed — an in-flight window
  // has a reportID but no winner yet (announced up front so its report can stream)
  const isDone = windows.filter(w => w.winner?.isProfit != null)
  const oosDone = windows.filter(w => w.winner?.oosProfit != null)

  let avgIs = 0
  if (isDone.length) {
    avgIs = avg(isDone.map(w => w.winner.isProfit))
  }

  let avgOos = 0
  if (oosDone.length) {
    avgOos = avg(oosDone.map(w => w.winner.oosProfit))
  }
  // Pardo WFE (length-normalized): meaningless if avg IS <= 0
  let wfe = null
  if (avgIs > 0) {
    wfe = computeWfe(avgIs, avgOos, config)
  }

  // pills live in the HTML; JS only fills their text
  document.getElementById("metaSymbol").textContent = wfaReport.symbol
  document.getElementById("metaTimeframe").textContent = wfaReport.timePeriod
  document.getElementById("metaStrategy").textContent = wfaReport.strategyName
  document.getElementById("metaSplit").textContent = `${config.isPct} / ${config.oosPct} split`
  document.getElementById("metaWindows").textContent = `${total} windows`

  const avgOosEl = document.getElementById("kpiAvgOos")
  avgOosEl.classList.remove("text-success", "text-danger") // persistent el: clear before re-coloring on refresh
  if (oosDone.length) {
    avgOosEl.textContent = fmtSignedProfit(avgOos)
    if (avgOos >= 0) {
      avgOosEl.classList.add("text-success")
    } else {
      avgOosEl.classList.add("text-danger")
    }
  } else {
    avgOosEl.textContent = "—"
  }

  const profitableEl = document.getElementById("kpiProfitable")
  if (oosDone.length) {
    profitableEl.textContent = computeProfitable(oosDone)
  } else {
    profitableEl.textContent = "—"
  }

  const wfeEl = document.getElementById("kpiWfe")
  if (wfe === null) {
    wfeEl.textContent = "—"
  } else {
    wfeEl.textContent = wfe.toFixed(2)
  }

  const rows = document.getElementById("wfaWindowRows")
  rows.innerHTML = "" // clear before rebuild — refresh re-runs this as windows land
  const rowTemplate = document.getElementById("wfaRowTemplate")
  windows.forEach((w, i) => {
    const tr = rowTemplate.content.firstElementChild.cloneNode(true)
    const winner = w.winner || {} // in-flight window: reportID present, winner not yet
    tr.querySelector('[data-cell="window"]').textContent = i + 1

    const params = tr.querySelector('[data-cell="params"]')
    if (winner.params != null) {
      params.textContent = winner.params
    } else {
      params.textContent = "—"
    }

    const is = tr.querySelector('[data-cell="is"]')
    if (winner.isProfit != null) {
      is.textContent = fmtSignedProfit(winner.isProfit)
    } else {
      is.textContent = "—" // IS still running
    }

    const oos = tr.querySelector('[data-cell="oos"]')
    if (winner.oosProfit != null) {
      oos.textContent = fmtSignedProfit(winner.oosProfit)
      if (winner.oosProfit >= 0) {
        oos.classList.add("text-success")
      } else {
        oos.classList.add("text-danger")
      }
    } else {
      oos.textContent = "—" // OOS not run for this window
    }

    // clicking a breakdown row jumps straight to that window (same as the pager)
    tr.addEventListener("click", () => goToPage(i))
    rows.appendChild(tr)
  })
}

// --- Rolling windows staircase (page 1) ---------------------------------------
// Classic rolling walk-forward geometry (verified): IS = T / (1 + N*oosRatio),
// OOS = IS*oosRatio; windows overlap so T = IS + N*OOS. All bars share ONE time axis
// and each steps forward exactly one OOS length. Dates are DERIVED from the formula,
// not from the child report ids.
const DAY = 86400000
function fmtDate(d) { return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }) }

function makeStairDate(kind, leftPct, text) {
  const el = document.createElement("span")
  el.className = "wfa-stair-date wfa-stair-date-" + kind
  el.style.left = leftPct + "%"
  el.textContent = text
  return el
}

function renderStaircase() {
  const { windows, config, dateRange } = wfaReport
  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)
  const T = (end - start) / DAY
  const N = windows.length
  const oosRatio = config.oosPct / config.isPct
  const IS = T / (1 + N * oosRatio)
  const OOS = IS * oosRatio
  const pct = (days) => (days / T) * 100
  const dayToDate = (n) => new Date(start.getTime() + n * DAY)

  const grid = document.getElementById("wfaStairGrid")
  grid.innerHTML = "" // clear before rebuild — refresh re-runs this as windows land

  // shared month axis (every 2nd month keeps the labels readable)
  const axis = document.createElement("div")
  axis.className = "wfa-stair-axis"
  let m = new Date(start)
  while (m <= end) {
    const tick = document.createElement("div")
    tick.className = "wfa-stair-tick"
    tick.style.left = pct((m - start) / DAY) + "%"
    tick.textContent = m.toLocaleDateString("en-US", { month: "short" })
    axis.appendChild(tick)
    m = new Date(m.getFullYear(), m.getMonth() + 2, 1)
  }
  grid.appendChild(axis)

  const rowTemplate = document.getElementById("wfaStairRowTemplate")
  windows.forEach((w, i) => {
    const isStart = i * OOS
    const bound = isStart + IS
    const winEnd = bound + OOS

    const frag = rowTemplate.content.cloneNode(true)
    const track = frag.querySelector(".wfa-stair-track")
    const bar = frag.querySelector(".wfa-stair-bar")
    frag.querySelector(".wfa-stair-num").textContent = i + 1
    bar.style.left = pct(isStart) + "%"
    bar.style.width = pct(IS + OOS) + "%"
    frag.querySelector(".wfa-seg-is").style.flex = IS
    frag.querySelector(".wfa-seg-oos").style.flex = OOS
    bar.title = `Window ${i + 1}`

    // IS start (neutral) + OOS boundary (primary). A window's end is the next window's
    // boundary, so only the LAST bar labels its own end.
    track.appendChild(makeStairDate("start", pct(isStart), fmtDate(dayToDate(isStart))))
    track.appendChild(makeStairDate("bound", pct(bound), fmtDate(dayToDate(bound))))
    if (i === windows.length - 1) {
      track.appendChild(makeStairDate("end", pct(winEnd), fmtDate(dayToDate(winEnd))))
    }

    // clicking a bar jumps to that window — parity with the breakdown rows
    bar.addEventListener("click", () => goToPage(i))
    grid.appendChild(frag)
  })
}

// update non-functional UI components for free/plus users
updateUserUI()

function applyReport(report) {
  wfaReport = report
  // windows stored keyed (for injector upsert); the UI iterates them ordered
  wfaReport.windows = Object.values(wfaReport.windows || {}).sort((a, b) => a.windowIndex - b.windowIndex)
  buildPager()
  renderSummary()
  renderStaircase()
}

chrome.storage.local.get("wfa-" + wfaID, (items) => {
  const report = items["wfa-" + wfaID]
  if (report == null) return // TODO: not-found state
  applyReport(report)
  goToPage("summary")
})

// breakdown row fingerprint — changes when a window appears or its winner lands
function rowSignature(w) {
  const win = w.winner || {}
  return `${win.params ?? ""}|${win.isProfit ?? ""}|${win.oosProfit ?? ""}`
}

// live updates: injector re-broadcasts the whole parent on every window ping
chrome.runtime.onMessage.addListener((message) => {
  const popupAction = message.popupAction
  if (popupAction == null || popupAction.event !== "wfaReportUpdated") return
  if (String(popupAction.message.report.wfaID) !== wfaID) return

  // per-window row signatures BEFORE the update, to flash rows that appear or change
  const prevSig = {}
  if (wfaReport?.windows) {
    wfaReport.windows.forEach(w => { prevSig[w.windowIndex] = rowSignature(w) })
  }
  // was OOS missing for the window we're viewing, before this update? (drives the toggle flash)
  let hadOosBefore = true
  if (currentPage !== "summary") {
    hadOosBefore = wfaReport.windows[currentPage]?.oos?.reportID != null
  }

  applyReport(popupAction.message.report) // re-render summary + pager
  highlightPager(currentPage)             // rebuilt pager lost its active state

  // flash breakdown rows that changed; animate the bar of a window that just appeared
  const rows = document.getElementById("wfaWindowRows")
  const bars = document.querySelectorAll("#wfaStairGrid .wfa-stair-bar")
  wfaReport.windows.forEach((w, i) => {
    if (rowSignature(w) !== prevSig[w.windowIndex]) {
      flash(rows.children[i])
    }
    if (prevSig[w.windowIndex] === undefined) {
      bars[i]?.classList.add("wfa-stair-appear")
    }
  })

  // OOS just started for the window you're viewing on its IS tab → flash the toggle
  if (currentPage !== "summary" && currentSample === "is" && !hadOosBefore
      && wfaReport.windows[currentPage]?.oos?.reportID != null) {
    flash(document.querySelector('label[for="wfaSampleOos"]'))
  }
})
