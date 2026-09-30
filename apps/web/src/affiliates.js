// Loan-broker affiliate links. Fill in the tracking URLs from the affiliate
// network (Adtraction/Awin) once the programs are approved; the card stays
// hidden while every url is empty. Links are always labelled as ads
// (marknadsföringslagen) and open only on an explicit click.
export const AFFILIATES = [
  { name: "Lendo", url: import.meta.env.VITE_AFF_LENDO ?? "", pitch: "Jämför bolån från flera banker med en ansökan" },
  { name: "Zmarta", url: import.meta.env.VITE_AFF_ZMARTA ?? "", pitch: "Få bolåneerbjudanden och jämför räntor" },
];

export function renderAffiliates(card, list) {
  const active = AFFILIATES.filter((a) => a.url);
  if (!card || !list || active.length === 0) return;
  list.replaceChildren(
    ...active.map((a) => {
      const link = document.createElement("a");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "sponsored noopener";
      link.textContent = `${a.name} →`;
      link.title = a.pitch;
      return link;
    }),
  );
  card.hidden = false;
}
