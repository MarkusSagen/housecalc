const fmt = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr";

const $ = (sel) => document.querySelector(sel);
const form = $("#calc-form");
const hpRows = $("#hp-rows");
const hpStatus = $("#hp-status");
const results = $("#results");
const formError = $("#form-error");

let networthChart = null;
let monthlyChart = null;

function addHandpenningRow(label = "", amount = "") {
  const row = document.createElement("div");
  row.className = "hp-row";
  row.innerHTML = `
    <label>Beskrivning
      <input type="text" class="hp-label" value="${label}" placeholder="t.ex. Sparpengar" required />
    </label>
    <label>Belopp (kr)
      <input type="number" class="hp-amount" value="${amount}" min="0" required />
    </label>
    <button type="button" class="remove">Ta bort</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    updateHpStatus();
  });
  row.querySelectorAll("input").forEach((i) =>
    i.addEventListener("input", updateHpStatus)
  );
  hpRows.appendChild(row);
  updateHpStatus();
}

function readHandpenning() {
  return Array.from(hpRows.querySelectorAll(".hp-row")).map((r) => ({
    label: r.querySelector(".hp-label").value.trim() || "Källa",
    amount_kr: parseInt(r.querySelector(".hp-amount").value || "0", 10),
  }));
}

function updateHpStatus() {
  const total = readHandpenning().reduce((s, x) => s + x.amount_kr, 0);
  const price = parseInt(form.price_kr.value || "0", 10);
  const min = Math.round(price * 0.1);
  const pct = price > 0 ? ((total / price) * 100).toFixed(1) : "0";
  const ltv = price > 0 ? (((price - total) / price) * 100).toFixed(1) : "0";
  hpStatus.textContent =
    `(${fmt(total)} = ${pct}% av priset, LTV ${ltv}%, krav ≥ ${fmt(min)})`;
  hpStatus.className = total >= min ? "ok" : "bad";
  renderLiveSummary();
}

const fmtMon = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr/mån";

function computeLiveSummary() {
  const price = parseInt(form.price_kr.value || "0", 10);
  const hpTotal = readHandpenning().reduce((s, x) => s + x.amount_kr, 0);
  const existingPantbrev = parseInt(form.existing_pantbrev_kr.value || "0", 10);
  const interestRate = parseFloat(form.interest_rate_pct.value || "0");
  const amortRate = parseFloat(form.amortization_rate_pct.value || "0");
  const monthlyFee = parseInt(form.monthly_fee_kr.value || "0", 10);
  const horizonYears = parseInt(form.horizon_years.value || "10", 10);

  const loan = Math.max(0, price - hpTotal);
  const ltv = price > 0 ? (loan / price) * 100 : 0;
  const hpPct = price > 0 ? (hpTotal / price) * 100 : 0;

  const lagfart = price > 0 ? Math.round(0.015 * price) + 825 : 0;
  const newPantbrev = Math.max(0, loan - existingPantbrev);
  const pantbrev = newPantbrev > 0 ? Math.round(0.02 * newPantbrev) + 375 : 0;
  const totalCashNeeded = hpTotal + lagfart + pantbrev;

  const monthlyInterest = Math.round((loan * (interestRate / 100)) / 12);
  const monthlyAmort = Math.round((loan * (amortRate / 100)) / 12);
  const monthlyTotal = monthlyInterest + monthlyAmort + monthlyFee;

  const annualInterest = monthlyInterest * 12;
  const taxCredit =
    annualInterest <= 100_000
      ? Math.round(annualInterest * 0.3)
      : Math.round(100_000 * 0.3 + (annualInterest - 100_000) * 0.21);
  const monthlyAfterTax = monthlyTotal - Math.floor(taxCredit / 12);

  return {
    price,
    hpTotal,
    hpPct,
    loan,
    ltv,
    lagfart,
    pantbrev,
    totalCashNeeded,
    monthlyInterest,
    monthlyAmort,
    monthlyFee,
    monthlyTotal,
    monthlyAfterTax,
    interestRate,
    amortRate,
    horizonYears,
  };
}

function renderLiveSummary() {
  const s = computeLiveSummary();
  $("#ls-price").textContent = fmt(s.price);
  $("#ls-hp-pct").textContent = `${s.hpPct.toFixed(1)}%`;
  $("#ls-handpenning").textContent = fmt(s.hpTotal);
  $("#ls-ltv").textContent = `${s.ltv.toFixed(1)}%`;
  $("#ls-loan").textContent = fmt(s.loan);
  $("#ls-lagfart").textContent = fmt(s.lagfart);
  $("#ls-pantbrev").textContent = fmt(s.pantbrev);
  $("#ls-total-cash").textContent = fmt(s.totalCashNeeded);
  $("#ls-rate-pct").textContent = `${s.interestRate.toFixed(2)}%`;
  $("#ls-amort-pct").textContent = `${s.amortRate.toFixed(1)}%`;
  $("#ls-monthly-interest").textContent = fmtMon(s.monthlyInterest);
  $("#ls-monthly-amort").textContent = fmtMon(s.monthlyAmort);
  $("#ls-monthly-fee").textContent = fmtMon(s.monthlyFee);
  $("#ls-monthly-total").textContent = fmtMon(s.monthlyTotal);
  $("#ls-monthly-aftertax").textContent = fmtMon(s.monthlyAfterTax);
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
    $("#ins-tier-drop-row").hidden = false;
  } else {
    $("#ins-tier-drop-row").hidden = true;
  }

  const tiers = [
    { pct: 10, amortPct: 2 },
    { pct: 30, amortPct: 1 },
    { pct: 50, amortPct: 0 },
  ];
  $("#tier-table-body").innerHTML = tiers
    .map((t) => {
      const hp = Math.round((s.price * t.pct) / 100);
      const loan = s.price - hp;
      const ltv = 100 - t.pct;
      const monthly = Math.round((loan * t.amortPct) / 100 / 12);
      return `<tr>
        <td>${fmt(hp)} (${t.pct}%)</td>
        <td>${ltv}%</td>
        <td>${fmt(monthly)}/mån (${t.amortPct}%)</td>
      </tr>`;
    })
    .join("");
}

function readForm() {
  const fd = new FormData(form);
  const payload = {};
  for (const [k, v] of fd.entries()) {
    payload[k] = isNaN(v) || v === "" ? v : Number(v);
  }
  payload.handpenning_sources = readHandpenning();
  return payload;
}

async function calculate(event) {
  event.preventDefault();
  formError.hidden = true;
  results.hidden = true;
  const payload = readForm();
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

function renderResults(data) {
  results.hidden = false;
  renderSummary(data.summary);
  renderOneTime(data.buy_now.one_time_costs);
  renderMonthly(data.buy_now.monthly_at_start, data.buy_now.monthly_at_start_after_tax);
  renderNetworthChart(data.buy_now.yearly, data.wait_and_invest.yearly);
  renderMonthlyChart(data.buy_now.monthly_at_start);
}

function renderSummary(s) {
  const winner = s.better_scenario === "buy_now" ? "Köp nu" : "Vänta och investera";
  $("#summary-body").innerHTML = `
    <div class="summary-row"><span class="label">Köp nu (förmögenhet vid horisont):</span><span class="value">${fmt(s.buy_now_net_worth_kr)}</span></div>
    <div class="summary-row"><span class="label">Vänta och investera:</span><span class="value">${fmt(s.wait_invest_net_worth_kr)}</span></div>
    <div class="summary-row winner"><span class="label">Bättre alternativ:</span><span class="value">${winner} (+${fmt(s.difference_kr)})</span></div>
  `;
}

function renderOneTime(o) {
  $("#one-time-table").innerHTML = `
    <tr><td>Kontantinsats</td><td>${fmt(o.kontantinsats_kr)}</td></tr>
    <tr><td>Stämpelskatt (lagfart, 1,5%)</td><td>${fmt(o.stamp_duty_kr)}</td></tr>
    <tr><td>Pantbrev (2% + avgift)</td><td>${fmt(o.pantbrev_kr)}</td></tr>
    <tr><td>Expeditionsavgift lagfart</td><td>${fmt(o.lagfart_fee_kr)}</td></tr>
    <tr class="total"><td>Totalt</td><td>${fmt(o.total_kr)}</td></tr>
  `;
}

function renderMonthly(m, mTax) {
  $("#monthly-table").innerHTML = `
    <tr><td>Ränta</td><td>${fmt(m.interest_kr)}</td></tr>
    <tr><td>Amortering</td><td>${fmt(m.amortization_kr)}</td></tr>
    <tr><td>Avgift / drift</td><td>${fmt(m.fee_kr)}</td></tr>
    <tr class="total"><td>Totalt (före skatt)</td><td>${fmt(m.total_kr)}</td></tr>
    <tr><td>Totalt (efter ränteavdrag)</td><td>${fmt(mTax.total_kr)}</td></tr>
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
      scales: {
        y: {
          ticks: { callback: (v) => fmt(v) },
        },
      },
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
form.addEventListener("input", renderLiveSummary);
$("#add-hp").addEventListener("click", () => addHandpenningRow());
document.querySelectorAll(".rate-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    form.interest_rate_pct.value = btn.dataset.rate;
    renderLiveSummary();
  });
});
form.addEventListener("submit", calculate);
addHandpenningRow("Sparpengar", 400000);
renderLiveSummary();
