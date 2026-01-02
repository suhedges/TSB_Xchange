
// Utility
const byId = (id) => document.getElementById(id);
const norm = (s) => (s ?? "").toString().replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
const FLAG_SPECS = 1;
const FLAG_IMAGES = 2;
const FLAG_DOCS = 4;
const PAGE_SIZE_SMALL = 5;
const PAGE_STATE = { bearings: 0, couplings: 0, motors: 0, oils: 0, pumps: 0 };
const LAST_SEARCH = { bearings: null, couplings: null, motors: null, oils: null, pumps: null };
let LAST_SPECS_TEXT = "";
function lowerBoundPrefix(arr, prefix) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid][0] < prefix) lo = mid + 1; else hi = mid; } return lo; }
function escapeHtml(s) { return (s ?? "").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
function nodeBrand(d, id) {
  const node = d?.NODES?.[id];
  if (!node) return "";
  return d.BRANDS?.[node[0]] || "";
}
function nodePart(d, id) {
  const node = d?.NODES?.[id];
  if (!node) return "";
  return node[1] || "";
}
function nodeFlags(node) { return node?.[2] || 0; }
function buildDetailsMap(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  entries.forEach(row => {
    const id = row?.[0];
    const flags = row?.[1] || 0;
    let idx = 2;
    let specs = null;
    let images = null;
    let docs = null;
    if (flags & FLAG_SPECS) { specs = row?.[idx++] || null; }
    if (flags & FLAG_IMAGES) { images = row?.[idx++] || null; }
    if (flags & FLAG_DOCS) { docs = row?.[idx++] || null; }
    if (id !== undefined && id !== null) map.set(id, { specs, images, docs });
  });
  return map;
}
function readNodeDetails(panelKey, nodeId) {
  const d = DS[panelKey];
  const entry = d?.DETAILS?.get(nodeId);
  if (!entry) return { specs: null, images: null, docs: null };
  return entry;
}

function isVerySmallScreen() {
  const w = window.innerWidth || document.documentElement.clientWidth || 9999;
  const h = window.innerHeight || document.documentElement.clientHeight || 9999;
  const bySize = (w <= 420 || h <= 420);
  let byCss = false;
  try {
    byCss = getComputedStyle(document.documentElement).getPropertyValue("--tiny-screen").trim() === "1";
  } catch {}
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 420px), (max-height: 420px)").matches || byCss || bySize;
  }
  return byCss || bySize;
}

function applyTinyMode() {
  const tiny = isVerySmallScreen();
  document.body?.classList.toggle("tiny", tiny);
  document.querySelectorAll(".subtitle").forEach(el => {
    el.style.display = tiny ? "none" : "";
  });
  document.querySelectorAll(".controls .action-cell .primary").forEach(el => {
    el.style.display = tiny ? "none" : "";
  });
  document.querySelectorAll(".footer-note").forEach(el => {
    el.style.display = tiny ? "none" : "";
  });
  return tiny;
}

function htmlToTextWithLines(html) {
  if (!html) return "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const walk = (node) => {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || "").replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "li") {
      return "- " + Array.from(node.childNodes).map(walk).join("").trim() + "\n";
    }
    if (tag === "p" || tag === "div" || tag === "ul" || tag === "ol") {
      return Array.from(node.childNodes).map(walk).join("") + "\n";
    }
    return Array.from(node.childNodes).map(walk).join("");
  };
  const raw = Array.from(wrapper.childNodes).map(walk).join("");
  return raw.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeSpecValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") {
    const raw = val.trim();
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return htmlToTextWithLines(raw);
    }
    return raw.replace(/\s+/g, " ");
  }
  return String(val).replace(/\s+/g, " ");
}

function buildSpecsClipboardText(panelKey, targetId, specs) {
  if (!specs) return "";
  const skipKeys = new Set(["images", "image", "pdf", "document", "documents", "docs"]);
  const d = DS[panelKey];
  const title = nodeBrand(d, targetId) + ": " + nodePart(d, targetId);
  const lines = [title, "Key\tValue"];
  Object.entries(specs).forEach(([k, v]) => {
    const keyLower = String(k || "").trim().toLowerCase();
    if (skipKeys.has(keyLower)) return;
    const val = normalizeSpecValue(v);
    if (!val) return;
    const parts = val.split(/\n+/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    parts.forEach(part => {
      lines.push(k + "\t" + part);
    });
  });
  return lines.join("\n");
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {}
  return false;
}

function isPrintAllowed() {
  try {
    if (window.frameElement && window.frameElement.hasAttribute("sandbox")) {
      const sb = (window.frameElement.getAttribute("sandbox") || "").trim();
      if (!sb) return false;
      return sb.split(/\s+/).includes("allow-modals");
    }
  } catch {}
  return true;
}

function applyPrintAvailability() {
  const btn = byId("printSpecsBtn");
  if (!btn) return;
  const ok = isPrintAllowed();
  btn.disabled = !ok;
  btn.setAttribute("aria-disabled", ok ? "false" : "true");
  btn.title = ok ? "Print" : "Printing disabled in embedded view";
}

function showPrintBlockedNotice() {
  const sub = byId("specsSub");
  if (sub) {
    sub.textContent = "Printing disabled in embedded view. Open in a new tab to print.";
  }
}

async function handlePrintClick() {
  const copied = await copyTextToClipboard(LAST_SPECS_TEXT);
  if (!isPrintAllowed()) {
    const extra = copied ? "Specifications copied to clipboard." : "Unable to copy specifications to clipboard.";
    const sub = byId("specsSub");
    if (sub) sub.textContent = "Printing disabled in embedded view. Open in a new tab to print. " + extra;
    return;
  }
  if (copied) {
    const sub = byId("specsSub");
    if (sub && !sub.textContent) sub.textContent = "Specifications copied to clipboard.";
  } else {
    const sub = byId("specsSub");
    if (sub && !sub.textContent) sub.textContent = "Unable to copy specifications to clipboard.";
  }
  window.print();
}

function updatePagerUi(panelKey, show, page, totalPages) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const wrap = byId(`pager-${prefix}`);
  const prev = byId(`pagerPrev-${prefix}`);
  const next = byId(`pagerNext-${prefix}`);
  const meta = byId(`pagerMeta-${prefix}`);
  if (!wrap || !prev || !next || !meta) return;
  if (!show) {
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden","true");
    wrap.style.display = "none";
    prev.disabled = true;
    next.disabled = true;
    meta.textContent = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden","false");
  wrap.style.display = "inline-flex";
  meta.textContent = (page + 1) + "/" + totalPages;
  prev.disabled = page <= 0;
  next.disabled = page >= (totalPages - 1);
}

function changePage(panelKey, delta) {
  const masterId = LAST_SEARCH[panelKey];
  if (masterId === null || masterId === undefined) return;
  PAGE_STATE[panelKey] = (PAGE_STATE[panelKey] || 0) + delta;
  renderInterchanges(panelKey, masterId, { keepPage: true });
}

function refreshPagination(panelKey) {
  const masterId = LAST_SEARCH[panelKey];
  if (masterId === null || masterId === undefined) {
    updatePagerUi(panelKey, false, 0, 0);
    return;
  }
  renderInterchanges(panelKey, masterId, { keepPage: true });
}

// Loader overlay (full-page spinner)
function showLoader() {
  const loader = byId("loader");
  if (loader) {
    loader.classList.remove("hidden");
    loader.setAttribute("aria-busy","true");
  }
  byId("appRoot")?.classList.add("disabled");
}
function hideLoader() {
  const loader = byId("loader");
  if (loader) {
    loader.classList.add("hidden");
    loader.setAttribute("aria-busy","false");
  }
  byId("appRoot")?.classList.remove("disabled");
}

// Load status bar
let loadTotal = 0;
let loadDone = 0;
let loadLabel = "";
let loadTimer = null;
function showLoadStatus(label, total) {
  const wrap = byId("loadStatus");
  const bar = byId("loadBar");
  const title = byId("loadTitle");
  const meta = byId("loadMeta");
  if (!wrap || !bar || !title || !meta) return;
  loadTotal = Math.max(1, total || 1);
  loadDone = 0;
  loadLabel = label || "Loading data";
  title.textContent = loadLabel;
  meta.textContent = "0%";
  bar.style.width = "0%";
  wrap.classList.remove("hidden");
  if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
}
function tickLoadStatus() {
  const wrap = byId("loadStatus");
  const bar = byId("loadBar");
  const meta = byId("loadMeta");
  if (!wrap || !bar || !meta) return;
  loadDone += 1;
  const pct = Math.min(100, Math.round((loadDone / loadTotal) * 100));
  bar.style.width = pct + "%";
  meta.textContent = pct + "% (" + loadDone + "/" + loadTotal + ")";
  if (loadDone >= loadTotal) {
    loadTimer = setTimeout(() => wrap.classList.add("hidden"), 450);
  }
}

// Modal
function ensureModal() {
  let backdrop = byId("modalBackdrop");
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.id = "modalBackdrop";
  backdrop.className = "specs-modal-backdrop";
  backdrop.setAttribute("role","dialog");
  backdrop.setAttribute("aria-modal","true");
  backdrop.setAttribute("aria-hidden","true");
  const modal = document.createElement("div"); modal.className = "specs-modal";
  const head = document.createElement("div"); head.className = "specs-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("div"); title.id = "specsTitle"; title.className = "specs-title";
  const sub = document.createElement("div"); sub.id = "specsSub"; sub.className = "specs-sub";
  titleWrap.appendChild(title); titleWrap.appendChild(sub);
  const actions = document.createElement("div"); actions.className = "actions";
  const printBtn = document.createElement("button"); printBtn.id = "printSpecsBtn"; printBtn.className = "ghost"; printBtn.textContent = "Print";
  const closeBtn = document.createElement("button"); closeBtn.id = "closeModal"; closeBtn.className = "primary"; closeBtn.style.width = "auto"; closeBtn.style.padding = ".55rem .8rem"; closeBtn.style.borderRadius = "10px"; closeBtn.textContent = "Close";
  actions.appendChild(printBtn); actions.appendChild(closeBtn);
  head.appendChild(titleWrap); head.appendChild(actions);
  const body = document.createElement("div"); body.id = "specsBody"; body.className = "specs-body";
  modal.appendChild(head); modal.appendChild(body); backdrop.appendChild(modal); document.body.appendChild(backdrop);
  closeBtn.addEventListener("click", closeModal);
  printBtn.addEventListener("click", handlePrintClick);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  applyPrintAvailability();
  return backdrop;
}
function closeModal() { const backdrop = ensureModal(); backdrop.style.display = "none"; backdrop.setAttribute("aria-hidden","true"); }

// Focus whitelist
const FOCUS_BRANDS = new Set([
  "TIMKEN","IDC","SKF","CRSEALS","LINK-BELT","REXNORD","REGAL","REGALREXNORD","NATIONAL","DICHTOMATIK","AMI","DODGE","AMERIDRIVES","AURORA","BALDO","BALDOR-RELIANCE","BANDO","GATES","BARDEN","BCA","BLUEBRUTE","BOWER","BROWNING","CLIMAX","CONSOLIDATED","FAFNIR","FALK","FLENDER","GARLOCK","GENERALBEARING","HARWAL","HUBCITY","IKO","INA","IPTCI","JTEKT","KOYO","KOP-FLEX","LEESON","LM76","LOVEJOY","MAGNALOY","MANITOU","MARTIN","MCGILL","NACHI","NEWDEPARTURE","NORD","NSK","NTN","OILITE","MARATHON/LEESON","OLDCATALOG(MARATHON/LEESON)","OLDMODEL(MARATHON/LEESON)","PEER","PRECISIONINDUSTRIES","PTI","RBC","ROYERSFORD","SCHATZ","SEALMASTER","SNR","TBWOODS","THK","THOMSON","TMC","TORRINGTON","U.S.SEALMFG.","WARNER","XYLEMINC."
]);

// Per-tab data container (filled after we fetch shards)
const DS = {
  bearings: { loaded:false, loading:null, detailsLoaded:false, NODES:null, GROUPS:null, NODE_GROUPS:null, DETAILS:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_NORMS:null, SHARDS:null, TAB_DIR:null, CACHE_BUST:"", BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  couplings: { loaded:false, loading:null, detailsLoaded:false, NODES:null, GROUPS:null, NODE_GROUPS:null, DETAILS:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_NORMS:null, SHARDS:null, TAB_DIR:null, CACHE_BUST:"", BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  motors:   { loaded:false, loading:null, detailsLoaded:false, NODES:null, GROUPS:null, NODE_GROUPS:null, DETAILS:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_NORMS:null, SHARDS:null, TAB_DIR:null, CACHE_BUST:"", BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  oils:     { loaded:false, loading:null, detailsLoaded:false, NODES:null, GROUPS:null, NODE_GROUPS:null, DETAILS:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_NORMS:null, SHARDS:null, TAB_DIR:null, CACHE_BUST:"", BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  pumps:    { loaded:false, loading:null, detailsLoaded:false, NODES:null, GROUPS:null, NODE_GROUPS:null, DETAILS:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_NORMS:null, SHARDS:null, TAB_DIR:null, CACHE_BUST:"", BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
};

const TAB_DIR = {
  bearings: "./data/bearings",
  couplings: "./data/couplings",
  motors: "./data/motors",
  oils: "./data/oils",
  pumps: "./data/pumps"
};

async function fetchJSON(url, cacheMode = "force-cache") {
  const res = await fetch(url, { cache: cacheMode });
  if (!res.ok) throw new Error("Fetch failed (" + res.status + "): " + url);
  return res.json();
}

async function fetchText(url, cacheMode = "force-cache") {
  const res = await fetch(url, { cache: cacheMode });
  if (!res.ok) throw new Error("Fetch failed (" + res.status + "): " + url);
  return res.text();
}

async function fetchShardSeries(baseDir, list, label, onProgress, cacheBust = "") {
  if (!list || !list.length) return null;
  try {
    const parts = await Promise.all(list.map(async (f) => {
      const data = await fetchJSON(baseDir + "/" + f + cacheBust);
      if (onProgress) onProgress();
      return data;
    }));
    if (parts.length === 1) return parts[0];
    let allArrays = true;
    const merged = [];
    for (const part of parts) {
      if (!Array.isArray(part)) {
        allArrays = false;
        break;
      }
      merged.push(...part);
    }
    return allArrays ? merged : parts;
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    throw new Error((label ? (label + " ") : "") + msg);
  }
}

function scheduleIdle(fn) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => fn(), { timeout: 2000 });
  } else {
    setTimeout(fn, 50);
  }
}

async function loadTabData(panelKey, showProgress = false) {
  const d = DS[panelKey];
  if (d.loaded) return;
  if (d.loading) return d.loading;
  d.loading = (async () => {
    const baseDir = TAB_DIR[panelKey];
    const manifest = await fetchJSON(baseDir + "/manifest.json", "no-store");
    const shards = manifest?.shards || {};
    const cacheBust = manifest?.build ? ("?v=" + manifest.build) : "";

  const totalShards = (shards.nodes?.length || 0) +
                      (shards.groups?.length || 0) +
                      (shards.node_groups?.length || 0) +
                      (shards.search?.length || 0) +
                      (shards.brands?.length || 0);
  const label = panelKey === "bearings" ? "Loading Bearings data" :
                panelKey === "couplings" ? "Loading Couplings data" :
                panelKey === "motors" ? "Loading Motors data" :
                panelKey === "oils" ? "Loading Oil Seals data" :
                panelKey === "pumps" ? "Loading Pump Seals data" : "Loading data";
  if (showProgress && totalShards) showLoadStatus(label, totalShards);
  const onProgress = showProgress ? tickLoadStatus : null;

  const [nodes, groups, nodeGroups, search, brands] = await Promise.all([
    fetchShardSeries(baseDir, shards.nodes, "nodes", onProgress, cacheBust),
    fetchShardSeries(baseDir, shards.groups, "groups", onProgress, cacheBust),
    fetchShardSeries(baseDir, shards.node_groups, "node_groups", onProgress, cacheBust),
    fetchShardSeries(baseDir, shards.search, "search", onProgress, cacheBust),
    fetchShardSeries(baseDir, shards.brands, "brands", onProgress, cacheBust),
  ]);

    d.NODES = Array.isArray(nodes) ? nodes : [];
    d.GROUPS = Array.isArray(groups) ? groups : [];
    d.NODE_GROUPS = Array.isArray(nodeGroups) ? nodeGroups : [];
    d.SEARCH = Array.isArray(search) ? search : [];
    d.BRANDS = Array.isArray(brands) ? brands : [];
    d.BRAND_NORMS = d.BRANDS.map(b => norm(b));
    d.SEARCH_BY_BRAND = null;
    d.DETAILS = null;
    d.detailsLoaded = false;
    d.SHARDS = shards;
    d.TAB_DIR = baseDir;
    d.CACHE_BUST = cacheBust;
    d.loaded = true;

    fillBrandOptions(panelKey);
    scheduleIdle(() => {
      if (!d.BRAND_PART_INDEX || !d.PART_ONLY_INDEX) {
        try {
          ensureIndexes(panelKey);
        } catch (err) {
          console.error(err);
        }
      }
    });
  })();
  try {
    await d.loading;
  } finally {
    d.loading = null;
  }
}

function fillBrandOptions(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const sel = byId(`brand-${prefix}`); if (!sel) return;
  const BRANDS = DS[panelKey].BRANDS || [];
  sel.innerHTML = "";
  const none = document.createElement("option"); none.value = ""; none.textContent = "NONE (All Brands)"; sel.appendChild(none);
  BRANDS.forEach(b => { const opt = document.createElement("option"); opt.value = b; opt.textContent = b || "(Unknown)"; sel.appendChild(opt); });
}

function ensureBrandSearch(panelKey) {
  const d = DS[panelKey];
  if (d.SEARCH_BY_BRAND) return;
  const map = new Map();
  const search = d.SEARCH || [];
  for (let i = 0; i < search.length; i++) {
    const item = search[i];
    const id = item[1];
    const node = d.NODES?.[id];
    if (!node) continue;
    const bNorm = d.BRAND_NORMS?.[node[0]] || "";
    if (!map.has(bNorm)) map.set(bNorm, []);
    map.get(bNorm).push(item);
  }
  d.SEARCH_BY_BRAND = map;
}

function topSuggestions(panelKey, queryNorm, brandNorm, limit=5) {
  if (!queryNorm) return [];
  if (brandNorm) ensureBrandSearch(panelKey);
  const pool = brandNorm ? (DS[panelKey].SEARCH_BY_BRAND?.get(brandNorm) || []) : (DS[panelKey].SEARCH || []);
  if (!pool.length) return [];
  const idx = lowerBoundPrefix(pool, queryNorm);
  const out = [];
  for (let i = idx; i < pool.length && out.length < limit; i++) {
    if (pool[i][0].startsWith(queryNorm)) out.push(pool[i]); else break;
  }
  return out;
}

function showSuggest(panelKey, list) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const box = byId(`suggestList-${prefix}`); if (!box) return;
  if (!list.length) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.innerHTML = "";
  list.forEach(item => {
    const div = document.createElement("div");
    div.className = "suggest-item";
    const id = item[1];
    const brand = nodeBrand(DS[panelKey], id);
    const part = nodePart(DS[panelKey], id);
    div.textContent = brand + ":" + part;
    div.onclick = () => {
      const partInp = byId(`part-${prefix}`);
      const brandSel = byId(`brand-${prefix}`);
      if (brandSel) brandSel.value = brand;
      if (partInp) partInp.value = part;
      box.style.display = "none";
      doSearch(panelKey);
    };
    box.appendChild(div);
  });
  box.style.display = "block";
}

function hideSuggest(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const box = byId(`suggestList-${prefix}`); if (box) box.style.display = "none";
}

function ensureIndexes(panelKey) {
  const d = DS[panelKey];
  if (!d.NODES) return;
  if (!d.BRAND_PART_INDEX) {
    d.BRAND_PART_INDEX = new Map();
    for (let id = 0; id < d.NODES.length; id++) {
      const meta = d.NODES[id];
      const bN = d.BRAND_NORMS?.[meta[0]] || norm(d.BRANDS?.[meta[0]] || "");
      const pN = norm(meta[1]);
      if (!d.BRAND_PART_INDEX.has(bN)) d.BRAND_PART_INDEX.set(bN, new Map());
      d.BRAND_PART_INDEX.get(bN).set(pN, id);
    }
  }
  if (!d.PART_ONLY_INDEX) {
    d.PART_ONLY_INDEX = new Map();
    for (let id = 0; id < d.NODES.length; id++) {
      const meta = d.NODES[id];
      const pN = norm(meta[1]);
      if (!d.PART_ONLY_INDEX.has(pN)) d.PART_ONLY_INDEX.set(pN, []);
      d.PART_ONLY_INDEX.get(pN).push(id);
    }
  }
}

let focusOn = false;
function syncFocusCheckboxes() {
  ["b","c","m","o","p"].forEach(pref => {
    const el = byId(`focus-${pref}`); if (el) el.checked = focusOn;
  });
}
function brandAllowedForFocus(brand) {
  const b = (brand || "").toString().toUpperCase().replaceAll(/\s+/g,"");
  return FOCUS_BRANDS.has(b);
}

function renderInterchanges(panelKey, masterId, opts = {}) {
  const keepPage = opts.keepPage === true;
  if (!keepPage) PAGE_STATE[panelKey] = 0;
  const d = DS[panelKey];
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const res = byId(`results-${prefix}`); if (!res) return; res.innerHTML = "";
  if (masterId === null || masterId === undefined || !d.NODES || !d.NODES[masterId]) {
    res.innerHTML = '<div class="empty">No matches found for that brand + part number.</div>';
    updatePagerUi(panelKey, false, 0, 0);
    return;
  }

  const master = d.NODES[masterId];
  const masterBrand = nodeBrand(d, masterId);
  const masterPart = nodePart(d, masterId);
  const masterHasSpecs = (nodeFlags(master) & FLAG_SPECS) !== 0;

  const header = document.createElement("div");
  header.className = "pill note clickable" + (masterHasSpecs ? " has-specs" : "");
  header.title = "Double-click to view specs (if this part has them)";
  header.innerHTML = '<span class="brand">' + escapeHtml(masterBrand) + '</span>' +
                     '<span class="part">' + escapeHtml(masterPart) + '</span>' +
                     '<span style="opacity:.7">is linked to:</span>';
  header.ondblclick = () => openSpecs(panelKey, masterId);
  res.appendChild(header);

  const groupIds = d.NODE_GROUPS?.[masterId] || [];
  const neighborSet = new Set();
  groupIds.forEach(gid => {
    const g = d.GROUPS?.[gid] || [];
    g.forEach(id => { if (id !== masterId) neighborSet.add(id); });
  });

  let neighbors = Array.from(neighborSet).filter(id => {
    const p = (d.NODES[id]?.[1] || "").trim().toLowerCase();
    return p !== "nan";
  });

  if (focusOn) {
    neighbors = neighbors.filter(id => brandAllowedForFocus(nodeBrand(d, id)));
  }

  neighbors.sort((a, b) => {
    const an = d.NODES[a];
    const bn = d.NODES[b];
    const ab = d.BRANDS?.[an?.[0]] || "";
    const bb = d.BRANDS?.[bn?.[0]] || "";
    if (ab < bb) return -1;
    if (ab > bb) return 1;
    const ap = an?.[1] || "";
    const bp = bn?.[1] || "";
    return ap < bp ? -1 : ap > bp ? 1 : 0;
  });

  if (!neighbors.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No interchanges found.";
    res.appendChild(empty);
    updatePagerUi(panelKey, false, 0, 0);
    return;
  }

  const usePager = applyTinyMode() && neighbors.length > PAGE_SIZE_SMALL;
  const totalPages = usePager ? Math.ceil(neighbors.length / PAGE_SIZE_SMALL) : 1;
  let page = PAGE_STATE[panelKey] || 0;
  if (!usePager) page = 0;
  if (page >= totalPages) page = totalPages - 1;
  if (page < 0) page = 0;
  PAGE_STATE[panelKey] = page;
  updatePagerUi(panelKey, usePager, page, totalPages);

  const visible = usePager ? neighbors.slice(page * PAGE_SIZE_SMALL, (page + 1) * PAGE_SIZE_SMALL) : neighbors;
  visible.forEach(id => {
    const pill = document.createElement("div");
    const node = d.NODES[id];
    const hasSpecs = (nodeFlags(node) & FLAG_SPECS) !== 0;
    pill.className = "pill" + (hasSpecs ? " has-specs" : "");
    pill.title = "Double-click for specifications (if available on that exact part)";
    pill.innerHTML = '<span class="brand">' + escapeHtml(nodeBrand(d, id)) + '</span>' +
                     '<span class="part">' + escapeHtml(nodePart(d, id)) + '</span>';
    pill.ondblclick = () => openSpecs(panelKey, id);
    res.appendChild(pill);
  });
}

// Spec helpers
function getUrlFilename(url) {
  try { const u = new URL(url); const last = u.pathname.split("/").filter(Boolean).pop() || ""; return last.replace(/\.[^/.]+$/,""); } catch { return ""; }
}
function splitMulti(str) {
  if (str.includes("|")) return str.split("|").map(s => s.trim()).filter(Boolean);
  if (str.includes(",")) return str.split(",").map(s => s.trim()).filter(Boolean);
  return str.split(/\s+(?=https?:\/\/)/).map(s => s.trim()).filter(Boolean);
}
function extractResourcesFromSpecs(specs) {
  const images = [];
  const pdfs = [];   // [{url,label}]
  const imgExt = /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i;

  for (const [k, rawVal] of Object.entries(specs || {})) {
    if (typeof rawVal !== "string") continue;
    const segments = splitMulti(rawVal);
    segments.forEach(seg => {
      const m = seg.match(/^(https?:\/\/\S+)(?:\s+(.+))?$/i);
      const url = m ? m[1] : (seg.startsWith("http") ? seg : null);
      const label = m && m[2] ? m[2].trim() : null;
      if (!url) return;
      if (/\.pdf($|\?)/i.test(url)) {
        pdfs.push({ url, label: label || getUrlFilename(url) || "Document" });
      } else if (imgExt.test(url)) {
        images.push(url);
      }
    });

    if (/<img\s[^>]*src=/i.test(rawVal)) {
      const im = [...rawVal.matchAll(/<img[^>]*src=["']([^"']+)["']/ig)];
      im.forEach(mm => { const u = mm[1]; if (imgExt.test(u) || /^https?:\/\//i.test(u)) images.push(u); });
    }
  }

  const seenI = new Set(); const dedupImages = [];
  images.forEach(u => { if (!seenI.has(u)) { seenI.add(u); dedupImages.push(u); } });
  const seenP = new Set(); const dedupPdfs = [];
  pdfs.forEach(p => { const key = (p.url || "") + "||" + (p.label || ""); if (!seenP.has(key)) { seenP.add(key); dedupPdfs.push(p); } });

  return { images: dedupImages, pdfs: dedupPdfs };
}
function isHtmlLike(val) { return typeof val === "string" && /<\w+[^>]*>.*<\/\w+>/s.test(val); }
function renderSpecEntry(k, v) {
  if (String(k).toLowerCase() === "images") return null;
  if (String(k).toLowerCase() === "pdf") return null;
  const wrap = document.createElement("div"); wrap.className = "specs-item";
  const keyEl = document.createElement("div"); keyEl.className = "k"; keyEl.textContent = k;
  const valEl = document.createElement("div"); valEl.className = "v";

  if (typeof v === "string" && /https?:\/\//i.test(v) && v.includes("|")) {
    const bits = v.split("|").map(s => s.trim()).filter(Boolean);
    const inner = bits.map(chunk => {
      const m = chunk.match(/(https?:\/\/[\S]+)\s+(.*)$/);
      if (m) return '<a class="link" href="' + escapeHtml(m[1]) + '" target="_blank" rel="noopener">' + escapeHtml(m[2]) + '</a>';
      return '<a class="link" href="' + escapeHtml(chunk) + '" target="_blank" rel="noopener">' + escapeHtml(chunk) + '</a>';
    }).join("<br/>");
    valEl.innerHTML = inner;
  } else if (typeof v === "string" && /^https?:\/\//i.test(v)) {
    valEl.innerHTML = '<a class="link" href="' + escapeHtml(v) + '" target="_blank" rel="noopener">' + escapeHtml(v) + '</a>';
  } else if (isHtmlLike(v)) {
    valEl.innerHTML = v;
  } else {
    valEl.textContent = (v ?? "").toString();
  }

  wrap.appendChild(keyEl); wrap.appendChild(valEl);
  return wrap;
}
function buildImagesGrid(images) {
  const grid = document.createElement("div"); grid.className = "gallery-grid";
  if (!images || !images.length) return null;
  images.forEach(u => {
    const a = document.createElement("a"); a.href = u; a.target = "_blank"; a.rel = "noopener";
    const box = document.createElement("div"); box.className = "thumb";
    const img = document.createElement("img"); img.src = u; img.alt = "Specification Image";
    box.appendChild(img); a.appendChild(box); grid.appendChild(a);
  });
  return grid;
}
function buildDocs(pdfs) {
  const wrap = document.createElement("div"); wrap.className = "docs";
  if (!pdfs || !pdfs.length) return null;
  pdfs.forEach(p => {
    const card = document.createElement("a"); card.className = "doc-card"; card.href = p.url; card.target = "_blank"; card.rel = "noopener";
    const icon = document.createElement("i"); icon.className = "fa-thin fa-file fa-regular";
    const pdfLabel = document.createElement("div"); pdfLabel.className = "pdf-label"; pdfLabel.textContent = "PDF";
    const labelText = p.label && p.label.trim() ? p.label.trim() : (getUrlFilename(p.url) || "Document");
    const label = document.createElement("div"); label.className = "doc-label"; label.textContent = labelText;
    card.appendChild(icon); card.appendChild(pdfLabel); card.appendChild(label); wrap.appendChild(card);
  });
  return wrap;
}
async function openSpecs(panelKey, targetId) {
  const d = DS[panelKey];
  const backdrop = ensureModal();
  const body = byId("specsBody");
  const title = byId("specsTitle");
  const sub = byId("specsSub");
  if (!body || !title || !sub) return alert("Unable to open specs view.");

  body.innerHTML = "";
  sub.textContent = isPrintAllowed() ? "" : "Printing disabled in embedded view. Open in a new tab to print.";
  const main = d && d.NODES && d.NODES[targetId];
  if (!main) { alert("No specifications are available for this part."); return; }
  if ((nodeFlags(main) & FLAG_SPECS) === 0) {
    alert("No specifications are available for this part.");
    return;
  }
  try {
    await ensureDetails(panelKey, true);
  } catch (err) {
    console.error(err);
    alert("Failed to load specifications data.");
    return;
  }
  const details = readNodeDetails(panelKey, targetId);
  const mainSpecs = details.specs;

  if (!(mainSpecs && Object.keys(mainSpecs).length)) {
    alert("No specifications are available for this part.");
    return;
  }
  LAST_SPECS_TEXT = buildSpecsClipboardText(panelKey, targetId, mainSpecs);

  title.textContent = nodeBrand(d, targetId) + ": " + nodePart(d, targetId);

  const fromSpecs = extractResourcesFromSpecs(mainSpecs);
  const extraImgs = Array.isArray(details.images) ? details.images : [];
  const extraDocs = Array.isArray(details.docs) ? details.docs : [];

  const imgSet = new Set();
  const images = [];
  [...fromSpecs.images, ...extraImgs].forEach(u => { if (u && !imgSet.has(u)) { imgSet.add(u); images.push(u); } });

  const docSet = new Set();
  const pdfs = [];
  [...fromSpecs.pdfs, ...extraDocs].forEach(p => {
    if (!p || !p.url) return;
    const label = (p.label || "").trim();
    const key = p.url + "||" + label;
    if (!docSet.has(key)) { docSet.add(key); pdfs.push({url: p.url, label}); }
  });

  if (images && images.length) {
    const imgTitle = document.createElement("div"); imgTitle.className = "specs-title"; imgTitle.style.marginTop = "6px"; imgTitle.textContent = "Images";
    const imgGrid = buildImagesGrid(images);
    if (imgGrid) { body.appendChild(imgTitle); body.appendChild(imgGrid); }
  }

  if (pdfs && pdfs.length) {
    const docTitle = document.createElement("div"); docTitle.className = "specs-title"; docTitle.style.marginTop = "14px"; docTitle.textContent = "Documents";
    const docs = buildDocs(pdfs);
    if (docs) { body.appendChild(docTitle); body.appendChild(docs); }
  }

  const otherTitle = document.createElement("div"); otherTitle.className = "specs-title"; otherTitle.style.marginTop = "14px"; otherTitle.textContent = "Specifications";
  const grid = document.createElement("div"); grid.className = "specs-grid";
  Object.entries(mainSpecs).forEach(([k,v]) => {
    const el = renderSpecEntry(k,v);
    if (el) grid.appendChild(el);
  });
  body.appendChild(otherTitle); body.appendChild(grid);

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden","false");
}

// Enable the controls once (but keep using loader overlay for lazy tab loads)
let UI_UNLOCKED = false;
function unlockUI() {
  if (UI_UNLOCKED) return;
  UI_UNLOCKED = true;

  byId("appRoot")?.classList.remove("disabled");
  [
    "brand-b","part-b","searchBtn-b","resetBtn-b","focus-b",
    "brand-c","part-c","searchBtn-c","resetBtn-c","focus-c",
    "brand-m","part-m","searchBtn-m","resetBtn-m","focus-m",
    "brand-o","part-o","searchBtn-o","resetBtn-o","focus-o",
    "brand-p","part-p","searchBtn-p","resetBtn-p","focus-p"
  ].forEach(id => { const el = byId(id); if (el) el.disabled = false; });
}

function wirePanel(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const input = byId(`part-${prefix}`);
  const brandSel = byId(`brand-${prefix}`);
  const searchBtn = byId(`searchBtn-${prefix}`);
  const resetBtn = byId(`resetBtn-${prefix}`);
  const suggestBox = byId(`suggestList-${prefix}`);
  const focusChk = byId(`focus-${prefix}`);
  const pagerPrev = byId(`pagerPrev-${prefix}`);
  const pagerNext = byId(`pagerNext-${prefix}`);

  async function refreshSuggestions() {
    const q = norm(input?.value || "");
    const bN = norm(brandSel?.value || "");
    if (!q) { showSuggest(panelKey, []); return; }

    // Show spinner if this tab isn't loaded yet
    if (!DS[panelKey].loaded) {
      try {
        await ensureLoaded(panelKey, false);
      } catch (err) {
        console.error(err);
      }
    }

    showSuggest(panelKey, topSuggestions(panelKey, q, bN, 5));
  }

  input?.addEventListener("input", refreshSuggestions);
  brandSel?.addEventListener("change", async () => {
    const res = byId(`results-${prefix}`); if (res) res.innerHTML = "";
    LAST_SEARCH[panelKey] = null;
    PAGE_STATE[panelKey] = 0;
    updatePagerUi(panelKey, false, 0, 0);
    await refreshSuggestions();
  });

  input?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const q = norm(input.value);
      const bN = norm(brandSel?.value || "");

      if (!DS[panelKey].loaded) {
        try {
          await ensureLoaded(panelKey, false);
        } catch (err) {
          console.error(err);
        }
      }

      const items = topSuggestions(panelKey, q, bN, 5);
      if (items.length) {
        const id = items[0][1];
        if (id !== undefined) {
          const brand = nodeBrand(DS[panelKey], id);
          const part = nodePart(DS[panelKey], id);
          if (brandSel) brandSel.value = brand;
          input.value = part;
        }
      }
      doSearch(panelKey);
      if (suggestBox) suggestBox.style.display = "none";
    } else if (e.key === "Escape") {
      hideSuggest(panelKey);
    }
  });

  input?.addEventListener("blur", () => setTimeout(() => hideSuggest(panelKey), 120));
  searchBtn?.addEventListener("click", () => doSearch(panelKey));
  resetBtn?.addEventListener("click", () => resetAll(panelKey));
  pagerPrev?.addEventListener("click", () => changePage(panelKey, -1));
  pagerNext?.addEventListener("click", () => changePage(panelKey, 1));

  if (focusChk) {
    focusChk.checked = focusOn;
    focusChk.addEventListener("change", () => {
      focusOn = focusChk.checked;
      syncFocusCheckboxes();
      const res = byId(`results-${prefix}`);
      if (res && res.children.length) {
        doSearch(panelKey);
      }
    });
  }
}

async function ensureLoaded(panelKey, useOverlay = false) {
  if (!DS[panelKey].loaded) {
    if (useOverlay) showLoader();
    try {
      await loadTabData(panelKey, true);
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? err.message : "Unknown error";
      alert("Failed to load data for this tab: " + msg);
    } finally {
      if (useOverlay) hideLoader();
    }
  }
  unlockUI();
}

async function ensureDetails(panelKey, showProgress = false) {
  const d = DS[panelKey];
  if (d.detailsLoaded) return;
  if (!d.loaded) await loadTabData(panelKey, showProgress);
  const shards = d.SHARDS?.details || [];
  if (!shards.length) {
    d.DETAILS = new Map();
    d.detailsLoaded = true;
    return;
  }
  if (showProgress) showLoadStatus("Loading specifications", shards.length);
  const entries = await fetchShardSeries(d.TAB_DIR, shards, "details", showProgress ? tickLoadStatus : null, d.CACHE_BUST || "");
  d.DETAILS = buildDetailsMap(entries || []);
  d.detailsLoaded = true;
}

function prewarmTabs() {
  const order = ["bearings", "couplings", "motors", "oils", "pumps"];
  let idx = 0;
  const next = () => {
    if (idx >= order.length) return;
    const key = order[idx++];
    const showProgress = key === "bearings";
    loadTabData(key, showProgress).catch(console.error).finally(() => scheduleIdle(next));
  };
  next();
}

function doSearch(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const d = DS[panelKey];
  const brandSel = byId(`brand-${prefix}`);
  const partInp = byId(`part-${prefix}`);
  const res = byId(`results-${prefix}`);

  if (!d.loaded) {
    res.innerHTML = '<div class="empty">Loading data…</div>';
    updatePagerUi(panelKey, false, 0, 0);
    LAST_SEARCH[panelKey] = null;
    ensureLoaded(panelKey).then(() => doSearch(panelKey));
    return;
  }

  if (!d.BRAND_PART_INDEX || !d.PART_ONLY_INDEX) {
    if (res) res.innerHTML = '<div class="empty">Preparing search indexes...</div>';
    ensureIndexes(panelKey);
  }

  const brand = brandSel?.value ?? "";
  const partRaw = partInp?.value ?? "";

  if (!partRaw.trim()) {
    if (res) res.innerHTML = '<div class="empty">Enter a part number to search.</div>';
    updatePagerUi(panelKey, false, 0, 0);
    LAST_SEARCH[panelKey] = null;
    return;
  }

  const wantBrandN = norm(brand);
  const wantPartN = norm(partRaw);
  let masterId = null;

  if (wantBrandN) {
    const brandMap = d.BRAND_PART_INDEX && d.BRAND_PART_INDEX.get(wantBrandN);
    if (brandMap && brandMap.has(wantPartN)) masterId = brandMap.get(wantPartN);
    if (masterId === null) {
      const cand = topSuggestions(panelKey, wantPartN, wantBrandN, 10);
      if (cand.length) masterId = cand[0][1];
    }
  } else {
    const keys = d.PART_ONLY_INDEX && d.PART_ONLY_INDEX.get(wantPartN) || [];
    if (keys.length) masterId = keys[0];
    if (masterId === null) {
      const cand = topSuggestions(panelKey, wantPartN, "", 10);
      if (cand.length) masterId = cand[0][1];
    }
  }

  if (masterId === null || masterId === undefined) {
    if (res) res.innerHTML = '<div class="empty">No matches found for that part number.</div>';
    updatePagerUi(panelKey, false, 0, 0);
    LAST_SEARCH[panelKey] = null;
    return;
  }

  LAST_SEARCH[panelKey] = masterId;
  renderInterchanges(panelKey, masterId);
}

function resetAll(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  byId(`brand-${prefix}`).value = "";
  byId(`part-${prefix}`).value = "";
  byId(`results-${prefix}`).innerHTML = "";
  LAST_SEARCH[panelKey] = null;
  PAGE_STATE[panelKey] = 0;
  updatePagerUi(panelKey, false, 0, 0);
  hideSuggest(panelKey);
  closeModal();
  byId(`part-${prefix}`).focus();
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  byId(`panel-${tab}`)?.classList.add("active");
  const select = byId("tabSelect");
  if (select && select.value !== tab) select.value = tab;
}

document.addEventListener("DOMContentLoaded", () => {
  ensureModal();

  wirePanel("bearings");
  wirePanel("couplings");
  wirePanel("motors");
  wirePanel("oils");
  wirePanel("pumps");

  unlockUI();
  hideLoader();
  applyTinyMode();
  applyPrintAvailability();
  prewarmTabs();

  document.getElementById("tabs")?.addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    const key = t.dataset.tab;
    switchTab(key);
  });
  const tabSelect = byId("tabSelect");
  if (tabSelect) {
    tabSelect.addEventListener("change", (e) => {
      const key = e.target.value;
      switchTab(key);
    });
    const activeTab = document.querySelector(".tab.active")?.dataset.tab || "bearings";
    if (tabSelect.value !== activeTab) tabSelect.value = activeTab;
  }

  byId("closeModal")?.addEventListener("click", closeModal);
  byId("modalBackdrop")?.addEventListener("click", (e) => { if (e.target === byId("modalBackdrop")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  window.addEventListener("resize", () => {
    applyTinyMode();
    ["bearings","couplings","motors","oils","pumps"].forEach(refreshPagination);
  });
});
