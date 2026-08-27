#!/usr/bin/env python3
"""
Rebuild sitemap.xml and robots.txt from the content in data/.

    python3 tools/build-seo.py

Run this after publishing content, so search engines see new packages and
destinations. It reads settings.json for the site address and only lists
records that are actually published.
"""
import json
import os
import datetime
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(name, default):
    try:
        with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # a missing file should not stop the build
        print(f"  ! could not read {name} ({exc}) — using defaults")
        return default


settings = read("settings.json", {})
destinations = read("destinations.json", [])
packages = read("packages.json", {}).get("packages", [])

origin = (settings.get("seo", {}).get("siteUrl") or "").rstrip("/")
if not origin:
    origin = "https://prithviholidays.com"
    print(f"  ! no seo.siteUrl in settings.json — using {origin}")

today = datetime.date.today().isoformat()

# Static pages, with a rough sense of relative importance.
urls = [
    ("", "1.0", "weekly"),
    ("packages.html", "0.9", "weekly"),
    ("destinations.html", "0.9", "weekly"),
    ("adventures.html", "0.7", "monthly"),
    ("about.html", "0.5", "yearly"),
    ("contact.html", "0.6", "yearly"),
]

for p in packages:
    if p.get("published"):
        urls.append((f"package-details.html?id={quote(str(p['id']))}", "0.8", "monthly"))

for d in destinations:
    if d.get("published"):
        urls.append((f"destination-details.html?id={quote(str(d['id']))}", "0.7", "monthly"))

body = "\n".join(
    "  <url>\n"
    f"    <loc>{origin}/{path}</loc>\n"
    f"    <lastmod>{today}</lastmod>\n"
    f"    <changefreq>{freq}</changefreq>\n"
    f"    <priority>{pri}</priority>\n"
    "  </url>"
    for path, pri, freq in urls
)

sitemap = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f"{body}\n"
    "</urlset>\n"
)

with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
    f.write(sitemap)

robots = f"""# Prithvi Holidays

User-agent: *
Allow: /

# The admin is a working tool, not a page anyone should land on from search.
Disallow: /admin/
Disallow: /api/
Disallow: /data/
Disallow: /tools/

Sitemap: {origin}/sitemap.xml
"""

with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
    f.write(robots)

print(f"  sitemap.xml   {len(urls)} URLs")
print(f"  robots.txt    pointing at {origin}")
