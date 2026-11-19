#!/usr/bin/env python3
"""Local preview for the memory palace.

GitHub Pages builds thoughts.json with Jekyll. Jekyll isn't needed locally:
this server serves the site as-is and builds /thoughts.json on the fly from
_thoughts/*.md, the same way the Liquid template does.

    python3 scripts/preview.py          # http://localhost:8000
    python3 scripts/preview.py 4000     # another port
"""
import http.server
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THOUGHTS = ROOT / "_thoughts"
DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")

try:
    import markdown

    def render(text):
        return markdown.markdown(text, extensions=["extra", "smarty"])
except ImportError:  # minimal fallback: paragraphs only (no headings, lists, links or footnotes)
    import html

    print("Note: the 'markdown' package isn't installed for this Python, so notes preview as plain "
          "paragraphs. Install it with `python3 -m pip install markdown` for a faithful preview.")

    def render(text):
        paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        return "\n".join(f"<p>{html.escape(p)}</p>" for p in paras)


def parse_front_matter(raw):
    data, body = {}, raw
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            for line in parts[1].splitlines():
                if ":" in line:
                    key, value = line.split(":", 1)
                    data[key.strip()] = value.strip().strip("\"'")
            body = parts[2]
    return data, body.strip()


def build_thoughts():
    items = []
    for path in sorted(THOUGHTS.glob("*.md")):
        data, body = parse_front_matter(path.read_text(encoding="utf-8"))
        if data.get("draft", "").lower() == "true":
            continue
        # same rules as thoughts.json: the file name is the id, its leading date is the date
        m = DATE_RE.match(path.stem)
        date = m.group(1) if m else str(data.get("date", ""))[:10]
        slug = path.stem
        title = data.get("title") or slug.replace("-", " ").title()
        items.append({"title": title, "date": date, "slug": slug, "body": render(body)})
    items.sort(key=lambda t: (t["date"], t["slug"]))
    return items


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # always serve fresh files so edits show up on a normal reload
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/thoughts.json":
            payload = json.dumps(build_thoughts(), indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Memory palace preview → http://localhost:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
