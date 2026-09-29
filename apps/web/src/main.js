import Chart from "chart.js/auto";
import { se } from "@housecalc/core";
import ratesData from "../../../data/rates/se.json";
import { renderAffiliates } from "./affiliates.js";

// The UI is Swedish-only for now; other markets plug in through @housecalc/core.
const market = se;
const { computeForPrice, recommendedAmortPct, projectPayoff } = market;
const ranteavdragMonthlyCredit = market.monthlyInterestTaxCredit;

const fmt = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr";

const fmtMon = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr/mån";

const fmtThousands = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n);

const parseDigits = (s) => parseInt(String(s).replace(/\D/g, "") || "0", 10);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const priceInput = $("#price-input");
const priceSlider = $("#price-slider");
const hpInput = $("#hp-input");
const hpSlider = $("#hp-slider");
const hpMeta = $("#hp-meta");
const rateInput = $("#rate-input");
const rateSlider = $("#rate-slider");
const amortInput = $("#amort-input");
const amortSlider = $("#amort-slider");
const amortMeta = $("#amort-meta");
const existingPantbrevInput = $("#existing-pantbrev-input");
const feeInput = $("#fee-input");
const feeSlider = $("#fee-slider");
const hpRows = $("#hp-rows");

const incomeInput = document.querySelector('[name="gross_household_income_kr_year"]');
const horizonInput = document.querySelector('[name="horizon_years"]');
const appreciationInput = $("#appreciation-input");
let payoffChart = null;

let suppressSync = false;
const comparePrices = [];

// ===== Bank-spread state =====
//
// `compareBanks` is the set of bank *names* currently included in the drawer
// comparison. Default = all storbanker + SBAB (the user's typical baseline).
// `expandedRows` tracks which price rows show the per-bank breakdown.
// `compareTenor` selects which rate column (snittränta horizon) to use.
const DEFAULT_COMPARE_BANKS = [
  "SEB",
  "Swedbank",
  "Handelsbanken",
  "Nordea",
  "Länsförsäkringar",
  "SBAB",
];
const compareBanks = new Set(DEFAULT_COMPARE_BANKS);
const expandedRows = new Set();
let compareTenor = "3m";
// Which rate type to use for the comparison cost: "list" = aktuell listränta
// (today's advertised rate), "snitt" = snittränta (FI's monthly average of
// what customers actually got). Default to list because it's "now-now" data;
// snitt is shown alongside for context.
let compareRateType = "list";
const TENOR_OPTIONS = [
  { key: "3m", label: "3 mån" },
  { key: "1y", label: "1 år" },
  { key: "3y", label: "3 år" },
  { key: "5y", label: "5 år" },
];
const RATE_TYPE_OPTIONS = [
  { key: "list", label: "Aktuell" },
  { key: "snitt", label: "Snitt" },
];

// ===== Live thousand-separator formatting for text inputs =====

function attachThousandFormatter(input) {
  input.addEventListener("input", () => {
    const old = input.value;
    const cursor = input.selectionStart ?? old.length;
    const digitsBeforeCursor = old.slice(0, cursor).replace(/\D/g, "").length;
    const digits = old.replace(/\D/g, "");
    const formatted = digits ? fmtThousands(+digits) : "";
    if (formatted === old) return;
    input.value = formatted;
    let newCursor = 0;
    let seen = 0;
    while (newCursor < formatted.length && seen < digitsBeforeCursor) {
      if (/\d/.test(formatted[newCursor])) seen++;
      newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
  });
}

attachThousandFormatter(priceInput);
attachThousandFormatter(hpInput);
attachThousandFormatter(existingPantbrevInput);
attachThousandFormatter(feeInput);

// ===== Read params from DOM =====

function readPrimaryParams() {
  const price = parseDigits(priceInput.value);
  const hpFromSources = readHandpenningSources().reduce(
    (s, x) => s + (x.amount_kr || 0),
    0,
  );
  const hpTotal = hpFromSources > 0 ? hpFromSources : parseDigits(hpInput.value);
  const hpPct = price > 0 ? (hpTotal / price) * 100 : 0;
  return {
    price,
    hpTotal,
    hpPct,
    existingPantbrev: parseDigits(existingPantbrevInput.value),
    rate: parseFloat(rateInput.value || "0"),
    amort: parseFloat(amortInput.value || "0"),
    monthlyFee: parseDigits(feeInput.value),
    horizonYears: parseInt(horizonInput.value || "10", 10),
    grossIncome: parseInt(incomeInput.value || "0", 10),
  };
}

// ===== Handpenning sources =====

function addHandpenningRow(label = "", amount = "") {
  const row = document.createElement("div");
  row.className = "hp-row";
  row.innerHTML = `
    <label>Beskrivning
      <input type="text" class="hp-label" value="${label}" placeholder="t.ex. Sparpengar" />
    </label>
    <label>Belopp (kr)
      <input type="number" class="hp-amount" value="${amount}" min="0" />
    </label>
    <button type="button" class="remove">Ta bort</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    renderLiveSummary();
  });
  row.querySelectorAll("input").forEach((i) =>
    i.addEventListener("input", renderLiveSummary),
  );
  hpRows.appendChild(row);
}

function readHandpenningSources() {
  return Array.from(hpRows.querySelectorAll(".hp-row")).map((r) => ({
    label: r.querySelector(".hp-label").value.trim() || "Källa",
    amount_kr: parseInt(r.querySelector(".hp-amount").value || "0", 10),
  }));
}

// ===== Render =====

function renderLiveSummary() {
  const p = readPrimaryParams();
  const r = computeForPrice(p.price, p);
  const dti = p.grossIncome > 0 ? r.loan / p.grossIncome : 0;

  $("#hero-monthly").textContent = fmtMon(r.monthlyTotal);
  $("#hero-monthly-after").textContent = fmtMon(r.monthlyAfterTax);

  $("#hc-interest").textContent = fmtMon(r.monthlyInterest);
  $("#hc-amort").textContent = fmtMon(r.monthlyAmort);
  $("#hc-fee").textContent = fmtMon(r.monthlyFee);
  $("#hc-total").textContent = fmtMon(r.monthlyTotal);

  $("#hc-lagfart").textContent = fmt(r.lagfart);
  $("#hc-pantbrev").textContent = fmt(r.pantbrev);
  $("#hc-kontantinsats").textContent = fmt(r.hpTotal);
  $("#hc-onetime-total").textContent = fmt(r.onetimeTotal);

  $("#hc-total-cash").textContent = fmt(r.onetimeTotal);
  $("#hcf-kontant").textContent = fmt(r.hpTotal);
  $("#hcf-lagfart").textContent = fmt(r.lagfart);
  $("#hcf-pantbrev").textContent = fmt(r.pantbrev);
  $("#hc-loan").textContent = fmt(r.loan);
  $("#hc-ltv").textContent = `${r.ltv.toFixed(1)}%`;

  hpMeta.textContent = `${p.hpPct.toFixed(1)}% av priset · LTV ${r.ltv.toFixed(1)}%`;
  const recAmort = recommendedAmortPct(r.ltv);
  amortMeta.textContent = `Lagstadgad minimi-amortering: ${recAmort}% (LTV-tier)`;

  updateSliderProgress();
  renderInsights(p, r, dti);
  refreshCompareValues(p);
  refreshHeroSpread(p, r);
  renderPayoff(p, r);
  renderBankRates(p, r);
}

function updateSliderProgress() {
  // Visual fill on the slider track
  for (const s of [priceSlider, hpSlider, rateSlider, amortSlider, feeSlider]) {
    const min = +s.min;
    const max = +s.max;
    const val = +s.value;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    s.style.setProperty("--progress", `${pct}%`);
  }
}

function renderInsights(p, r, dti) {
  const annualAmort = Math.round((r.loan * p.amort) / 100);
  const totalAmort = Math.min(r.loan, annualAmort * p.horizonYears);
  $("#ins-horizon").textContent = p.horizonYears;
  $("#ins-amort-total").textContent = fmt(totalAmort);

  const targetLoan = 0.7 * p.price;
  if (r.loan > targetLoan && annualAmort > 0) {
    const yearsToTier = Math.ceil((r.loan - targetLoan) / annualAmort);
    $("#ins-tier-drop-years").textContent = `${yearsToTier} år`;
    $("#ins-tier-drop-card").hidden = false;
  } else {
    $("#ins-tier-drop-card").hidden = true;
  }

  if (p.grossIncome > 0 && r.loan > 0) {
    $("#ins-dti").textContent = `${dti.toFixed(1)}×`;
    if (dti > 4.5) {
      $("#ins-dti-extra").textContent =
        "Hög skuldkvot — bankens individuella bedömning kan påverkas, men skärpta amorteringskravet (+1%) togs bort 2026-04-01.";
    } else {
      $("#ins-dti-extra").textContent =
        "Under 4,5× — bankens vanliga tröskelvärde för låg risk.";
    }
    $("#ins-dti-card").hidden = false;
  } else {
    $("#ins-dti-card").hidden = true;
  }

  const tierRows = [];
  tierRows.push(`<tr class="current">
    <td>${fmt(p.hpTotal)} (${p.hpPct.toFixed(1)}%, nuvarande)</td>
    <td>${r.ltv.toFixed(1)}%</td>
    <td>${fmt(r.monthlyAmort)}/mån (${p.amort.toFixed(1)}%)</td>
  </tr>`);
  const tiers = [
    { pct: 10, amortPct: 2 },
    { pct: 30, amortPct: 1 },
    { pct: 50, amortPct: 0 },
  ];
  for (const t of tiers) {
    const hp = Math.round((p.price * t.pct) / 100);
    const loan = p.price - hp;
    const ltv = 100 - t.pct;
    const monthly = Math.round((loan * t.amortPct) / 100 / 12);
    tierRows.push(`<tr>
      <td>${fmt(hp)} (${t.pct}%)</td>
      <td>${ltv}%</td>
      <td>${fmt(monthly)}/mån (${t.amortPct}%)</td>
    </tr>`);
  }
  $("#tier-table-body").innerHTML = tierRows.join("");

  const stressDeltas = [0, 1, 2, 3];
  $("#stress-body").innerHTML = stressDeltas
    .map((dp) => {
      const newRate = p.rate + dp;
      const newInterest = Math.round((r.loan * newRate) / 100 / 12);
      const newTotal = newInterest + r.monthlyAmort + r.monthlyFee;
      const afterTax = newTotal - ranteavdragMonthlyCredit(newInterest);
      const rowClass = dp === 0 ? "current" : "";
      const label =
        dp === 0
          ? `${newRate.toFixed(2)}% (nuvarande)`
          : `+${dp.toFixed(1)}pp → ${newRate.toFixed(2)}%`;
      return `<tr class="${rowClass}">
        <td>${label}</td>
        <td>${fmt(newTotal)}/mån</td>
        <td>${fmt(afterTax)}/mån</td>
      </tr>`;
    })
    .join("");
}

// ===== Payoff projection =====

function renderPayoff(p, r) {
  const appreciation = parseFloat(appreciationInput.value || "0");
  const proj = projectPayoff(r.loan, p.price, p.rate, appreciation, 50);

  $("#po-tier-1").textContent = proj.yearTier1 !== null ? `${proj.yearTier1} år` : "—";
  $("#po-tier-0").textContent = proj.yearTier0 !== null ? `${proj.yearTier0} år` : "—";

  if (proj.yearPaidOffFi !== null) {
    $("#po-paid").textContent = `${proj.yearPaidOffFi} år`;
    $("#po-paid-sub").textContent = "Med lagstadgad amortering + värdestegring";
  } else if (proj.yearPaidOffVol !== null) {
    $("#po-paid").textContent = `${proj.yearPaidOffVol} år`;
    $("#po-paid-sub").textContent = "Om du fortsätter 2% även efter att kravet upphör";
  } else {
    $("#po-paid").textContent = "—";
    $("#po-paid-sub").textContent = "Ej fullt avbetalt inom 50 år";
  }

  $("#po-total-interest").textContent = fmt(Math.round(proj.totalInterestFi30));

  const labels = proj.fiSeries.map((d) => `År ${d.year}`);
  const ctx = $("#payoff-chart").getContext("2d");
  if (payoffChart) payoffChart.destroy();
  payoffChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Lagstadgad min-amortering (tier-baserad)",
          data: proj.fiSeries.map((d) => d.remaining),
          borderColor: "#1a4480",
          backgroundColor: "rgba(26,68,128,0.12)",
          fill: true,
          tension: 0.2,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: "Frivilligt 2% hela vägen",
          data: proj.voluntarySeries.map((d) => d.remaining),
          borderColor: "#b85c00",
          backgroundColor: "rgba(184,92,0,0.04)",
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = proj.fiSeries[ctx.dataIndex];
              const ltv = d ? ` · LTV ${d.ltv.toFixed(1)}%` : "";
              return `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}${
                ctx.datasetIndex === 0 ? ltv : ""
              }`;
            },
          },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => fmt(v) },
          title: { display: true, text: "Återstående lån" },
        },
        x: {
          title: { display: true, text: "År från köp" },
        },
      },
    },
  });
}

// ===== Bank spread: derive min/avg/max monthly cost across selected banks =====

function getSelectedBanks() {
  if (!bankRatesData?.banks) return [];
  return bankRatesData.banks.filter((b) => compareBanks.has(b.name));
}

// Resolve a bank's rate for the active tenor + rate-type, with fallbacks.
// Order: requested type@tenor → other type@tenor → requested type@3m → any 3m.
// `source` tells the UI whether this is the "primary" hit or a fallback so
// it can mark the row.
function bankRateForTenor(bank, tenor) {
  const primary = compareRateType; // "list" or "snitt"
  const other = primary === "list" ? "snitt" : "list";
  const tryBuckets = [
    { rate: bank[primary]?.[tenor], source: primary, tenor, fallback: false },
    { rate: bank[other]?.[tenor], source: other, tenor, fallback: true },
    { rate: bank[primary]?.["3m"], source: primary, tenor: "3m", fallback: true },
    { rate: bank[other]?.["3m"], source: other, tenor: "3m", fallback: true },
  ];
  for (const t of tryBuckets) {
    if (Number.isFinite(t.rate)) return t;
  }
  return null;
}

/**
 * Compute min / avg / max monthly cost across the currently-selected banks
 * for a given price. `baseParams` supplies hpPct, amort, monthlyFee,
 * existingPantbrev — everything except the per-bank rate.
 *
 * Returns { min, max, avg, byBank: [{ name, type, rate, source, tenor,
 * monthlyTotal, monthlyAfterTax }] } sorted ascending by monthlyTotal.
 * Empty array when no banks selected or no rate data loaded.
 */
function computeBankSpread(price, baseParams) {
  const banks = getSelectedBanks();
  const byBank = banks
    .map((b) => {
      const info = bankRateForTenor(b, compareTenor);
      if (!info) return null;
      const r = computeForPrice(price, { ...baseParams, rate: info.rate });
      // Surface the "other" rate at the SAME tenor used (snitt if primary is
      // list and vice versa) so the breakdown line can show both numbers.
      const otherType = info.source === "list" ? "snitt" : "list";
      const otherRate = b[otherType]?.[info.tenor];
      return {
        name: b.name,
        type: b.type,
        rate: info.rate,
        rateType: info.source,
        tenor: info.tenor,
        fallback: !!info.fallback,
        otherType,
        otherRate: Number.isFinite(otherRate) ? otherRate : null,
        snittPeriod: b.snitt_period ?? null,
        monthlyTotal: r.monthlyTotal,
        monthlyAfterTax: r.monthlyAfterTax,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.monthlyTotal - b.monthlyTotal);

  if (byBank.length === 0) return { min: null, max: null, avg: null, byBank: [] };
  const totals = byBank.map((b) => b.monthlyTotal);
  return {
    min: totals[0],
    max: totals[totals.length - 1],
    avg: Math.round(totals.reduce((s, t) => s + t, 0) / totals.length),
    byBank,
  };
}

// ===== Compare drawer: bank chips + tenor + per-row spread w/ expandable banks =====
//
// Two-tier render strategy:
//  - renderCompareDrawer() rebuilds DOM. Called on structural changes
//    (bank toggle, tenor change, price add/remove, row expand/collapse).
//  - refreshCompareValues(params) patches numbers in-place. Called from
//    renderLiveSummary() so slider/input changes don't blow away focus
//    inside the row's price input.
//
// The "current price" row (data-row="current") mirrors the main slider and
// is read-only. Alternative rows have an editable price input.

function escapeAttrJs(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Hero spread callout: one-liner under the main monthly value showing the
// min–max monthly cost across the currently-selected banks for the current
// price. Hides when there are 0 or 1 banks (nothing to "spread").
function refreshHeroSpread(p, r) {
  const host = $("#hero-spread");
  if (!host) return;
  if (!bankRatesData?.banks) {
    host.hidden = true;
    return;
  }
  const params = p ?? readPrimaryParams();
  const spread = computeBankSpread(params.price, params);
  if (spread.byBank.length < 2) {
    host.hidden = true;
    return;
  }
  const cheapest = spread.byBank[0];
  const priciest = spread.byBank[spread.byBank.length - 1];
  host.hidden = false;
  host.innerHTML =
    `Mellan <strong>${fmtMon(spread.min)}</strong> (${escapeAttrJs(cheapest.name)}) ` +
    `och <strong>${fmtMon(spread.max)}</strong> (${escapeAttrJs(priciest.name)}) ` +
    `över ${spread.byBank.length} valda banker. ` +
    `<button type="button" class="hero-spread-link" id="hero-spread-link" aria-label="Öppna jämförelsen längst ner på sidan">Se jämförelsen →</button>`;
}

// Delegated handler so the link survives renderLiveSummary() rebuilds.
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t && t.id === "hero-spread-link") {
    const drawer = $("#compare-drawer");
    if (drawer && !drawer.classList.contains("is-open")) {
      $("#compare-drawer-toggle")?.click();
    }
    drawer?.scrollIntoView({ behavior: "smooth", block: "end" });
  }
});

// Sync the bank-rates table's "Jämför" toggle buttons with the current
// compareBanks set. Lightweight: only toggles classes/labels on existing rows.
// Falls back to a full rerender if the row count and bank set drift.
function renderBankRatesTableSelection() {
  const rows = $$("#bank-rates-body tr[data-bank-name]");
  if (rows.length === 0) {
    // No table rendered yet; full render path will handle it.
    return;
  }
  rows.forEach((tr) => {
    const name = tr.dataset.bankName;
    const btn = tr.querySelector(".bank-compare-toggle");
    if (!btn) return;
    const active = compareBanks.has(name);
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = active ? "✓" : "+";
    const aria = active
      ? `Ta bort ${name} från jämförelsen`
      : `Lägg till ${name} i jämförelsen`;
    btn.setAttribute("aria-label", aria);
    btn.setAttribute("title", aria);
  });
  updateCompareBanner();
}

function renderCompareDrawer() {
  renderBankChips();
  renderBankPopover();
  renderTenorPills();
  renderPriceRows();
  updateCompareCount();
  refreshCompareValues(readPrimaryParams());
}

function updateCompareCount() {
  const drawerCount = $("#compare-count");
  if (drawerCount) drawerCount.textContent = comparePrices.length;
  const bankCount = $("#cd-bank-count");
  if (bankCount) bankCount.textContent = compareBanks.size;
}

// ----- Bank chip row -----

function renderBankChips() {
  const container = $("#cd-bank-chips");
  if (!container) return;
  if (compareBanks.size === 0) {
    container.innerHTML =
      `<span class="cd-bank-empty">Inga banker valda. Klicka <em>+ Lägg till bank</em> för att jämföra månadskostnader.</span>`;
    return;
  }
  // Sort chips by bank name for stable order.
  const names = Array.from(compareBanks).sort((a, b) => a.localeCompare(b, "sv"));
  container.innerHTML = names
    .map((name) => {
      const type = bankRatesData?.banks?.find((b) => b.name === name)?.type ?? "";
      const dot = type ? `<span class="bank-dot bank-dot--${type}"></span>` : "";
      return `<button type="button" class="cd-bank-chip" data-bank="${escapeAttrJs(name)}" aria-label="Ta bort ${escapeAttrJs(name)} från jämförelsen">
        ${dot}${escapeAttrJs(name)}
        <span class="cd-bank-chip-x" aria-hidden="true">×</span>
      </button>`;
    })
    .join("");
  container.querySelectorAll(".cd-bank-chip").forEach((btn) => {
    btn.addEventListener("click", () => toggleCompareBank(btn.dataset.bank));
  });
}

// ----- Bank popover (full list grouped by type) -----

function renderBankPopover() {
  const pop = $("#cd-bank-popover");
  if (!pop) return;
  if (!bankRatesData?.banks) {
    pop.innerHTML = `<div class="small muted">Bankdata laddas…</div>`;
    return;
  }
  const grouped = new Map();
  for (const b of bankRatesData.banks) {
    if (!grouped.has(b.type)) grouped.set(b.type, []);
    grouped.get(b.type).push(b);
  }
  const order = ["storbank", "niche", "borgo", "pb", "subprime"];
  const groups = order.filter((k) => grouped.has(k));
  pop.innerHTML = groups
    .map((type) => {
      const label = BANK_TYPE_LABEL[type] ?? type;
      const items = grouped
        .get(type)
        .sort((a, b) => a.name.localeCompare(b.name, "sv"))
        .map((b) => {
          const active = compareBanks.has(b.name);
          return `<button type="button" class="cd-bank-popover-item${active ? " is-active" : ""}" data-bank="${escapeAttrJs(b.name)}" aria-pressed="${active}">
            <span class="bank-dot bank-dot--${b.type}"></span>${escapeAttrJs(b.name)}
          </button>`;
        })
        .join("");
      return `<div class="cd-bank-popover-group">
        <div class="cd-bank-popover-group-label"><span class="bank-dot bank-dot--${type}"></span>${label}</div>
        <div class="cd-bank-popover-list">${items}</div>
      </div>`;
    })
    .join("");
  pop.querySelectorAll(".cd-bank-popover-item").forEach((btn) => {
    btn.addEventListener("click", () => toggleCompareBank(btn.dataset.bank));
  });
}

function toggleCompareBank(name) {
  if (!name) return;
  if (compareBanks.has(name)) compareBanks.delete(name);
  else compareBanks.add(name);
  renderCompareDrawer();
  renderBankRatesTableSelection();
  refreshHeroSpread();
}

// ----- Tenor pills -----

function renderTenorPills() {
  const container = $("#cd-tenor-pills");
  if (!container) return;
  container.innerHTML = TENOR_OPTIONS.map(
    (t) =>
      `<button type="button" class="cd-tenor-pill${t.key === compareTenor ? " is-active" : ""}" data-tenor="${t.key}" role="tab" aria-selected="${t.key === compareTenor}">${t.label}</button>`,
  ).join("");
  container.querySelectorAll(".cd-tenor-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      compareTenor = btn.dataset.tenor;
      renderCompareDrawer();
      refreshHeroSpread();
    });
  });

  const typeContainer = $("#cd-rate-type-pills");
  if (typeContainer) {
    typeContainer.innerHTML = RATE_TYPE_OPTIONS.map(
      (t) =>
        `<button type="button" class="cd-tenor-pill${t.key === compareRateType ? " is-active" : ""}" data-rate-type="${t.key}" role="tab" aria-selected="${t.key === compareRateType}">${t.label}</button>`,
    ).join("");
    typeContainer.querySelectorAll(".cd-tenor-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        compareRateType = btn.dataset.rateType;
        renderCompareDrawer();
        refreshHeroSpread();
      });
    });
  }
}

// ----- Price rows (cards) -----

function renderPriceRows() {
  const container = $("#cd-rows");
  if (!container) return;
  const rows = [buildPriceRowHtml("current")];
  comparePrices.forEach((_price, idx) => rows.push(buildPriceRowHtml(String(idx))));
  container.innerHTML = rows.join("");
  wirePriceRowEvents();
}

function buildPriceRowHtml(rowKey) {
  const isCurrent = rowKey === "current";
  const isExpanded = expandedRows.has(rowKey);
  const chevLabel = isExpanded ? "Dölj banker" : "Visa banker";

  const priceCell = isCurrent
    ? `<span class="cd-row-price">
         <strong class="cd-row-price-display">— kr</strong>
         <span class="cd-row-tag">nuvarande</span>
       </span>`
    : `<span class="cd-row-price">
         <input type="text" inputmode="numeric" class="cd-row-price-input"
                data-idx="${escapeAttrJs(rowKey)}"
                value="${fmtThousands(comparePrices[parseInt(rowKey, 10)] ?? 0)}"
                aria-label="Pris för jämförelserad" />
         <span class="control-unit small">kr</span>
       </span>`;

  const altActions = isCurrent
    ? ""
    : `<button type="button" class="cd-row-apply" data-idx="${escapeAttrJs(rowKey)}">Räkna med</button>
       <button type="button" class="cd-row-remove" data-idx="${escapeAttrJs(rowKey)}" aria-label="Ta bort raden">×</button>`;

  const expandBtn = `<button type="button" class="cd-row-expand-btn${isExpanded ? " is-open" : ""}" data-row="${escapeAttrJs(rowKey)}" aria-expanded="${isExpanded}">
    <span class="cd-chev" aria-hidden="true">▼</span><span class="cd-expand-label">${chevLabel}</span>
  </button>`;

  return `
    <article class="cd-row${isCurrent ? " is-current" : ""}" data-row="${escapeAttrJs(rowKey)}">
      <div class="cd-row-head">
        ${priceCell}
        <span class="cd-row-actions">${altActions}${expandBtn}</span>
      </div>
      <div class="cd-row-loan">—</div>
      <div class="cd-row-spread">—</div>
      ${isExpanded ? `<div class="cd-row-banks"></div>` : ""}
    </article>
  `;
}

function wirePriceRowEvents() {
  $$("#cd-rows .cd-row-price-input").forEach((inp) => {
    attachThousandFormatter(inp);
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      if (Number.isFinite(idx)) {
        comparePrices[idx] = parseDigits(inp.value);
        refreshCompareValues(readPrimaryParams());
        refreshHeroSpread();
      }
    });
  });
  $$("#cd-rows .cd-row-apply").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      applyPrice(comparePrices[idx] ?? 0);
    });
  });
  $$("#cd-rows .cd-row-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (!Number.isFinite(idx)) return;
      comparePrices.splice(idx, 1);
      // Drop any expanded-row tracking for the removed index and shift
      // higher-indexed keys down so they keep pointing to the right rows.
      const next = new Set();
      for (const k of expandedRows) {
        if (k === "current") next.add("current");
        else {
          const n = parseInt(k, 10);
          if (n < idx) next.add(k);
          else if (n > idx) next.add(String(n - 1));
        }
      }
      expandedRows.clear();
      next.forEach((k) => expandedRows.add(k));
      renderCompareDrawer();
    });
  });
  $$("#cd-rows .cd-row-expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.row;
      if (expandedRows.has(key)) expandedRows.delete(key);
      else expandedRows.add(key);
      renderCompareDrawer();
    });
  });
}

// ----- Value refresh (called from renderLiveSummary on every change) -----

function refreshCompareValues(p) {
  const pctDisp = $("#cmp-pct-display");
  if (pctDisp) pctDisp.textContent = `${p.hpPct.toFixed(1)}%`;

  $$("#cd-rows .cd-row").forEach((rowEl) => {
    const rowKey = rowEl.dataset.row;
    let price;
    if (rowKey === "current") {
      price = p.price;
      const priceEl = rowEl.querySelector(".cd-row-price-display");
      if (priceEl) priceEl.textContent = fmt(price);
    } else {
      const idx = parseInt(rowKey, 10);
      price = comparePrices[idx] ?? 0;
    }

    const c = computeForPrice(price, p);
    const spread = computeBankSpread(price, p);

    rowEl.querySelector(".cd-row-loan").innerHTML =
      `Kontant <strong>${fmt(c.hpTotal)}</strong> <span class="muted">(${p.hpPct.toFixed(1)}%)</span> · ` +
      `Lån <strong>${fmt(c.loan)}</strong>`;

    const spreadEl = rowEl.querySelector(".cd-row-spread");
    spreadEl.classList.remove("is-empty");
    if (spread.byBank.length === 0) {
      spreadEl.classList.add("is-empty");
      spreadEl.textContent = "Inga banker valda — lägg till banker ovan för att se månadskostnad.";
    } else if (spread.byBank.length === 1) {
      const only = spread.byBank[0];
      spreadEl.innerHTML =
        `<strong>${fmtMon(only.monthlyTotal)}</strong> hos ${escapeAttrJs(only.name)}` +
        `<span class="cd-row-spread-after">Efter ränteavdrag ${fmtMon(only.monthlyAfterTax)}</span>`;
    } else {
      const cheapest = spread.byBank[0];
      const minAfter = Math.min(...spread.byBank.map((b) => b.monthlyAfterTax));
      const maxAfter = Math.max(...spread.byBank.map((b) => b.monthlyAfterTax));
      spreadEl.innerHTML =
        `<strong>${fmtThousands(spread.min)} – ${fmtThousands(spread.max)}</strong> kr/mån · ` +
        `medel ${fmtThousands(spread.avg)} kr/mån · billigast ${escapeAttrJs(cheapest.name)}` +
        `<span class="cd-row-spread-after">Efter ränteavdrag ${fmtThousands(minAfter)} – ${fmtThousands(maxAfter)} kr/mån</span>`;
    }

    const banksEl = rowEl.querySelector(".cd-row-banks");
    if (banksEl) renderBankBreakdown(banksEl, spread, c);
  });
}

function renderBankBreakdown(container, spread, c) {
  if (spread.byBank.length === 0) {
    container.innerHTML = `<div class="small muted">Inga banker valda för denna jämförelse.</div>`;
    return;
  }
  const min = spread.byBank[0].monthlyTotal;
  const max = spread.byBank[spread.byBank.length - 1].monthlyTotal;
  const typeLabel = (k) => (k === "list" ? "aktuell" : "snitt");
  const lines = spread.byBank
    .map((b) => {
      const isMin = b.monthlyTotal === min;
      const isMax = b.monthlyTotal === max && min !== max;
      const tenorLabel = TENOR_OPTIONS.find((t) => t.key === b.tenor)?.label ?? b.tenor;
      const primaryLabel = typeLabel(b.rateType);
      const fallbackNote = b.fallback ? ` <em>(saknas, föll tillbaka)</em>` : "";
      const otherText =
        b.otherRate !== null
          ? ` · ${typeLabel(b.otherType)} ${fmtPct(b.otherRate)}`
          : "";
      const rateText =
        `<strong>${primaryLabel} ${tenorLabel} ${fmtPct(b.rate)}</strong>${fallbackNote}${otherText}`;
      return `<div class="cd-bank-line">
        <span class="cd-bank-line-name"><span class="bank-dot bank-dot--${b.type}"></span>${escapeAttrJs(b.name)}</span>
        <span class="cd-bank-line-rate">${rateText}</span>
        <span class="cd-bank-line-cost${isMin ? " is-min" : ""}${isMax ? " is-max" : ""}">
          ${fmtMon(b.monthlyTotal)}
          <span class="cd-bank-line-cost-after">efter avdrag ${fmtMon(b.monthlyAfterTax)}</span>
        </span>
        <button type="button" class="cd-bank-line-use" data-rate="${b.rate}" aria-label="Applicera ${escapeAttrJs(b.name)} ränta på kalkylatorn">Använd ränta</button>
      </div>`;
    })
    .join("");

  const engang = `<div class="cd-row-engang">
    Engångskostnader: lagfart <strong>${fmt(c.lagfart)}</strong> · pantbrev <strong>${fmt(c.pantbrev)}</strong> · totalt kontant <strong>${fmt(c.onetimeTotal)}</strong>
  </div>`;

  container.innerHTML = lines + engang;

  container.querySelectorAll(".cd-bank-line-use").forEach((btn) => {
    btn.addEventListener("click", () => applyRate(parseFloat(btn.dataset.rate)));
  });
}

function applyPrice(newPrice) {
  if (!Number.isFinite(newPrice) || newPrice <= 0) return;
  suppressSync = true;
  priceInput.value = fmtThousands(newPrice);
  priceSlider.value = Math.min(
    +priceSlider.max,
    Math.max(+priceSlider.min, newPrice),
  );
  suppressSync = false;
  syncFromPriceOrPct();
  renderLiveSummary();
}

function wireCompareDrawer() {
  const drawer = $("#compare-drawer");
  const toggle = $("#compare-drawer-toggle");
  const body = $("#compare-drawer-body");
  if (!drawer || !toggle || !body) return;

  const stateText = toggle.querySelector(".cdh-state-text");
  const setOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    if (stateText) {
      stateText.textContent = open
        ? stateText.dataset.whenOpen
        : stateText.dataset.whenClosed;
    }
  };
  setOpen(false);
  toggle.addEventListener("click", () => {
    setOpen(!drawer.classList.contains("is-open"));
  });
}

// ===== Slider/input bidirectional sync =====

function syncPriceFromSlider() {
  suppressSync = true;
  priceInput.value = fmtThousands(+priceSlider.value);
  suppressSync = false;
  syncFromPriceOrPct();
  renderLiveSummary();
}

function syncPriceFromInput() {
  if (suppressSync) return;
  const v = parseDigits(priceInput.value);
  if (Number.isFinite(v)) {
    suppressSync = true;
    priceSlider.value = Math.min(+priceSlider.max, Math.max(+priceSlider.min, v));
    suppressSync = false;
  }
  syncFromPriceOrPct();
  renderLiveSummary();
}

function syncFromPriceOrPct() {
  if (suppressSync) return;
  const price = parseDigits(priceInput.value);
  const pct = +hpSlider.value;
  const newAmount = Math.round((price * pct) / 100);
  suppressSync = true;
  hpInput.value = fmtThousands(newAmount);
  suppressSync = false;
}

function syncHpSlider() {
  syncFromPriceOrPct();
  renderLiveSummary();
}

function syncFromHpAmount() {
  if (suppressSync) return;
  const price = parseDigits(priceInput.value);
  const amount = parseDigits(hpInput.value);
  const pct = price > 0 ? (amount / price) * 100 : 0;
  suppressSync = true;
  hpSlider.value = Math.min(50, Math.max(0, pct));
  suppressSync = false;
  renderLiveSummary();
}

function syncRateSlider() {
  suppressSync = true;
  rateInput.value = (+rateSlider.value).toFixed(2);
  suppressSync = false;
  renderLiveSummary();
}
function syncRateInput() {
  if (suppressSync) return;
  const v = +rateInput.value;
  if (Number.isFinite(v)) {
    suppressSync = true;
    rateSlider.value = Math.min(+rateSlider.max, Math.max(+rateSlider.min, v));
    suppressSync = false;
  }
  renderLiveSummary();
}
function syncAmortSlider() {
  suppressSync = true;
  amortInput.value = (+amortSlider.value).toFixed(1);
  suppressSync = false;
  renderLiveSummary();
}
function syncAmortInput() {
  if (suppressSync) return;
  const v = +amortInput.value;
  if (Number.isFinite(v)) {
    suppressSync = true;
    amortSlider.value = Math.min(+amortSlider.max, Math.max(+amortSlider.min, v));
    suppressSync = false;
  }
  renderLiveSummary();
}

priceSlider.addEventListener("input", syncPriceFromSlider);
priceInput.addEventListener("input", syncPriceFromInput);
hpSlider.addEventListener("input", syncHpSlider);
hpInput.addEventListener("input", syncFromHpAmount);
rateSlider.addEventListener("input", syncRateSlider);
rateInput.addEventListener("input", syncRateInput);
amortSlider.addEventListener("input", syncAmortSlider);
amortInput.addEventListener("input", syncAmortInput);

feeSlider.addEventListener("input", () => {
  suppressSync = true;
  feeInput.value = fmtThousands(+feeSlider.value);
  suppressSync = false;
  renderLiveSummary();
});
feeInput.addEventListener("input", () => {
  if (suppressSync) return;
  const v = parseDigits(feeInput.value);
  if (Number.isFinite(v)) {
    suppressSync = true;
    feeSlider.value = Math.min(+feeSlider.max, Math.max(+feeSlider.min, v));
    suppressSync = false;
  }
  renderLiveSummary();
});

$$(".rate-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    suppressSync = true;
    rateInput.value = (+btn.dataset.rate).toFixed(2);
    rateSlider.value = btn.dataset.rate;
    suppressSync = false;
    renderLiveSummary();
  });
});

[existingPantbrevInput, appreciationInput].forEach((el) =>
  el.addEventListener("input", renderLiveSummary),
);
[incomeInput, horizonInput].forEach((el) =>
  el.addEventListener("input", renderLiveSummary),
);

$("#add-hp").addEventListener("click", () => addHandpenningRow());

function addComparePrice() {
  const current = parseDigits(priceInput.value);
  const suggestion = Math.round((current * 1.1) / 10000) * 10000;
  comparePrices.push(suggestion);
  renderCompareDrawer();
  renderLiveSummary();
  // Make sure the drawer is open so the user sees the new row.
  const drawer = $("#compare-drawer");
  if (drawer && !drawer.classList.contains("is-open")) {
    $("#compare-drawer-toggle").click();
  }
  const inputs = $$("#cd-rows .cd-row-price-input");
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.select();
  }
}

// `#add-compare` is rebuilt with each renderCompareDrawer() (it lives inside
// the drawer body), so wire its handler through delegation on document.
document.addEventListener("click", (e) => {
  const target = e.target;
  if (target && target.id === "add-compare") addComparePrice();
  if (target && target.id === "cd-bank-add") toggleBankPopover();
});

function toggleBankPopover() {
  const pop = $("#cd-bank-popover");
  if (!pop) return;
  pop.hidden = !pop.hidden;
}

// ===== Bank rates =====

let bankRatesData = null;

function loadBankRates() {
  bankRatesData = ratesData;
  $("#rates-period").textContent = bankRatesData.snittranta_period;
  $("#bank-rates-updated").textContent = bankRatesData.updated;
  renderFreshness(bankRatesData.updated);
  // Re-render the drawer now that bank chips/popover have real data.
  renderCompareDrawer();
  renderLiveSummary();
}

function renderFreshness(updatedStr) {
  const el = $("#bank-rates-freshness");
  if (!el || !updatedStr) return;
  const updated = new Date(`${updatedStr}T00:00:00`);
  if (Number.isNaN(updated.getTime())) {
    el.textContent = "";
    return;
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - updated.getTime()) / 86_400_000),
  );
  el.textContent =
    days === 0 ? "(idag)" : days === 1 ? "(1 dag sedan)" : `(${days} dagar sedan)`;
  el.classList.toggle("is-stale", days > 35 && days <= 60);
  el.classList.toggle("is-very-stale", days > 60);
  if (days > 35) {
    el.title =
      "Snitträntorna publiceras månadsvis — datan här är äldre än en publiceringscykel. Den automatiska uppdateringen kan ha fallerat.";
  } else {
    el.removeAttribute("title");
  }
}

function fmtPct(n) {
  return n.toFixed(2).replace(".", ",") + "%";
}

const BANK_TYPE_LABEL = {
  storbank: "Storbank",
  niche: "Nischbank",
  borgo: "Borgo",
  pb: "Private Banking",
  subprime: "Second-tier",
};

const bankSort = { column: "snitt3m", dir: "asc" };
const bankHiddenTypes = new Set();

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Automated banks carry their own snitt month; hand-maintained ones inherit the
// period they were last edited for, flagged so stale rows are obvious.
function snittPeriodTag(b) {
  if (b.snitt_period) {
    const [y, m] = b.snitt_period.split("-").map(Number);
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("sv-SE", { month: "short", year: "numeric", timeZone: "UTC" });
    return `<div class="snitt-period" title="Hämtad automatiskt ${escapeAttr(b.fetched ?? "")}">${label}</div>`;
  }
  const period = bankRatesData.manual_period;
  if (!period) return "";
  return `<div class="snitt-period snitt-period--manual" title="Manuellt uppdaterad ${escapeAttr(bankRatesData.manual_updated ?? "")}">${escapeAttr(period)} · manuell</div>`;
}

function decorateBank(b, r) {
  const list3m = b.list?.["3m"] ?? null;
  const snitt3m = b.snitt?.["3m"] ?? null;
  // Pick the best available rate for the monthly-cost column.
  const rateForCalc = snitt3m ?? list3m ?? Object.values(b.snitt ?? {})[0] ?? 0;
  const interest = Math.round((r.loan * rateForCalc) / 100 / 12);
  const monthly = interest + r.monthlyAmort + r.monthlyFee;
  return { bank: b, list3m, snitt3m, rateForCalc, monthly };
}

function bankSortValue(d, column) {
  switch (column) {
    case "name": return (d.bank.name ?? "").toLowerCase();
    case "list3m": return d.list3m ?? Number.POSITIVE_INFINITY;
    case "snitt3m": return d.snitt3m ?? d.rateForCalc ?? Number.POSITIVE_INFINITY;
    case "monthly": return d.monthly ?? Number.POSITIVE_INFINITY;
    case "type": return d.bank.type ?? "";
    default: return 0;
  }
}

function sortDecorated(decorated) {
  const { column, dir } = bankSort;
  const factor = dir === "asc" ? 1 : -1;
  return [...decorated].sort((a, b) => {
    const av = bankSortValue(a, column);
    const bv = bankSortValue(b, column);
    if (typeof av === "string") return av.localeCompare(bv, "sv") * factor;
    return (av - bv) * factor;
  });
}

function updateSortIndicators() {
  $$(".bank-rates-table th.sortable").forEach((th) => {
    const col = th.dataset.sort;
    const arrow = th.querySelector(".sort-arrow");
    if (!arrow) return;
    if (col === bankSort.column) {
      arrow.textContent = bankSort.dir === "asc" ? "▲" : "▼";
      th.classList.add("is-sorted");
      th.setAttribute("aria-sort", bankSort.dir === "asc" ? "ascending" : "descending");
    } else {
      arrow.textContent = "";
      th.classList.remove("is-sorted");
      th.setAttribute("aria-sort", "none");
    }
  });
}

function renderBankRates(p, r) {
  if (!bankRatesData) return;
  const decorated = bankRatesData.banks
    .map((b) => decorateBank(b, r))
    .filter((d) => !bankHiddenTypes.has(d.bank.type));
  const sorted = sortDecorated(decorated);

  const tbody = $("#bank-rates-body");
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Inga banker matchar filtret.</td></tr>`;
    updateSortIndicators();
    return;
  }

  const rows = sorted.map(({ bank: b, list3m, snitt3m, rateForCalc, monthly }) => {
    const c = b.criteria ?? {};
    const krav = c.short_label ?? "—";
    const kravTitle = c.details ? escapeAttr(c.details) : "";
    const typeLabel = BANK_TYPE_LABEL[b.type] ?? b.type ?? "";
    const typeClass = b.type ? `bank-row bank-row--${b.type}` : "bank-row";
    const inCompare = compareBanks.has(b.name);
    const toggleAria = inCompare
      ? `Ta bort ${b.name} från jämförelsen`
      : `Lägg till ${b.name} i jämförelsen`;

    return `<tr class="${typeClass}" data-bank-name="${escapeAttr(b.name)}">
      <td class="col-compare">
        <button type="button" class="bank-compare-toggle${inCompare ? " is-active" : ""}"
                data-bank="${escapeAttr(b.name)}" aria-pressed="${inCompare}" aria-label="${toggleAria}" title="${toggleAria}">
          ${inCompare ? "✓" : "+"}
        </button>
      </td>
      <td>
        <div class="bank-name">${b.name}</div>
        <div class="bank-source"><a href="${b.source}" target="_blank" rel="noopener noreferrer">→ källa</a></div>
      </td>
      <td>${list3m !== null ? fmtPct(list3m) : "—"}</td>
      <td>${snitt3m !== null ? fmtPct(snitt3m) : "—"}${snittPeriodTag(b)}</td>
      <td class="bank-krav" title="${kravTitle}">${krav}</td>
      <td><strong>${fmtMon(monthly)}</strong></td>
      <td><span class="bank-type-label bank-type-label--${b.type}">${typeLabel}</span></td>
      <td><button type="button" class="bank-apply" data-rate="${rateForCalc}" aria-label="Använd ${b.name} snittränta">Räkna med</button></td>
    </tr>`;
  });

  tbody.innerHTML = rows.join("");

  $$(".bank-apply").forEach((btn) => {
    btn.addEventListener("click", () => applyRate(+btn.dataset.rate));
  });
  $$("#bank-rates-body .bank-compare-toggle").forEach((btn) => {
    btn.addEventListener("click", () => toggleCompareBank(btn.dataset.bank));
  });
  updateSortIndicators();
  updateCompareBanner();
}

function updateCompareBanner() {
  const countEl = $("#bank-compare-banner-count");
  if (countEl) countEl.textContent = compareBanks.size;
}

function wireBankRatesUI() {
  $$(".bank-rates-table th.sortable").forEach((th) => {
    th.setAttribute("role", "button");
    th.setAttribute("tabindex", "0");
    const handler = () => {
      const col = th.dataset.sort;
      if (bankSort.column === col) {
        bankSort.dir = bankSort.dir === "asc" ? "desc" : "asc";
      } else {
        bankSort.column = col;
        bankSort.dir = col === "name" || col === "type" ? "asc" : "asc";
      }
      renderLiveSummary();
    };
    th.addEventListener("click", handler);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });

  $$(".bank-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      if (bankHiddenTypes.has(type)) {
        bankHiddenTypes.delete(type);
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
      } else {
        bankHiddenTypes.add(type);
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
      }
      renderLiveSummary();
    });
    btn.setAttribute("aria-pressed", "true");
  });

  // Compare-selection banner: reset / clear all
  const resetBtn = $("#bank-compare-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      compareBanks.clear();
      DEFAULT_COMPARE_BANKS.forEach((n) => compareBanks.add(n));
      renderCompareDrawer();
      renderBankRatesTableSelection();
      refreshHeroSpread();
    });
  }
  const clearBtn = $("#bank-compare-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      compareBanks.clear();
      renderCompareDrawer();
      renderBankRatesTableSelection();
      refreshHeroSpread();
    });
  }
}

function applyRate(newRate) {
  if (!Number.isFinite(newRate) || newRate <= 0) return;
  suppressSync = true;
  rateInput.value = newRate.toFixed(2);
  rateSlider.value = Math.min(+rateSlider.max, Math.max(+rateSlider.min, newRate));
  suppressSync = false;
  renderLiveSummary();
}

// ===== Mobile slider hardening =====
//
// Native <input type="range"> jumps to wherever the track is tapped, which on
// touch screens means scrolling past a slider can nudge its value. We block
// any pointerdown that lands outside the thumb hit-area when the device is on
// a coarse pointer. `touch-action: pan-y` (CSS) already lets vertical scroll
// pass through; this handler kills the lateral track-jump.
function hardenSliderForTouch(slider) {
  if (!slider) return;
  slider.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse") return;
      const rect = slider.getBoundingClientRect();
      if (rect.width <= 0) return;
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const value = parseFloat(slider.value);
      const ratio = max > min ? (value - min) / (max - min) : 0;
      const thumbX = rect.left + ratio * rect.width;
      // Coarse-pointer thumb is 44px wide; allow a slightly generous radius.
      if (Math.abs(e.clientX - thumbX) > 26) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      slider.classList.add("is-armed");
    },
    { capture: true },
  );
  const disarm = () => slider.classList.remove("is-armed");
  slider.addEventListener("pointerup", disarm);
  slider.addEventListener("pointercancel", disarm);
  slider.addEventListener("blur", disarm);
}

// ===== Stepper buttons (− / +) for every parameter =====
//
// Steppers are the mobile-friendly path for fine adjustments — they bump the
// slider by its native `step` and route through the existing input/sync
// handlers, so all derived UI (hero, drawer, charts) refreshes for free.
const STEPPER_TARGETS = {
  price: priceSlider,
  hp: hpSlider,
  rate: rateSlider,
  amort: amortSlider,
  fee: feeSlider,
};

function wireSteppers() {
  $$(".step-btn").forEach((btn) => {
    const key = btn.dataset.stepFor;
    const dir = parseInt(btn.dataset.dir, 10);
    const slider = STEPPER_TARGETS[key];
    if (!slider || !Number.isFinite(dir)) return;
    btn.addEventListener("click", () => {
      const step = parseFloat(slider.step) || 1;
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const current = parseFloat(slider.value);
      const raw = current + dir * step;
      // Snap to the step grid relative to min to avoid floating-point drift
      // (rate slider step 0.05, amort step 0.1 — both prone to drift).
      const snapped = Math.round((raw - min) / step) * step + min;
      const clamped = Math.min(max, Math.max(min, snapped));
      slider.value = clamped;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

// ===== Excel-export =====

// Bygger och laddar ner en .xlsx med aktuellt sliderläge. All text svensk.
// Belopp skrivs som riktiga tal med talformat så banken kan summera cellerna.
async function exportXlsx() {
  const btn = $("#export-xlsx");
  const p = readPrimaryParams();
  const r = computeForPrice(p.price, p);
  const date = new Date().toISOString().slice(0, 10);

  const KR = '#,##0" kr"';
  const KRM = '#,##0" kr/mån"';
  // Percent cells: store the value as a fraction (0.0254) with a real percent
  // format so Excel, Numbers and Sheets all display "2,54%". Storing 2.54 with
  // a %-format makes Numbers treat it as 254% on import.
  const PCT1 = "0.0%";
  const PCT2 = "0.00%";
  const FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE3EC" } };

  // Lazy: ExcelJS is ~1 MB and only needed when someone exports.
  const { default: ExcelJS } = await import("exceljs/dist/exceljs.min.js");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Housecalc";
  const ws = wb.addWorksheet("Bostadskalkyl", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 28 }, { width: 18 }];

  let rowN = 0;
  const addRow = (label, value, fmt, opts = {}) => {
    rowN += 1;
    const row = ws.getRow(rowN);
    row.getCell(1).value = label;
    if (opts.labelBold) row.getCell(1).font = { bold: true };
    if (value !== null && value !== undefined) {
      const c = row.getCell(2);
      c.value = value;
      if (fmt) c.numFmt = fmt;
      if (opts.valueBold) c.font = { bold: true };
    }
    return row;
  };
  const addSection = (title) => {
    rowN += 1;
    const row = ws.getRow(rowN);
    row.getCell(1).value = title;
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = FILL;
    row.getCell(2).fill = FILL;
  };
  const blank = () => { rowN += 1; };

  const title = addRow("Housecalc – Bostadskalkyl", null);
  title.getCell(1).font = { bold: true, size: 14 };
  addRow("Underlag till banken · " + date, null);
  blank();

  addSection("FÖRUTSÄTTNINGAR");
  addRow("Förväntat slutpris", p.price, KR);
  addRow("Kontantinsats", r.hpTotal, KR);
  addRow("Ränta", p.rate / 100, PCT2);
  addRow("Amortering", p.amort / 100, PCT1);
  addRow("Avgift / drift", r.monthlyFee, KRM);
  addRow("Befintliga pantbrev", p.existingPantbrev, KR);
  addRow("Bolån", r.loan, KR);
  addRow("LTV", r.ltv / 100, PCT1);
  blank();

  addSection("MÅNADSKOSTNAD");
  addRow("Ränta", r.monthlyInterest, KRM);
  addRow("Amortering", r.monthlyAmort, KRM);
  addRow("Avgift / drift", r.monthlyFee, KRM);
  addRow("Totalt före skatt", r.monthlyTotal, KRM, { labelBold: true, valueBold: true });
  blank();

  addSection("DU BEHÖVER I KONTANTER");
  addRow("Kontantinsats", r.hpTotal, KR);
  addRow("+ Lagfart (1,5 %)", r.lagfart, KR);
  addRow("+ Pantbrev (2 % av nya)", r.pantbrev, KR);
  addRow("Summa kontanter", r.onetimeTotal, KR, { labelBold: true, valueBold: true });

  // Blank spacer row at the bottom-left for a little margin. An empty string in
  // column A materializes the row so it exists in the file.
  rowN += 1;
  ws.getRow(rowN).getCell(1).value = "";

  if (btn) btn.disabled = true;
  try {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Housecalc-bostadskalkyl-" + date + ".xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    if (btn) btn.disabled = false;
  }
}

$("#export-xlsx").addEventListener("click", exportXlsx);

// Prefill from the query string so listing pages (and the browser extension)
// can deep-link a scenario: ?pris=3195000&avgift=4788&kontant=15&ranta=2.9
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  const num = (k) => {
    const v = q.get(k);
    if (v === null || v === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const setPair = (input, slider, value, formatted) => {
    input.value = formatted;
    slider.value = Math.min(+slider.max, Math.max(+slider.min, value));
  };
  const price = num("pris");
  if (price !== null) setPair(priceInput, priceSlider, price, fmtThousands(price));
  const fee = num("avgift");
  if (fee !== null) setPair(feeInput, feeSlider, fee, fmtThousands(Math.round(fee)));
  const hpPct = num("kontant");
  if (hpPct !== null) hpSlider.value = Math.min(+hpSlider.max, hpPct);
  const rate = num("ranta");
  if (rate !== null) setPair(rateInput, rateSlider, rate, rate.toFixed(2));
  const pantbrev = num("pantbrev");
  if (pantbrev !== null) existingPantbrevInput.value = fmtThousands(pantbrev);
}

// init
applyUrlParams();
wireCompareDrawer();
renderCompareDrawer();
wireBankRatesUI();
[priceSlider, hpSlider, rateSlider, amortSlider, feeSlider].forEach(hardenSliderForTouch);
wireSteppers();
syncFromPriceOrPct();
renderLiveSummary();
loadBankRates();
renderAffiliates(document.getElementById("affiliate-card"), document.getElementById("affiliate-links"));
