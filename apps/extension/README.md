# Housecalc browser extension

Click the toolbar button on a property listing (Hemnet, Booli, Mäklarhuset or
any other Swedish broker site). A popup shows the monthly cost after
ränteavdrag, the cash needed, and the banks with the lowest rates, all
prefilled from the page you have open. Every field can be edited.
"Öppna full kalkyl" opens the website with the same scenario.

## How it reads the page

- The extension has no host permissions and no content scripts. When you click
  the button, the `activeTab` permission lets the popup inject
  `entrypoints/extract.ts` into that one tab, once.
- `extract.ts` runs `extractListing()` from `@housecalc/listing`
  (`packages/listing`), which takes data from three places in order:
  1. the site's own structured data (Hemnet, Booli);
  2. schema.org JSON-LD;
  3. Swedish label text on the page (Utgångspris, Avgift, Driftkostnad,
     Upplåtelseform, …).
- The calculation uses `@housecalc/core`, the same code as the website.
- Rates are bundled at build time. The popup also tries
  `<site>/rates/se.json`, with a 2-second timeout, so it picks up newer rates
  without an extension release. Only rate data is fetched; nothing about the
  page or the user is sent anywhere.

## Develop

```sh
npm install                       # from the repo root
npm run dev -w @housecalc/extension           # Chrome with live reload
npm run dev:firefox -w @housecalc/extension   # Firefox
npm run build -w @housecalc/extension         # .output/chrome-mv3 and .output/firefox-mv3
npm run e2e -w @housecalc/extension           # Playwright + Chromium popup test
```

### Load it in your own browser

- **Chrome/Edge/Brave:** run `npm run build -w @housecalc/extension`. Then open
  `chrome://extensions`, turn on *Developer mode*, click *Load unpacked*, and
  pick `apps/extension/.output/chrome-mv3`. Pin the Housecalc icon.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click *Load
  Temporary Add-on…*, and pick `apps/extension/.output/firefox-mv3/manifest.json`.
  Temporary add-ons are removed when Firefox restarts.

Environment variables (optional, at build time):
- `WXT_SITE_URL`: the site for "Öppna full kalkyl" and the rates refresh.
  Default: `https://markussagen.github.io/housecalc`.
- `WXT_AFF_LENDO`: an affiliate URL. When set, the popup shows a link labelled
  "Annonslänk".

## Manual QA (before every store release)

Automated tests use fixtures. Hemnet's and Booli's terms forbid automated
access, so checks against the live sites are done by hand, in a normal browser
session:

| Site | Check 3 listings: BRF, villa, "Pris ej angivet"/bidding |
|---|---|
| hemnet.se | Price, avgift, drift (yearly on the page → monthly in the popup), upplåtelseform |
| booli.se `/annons/…` | Same; "Pris ej angivet" leaves the price empty |
| maklarhuset.se | Same, plus pantbrev on villas |
| One unsupported broker site | Label pass fills what it can; the rest is editable |
| After in-site navigation (Hemnet, Booli) | The popup shows the *new* listing, never the previous one |

Report any mismatch as a new fixture in `packages/listing/test/fixtures.ts`.
