"use strict";
(() => {
  const VERSION = "1.0.0";
  const OZ_G = 31.1035;
  const METALS = {
    gold:      { name: "Gold",      sym: "Au", api: "XAU", range: [500, 25000], def: 4027.8,
                 purities: [["24K  (99.9%)", .999], ["22K  (91.6%)", .916], ["21K  (87.5%)", .875], ["18K  (75%)", .75], ["14K  (58.5%)", .585], ["10K  (41.7%)", .417], ["9K  (37.5%)", .375]], defP: .875 },
    silver:    { name: "Silver",    sym: "Ag", api: "XAG", range: [5, 600], def: 51.7,
                 purities: [["Fine  (99.9%)", .999], ["Sterling  (92.5%)", .925], ["90% coin", .9], ["835", .835], ["80%", .8]], defP: .999 },
    platinum:  { name: "Platinum",  sym: "Pt", api: "XPT", range: [300, 8000], def: 1457.8,
                 purities: [["Fine  (99.95%)", .9995], ["95%", .95], ["90%", .9], ["85%", .85]], defP: .95 },
    palladium: { name: "Palladium", sym: "Pd", api: "XPD", range: [300, 8000], def: 1400,
                 purities: [["Fine  (99.95%)", .9995], ["95%", .95], ["50%", .5]], defP: .95 }
  };
  const ORDER = ["gold", "silver", "platinum", "palladium"];
  const CURS = ["USD", "EUR", "GBP", "AED", "HKD", "CAD"];
  const RATE_RANGE = { EUR: [.3, 3], GBP: [.3, 3], AED: [3.6, 3.75], HKD: [7, 8.5], CAD: [.8, 2.5] };
  const DEF_RATES = { USD: 1, EUR: .86, GBP: .78, AED: 3.6725, HKD: 7.78, CAD: 1.38 };
  const UNITS = { g: ["Grams", 1], ozt: ["Troy oz", OZ_G], dwt: ["Pennyweight", OZ_G / 20], kg: ["Kilograms", 1000] };
  const CHIPS = [["1 g", 1], ["5 g", 5], ["10 g", 10], ["1/10 oz", OZ_G / 10], ["1/4 oz", OZ_G / 4], ["1/2 oz", OZ_G / 2], ["1 oz", OZ_G], ["100 g", 100], ["1 kg", 1000]];
  const FRESH_MS = 5 * 60 * 1000, RATES_FRESH_MS = 12 * 3600 * 1000;
  const KEY = "metalPremium.v1";

  const $ = id => document.getElementById(id);
  const mk = (tag, attrs, text) => {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };

  // ---------- state ----------
  const blank = m => ({ price: "", currency: "USD", weight: "", unit: "g", purity: String(METALS[m].defP), custom: "", spot: "" });
  let S = { metal: "gold", per: {}, live: {}, liveAt: 0, rates: { ...DEF_RATES }, ratesAt: 0, conv: { amount: "100", from: "USD" } };
  ORDER.forEach(m => S.per[m] = blank(m));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") {
      if (ORDER.includes(saved.metal)) S.metal = saved.metal;
      ORDER.forEach(m => { if (saved.per && saved.per[m]) {
        const p = saved.per[m], b = S.per[m];
        for (const k of Object.keys(b)) if (typeof p[k] === "string") b[k] = p[k].slice(0, 24);
        if (!UNITS[b.unit]) b.unit = "g";
        if (!CURS.includes(b.currency)) b.currency = "USD";
      } });
      if (saved.live && typeof saved.live === "object") ORDER.forEach(m => { const v = Number(saved.live[m]); if (v > 0) S.live[m] = v; });
      S.liveAt = Number(saved.liveAt) || 0;
      if (saved.rates) CURS.forEach(c => { const v = Number(saved.rates[c]); if (v > 0) S.rates[c] = v; });
      S.rates.USD = 1;
      S.ratesAt = Number(saved.ratesAt) || 0;
      if (saved.conv) { if (typeof saved.conv.amount === "string") S.conv.amount = saved.conv.amount.slice(0, 24); if (CURS.includes(saved.conv.from)) S.conv.from = saved.conv.from; }
    }
  } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };

  // ---------- helpers ----------
  const num = s => { const n = Number(String(s).replace(/,/g, "").trim()); return Number.isFinite(n) && n > 0 ? n : null; };
  const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = n => "$" + fmt(n);
  const cur = () => S.per[S.metal];
  const timeStr = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  function spotInfo(m) {
    const typed = num(S.per[m].spot);
    if (typed) return { v: typed, kind: "typed" };
    if (S.live[m]) return { v: S.live[m], kind: "live" };
    return { v: METALS[m].def, kind: "default" };
  }
  function purityOf(p) {
    if (p.purity === "custom") { const c = num(p.custom); return c && c <= 100 ? c / 100 : null; }
    const v = Number(p.purity); return v > 0 && v <= 1 ? v : null;
  }

  // ---------- build static controls ----------
  CURS.forEach(c => { $("currency").append(mk("option", { value: c }, c)); $("convFrom").append(mk("option", { value: c }, c)); });
  for (const u in UNITS) $("unit").append(mk("option", { value: u }, UNITS[u][0]));
  CHIPS.forEach(([label, g], i) => $("chips").append(mk("button", { type: "button", class: "chip", "data-i": String(i) }, label)));
  ORDER.forEach(m => {
    const b = mk("button", { type: "button", class: "dock-btn", role: "tab", "data-metal": m, "aria-selected": "false" });
    b.append(mk("span", { class: "coin", "aria-hidden": "true" }, METALS[m].sym), mk("span", null, METALS[m].name));
    $("dock").append(b);
  });
  $("ver").textContent = VERSION;

  // ---------- render ----------
  function fillPurity() {
    const m = METALS[S.metal], sel = $("purity");
    sel.replaceChildren();
    m.purities.forEach(([l, v]) => sel.append(mk("option", { value: String(v) }, l)));
    sel.append(mk("option", { value: "custom" }, "Custom…"));
    const want = cur().purity;
    sel.value = [...sel.options].some(o => o.value === want) ? want : String(m.defP);
    cur().purity = sel.value;
  }

  function syncInputs() {
    const p = cur();
    $("price").value = p.price; $("currency").value = p.currency;
    $("weight").value = p.weight; $("unit").value = p.unit;
    $("custom").value = p.custom; $("spot").value = p.spot;
    fillPurity();
    $("customWrap").hidden = $("purity").value !== "custom";
  }

  function render() {
    const m = METALS[S.metal], p = cur();
    document.body.dataset.metal = S.metal;
    $("metalName").textContent = m.name;
    document.querySelectorAll(".dock-btn").forEach(b => b.setAttribute("aria-selected", String(b.dataset.metal === S.metal)));

    const sp = spotInfo(S.metal);
    $("spotHead").textContent = usd(sp.v) + " /oz";
    if (!$("spot").value) $("spot").placeholder = fmt(sp.v);
    $("spotLive").hidden = sp.kind !== "typed" || !S.live[S.metal];
    $("spotNote").textContent = sp.kind === "typed" ? "Using the price you typed."
      : sp.kind === "live" ? "Live price from gold-api.com" + (S.liveAt ? ", updated " + timeStr(S.liveAt) + "." : ".")
      : "Live price not loaded. Showing a typical value, so type the current one or tap refresh.";

    const rate = S.rates[p.currency], price = num(p.price);
    const rn = $("rateNote");
    if (p.currency !== "USD") {
      rn.hidden = false;
      rn.textContent = price ? "About " + usd(price / rate) + " USD at 1 USD = " + fmt(rate, 4) + " " + p.currency + "." : "1 USD = " + fmt(rate, 4) + " " + p.currency + ".";
    } else rn.hidden = true;

    const grams = num(p.weight) ? num(p.weight) * UNITS[p.unit][1] : null;
    document.querySelectorAll(".chip").forEach(c => {
      const g = CHIPS[Number(c.dataset.i)][1];
      c.classList.toggle("on", !!grams && Math.abs(grams - g) < 1e-6);
    });

    const pur = purityOf(p);
    $("price").removeAttribute("aria-invalid");
    $("custom").setAttribute("aria-invalid", String(p.purity === "custom" && p.custom !== "" && !pur));

    const plate = $("plate"), prem = $("premium"), dot = $("dot"), det = $("details");
    det.replaceChildren();
    const row = (k, v) => { const r = mk("div", { class: "row" }); r.append(mk("dt", null, k), mk("span", { class: "leader", "aria-hidden": "true" }), mk("dd", null, v)); det.append(r); };
    plate.classList.remove("below"); dot.hidden = true;

    if (!price || !grams || !pur) {
      prem.textContent = "—";
      $("plateLine").textContent = !price ? "Enter the asking price." : !grams ? "Enter the weight." : "Enter the purity.";
      $("plateSub").textContent = "Melt value: " + (grams && pur ? usd(sp.v * grams / OZ_G * pur) : "needs weight and purity");
      row("Spot price", usd(sp.v) + " /oz");
      return;
    }
    const vendor = price / rate, pureOz = grams / OZ_G * pur, melt = sp.v * pureOz;
    const pct = (vendor - melt) / melt * 100, diff = vendor - melt;
    const abs = Math.abs(pct);
    prem.textContent = (pct < 0 ? "−" : "+") + fmt(abs, abs >= 1000 ? 0 : 1) + "%";
    plate.classList.toggle("below", pct < 0);
    const tier = pct <= 5 ? ["good", "Low markup"] : pct <= 15 ? ["ok", "Moderate markup"] : pct <= 30 ? ["fair", "Fair markup"] : pct <= 60 ? ["high", "High markup"] : ["vhigh", "Very high markup"];
    dot.hidden = false; dot.dataset.tier = tier[0];
    $("plateLine").textContent = (pct < 0 ? "Below melt value" : "Above melt value") + " · " + tier[1];
    $("plateSub").textContent = "You pay " + usd(vendor) + ", melt is " + usd(melt);
    row("Asking price (USD)", usd(vendor));
    row("Melt value", usd(melt));
    row(pct < 0 ? "Below melt by" : "Premium paid", usd(Math.abs(diff)));
    row("Pure " + m.name.toLowerCase(), fmt(grams * pur, 2) + " g  (" + fmt(pureOz, 4) + " oz)");
    row("You pay per pure gram", usd(vendor / (grams * pur)));
    row("Spot per pure gram", usd(sp.v / OZ_G));
    row("Break-even spot", usd(vendor / pureOz) + " /oz");
    row("Spot price used", usd(sp.v) + " /oz");
  }

  // ---------- converter + rates ----------
  function renderConv() {
    const amt = num(S.conv.amount), out = $("convOut");
    out.replaceChildren();
    CURS.forEach(c => {
      const li = mk("li", c === S.conv.from ? { class: "self" } : null);
      li.append(mk("span", null, c), mk("span", null, amt ? fmt(amt / S.rates[S.conv.from] * S.rates[c]) : "—"));
      out.append(li);
    });
  }
  function buildRates() {
    const g = $("ratesGrid"); g.replaceChildren();
    CURS.filter(c => c !== "USD").forEach(c => {
      const l = mk("label", null, "1 USD in " + c), i = mk("input", { inputmode: "decimal", autocomplete: "off", "data-c": c, "aria-label": "1 USD in " + c });
      i.value = String(S.rates[c]); l.append(i); g.append(l);
    });
  }
  function syncRates() {
    document.querySelectorAll("#ratesGrid input").forEach(i => { if (document.activeElement !== i) i.value = String(S.rates[i.dataset.c]); });
    $("ratesStatus").textContent = S.ratesAt ? "Rates updated " + new Date(S.ratesAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + "." : "Using built-in rates. Tap Update rates for today's.";
  }

  // ---------- network (two fixed endpoints, plain data only) ----------
  async function getJSON(url) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 10000);
    try { const r = await fetch(url, { cache: "no-store", signal: c.signal, credentials: "omit", referrerPolicy: "no-referrer" }); if (!r.ok) throw 0; return await r.json(); }
    finally { clearTimeout(t); }
  }
  let spotBusy = false;
  async function loadSpots(force) {
    if (spotBusy || (!force && S.liveAt && Date.now() - S.liveAt < FRESH_MS)) return;
    spotBusy = true; $("spotRefresh").classList.add("busy");
    let got = 0;
    await Promise.all(ORDER.map(async k => {
      try {
        const j = await getJSON("https://api.gold-api.com/price/" + METALS[k].api);
        const p = Number(j.price ?? j.priceUsd ?? j.mid), [lo, hi] = METALS[k].range;
        if (p >= lo && p <= hi) { S.live[k] = p; got++; }
      } catch (_) {}
    }));
    if (got) { S.liveAt = Date.now(); save(); }
    else if (force) $("spotNote").textContent = "Couldn't reach the price feed. Check your connection, or type the price.";
    spotBusy = false; $("spotRefresh").classList.remove("busy");
    if (got || !force) render();
  }
  async function loadRates(force) {
    if (!force && S.ratesAt && Date.now() - S.ratesAt < RATES_FRESH_MS) return;
    const b = $("ratesBtn"); b.disabled = true;
    try {
      const j = await getJSON("https://open.er-api.com/v6/latest/USD");
      let n = 0;
      for (const c in RATE_RANGE) { const v = Number(j && j.rates && j.rates[c]); if (v >= RATE_RANGE[c][0] && v <= RATE_RANGE[c][1]) { S.rates[c] = v; n++; } }
      if (n) { S.ratesAt = Date.now(); save(); }
      else if (force) $("ratesStatus").textContent = "Got an unexpected answer, so rates were not changed.";
    } catch (_) { if (force) $("ratesStatus").textContent = "Couldn't reach the rates service. Your current rates are kept."; }
    b.disabled = false; syncRates(); render(); renderConv();
  }

  // ---------- events ----------
  const bind = (id, key) => $(id).addEventListener("input", e => { cur()[key] = e.target.value; save(); render(); });
  bind("price", "price"); bind("weight", "weight"); bind("custom", "custom"); bind("spot", "spot");
  $("currency").addEventListener("change", e => { cur().currency = e.target.value; save(); render(); });
  $("unit").addEventListener("change", e => {
    const p = cur(), w = num(p.weight);
    if (w) { const g = w * UNITS[p.unit][1]; p.weight = String(+(g / UNITS[e.target.value][1]).toPrecision(6)); $("weight").value = p.weight; }
    p.unit = e.target.value; save(); render();
  });
  $("purity").addEventListener("change", e => {
    cur().purity = e.target.value; $("customWrap").hidden = e.target.value !== "custom";
    save(); render(); if (e.target.value === "custom") $("custom").focus();
  });
  $("chips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    const g = CHIPS[Number(b.dataset.i)][1], p = cur();
    p.unit = "g"; p.weight = String(+g.toPrecision(6)); $("unit").value = "g"; $("weight").value = p.weight; save(); render();
  });
  $("dock").addEventListener("click", e => {
    const b = e.target.closest(".dock-btn"); if (!b || b.dataset.metal === S.metal) return;
    S.metal = b.dataset.metal; save(); syncInputs(); render();
    const pl = $("plate"); pl.classList.remove("sheen"); void pl.offsetWidth; pl.classList.add("sheen");
    window.scrollTo(0, 0);
  });
  $("spotRefresh").addEventListener("click", () => loadSpots(true));
  $("spotLive").addEventListener("click", () => { cur().spot = ""; $("spot").value = ""; save(); render(); });

  const dlg = $("tools");
  $("toolsBtn").addEventListener("click", () => { renderConv(); syncRates(); dlg.showModal(); });
  $("closeTools").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  $("convAmount").addEventListener("input", e => { S.conv.amount = e.target.value; save(); renderConv(); });
  $("convFrom").addEventListener("change", e => { S.conv.from = e.target.value; save(); renderConv(); });
  $("ratesGrid").addEventListener("input", e => {
    const i = e.target.closest("input"); if (!i) return;
    const v = num(i.value); if (v) { S.rates[i.dataset.c] = v; save(); renderConv(); render(); }
  });
  $("ratesBtn").addEventListener("click", () => loadRates(true));

  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("installBtn").hidden = false; });
  $("installBtn").addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (_) {} deferred = null; $("installBtn").hidden = true; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadSpots(false); });

  // ---------- start ----------
  $("convAmount").value = S.conv.amount; $("convFrom").value = S.conv.from;
  buildRates(); syncInputs(); render(); renderConv(); syncRates();
  loadSpots(false); loadRates(false);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
