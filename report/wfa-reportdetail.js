const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});
let wfaID = params.wfaID;

// TODO: replace mock with real chrome.storage.local.get("wfa-" + wfaID)
// DUMMY: inSample/outSample point at real existing report-data-* ids so the iframes render live.
// IS/OOS are staggered so toggling on a window swaps between two different real reports.
const wfaReport = {
  wfaID: wfaID || "mock",
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

// update non-functional UI components for free/plus users
updateUserUI()
buildPager()
goToPage("summary")
