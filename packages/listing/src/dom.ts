// DOM helpers that work in a browser, in an extension's isolated world
// (no access to page globals, so we read <script> text), and in linkedom.

export function scriptText(doc: Document, selector: string): string[] {
  return Array.from(doc.querySelectorAll(selector), (s) => s.textContent ?? "");
}

export function parseJsonSafe<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Next.js app-router pages stream data as `self.__next_f.push([1,"…"])`
 * script tags. Decode and concatenate the string payloads.
 */
export function nextFlightPayload(doc: Document): string {
  const out: string[] = [];
  for (const text of scriptText(doc, "script")) {
    for (const m of text.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
      const decoded = parseJsonSafe<string>(`"${m[1]}"`);
      if (decoded) out.push(decoded);
    }
  }
  return out.join("");
}

/**
 * Every JSON object in `text` that contains `marker` at its own top level of
 * braces. String-aware brace matching, so braces inside strings don't confuse it.
 */
export function objectsContaining(text: string, marker: string): unknown[] {
  const found: unknown[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at < 0) return found;
    from = at + marker.length;
    const start = enclosingObjectStart(text, at);
    if (start < 0) continue;
    const end = matchingBrace(text, start);
    if (end < 0) continue;
    const obj = parseJsonSafe(text.slice(start, end + 1));
    if (obj) found.push(obj);
  }
}

function enclosingObjectStart(text: string, at: number): number {
  // Walk backwards counting braces. Strings are rare enough between the marker
  // and its object start that a quote-aware backward scan isn't worth it; the
  // forward pass (matchingBrace + JSON.parse) validates the result.
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const c = text[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);

/** Visible, non-empty text nodes in document order, whitespace-collapsed. */
export function visibleTexts(doc: Document): string[] {
  const root = doc.body ?? doc.documentElement;
  if (!root) return [];
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const out: string[] = [];
  // Adjacent text nodes are one run of text. Browsers mostly keep them merged,
  // but parsers (and some frameworks) split at entities like &nbsp;/&aring;.
  // We join them here rather than calling normalize(), which would mutate the page.
  let prev: Node | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let el = n.parentElement;
    let hidden = false;
    while (el) {
      if (SKIP.has(el.tagName.toUpperCase())) {
        hidden = true;
        break;
      }
      el = el.parentElement;
    }
    if (hidden) continue;
    const raw = n.textContent ?? "";
    if (prev && n.previousSibling === prev && out.length) {
      out[out.length - 1] = (out[out.length - 1] + raw).replace(/\s+/g, " ").trim();
    } else {
      const t = raw.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    // Only a node that produced output can be continued.
    prev = raw.trim() || (prev && n.previousSibling === prev) ? n : null;
  }
  return out;
}
