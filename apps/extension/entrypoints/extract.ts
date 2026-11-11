import { extractListing } from "@housecalc/listing";

// Injected into the active tab by the popup, once per click. Runs in the
// extension's isolated world: it can read the page's DOM (including the text
// of embedded <script> data), not its JS globals. Returns plain JSON.
export default defineUnlistedScript(() => extractListing(document, location.href));
