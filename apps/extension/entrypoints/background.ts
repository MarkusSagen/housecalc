// Only built for the end-to-end test (HOUSECALC_E2E=1): Playwright finds the
// extension id through its service worker. Production has no background.
export default defineBackground(() => {});
