import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Build-time SEO: FAQPage JSON-LD mirrors the visible #faq section (so the two
// can't drift); robots.txt + sitemap.xml are emitted with the real site URL, and
// rates/se.json is published for the browser extension.
function seo(siteUrl) {
  return {
    name: "housecalc-seo",
    transformIndexHtml(html) {
      const faq = html.split('id="faq"')[1] ?? "";
      const items = [...faq.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(
        ([, q, a]) => ({
          "@type": "Question",
          name: stripTags(q),
          acceptedAnswer: { "@type": "Answer", text: stripTags(a) },
        }),
      );
      const jsonld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items });
      return html.replace(
        '<script type="application/ld+json" id="faq-jsonld"></script>',
        `<script type="application/ld+json" id="faq-jsonld">${jsonld}</script>`,
      );
    },
    generateBundle() {
      const ratesJson = readFileSync(new URL("../../data/rates/se.json", import.meta.url), "utf8");
      const rates = JSON.parse(ratesJson);
      // Public copy for the browser extension to refresh from (data, not code).
      this.emitFile({ type: "asset", fileName: "rates/se.json", source: ratesJson });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url><loc>${siteUrl}/</loc><lastmod>${rates.updated}</lastmod><changefreq>daily</changefreq></url>\n` +
          `</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = (process.env.VITE_SITE_URL ?? env.VITE_SITE_URL ?? "").replace(/\/$/, "");
  return {
    // SITE_BASE lets GitHub Pages serve from /<repo>/ until a custom domain is set.
    base: process.env.SITE_BASE ?? "/",
    build: { target: "es2022" },
    plugins: [seo(siteUrl)],
  };
});
