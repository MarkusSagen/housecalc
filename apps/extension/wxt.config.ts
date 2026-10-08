import { defineConfig } from "wxt";

// Click-to-calculate: the popup injects entrypoints/extract.ts into the active
// tab only when the user clicks the toolbar button (activeTab). No host
// permissions, no content scripts, nothing runs in the background.
// HOUSECALC_E2E=1 builds a test variant (see e2e/popup.e2e.ts): the test can't
// click the toolbar button, so it needs host access and a background worker
// to find the extension id. Production builds never include either.
const e2e = process.env.HOUSECALC_E2E === "1";

export default defineConfig({
  manifestVersion: 3,
  outDir: e2e ? ".output-e2e" : ".output",
  filterEntrypoints: e2e ? undefined : ["popup", "extract"],
  manifest: ({ browser }) => ({
    name: "Housecalc – bolånekalkyl för bostadsannonser",
    short_name: "Housecalc",
    description:
      "Klicka på en bostadsannons och se månadskostnad efter ränteavdrag, kontantinsats, lagfart och bankernas aktuella räntor.",
    permissions: ["activeTab", "scripting", "storage"],
    ...(e2e && { host_permissions: ["<all_urls>"] }),
    action: { default_title: "Räkna på den här bostaden" },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "housecalc@markussagen.github.io",
          strict_min_version: "128.0",
          // AMO requires a declaration; we collect nothing.
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  }),
});
