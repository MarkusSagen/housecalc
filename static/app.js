const fmt = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr";

const fmtMon = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr/mån";

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
const hpRows = $("#hp-rows");

const feeInput = document.querySelector('[name="monthly_fee_kr"]');
const existingPantbrevInput = document.querySelector('[name="existing_pantbrev_kr"]');
const incomeInput = document.querySelector('[name="gross_household_income_kr_year"]');
const horizonInput = document.querySelector('[name="horizon_years"]');

let suppressSync = false;
const comparePrices = [];

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
  const price = parseInt(priceInput.value || "0", 10);
  const hpFromSources = readHandpenningSources().reduce(
    (s, x) => s + (x.amount_kr || 0),
    0,
  );
  const hpTotal = hpFromSources > 0 ? hpFromSources : parseInt(hpInput.value || "0", 10);
  const hpPct = price > 0 ? (hpTotal / price) * 100 : 0;
  return {
    price,
    hpTotal,
    hpPct,
    existingPantbrev: parseInt(existingPantbrevInput.value || "0", 10),
    rate: parseFloat(rateInput.value || "0"),
    amort: parseFloat(amortInput.value || "0"),
    monthlyFee: parseInt(feeInput.value || "0", 10),
    horizonYears: parseInt(horizonInput.value || "10", 10),
    grossIncome: parseInt(incomeInput.value || "0", 10),
  };
}

// ===== Handpenning sources (optional, in secondary section) =====

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

  renderInsights(p, r, dti);
  renderCompareTable(p);
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

// ===== Compare prices table =====

function renderCompareTable(primary) {
  $("#cmp-pct-display").textContent = `${primary.hpPct.toFixed(1)}%`;

  const rows = [];

  rows.push({ price: primary.price, isCurrent: true, idx: -1 });
  comparePrices.forEach((price, idx) => rows.push({ price, isCurrent: false, idx }));
  rows.sort((a, b) => b.price - a.price);

  $("#compare-body").innerHTML = rows
    .map((row) => {
      const c = computeForPrice(row.price, primary);
      const priceCell = row.isCurrent
        ? `<strong>${fmt(row.price)}</strong><div class="small muted">nuvarande</div>`
        : `<input type="number" class="compare-price-input" data-idx="${row.idx}" value="${row.price}" min="1" step="10000" />`;
      const removeCell = row.isCurrent
        ? ""
        : `<button type="button" class="compare-remove" data-idx="${row.idx}" aria-label="Ta bort">×</button>`;
      return `<tr class="${row.isCurrent ? "current" : ""}">
        <td>${priceCell}</td>
        <td>${fmt(c.hpTotal)} <span class="muted small">(${primary.hpPct.toFixed(1)}%)</span></td>
        <td>${fmt(c.loan)}</td>
        <td>${fmt(c.lagfart)}</td>
        <td>${fmt(c.pantbrev)}</td>
        <td><strong>${fmt(c.onetimeTotal)}</strong></td>
        <td>${fmt(c.monthlyTotal)}/mån</td>
        <td>${fmt(c.monthlyAfterTax)}/mån</td>
        <td>${removeCell}</td>
      </tr>`;
    })
    .join("");

  $$(".compare-price-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = parseInt(inp.dataset.idx, 10);
      comparePrices[idx] = parseInt(inp.value || "0", 10);
      renderLiveSummary();
    });
  });
  $$(".compare-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      comparePrices.splice(idx, 1);
      renderLiveSummary();
    });
  });
}

// ===== Slider/input bidirectional sync =====

function bindPair(slider, input, opts = {}) {
  slider.addEventListener("input", () => {
    suppressSync = true;
    input.value = slider.value;
    suppressSync = false;
    if (opts.afterSlider) opts.afterSlider();
    renderLiveSummary();
  });
  input.addEventListener("input", () => {
    if (suppressSync) return;
    const v = +input.value;
    if (Number.isFinite(v)) {
      suppressSync = true;
      slider.value = Math.min(+slider.max, Math.max(+slider.min, v));
      suppressSync = false;
    }
    if (opts.afterInput) opts.afterInput();
    renderLiveSummary();
  });
}

function syncFromPriceOrPct() {
  if (suppressSync) return;
  const price = +priceInput.value || 0;
  const pct = +hpSlider.value;
  const newAmount = Math.round((price * pct) / 100);
  suppressSync = true;
  hpInput.value = newAmount;
  suppressSync = false;
  renderLiveSummary();
}

function syncFromHpAmount() {
  if (suppressSync) return;
  const price = +priceInput.value || 0;
  const amount = +hpInput.value || 0;
  const pct = price > 0 ? (amount / price) * 100 : 0;
  suppressSync = true;
  hpSlider.value = Math.min(50, Math.max(0, pct));
  suppressSync = false;
  renderLiveSummary();
}

bindPair(priceSlider, priceInput, {
  afterSlider: syncFromPriceOrPct,
  afterInput: syncFromPriceOrPct,
});
hpSlider.addEventListener("input", syncFromPriceOrPct);
hpInput.addEventListener("input", syncFromHpAmount);
bindPair(rateSlider, rateInput);
bindPair(amortSlider, amortInput);

$$(".rate-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    rateInput.value = btn.dataset.rate;
    rateSlider.value = btn.dataset.rate;
    renderLiveSummary();
  });
});

[feeInput, existingPantbrevInput, incomeInput, horizonInput].forEach((el) =>
  el.addEventListener("input", renderLiveSummary),
);

$("#add-hp").addEventListener("click", () => addHandpenningRow());

$("#add-compare").addEventListener("click", () => {
  const current = parseInt(priceInput.value || "0", 10);
  const suggestion = Math.round((current * 1.1) / 10000) * 10000;
  comparePrices.push(suggestion);
  renderLiveSummary();
});

syncFromPriceOrPct();
renderLiveSummary();
