# beheryd.github.io
David Behery's Bio — a memory palace of questions and loose thoughts.

## Adding a thought

Each thought is one markdown file in `_thoughts/`, and each file becomes one paper frame in the palace (newest at the front, oldest at the back).

1. Create `_thoughts/YYYY-MM-DD.md` named with today's date, e.g. `_thoughts/2026-11-18.md` (works from the GitHub web or mobile app too). A second thought on the same day can be `2026-11-18-2.md`.
2. Give it a title, then write in plain markdown:

### Citations

Add a `## References` heading at the end of a note (`Sources`, `Citations`, `Bibliography` and `Further reading` also work). Everything under it shows as a citation list in smaller type with hanging indents:

For numbered in-text citations, use footnotes: write `...a measure of control[^1].` in the text and `[^1]: Klyubin et al. 2005.` anywhere below. They collect into a "Notes" section at the bottom of the card.

The date shown on the thought comes from the file name. Optional front matter: `draft: true` hides a thought without deleting it.

Each thought has its own link, its file name: `https://beheryd.github.io/#2026-11-18`.

This serves the site and builds `thoughts.json` from `_thoughts/` on the fly (no Jekyll install needed).

## Files

- `index.html` — page markup, bio text, and pillar links
- `assets/palace.css`, `assets/palace.js` — the palace look and interaction
- `thoughts.json` — Jekyll template that lists every thought
- `cv.pdf` — synced from `beheryd/resume`

Claude 3.7 Sonnet and Claude Opus 5.5 were used in the creation of this site.
