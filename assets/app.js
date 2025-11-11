
// Utility
const byId = (id) => document.getElementById(id);
const norm = (s) => (s ?? "").toString().replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
const unique = (arr) => [...new Set(arr)];
function lowerBoundPrefix(arr, prefix) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid].n < prefix) lo = mid + 1; else hi = mid; } return lo; }
function escapeHtml(s) { return (s ?? "").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }

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
  printBtn.addEventListener("click", () => window.print());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  return backdrop;
}
function closeModal() { const backdrop = ensureModal(); backdrop.style.display = "none"; backdrop.setAttribute("aria-hidden","true"); }

// Focus whitelist
const FOCUS_BRANDS = new Set([
  "TIMKEN","IDC","SKF","CRSEALS","LINK-BELT","REXNORD","REGAL","REGALREXNORD","NATIONAL","DICHTOMATIK","AMI","DODGE","AMERIDRIVES","AURORA","BALDO","BALDOR-RELIANCE","BANDO","GATES","BARDEN","BCA","BLUEBRUTE","BOWER","BROWNING","CLIMAX","CONSOLIDATED","FAFNIR","FALK","FLENDER","GARLOCK","GENERALBEARING","HARWAL","HUBCITY","IKO","INA","IPTCI","JTEKT","KOYO","KOP-FLEX","LEESON","LM76","LOVEJOY","MAGNALOY","MANITOU","MARTIN","MCGILL","NACHI","NEWDEPARTURE","NORD","NSK","NTN","OILITE","MARATHON/LEESON","OLDCATALOG(MARATHON/LEESON)","OLDMODEL(MARATHON/LEESON)","PEER","PRECISIONINDUSTRIES","PTI","RBC","ROYERSFORD","SCHATZ","SEALMASTER","SNR","TBWOODS","THK","THOMSON","TMC","TORRINGTON","U.S.SEALMFG.","WARNER","XYLEMINC."
]);

// Per-tab data container (filled after we fetch shards)
const DS = {
  bearings: { loaded:false, NODES:null, GRAPH:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  couplings: { loaded:false, NODES:null, GRAPH:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  motors:   { loaded:false, NODES:null, GRAPH:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  oils:     { loaded:false, NODES:null, GRAPH:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
  pumps:    { loaded:false, NODES:null, GRAPH:null, SEARCH:null, SEARCH_BY_BRAND:null, BRANDS:null, BRAND_PART_INDEX:null, PART_ONLY_INDEX:null },
};

const TAB_DIR = {
  bearings: "./data/bearings",
  couplings: "./data/couplings",
  motors: "./data/motors",
  oils: "./data/oils",
  pumps: "./data/pumps"
};

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error("Fetch failed: " + url);
  return res.json();
}

async function fetchShardSeries(baseDir, list) {
  // Concatenate JSON text pieces then parse once — efficient for big arrays/objects
  if (!list || !list.length) return null;
  const texts = await Promise.all(list.map(async (f) => (await fetch(baseDir + "/" + f)).text()));
  const combined = texts.join("");
  return JSON.parse(combined);
}

async function loadTabData(panelKey) {
  if (DS[panelKey].loaded) return;
  const baseDir = TAB_DIR[panelKey];
  const manifest = await fetchJSON(baseDir + "/manifest.json");
  const shards = manifest?.shards || {};

  const [nodes, graph, search, searchByBrand, brands] = await Promise.all([
    fetchShardSeries(baseDir, shards.nodes),
    fetchShardSeries(baseDir, shards.graph),
    fetchShardSeries(baseDir, shards.search),
    fetchShardSeries(baseDir, shards.search_by_brand),
    fetchShardSeries(baseDir, shards.brands),
  ]);

  DS[panelKey].NODES = nodes || {};
  DS[panelKey].GRAPH = graph || {};
  DS[panelKey].SEARCH = Array.isArray(search) ? search.sort((a,b)=>a.n<b.n?-1:a.n>b.n?1:0) : [];
  DS[panelKey].SEARCH_BY_BRAND = searchByBrand || {};
  DS[panelKey].BRANDS = brands || [];
  DS[panelKey].loaded = true;

  fillBrandOptions(panelKey);
  ensureIndexes(panelKey);
}

function fillBrandOptions(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const sel = byId(`brand-${prefix}`); if (!sel) return;
  const BRANDS = DS[panelKey].BRANDS || [];
  sel.innerHTML = "";
  const none = document.createElement("option"); none.value = ""; none.textContent = "NONE (All Brands)"; sel.appendChild(none);
  BRANDS.forEach(b => { const opt = document.createElement("option"); opt.value = b; opt.textContent = b || "(Unknown)"; sel.appendChild(opt); });
}

function topSuggestions(panelKey, queryNorm, brandNorm, limit=5) {
  if (!queryNorm) return [];
  const pool = brandNorm ? (DS[panelKey].SEARCH_BY_BRAND?.[brandNorm] || []) : (DS[panelKey].SEARCH || []);
  if (!pool.length) return [];
  const idx = lowerBoundPrefix(pool, queryNorm);
  const out = [];
  for (let i = idx; i < pool.length && out.length < limit; i++) {
    if (pool[i].n.startsWith(queryNorm)) out.push(pool[i]); else break;
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
    div.textContent = item.d;
    div.onclick = () => {
      const [brand, ...rest] = item.d.split(":");
      const partInp = byId(`part-${prefix}`);
      const brandSel = byId(`brand-${prefix}`);
      if (brandSel) brandSel.value = brand;
      if (partInp) partInp.value = rest.join(":");
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
    for (const [k, meta] of Object.entries(d.NODES)) {
      const bN = norm(meta.b), pN = norm(meta.p);
      if (!d.BRAND_PART_INDEX.has(bN)) d.BRAND_PART_INDEX.set(bN, new Map());
      d.BRAND_PART_INDEX.get(bN).set(pN, k);
    }
  }
  if (!d.PART_ONLY_INDEX) {
    d.PART_ONLY_INDEX = new Map();
    for (const [k, meta] of Object.entries(d.NODES)) {
      const pN = norm(meta.p);
      if (!d.PART_ONLY_INDEX.has(pN)) d.PART_ONLY_INDEX.set(pN, []);
      d.PART_ONLY_INDEX.get(pN).push(k);
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

function renderInterchanges(panelKey, masterKey) {
  const d = DS[panelKey];
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const res = byId(`results-${prefix}`); if (!res) return; res.innerHTML = "";
  if (!d.NODES || !d.NODES[masterKey]) { res.innerHTML = '<div class="empty">No matches found for that brand + part number.</div>'; return; }

  const header = document.createElement("div");
  const masterHasSpecs = !!(d.NODES[masterKey] && d.NODES[masterKey].s && Object.keys(d.NODES[masterKey].s).length);
  header.className = "pill note clickable" + (masterHasSpecs ? " has-specs" : "");
  header.title = "Double-click to view specs (if this part has them)";
  header.innerHTML = '<span class="brand">' + escapeHtml(d.NODES[masterKey].b) + '</span>' +
                     '<span class="part">' + escapeHtml(d.NODES[masterKey].p) + '</span>' +
                     '<span style="opacity:.7">is linked to:</span>';
  header.ondblclick = () => openSpecs(panelKey, masterKey);
  res.appendChild(header);

  let neighbors = unique((d.GRAPH[masterKey] || []).filter(k => {
    const p = d.NODES[k]?.p ?? ""; return p.trim().toLowerCase() !== "nan";
  }));

  if (focusOn) {
    neighbors = neighbors.filter(k => brandAllowedForFocus(d.NODES[k]?.b));
  }

  if (!neighbors.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No interchanges found.";
    res.appendChild(empty);
    return;
  }

  neighbors.forEach(k => {
    const pill = document.createElement("div");
    const hasSpecs = !!(d.NODES[k] && d.NODES[k].s && Object.keys(d.NODES[k].s).length);
    pill.className = "pill" + (hasSpecs ? " has-specs" : "");
    pill.title = "Double-click for specifications (if available on that exact part)";
    pill.innerHTML = '<span class="brand">' + escapeHtml(d.NODES[k].b) + '</span>' +
                     '<span class="part">' + escapeHtml(d.NODES[k].p) + '</span>';
    pill.ondblclick = () => openSpecs(panelKey, k);
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
function openSpecs(panelKey, targetKey) {
  const d = DS[panelKey];
  const backdrop = ensureModal();
  const body = byId("specsBody");
  const title = byId("specsTitle");
  const sub = byId("specsSub");
  if (!body || !title || !sub) return alert("Unable to open specs view.");

  body.innerHTML = ""; sub.textContent = "";
  const main = d && d.NODES && d.NODES[targetKey];
  if (!main) { alert("No specifications are available for this part."); return; }
  const mainSpecs = main.s;

  if (!(mainSpecs && Object.keys(mainSpecs).length)) {
    alert("No specifications are available for this part.");
    return;
  }

  title.textContent = (main.b || "") + ": " + (main.p || "");

  const fromSpecs = extractResourcesFromSpecs(mainSpecs);
  const extraImgs = Array.isArray(main.i) ? main.i : [];
  const extraDocs = Array.isArray(main.d) ? main.d : []; // {url,label}

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

function unlockUI() {
  byId("appRoot")?.classList.remove("disabled");
  ["brand-b","part-b","searchBtn-b","resetBtn-b","focus-b",
   "brand-c","part-c","searchBtn-c","resetBtn-c","focus-c",
   "brand-m","part-m","searchBtn-m","resetBtn-m","focus-m",
   "brand-o","part-o","searchBtn-o","resetBtn-o","focus-o",
   "brand-p","part-p","searchBtn-p","resetBtn-p","focus-p"].forEach(id => { const el = byId(id); if (el) el.disabled = false; });
  const loader = byId("loader"); if (loader) { loader.classList.add("hidden"); loader.setAttribute("aria-busy","false"); }
}

function wirePanel(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const input = byId(`part-${prefix}`);
  const brandSel = byId(`brand-${prefix}`);
  const searchBtn = byId(`searchBtn-${prefix}`);
  const resetBtn = byId(`resetBtn-${prefix}`);
  const suggestBox = byId(`suggestList-${prefix}`);
  const focusChk = byId(`focus-${prefix}`);

  async function refreshSuggestions() {
    const q = norm(input?.value || "");
    const bN = norm(brandSel?.value || "");
    if (!q) { showSuggest(panelKey, []); return; }
    if (!DS[panelKey].loaded) await loadTabData(panelKey);
    showSuggest(panelKey, topSuggestions(panelKey, q, bN, 5));
  }

  input?.addEventListener("input", refreshSuggestions);
  brandSel?.addEventListener("change", async () => {
    const res = byId(`results-${prefix}`); if (res) res.innerHTML = "";
    await refreshSuggestions();
  });

  input?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const q = norm(input.value);
      const bN = norm(brandSel?.value || "");
      if (!DS[panelKey].loaded) await loadTabData(panelKey);
      const items = topSuggestions(panelKey, q, bN, 5);
      if (items.length) {
        const [brand, ...rest] = items[0].d.split(":");
        if (brandSel) brandSel.value = brand;
        input.value = rest.join(":");
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

async function ensureLoaded(panelKey) {
  if (!DS[panelKey].loaded) {
    await loadTabData(panelKey);
  }
  unlockUI();
}

function doSearch(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  const d = DS[panelKey];
  const brandSel = byId(`brand-${prefix}`);
  const partInp = byId(`part-${prefix}`);
  const res = byId(`results-${prefix}`);

  if (!d.loaded) {
    res.innerHTML = '<div class="empty">Loading data…</div>';
    ensureLoaded(panelKey).then(() => doSearch(panelKey));
    return;
  }

  const brand = brandSel?.value ?? "";
  const partRaw = partInp?.value ?? "";

  if (!partRaw.trim()) {
    if (res) res.innerHTML = '<div class="empty">Enter a part number to search.</div>';
    return;
  }

  const wantBrandN = norm(brand);
  const wantPartN = norm(partRaw);
  let masterKey = null;

  if (wantBrandN) {
    const brandMap = d.BRAND_PART_INDEX && d.BRAND_PART_INDEX.get(wantBrandN);
    if (brandMap) masterKey = brandMap.get(wantPartN) || null;
    if (!masterKey) {
      const cand = topSuggestions(panelKey, wantPartN, wantBrandN, 10);
      if (cand.length) masterKey = cand[0].d;
    }
  } else {
    const keys = d.PART_ONLY_INDEX && d.PART_ONLY_INDEX.get(wantPartN) || [];
    if (keys.length) masterKey = keys[0];
    if (!masterKey) {
      const cand = topSuggestions(panelKey, wantPartN, "", 10);
      if (cand.length) masterKey = cand[0].d;
    }
  }

  if (!masterKey) {
    if (res) res.innerHTML = '<div class="empty">No matches found for that part number.</div>';
    return;
  }

  renderInterchanges(panelKey, masterKey);
}

function resetAll(panelKey) {
  const prefix = panelKey === "pumps" ? "p" : panelKey[0];
  byId(`brand-${prefix}`).value = "";
  byId(`part-${prefix}`).value = "";
  byId(`results-${prefix}`).innerHTML = "";
  hideSuggest(panelKey);
  closeModal();
  byId(`part-${prefix}`).focus();
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  byId(`panel-${tab}`)?.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  ensureModal();

  // Wire per-panel controls first
  wirePanel("bearings");
  wirePanel("couplings");
  wirePanel("motors");
  wirePanel("oils");
  wirePanel("pumps");

  // Initial load just unlocks UI (no datasets yet)
  unlockUI();

  // Tabs: load the dataset for the active tab on first interaction
  document.getElementById("tabs")?.addEventListener("click", async (e) => {
    const t = e.target.closest(".tab"); if (!t) return;
    const key = t.dataset.tab;
    switchTab(key);
    const panelKey = (key === "pumpseals" ? "pumps" :
                     key === "oilseals" ? "oils" : key);
    await ensureLoaded(panelKey);
  });

  // Also load bearings on first paint (most common)
  ensureLoaded("bearings").catch(console.error);

  // Close/Print safety
  byId("closeModal")?.addEventListener("click", closeModal);
  byId("printSpecsBtn")?.addEventListener("click", () => window.print());
  byId("modalBackdrop")?.addEventListener("click", (e) => { if (e.target === byId("modalBackdrop")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
});
