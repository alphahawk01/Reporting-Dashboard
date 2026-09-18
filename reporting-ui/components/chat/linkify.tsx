import React from "react";

// Turn plain message text into React nodes where URLs become clickable links.
// Kept deliberately simple and safe: we only ever emit <a> elements with an
// href we built from the matched text (http/https, or www.* which we prefix
// with https://). Everything else is rendered as plain text, so there's no
// HTML injection — the message content is never treated as markup.

// URL detection. We match three shapes, in priority order via alternation:
//   1. Explicit scheme:   http:// or https:// followed by non-space chars.
//   2. www-prefixed:      www.<something>
//   3. Bare domain:       host.tld(/path…)? e.g. training.premierdata-technology.com
//
// The bare-domain case is the tricky one: we only treat something as a link
// when it ends in a plausible top-level domain (so ordinary text like "e.g."
// or "Node.js" isn't linkified). A domain is one or more dot-separated labels
// (letters, digits, hyphens) ending in a known/again-plausible TLD, optionally
// followed by a port and/or a path/query/fragment.
//
// Trailing sentence punctuation (. , ! ? ; : ) ] }) is trimmed off the match
// below so "see example.com." doesn't include the full stop in the link.
const URL_RE = new RegExp(
  [
    // 1. http(s):// …
    "(?:https?:\\/\\/[^\\s<]+)",
    // 2. www. …
    "|(?:www\\.[^\\s<]+)",
    // 3. bare domain: label(.label)+.tld  (+ optional :port and /path)
    "|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*" +
      "\\.(?:com|org|net|io|co|dev|app|ai|gov|edu|info|biz|tech|online|site|xyz|au|uk|us|ca|nz|de|fr|nl|eu|me|tv)" +
      "(?::\\d{2,5})?(?:\\/[^\\s<]*)?)",
  ].join(""),
  "gi"
);

const TRAILING_PUNCT = /[.,!?;:)\]}]+$/;

/**
 * Render `text`, converting any URLs into clickable links. Returns an array of
 * strings and <a> elements suitable for placing inside a <p> or similar.
 */
export function linkify(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  // Reset lastIndex since URL_RE is a module-level global regex.
  URL_RE.lastIndex = 0;

  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    // Skip a bare-domain match that's actually part of an email address
    // (e.g. the "premierdata.com" inside "name@premierdata.com"). Emails have
    // an "@" immediately before the domain and no scheme. Emit as plain text.
    const prevChar = start > 0 ? text[start - 1] : "";
    const hasSchemeRaw = /^(?:https?:\/\/|www\.)/i.test(raw);
    if (prevChar === "@" && !hasSchemeRaw) {
      nodes.push(text.slice(lastIndex, start + raw.length));
      lastIndex = start + raw.length;
      continue;
    }

    // Trim trailing sentence punctuation out of the link (keep it as text).
    const trimmed = raw.replace(TRAILING_PUNCT, "");
    const trailing = raw.slice(trimmed.length);

    // Text before the URL.
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    // Add https:// when there's no explicit scheme (covers www.* and bare
    // domains like training.premierdata-technology.com).
    const hasScheme = /^https?:\/\//i.test(trimmed);
    const href = hasScheme ? trimmed : `https://${trimmed}`;
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {trimmed}
      </a>
    );

    if (trailing) nodes.push(trailing);
    lastIndex = start + raw.length;
  }

  // Remaining text after the last URL.
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}
