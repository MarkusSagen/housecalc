// Minimal pages that reproduce each site's real data layout (captured
// 2026-09-29), with fictional addresses and no broker/personal details.
// Kept as code rather than saved pages: the repo is public and we must not
// republish listing content.

const page = (head: string, body: string) =>
  `<!doctype html><html lang="sv"><head>${head}</head><body>${body}</body></html>`;

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

// --- Hemnet: Next.js pages router, Apollo cache in __NEXT_DATA__ ------------

export function hemnetPage(listing: Record<string, unknown>, bodyHtml = "") {
  const state = {
    [`ActivePropertyListing:${listing.id}`]: { __typename: "ActivePropertyListing", ...listing },
    "Location:18031": { __typename: "Location", id: "18031", fullName: "Stockholms kommun" },
  };
  const next = { props: { pageProps: { __APOLLO_STATE__: state } }, page: "/bostad/[slug]" };
  return page(
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`,
    `<div id="__next">${bodyHtml}</div>`,
  );
}

export const HEMNET_BRF = {
  id: "21740611",
  askingPrice: { __typename: "Money", amount: 1825000, formatted: "1 825 000 kr" },
  fee: { __typename: "Money", amount: 3175, formatted: "3 175 kr" },
  runningCosts: { __typename: "Money", amount: 5808, formatted: "5 808 kr" },
  housingForm: { __typename: "HousingForm", name: "Lägenhet", symbol: "APARTMENT" },
  tenure: { __typename: "Tenure", name: "Bostadsrätt", symbol: "TENANT_OWNERSHIP" },
  livingArea: 40,
  streetAddress: "Exempelgatan 29",
  municipality: { __ref: "Location:18031" },
};

export const HEMNET_VILLA = {
  id: "21800001",
  askingPrice: { __typename: "Money", amount: 6495000, formatted: "6 495 000 kr" },
  fee: null,
  runningCosts: { __typename: "Money", amount: 42000, formatted: "42 000 kr" },
  housingForm: { __typename: "HousingForm", name: "Villa", symbol: "VILLA" },
  tenure: { __typename: "Tenure", name: "Äganderätt", symbol: "OWNERSHIP" },
  livingArea: 142,
  streetAddress: "Provvägen 4",
  municipality: { __ref: "Location:18031" },
};

// --- Booli: Next.js app router, data in self.__next_f.push script tags --------

export function booliPage(listings: Record<string, unknown>[]) {
  const payload = `7:${JSON.stringify({ props: { listing: listings[0], similar: listings.slice(1) } })}\n`;
  return page(
    "",
    `<main>Booli</main><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`,
  );
}

const fv = (raw: number, unit: string) => ({ __typename: "FormattedValue", raw, value: String(raw), unit });

export const BOOLI_BRF_NO_PRICE = {
  __typename: "Listing",
  booliId: "6281333",
  listPrice: null,
  priceInfo: { __typename: "PriceInfo", label: "Utropspris", displayPrice: "Pris ej angivet" },
  rent: fv(3741, "kr/mån"),
  operatingCost: fv(533, "kr/mån"),
  livingArea: fv(63, "m²"),
  objectType: "Lägenhet",
  tenureForm: "Bostadsrätt",
  streetAddress: "Exempelgatan 10",
  mortgageDeed: null,
  description: "Ljus lägenhet med {klammer} i texten.",
};

export const BOOLI_SIMILAR = {
  __typename: "Listing",
  booliId: "6000001",
  listPrice: fv(2950000, "kr"),
  rent: fv(2100, "kr/mån"),
  tenureForm: "Bostadsrätt",
  streetAddress: "Annangatan 1",
};

export const BOOLI_VILLA = {
  __typename: "Listing",
  booliId: "6300000",
  listPrice: fv(4995000, "kr"),
  rent: null,
  operatingCost: fv(45000, "kr/år"),
  livingArea: fv(128, "m²"),
  objectType: "Villa",
  tenureForm: "Äganderätt",
  streetAddress: "Provvägen 9",
  mortgageDeed: fv(2400000, "kr"),
};

// --- Mäklarhuset: JSON-LD @graph + h6 label pairs, entities in the text -------

export function maklarhusetVilla(url: string) {
  return page(
    ld({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "DetachedHouse",
          url,
          address: { "@type": "PostalAddress", streetAddress: "Provgränd 1", addressLocality: "Halmstad" },
          floorSize: { "@type": "QuantitativeValue", value: 105, unitCode: "MTK" },
        },
        { "@type": "Offer", url, price: 3195000, priceCurrency: "SEK" },
        { "@type": "RealEstateAgent", name: "Mäklarhuset Halmstad" },
      ],
    }),
    `<div class="uk-grid">
      <div><h6 class="uk-h7">Utgångspris</h6><h6>3&nbsp;195&nbsp;000 kr</h6></div>
      <div><h6 class="uk-h7">Boarea/biarea</h6><h6>105/38 kvm</h6></div>
      <div><h6 class="uk-h7">Driftkostnad</h6><h6>40&nbsp;354 kr/&aring;r</h6></div>
      <div><h6 class="uk-h7">Byggnadstyp</h6><h6>1-plans kedjehus</h6></div>
    </div>
    <div class="uk-grid uk-grid-small"><div><div class="uk-h5"> Upplåtelseform </div></div>
      <div class="uk-display-block"><p> Tomträtt </p></div></div>
    <h3>Pantbrev</h3><p>Det finns 8 pantbrev om totalt 1&nbsp;914&nbsp;000 kr.</p>`,
  );
}

export function maklarhusetBrf(url: string) {
  return page(
    ld({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Apartment",
          url,
          address: { "@type": "PostalAddress", streetAddress: "Strandvägen 25", addressLocality: "Halmstad" },
          floorSize: { "@type": "QuantitativeValue", value: 44.3 },
        },
        { "@type": "Offer", url, price: 1995000, priceCurrency: "SEK" },
      ],
    }),
    `<div><h6 class="uk-h7">Utgångspris</h6><h6>1 995 000 kr</h6></div>
     <div><h6 class="uk-h7">Avgift</h6><h6>4&nbsp;788 kr/m&aring;n</h6></div>
     <div><div class="uk-h5">Upplåtelseform</div><p>Bostadsrätt</p></div>
     <h3>Avgiftsförändringar</h3><p>Avgiften sänks till 3926 kr/mån från 1/1.</p>`,
  );
}

// --- A broker site we have no adapter for: Svensk Fast-style spans, dt/dd ----

export const GENERIC_BROKER = page(
  "<title>Radhus till salu</title>",
  `<nav><a href="/">Pris</a> <a href="/">Sök</a></nav>
   <ul>
     <li class="info--icon"><span>Typ:</span><span>Radhus</span></li>
     <li class="info--icon"><span>Upplåtelseform:</span><span>Bostadsrätt</span></li>
     <li class="info--icon"><span>Boarea:</span><span>98 m²</span></li>
     <li class="info--icon"><span>Månadsavgift:</span><span>5 210 kr</span></li>
   </ul>
   <dl><dt>Utgångspris</dt><dd>3 450 000 kr</dd>
       <dt>Driftkostnad</dt><dd>Totalt</dd><dd>1 250 kr per månad</dd></dl>`,
);

export const NOT_A_LISTING = page(
  "<title>Om oss</title>",
  "<h1>Välkommen till vår mäklarbyrå</h1><p>Vi har sålt bostäder sedan 1985.</p>",
);
