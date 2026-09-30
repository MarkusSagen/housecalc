# Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Exportera till Excel" button to the hero card that downloads the current calculator scenario as a real `.xlsx` file, in Swedish, with three sections: Förutsättningar, Månadskostnad, Du behöver i kontanter.

**Architecture:** A small self-contained `.xlsx` writer (CRC32 + ZIP store-mode + minimal SpreadsheetML XML) is added inside the existing `<script>` in `index.html`. No external library. The button reads current state via `readPrimaryParams()`, computes via `computeForPrice()`, builds the workbook bytes, and downloads via a Blob. The fragile writer logic is proven first in a Node scratch harness using `unzip -t` (CRC/structure validation) before being inlined.

**Tech Stack:** Vanilla JS in a single `index.html`. Node 25 + `unzip` CLI for verification only (not shipped).

## Global Constraints

- Single-file app: everything lives in `index.html`. No new runtime dependencies, no build step.
- All exported text is **Swedish only**. No language toggle.
- Numbers written as real Excel numbers with number formats (not pre-formatted strings), so cells are summable/editable.
- Number formats: kr = `#,##0" kr"`, kr/mån = `#,##0" kr/mån"`, percent-1dp = `0.0" %"`, percent-2dp = `0.00" %"`. Percent values are stored as the raw displayed number (2.54, not 0.0254).
- Follow existing code style in `index.html` (2-space indent, `const`/`function`, `$`/`$$` helpers).

---

### Task 1: Prove the xlsx writer in a Node scratch harness

Build the pure writer functions and prove they produce a valid `.xlsx` that `unzip -t` accepts and whose sheet XML contains the expected numbers. This is the fragile part; validate it in isolation before touching `index.html`.

**Files:**
- Create (scratch, not committed): `/tmp/xlsx-verify.mjs`

**Interfaces:**
- Produces (these exact functions get inlined into `index.html` in Task 2, unchanged):
  - `crc32(bytes: Uint8Array) => number`
  - `concatBytes(parts: Uint8Array[]) => Uint8Array`
  - `zipStore(files: {name: string, data: Uint8Array}[]) => Uint8Array`
  - `xmlEsc(s) => string`
  - `buildWorkbook(rows: RowSpec[]) => Uint8Array` where `RowSpec` is `{cells: CellSpec[]}` (empty `cells` = blank row) and `CellSpec` is `{col: "A"|"B", t: "s"|"n", s: number, v: string|number}`
  - `buildSheetData(model) => RowSpec[]` — maps the calculator model to the 24-row layout

- [ ] **Step 1: Write the scratch harness with writer + a sample model + assertions**

Create `/tmp/xlsx-verify.mjs`:

```js
import { writeFileSync } from "node:fs";

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- byte helpers ----
function concatBytes(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}
const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

// ---- ZIP (store mode, no compression) ----
function zipStore(files) {
  const enc = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      nameBytes, f.data,
    ]);
    locals.push(local);
    central.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]));
    offset += local.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const eocd = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0),
  ]);
  return concatBytes([...locals, ...central, eocd]);
}

// ---- XML ----
function xmlEsc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bostadskalkyl" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0&quot; kr&quot;"/><numFmt numFmtId="165" formatCode="#,##0&quot; kr/mån&quot;"/><numFmt numFmtId="166" formatCode="0.0&quot; %&quot;"/><numFmt numFmtId="167" formatCode="0.00&quot; %&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE3EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// style indices: 0 default, 1 bold, 2 section, 3 bold-label,
// 4 kr, 5 kr/mån, 6 %.0, 7 %.00, 8 kr-bold, 9 kr/mån-bold

function buildSheetXml(rows) {
  const enc = new TextEncoder();
  let body = "";
  rows.forEach((row, i) => {
    const rn = i + 1;
    let cells = "";
    for (const c of row.cells) {
      const ref = c.col + rn;
      if (c.t === "s") {
        cells += `<c r="${ref}" t="inlineStr" s="${c.s}"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      } else {
        cells += `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
      }
    }
    body += `<row r="${rn}">${cells}</row>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
  return enc.encode(xml);
}

function buildWorkbook(rows) {
  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: buildSheetXml(rows) },
  ]);
}

// ---- model -> rows ----
function buildSheetData(m) {
  const S = (col, s, v) => ({ col, t: "s", s, v });
  const N = (col, s, v) => ({ col, t: "n", s, v });
  const blank = { cells: [] };
  const section = (title) => ({ cells: [S("A", 2, title), S("B", 2, "")] });
  return [
    { cells: [S("A", 1, "Housecalc – Bostadskalkyl")] },
    { cells: [S("A", 0, "Underlag till banken · " + m.date)] },
    blank,
    section("FÖRUTSÄTTNINGAR"),
    { cells: [S("A", 0, "Förväntat slutpris"), N("B", 4, m.price)] },
    { cells: [S("A", 0, "Kontantinsats"), N("B", 4, m.hpTotal)] },
    { cells: [S("A", 0, "Ränta"), N("B", 7, m.rate)] },
    { cells: [S("A", 0, "Amortering"), N("B", 6, m.amort)] },
    { cells: [S("A", 0, "Avgift / drift"), N("B", 5, m.monthlyFee)] },
    { cells: [S("A", 0, "Befintliga pantbrev"), N("B", 4, m.existingPantbrev)] },
    { cells: [S("A", 0, "Bolån"), N("B", 4, m.loan)] },
    { cells: [S("A", 0, "LTV"), N("B", 6, m.ltv)] },
    blank,
    section("MÅNADSKOSTNAD"),
    { cells: [S("A", 0, "Ränta"), N("B", 5, m.monthlyInterest)] },
    { cells: [S("A", 0, "Amortering"), N("B", 5, m.monthlyAmort)] },
    { cells: [S("A", 0, "Avgift / drift"), N("B", 5, m.monthlyFee)] },
    { cells: [S("A", 3, "Totalt före skatt"), N("B", 9, m.monthlyTotal)] },
    blank,
    section("DU BEHÖVER I KONTANTER"),
    { cells: [S("A", 0, "Kontantinsats"), N("B", 4, m.hpTotal)] },
    { cells: [S("A", 0, "+ Lagfart (1,5 %)"), N("B", 4, m.lagfart)] },
    { cells: [S("A", 0, "+ Pantbrev (2 % av nya)"), N("B", 4, m.pantbrev)] },
    { cells: [S("A", 3, "Summa kontanter"), N("B", 8, m.onetimeTotal)] },
  ];
}

// ---- run: sample model from the user's screenshot ----
const model = {
  date: "2026-08-12",
  price: 6800000, hpTotal: 680000, rate: 2.54, amort: 2.0,
  monthlyFee: 5879, existingPantbrev: 2248000, loan: 6120000, ltv: 90.0,
  monthlyInterest: 12954, monthlyAmort: 10200, monthlyTotal: 29033,
  lagfart: 102825, pantbrev: 77815, onetimeTotal: 860640,
};
const bytes = buildWorkbook(buildSheetData(model));
writeFileSync("/tmp/out.xlsx", bytes);
console.log("wrote /tmp/out.xlsx", bytes.length, "bytes");

// assert CRC32 against a known vector: crc32("123456789") === 0xCBF43926
const check = crc32(new TextEncoder().encode("123456789"));
if (check !== 0xcbf43926) throw new Error("CRC32 wrong: " + check.toString(16));
console.log("CRC32 self-test OK");
```

- [ ] **Step 2: Run it and validate ZIP integrity + content**

Run:
```bash
node /tmp/xlsx-verify.mjs && \
unzip -t /tmp/out.xlsx && \
unzip -p /tmp/out.xlsx xl/worksheets/sheet1.xml | grep -o '<v>[0-9]*</v>' | head -20
```
Expected:
- "CRC32 self-test OK" printed.
- `unzip -t` prints "No errors detected in compressed data of /tmp/out.xlsx." for all 6 entries.
- The `<v>` values include `6800000`, `680000`, `12954`, `10200`, `29033`, `102825`, `77815`, `860640`.

If `unzip -t` reports CRC errors, the ZIP header/CRC logic is wrong — fix `zipStore`/`crc32` and re-run before proceeding.

- [ ] **Step 3: Open the file to confirm no repair prompt**

Run:
```bash
open /tmp/out.xlsx
```
Expected: opens in Numbers/Excel with no "needs repair" dialog; three visible sections with bold headers and `kr` / `%` formatting. (Manual visual check.)

There is no commit for this task — it is scratch validation. Proceed only once `unzip -t` passes and the file opens cleanly.

---

### Task 2: Inline the writer + wire the export button into index.html

Add a static "Exportera till Excel" button in the hero card, and inline the exact proven writer functions plus the click handler.

**Files:**
- Modify: `index.html` (hero card markup — add button; script — add writer + handler)

**Interfaces:**
- Consumes: `readPrimaryParams()`, `computeForPrice(price, params)` (existing, in the CALC block); the writer functions from Task 1 (`crc32`, `concatBytes`, `zipStore`, `xmlEsc`, `buildSheetXml`, `buildWorkbook`, `buildSheetData`).
- Produces: `exportXlsx()` click handler; `downloadXlsx(filename, bytes)`.

- [ ] **Step 1: Locate the hero card action area and the end of the script**

Run:
```bash
grep -n "hero-spread-link\|Se jämförelsen\|id=\"hero-monthly\"" index.html
grep -n "renderLiveSummary()" index.html | tail -3
```
Note the hero card DOM area (around the spread link) and the region near the bottom of the script where top-level render calls happen — the new code goes there.

- [ ] **Step 2: Add the export button to the hero card markup**

Find the hero card container that holds the monthly figure (near `id="hero-monthly"` / the "Se jämförelsen" spread link). Add, as a static element in that card:

```html
<button type="button" id="export-xlsx" class="ghost hero-export-btn" aria-label="Exportera kalkylen till en Excel-fil">Exportera till Excel</button>
```

Reuse an existing button class already present in the hero/controls (`ghost` is used elsewhere; if the hero uses a different class such as `hero-spread-link`, match the nearest sibling's class instead). Place it after the spread link so it sits with the other hero actions.

- [ ] **Step 3: Inline the writer functions**

Immediately after the `/* CALC-END */` marker's downstream helpers (place near the other top-level helper functions, e.g. just after `fmtThousands`/`parseDigits` definitions), paste the EXACT functions from Task 1, unchanged: `CRC_TABLE`, `crc32`, `concatBytes`, `u16`, `u32`, `zipStore`, `xmlEsc`, the six XML string constants (`CONTENT_TYPES`, `ROOT_RELS`, `WORKBOOK`, `WORKBOOK_RELS`, `STYLES`), `buildSheetXml`, `buildWorkbook`, `buildSheetData`.

Do not re-declare `TextEncoder` usage differently — keep `new TextEncoder()` inline as in Task 1.

- [ ] **Step 4: Add the download helper and click handler**

Add after the writer functions:

```js
function downloadXlsx(filename, bytes) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportXlsx() {
  const p = readPrimaryParams();
  const r = computeForPrice(p.price, p);
  const date = new Date().toISOString().slice(0, 10);
  const model = {
    date,
    price: p.price,
    hpTotal: r.hpTotal,
    rate: p.rate,
    amort: p.amort,
    monthlyFee: r.monthlyFee,
    existingPantbrev: p.existingPantbrev,
    loan: r.loan,
    ltv: Math.round(r.ltv * 10) / 10,
    monthlyInterest: r.monthlyInterest,
    monthlyAmort: r.monthlyAmort,
    monthlyTotal: r.monthlyTotal,
    lagfart: r.lagfart,
    pantbrev: r.pantbrev,
    onetimeTotal: r.onetimeTotal,
  };
  const bytes = buildWorkbook(buildSheetData(model));
  downloadXlsx("Housecalc-bostadskalkyl-" + date + ".xlsx", bytes);
}

$("#export-xlsx").addEventListener("click", exportXlsx);
```

Place the `addEventListener` line alongside the other top-level `addEventListener` wiring near the bottom of the script (where `priceSlider.addEventListener(...)` etc. are), so `$("#export-xlsx")` resolves after the DOM element exists.

- [ ] **Step 5: Verify the page loads and the handler runs without error**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');if(!h.includes('id=\"export-xlsx\"'))throw new Error('button missing');if(!h.includes('function buildWorkbook'))throw new Error('writer missing');if(!h.includes('#export-xlsx').valueOf())throw new Error('listener missing');console.log('static checks OK');"
```
Then open the app and click the button:
```bash
open index.html
```
Expected: no console errors; clicking "Exportera till Excel" downloads `Housecalc-bostadskalkyl-<today>.xlsx`; opening it shows numbers matching the on-screen hero values for the current slider positions.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: export current scenario to .xlsx (Swedish, hero button)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Real .xlsx → Task 1 writer, `unzip -t` validated. ✓
- Swedish only → all labels Swedish in `buildSheetData`; no toggle. ✓
- Three sections (Förutsättningar, Månadskostnad, Du behöver i kontanter), ENGÅNGSKOSTNADER dropped → `buildSheetData` row list. ✓
- Assumptions block + "Du behöver i kontanter" summary → present. Efter ränteavdrag + bank comparison excluded. ✓
- Button in hero card → Task 2 Step 2. ✓
- Numbers as real Excel values with formats → style indices 4–9. ✓
- Filename with today's date → `exportXlsx`. ✓

**Placeholder scan:** No TBD/TODO; all code blocks concrete. ✓

**Type consistency:** `buildWorkbook(buildSheetData(model))` chain consistent across Task 1 and Task 2. Model field names in Task 1 sample match those produced in Task 2 `exportXlsx`. Style indices in `buildSheetData` match the 10 `cellXfs` entries in `STYLES`. ✓
