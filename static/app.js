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
const hpRows = $("#hp-rows");

const incomeInput = document.querySelector('[name="gross_household_income_kr_year"]');
const horizonInput = document.querySelector('[name="horizon_years"]');

let suppressSync = false;
const comparePrices = [];

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

// ===== Calculation =====

function ranteavdragMonthlyCredit(monthlyInterestKr) {
  const annual = monthlyInterestKr * 12;
  const credit =
    annual <= 100_000
      ? Math.round(annual * 0.3)
      : Math.round(100_000 * 0.3 + (annual - 100_000) * 0.21);
  return Math.floor(credit / 12);
}

function recommendedAmortPct(ltvPct, dti) {
  let pct = 0;
  if (ltvPct > 70) pct = 2;
  else if (ltvPct > 50) pct = 1;
  if (dti > 4.5) pct += 1;
  return pct;
}

function computeForPrice(price, params) {
  const { hpPct, existingPantbrev, rate, amort, monthlyFee } = params;
  const hpTotal = Math.round((price * hpPct) / 100);
  const loan = Math.max(0, price - hpTotal);
  const ltv = price > 0 ? (loan / price) * 100 : 0;

  const lagfart = price > 0 ? Math.round(0.015 * price) + 825 : 0;
  const newPantbrev = Math.max(0, loan - existingPantbrev);
  const pantbrev = newPantbrev > 0 ? Math.round(0.02 * newPantbrev) + 375 : 0;
  const onetimeTotal = hpTotal + lagfart + pantbrev;

  const monthlyInterest = Math.round((loan * (rate / 100)) / 12);
  const monthlyAmort = Math.round((loan * (amort / 100)) / 12);
  const monthlyTotal = monthlyInterest + monthlyAmort + monthlyFee;
  const monthlyAfterTax = monthlyTotal - ranteavdragMonthlyCredit(monthlyInterest);

  return {
    price, hpTotal, loan, ltv, lagfart, pantbrev, onetimeTotal,
    monthlyInterest, monthlyAmort, monthlyFee, monthlyTotal, monthlyAfterTax,
  };
}

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
  const recAmort = recommendedAmortPct(r.ltv, dti);
  amortMeta.textContent = `FI rekommenderar ${recAmort.toFixed(1)}% (LTV-tier${dti > 4.5 ? " + DTI" : ""})`;

  updateSliderProgress();
  renderInsights(p, r, dti);
  updateCompareValues(p);
}

function updateSliderProgress() {
  // Visual fill on the slider track
  for (const s of [priceSlider, hpSlider, rateSlider, amortSlider]) {
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
      $("#ins-dti-extra").innerHTML =
        "Lånet är över 4,5× årsinkomsten → <strong>+1% extra amorteringskrav</strong>.";
    } else {
      $("#ins-dti-extra").textContent =
        "Lånet är under 4,5× årsinkomsten — inget extra amorteringskrav.";
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

// ===== Compare prices: structure built once per add/remove, values updated on render =====

function buildCompareTable() {
  const rows = [];
  rows.push(`<tr class="current" data-row="current">
    <td>
      <strong class="cmp-price-text">— kr</strong>
      <div class="small muted">nuvarande</div>
    </td>
    <td class="cmp-hp">—</td>
    <td class="cmp-loan">—</td>
    <td class="cmp-lagfart">—</td>
    <td class="cmp-pantbrev">—</td>
    <td class="cmp-total"><strong>—</strong></td>
    <td class="cmp-monthly">—</td>
    <td class="cmp-aftertax">—</td>
    <td></td>
  </tr>`);
  comparePrices.forEach((price, idx) => {
    rows.push(`<tr data-row="${idx}">
      <td>
        <input type="text" inputmode="numeric" class="compare-price-input"
               data-idx="${idx}" value="${fmtThousands(price)}" />
        <span class="control-unit small">kr</span>
      </td>
      <td class="cmp-hp">—</td>
      <td class="cmp-loan">—</td>
      <td class="cmp-lagfart">—</td>
      <td class="cmp-pantbrev">—</td>
      <td class="cmp-total"><strong>—</strong></td>
      <td class="cmp-monthly">—</td>
      <td class="cmp-aftertax">—</td>
      <td><button type="button" class="compare-remove" data-idx="${idx}" aria-label="Ta bort">×</button></td>
    </tr>`);
  });
  $("#compare-body").innerHTML = rows.join("");

  $$(".compare-price-input").forEach((inp) => {
    attachThousandFormatter(inp);
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      comparePrices[idx] = parseDigits(inp.value);
      updateCompareValues(readPrimaryParams());
    });
  });
  $$(".compare-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      comparePrices.splice(idx, 1);
      buildCompareTable();
      renderLiveSummary();
    });
  });
}

function updateCompareValues(primary) {
  $("#cmp-pct-display").textContent = `${primary.hpPct.toFixed(1)}%`;
  const tbody = $("#compare-body");
  Array.from(tbody.children).forEach((tr) => {
    const rowType = tr.dataset.row;
    let price;
    if (rowType === "current") {
      price = primary.price;
      tr.querySelector(".cmp-price-text").textContent = fmt(price);
    } else {
      const idx = parseInt(rowType, 10);
      price = comparePrices[idx] ?? 0;
    }
    const c = computeForPrice(price, primary);
    tr.querySelector(".cmp-hp").innerHTML =
      `${fmt(c.hpTotal)} <span class="muted small">(${primary.hpPct.toFixed(1)}%)</span>`;
    tr.querySelector(".cmp-loan").textContent = fmt(c.loan);
    tr.querySelector(".cmp-lagfart").textContent = fmt(c.lagfart);
    tr.querySelector(".cmp-pantbrev").textContent = fmt(c.pantbrev);
    tr.querySelector(".cmp-total").innerHTML = `<strong>${fmt(c.onetimeTotal)}</strong>`;
    tr.querySelector(".cmp-monthly").textContent = `${fmt(c.monthlyTotal)}/mån`;
    tr.querySelector(".cmp-aftertax").textContent = `${fmt(c.monthlyAfterTax)}/mån`;
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

$$(".rate-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    suppressSync = true;
    rateInput.value = (+btn.dataset.rate).toFixed(2);
    rateSlider.value = btn.dataset.rate;
    suppressSync = false;
    renderLiveSummary();
  });
});

[existingPantbrevInput, feeInput].forEach((el) =>
  el.addEventListener("input", renderLiveSummary),
);
[incomeInput, horizonInput].forEach((el) =>
  el.addEventListener("input", renderLiveSummary),
);

$("#add-hp").addEventListener("click", () => addHandpenningRow());

$("#add-compare").addEventListener("click", () => {
  const current = parseDigits(priceInput.value);
  const suggestion = Math.round((current * 1.1) / 10000) * 10000;
  comparePrices.push(suggestion);
  buildCompareTable();
  renderLiveSummary();
  const inputs = $$(".compare-price-input");
  const last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.select();
  }
});

// init
buildCompareTable();
syncFromPriceOrPct();
renderLiveSummary();
