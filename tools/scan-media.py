#!/usr/bin/env python3
"""
Rebuild data/media.json — the list the admin media picker offers.

Run this from the project root after dropping new photographs into
images/ or uploads/:

    python3 tools/scan-media.py

There is no server on a static host to list a directory, so this manifest
is how the picker knows what exists. Images themselves are never stored in
JSON — only their paths.
"""
import json, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif")


def scan(folder):
    path = os.path.join(ROOT, folder)
    if not os.path.isdir(path):
        return []
    return sorted(
        f"{folder}/{n}" for n in os.listdir(path) if n.lower().endswith(EXTS)
    )


images = scan("images") + scan("uploads")

with open(os.path.join(ROOT, "data", "media.json"), "w", encoding="utf-8") as f:
    json.dump({
        "note": "Photographs available to the admin media picker. "
                "Regenerate with tools/scan-media.py after adding files.",
        "images": images,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat().replace("+00:00", "Z"),
    }, f, indent=2)
    f.write("\n")

print(f"data/media.json — {len(images)} images")
