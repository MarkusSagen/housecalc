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
const results = $("#results");
const formError = $("#form-error");

const feeInput = document.querySelector('[name="monthly_fee_kr"]');
const existingPantbrevInput = document.querySelector('[name="existing_pantbrev_kr"]');
const incomeInput = document.querySelector('[name="gross_household_income_kr_year"]');
const housingTypeInput = document.querySelector('[name="housing_type"]');
const loanTermInput = document.querySelector('[name="loan_term_years"]');
const horizonInput = document.querySelector('[name="horizon_years"]');
const waitMonthsInput = document.querySelector('[name="wait_months"]');
const monthlySavingsInput = document.querySelector('[name="monthly_savings_kr"]');
const stockReturnInput = document.querySelector('[name="stock_return_pct"]');
const houseApprInput = document.querySelector('[name="house_appreciation_pct"]');
const waitKontantinsatsInput = document.querySelector('[name="wait_kontantinsats_pct"]');

let networthChart = null;
let monthlyChart = null;
let suppressSync = false;

function syncFromPriceOrPct() {
  if (suppressSync) return;
  const price = +priceInput.value || 0;
  const pct = +hpSlider.value;
  const newAmount = Math.round((price * pct) / 100);
  suppressSync = true;
  hpInput.value = newAmount;
  suppressSync = false;
}

function syncFromHpAmount() {
  if (suppressSync) return;
  const price = +priceInput.value || 0;
  const amount = +hpInput.value || 0;
  const pct = price > 0 ? (amount / price) * 100 : 0;
  suppressSync = true;
  hpSlider.value = Math.min(50, Math.max(0, pct));
  suppressSync = false;
}

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

function effectiveHandpenningKr() {
  const sources = readHandpenningSources();
  const fromSources = sources.reduce((s, x) => s + (x.amount_kr || 0), 0);
  if (fromSources > 0) return fromSources;
  return parseInt(hpInput.value || "0", 10);
}

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

function computeLiveSummary() {
  const price = parseInt(priceInput.value || "0", 10);
  const hpTotal = effectiveHandpenningKr();
  const existingPantbrev = parseInt(existingPantbrevInput.value || "0", 10);
  const interestRate = parseFloat(rateInput.value || "0");
  const amortRate = parseFloat(amortInput.value || "0");
  const monthlyFee = parseInt(feeInput.value || "0", 10);
  const horizonYears = parseInt(horizonInput.value || "10", 10);
  const grossIncome = parseInt(incomeInput.value || "0", 10);

  const loan = Math.max(0, price - hpTotal);
  const ltv = price > 0 ? (loan / price) * 100 : 0;
  const hpPct = price > 0 ? (hpTotal / price) * 100 : 0;
  const dti = grossIncome > 0 ? loan / grossIncome : 0;

  const lagfart = price > 0 ? Math.round(0.015 * price) + 825 : 0;
  const newPantbrev = Math.max(0, loan - existingPantbrev);
  const pantbrev = newPantbrev > 0 ? Math.round(0.02 * newPantbrev) + 375 : 0;
  const onetimeTotal = hpTotal + lagfart + pantbrev;

  const monthlyInterest = Math.round((loan * (interestRate / 100)) / 12);
  const monthlyAmort = Math.round((loan * (amortRate / 100)) / 12);
  const monthlyTotal = monthlyInterest + monthlyAmort + monthlyFee;
  const monthlyAfterTax = monthlyTotal - ranteavdragMonthlyCredit(monthlyInterest);

  return {
    price, hpTotal, hpPct, loan, ltv, dti, grossIncome,
    lagfart, pantbrev, onetimeTotal,
    monthlyInterest, monthlyAmort, monthlyFee, monthlyTotal, monthlyAfterTax,
    interestRate, amortRate, horizonYears,
  };
}

function renderLiveSummary() {
  const s = computeLiveSummary();

  // Hero headline
  $("#hero-monthly").textContent = fmtMon(s.monthlyTotal);
  $("#hero-monthly-after").textContent = fmtMon(s.monthlyAfterTax);

  // Hero cards
  $("#hc-interest").textContent = fmtMon(s.monthlyInterest);
  $("#hc-amort").textContent = fmtMon(s.monthlyAmort);
  $("#hc-fee").textContent = fmtMon(s.monthlyFee);
  $("#hc-total").textContent = fmtMon(s.monthlyTotal);

  $("#hc-lagfart").textContent = fmt(s.lagfart);
  $("#hc-pantbrev").textContent = fmt(s.pantbrev);
  $("#hc-kontantinsats").textContent = fmt(s.hpTotal);
  $("#hc-onetime-total").textContent = fmt(s.onetimeTotal);

  $("#hc-total-cash").textContent = fmt(s.onetimeTotal);
  $("#hc-loan").textContent = fmt(s.loan);
  $("#hc-ltv").textContent = `${s.ltv.toFixed(1)}%`;

  // Slider meta
  hpMeta.textContent = `${s.hpPct.toFixed(1)}% av priset · LTV ${s.ltv.toFixed(1)}%`;
  const recAmort = recommendedAmortPct(s.ltv, s.dti);
  amortMeta.textContent = `FI rekommenderar ${recAmort.toFixed(1)}% (LTV-tier${s.dti > 4.5 ? " + DTI" : ""})`;

  renderInsights(s);
}

function renderInsights(s) {
  const annualAmort = Math.round((s.loan * s.amortRate) / 100);
  const totalAmort = Math.min(s.loan, annualAmort * s.horizonYears);
  $("#ins-horizon").textContent = s.horizonYears;
  $("#ins-amort-total").textContent = fmt(totalAmort);

  const targetLoan = 0.7 * s.price;
  if (s.loan > targetLoan && annualAmort > 0) {
    const yearsToTier = Math.ceil((s.loan - targetLoan) / annualAmort);
    $("#ins-tier-drop-years").textContent = `${yearsToTier} år`;
    $("#ins-tier-drop-card").hidden = false;
  } else {
    $("#ins-tier-drop-card").hidden = true;
  }

  if (s.grossIncome > 0 && s.loan > 0) {
    $("#ins-dti").textContent = `${s.dti.toFixed(1)}×`;
    if (s.dti > 4.5) {
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

  // Tier table — current row + 10/30/50 references
  const tierRows = [];
  tierRows.push(`<tr class="current">
    <td>${fmt(s.hpTotal)} (${s.hpPct.toFixed(1)}%, nuvarande)</td>
    <td>${s.ltv.toFixed(1)}%</td>
    <td>${fmt(s.monthlyAmort)}/mån (${s.amortRate.toFixed(1)}%)</td>
  </tr>`);
  const tiers = [
    { pct: 10, amortPct: 2 },
    { pct: 30, amortPct: 1 },
    { pct: 50, amortPct: 0 },
  ];
  for (const t of tiers) {
    const hp = Math.round((s.price * t.pct) / 100);
    const loan = s.price - hp;
    const ltv = 100 - t.pct;
    const monthly = Math.round((loan * t.amortPct) / 100 / 12);
    tierRows.push(`<tr>
      <td>${fmt(hp)} (${t.pct}%)</td>
      <td>${ltv}%</td>
      <td>${fmt(monthly)}/mån (${t.amortPct}%)</td>
    </tr>`);
  }
  $("#tier-table-body").innerHTML = tierRows.join("");

  // Stress test
  const stressDeltas = [0, 1, 2, 3];
  $("#stress-body").innerHTML = stressDeltas
    .map((dp) => {
      const newRate = s.interestRate + dp;
      const newInterest = Math.round((s.loan * newRate) / 100 / 12);
      const newTotal = newInterest + s.monthlyAmort + s.monthlyFee;
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

// ===== Slider/input bidirectional sync =====

function bindPair(slider, input, opts = {}) {
  const onSlider = () => {
    suppressSync = true;
    input.value = slider.value;
    suppressSync = false;
    if (opts.afterSlider) opts.afterSlider();
    renderLiveSummary();
  };
  const onInput = () => {
    if (suppressSync) return;
    const v = +input.value;
    if (Number.isFinite(v)) {
      suppressSync = true;
      slider.value = Math.min(+slider.max, Math.max(+slider.min, v));
      suppressSync = false;
    }
    if (opts.afterInput) opts.afterInput();
    renderLiveSummary();
  };
  slider.addEventListener("input", onSlider);
  input.addEventListener("input", onInput);
}

// Price: simple pair; also keep hp pct stable when price changes (re-derive hp amount)
bindPair(priceSlider, priceInput, {
  afterSlider: syncFromPriceOrPct,
  afterInput: syncFromPriceOrPct,
});

// Handpenning: slider is %, input is kr — need custom sync
hpSlider.addEventListener("input", syncFromPriceOrPct);
hpInput.addEventListener("input", syncFromHpAmount);

bindPair(rateSlider, rateInput);
bindPair(amortSlider, amortInput);

// Rate presets
$$(".rate-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    rateInput.value = btn.dataset.rate;
    rateSlider.value = btn.dataset.rate;
    renderLiveSummary();
  });
});

// Secondary inputs trigger live summary too
[
  feeInput,
  existingPantbrevInput,
  incomeInput,
  housingTypeInput,
  loanTermInput,
  horizonInput,
  waitMonthsInput,
  monthlySavingsInput,
  stockReturnInput,
  houseApprInput,
  waitKontantinsatsInput,
].forEach((el) => el.addEventListener("input", renderLiveSummary));

// Handpenning sources
$("#add-hp").addEventListener("click", () => addHandpenningRow());

// ===== Submit handler =====

async function calculate() {
  formError.hidden = true;
  results.hidden = true;
  const sources = readHandpenningSources();
  const hpFromSources = sources.reduce((s, x) => s + (x.amount_kr || 0), 0);
  const handpenningPayload =
    hpFromSources > 0
      ? sources
      : [
          {
            label: "Kontantinsats",
            amount_kr: parseInt(hpInput.value || "0", 10),
          },
        ];

  const payload = {
    price_kr: parseInt(priceInput.value || "0", 10),
    housing_type: housingTypeInput.value,
    monthly_fee_kr: parseInt(feeInput.value || "0", 10),
    existing_pantbrev_kr: parseInt(existingPantbrevInput.value || "0", 10),
    handpenning_sources: handpenningPayload,
    interest_rate_pct: parseFloat(rateInput.value || "0"),
    amortization_rate_pct: parseFloat(amortInput.value || "0"),
    loan_term_years: parseInt(loanTermInput.value || "50", 10),
    wait_months: parseInt(waitMonthsInput.value || "12", 10),
    monthly_savings_kr: parseInt(monthlySavingsInput.value || "0", 10),
    stock_return_pct: parseFloat(stockReturnInput.value || "7"),
    house_appreciation_pct: parseFloat(houseApprInput.value || "3"),
    wait_kontantinsats_pct: parseFloat(waitKontantinsatsInput.value || "10"),
    horizon_years: parseInt(horizonInput.value || "10", 10),
    gross_household_income_kr_year: parseInt(incomeInput.value || "0", 10),
  };

  try {
    const r = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: "Okänt fel" }));
      const msg = Array.isArray(err.detail)
        ? err.detail.map((d) => d.msg).join("; ")
        : err.detail;
      throw new Error(msg);
    }
    const data = await r.json();
    renderResults(data);
  } catch (e) {
    formError.textContent = e.message;
    formError.hidden = false;
  }
}

$("#submit-btn").addEventListener("click", calculate);

function renderResults(data) {
  results.hidden = false;
  renderComparisonSummary(data.summary);
  renderNetworthChart(data.buy_now.yearly, data.wait_and_invest.yearly);
  renderMonthlyChart(data.buy_now.monthly_at_start);
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderComparisonSummary(s) {
  const winner = s.better_scenario === "buy_now" ? "Köp nu" : "Vänta och investera";
  $("#summary-body").innerHTML = `
    <div class="summary-row"><span class="label">Köp nu (förmögenhet vid horisont):</span><span class="value">${fmt(s.buy_now_net_worth_kr)}</span></div>
    <div class="summary-row"><span class="label">Vänta och investera:</span><span class="value">${fmt(s.wait_invest_net_worth_kr)}</span></div>
    <div class="summary-row winner"><span class="label">Bättre alternativ:</span><span class="value">${winner} (+${fmt(s.difference_kr)})</span></div>
  `;
}

function renderNetworthChart(buyYears, waitYears) {
  const labels = buyYears.map((y) => `År ${y.year}`);
  const ctx = $("#networth-chart").getContext("2d");
  if (networthChart) networthChart.destroy();
  networthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Köp nu",
          data: buyYears.map((y) => y.net_worth_kr),
          borderColor: "#1a4480",
          backgroundColor: "rgba(26,68,128,0.1)",
          tension: 0.2,
        },
        {
          label: "Vänta och investera",
          data: waitYears.map((y) => y.net_worth_kr),
          borderColor: "#b85c00",
          backgroundColor: "rgba(184,92,0,0.1)",
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
        },
      },
      scales: { y: { ticks: { callback: (v) => fmt(v) } } },
    },
  });
}

function renderMonthlyChart(m) {
  const ctx = $("#monthly-chart").getContext("2d");
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Ränta", "Amortering", "Avgift / drift"],
      datasets: [
        {
          data: [m.interest_kr, m.amortization_kr, m.fee_kr],
          backgroundColor: ["#1a4480", "#2a7f3e", "#b85c00"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)}` },
        },
      },
    },
  });
}

// init
syncFromPriceOrPct();
renderLiveSummary();
