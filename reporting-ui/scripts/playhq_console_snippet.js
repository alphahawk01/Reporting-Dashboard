/*
 * PlayHQ logo grabber — run in the BROWSER CONSOLE on a PlayHQ page that
 * shows club logos (a league's Teams or Ladder page).
 *
 * How to use:
 *   1. Open the PlayHQ league/ladder page in your browser.
 *   2. Open DevTools (F12) -> Console.
 *   3. Paste this whole file and press Enter.
 *   4. It prints a JSON array of { name, logo } and copies it to your
 *      clipboard. Save that JSON to scripts/playhq_logos.json.
 *
 * It scans every <img> whose src is a PlayHQ Cloudinary logo and pairs it
 * with the nearest readable team/club name text.
 */
(() => {
  const out = [];
  const seen = new Set();

  const imgs = Array.from(document.querySelectorAll("img")).filter((img) =>
    /res\.cloudinary\.com\/playhq/.test(img.src || "")
  );

  const cleanName = (s) =>
    (s || "")
      .replace(/\s+/g, " ")
      .trim();

  for (const img of imgs) {
    // Prefer the img alt; else the nearest text in an ancestor row/link.
    let name = cleanName(img.alt);
    if (!name || /logo/i.test(name)) {
      let el = img.parentElement;
      for (let i = 0; i < 5 && el; i++) {
        const txt = cleanName(el.textContent);
        if (txt && txt.length >= 2 && txt.length <= 60) {
          name = txt;
          break;
        }
        el = el.parentElement;
      }
    }
    // Normalise the logo URL to a stable size.
    const logo = img.src.replace(/\/h_\d+,w_\d+\//, "/h_96,w_96/");
    const key = name.toLowerCase();
    if (name && logo && !seen.has(key)) {
      seen.add(key);
      out.push({ name, logo });
    }
  }

  const json = JSON.stringify(out, null, 2);
  console.log(json);
  console.log(`\nFound ${out.length} teams with logos.`);
  try {
    copy(json); // DevTools helper — copies to clipboard
    console.log("Copied to clipboard. Paste into scripts/playhq_logos.json");
  } catch {
    console.log("Select the JSON above and copy it manually.");
  }
  return out;
})();
