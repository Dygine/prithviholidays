#!/usr/bin/env python3
"""
Set the admin passcode.

    python3 tools/set-passcode.py

Writes data/admin.json containing a PBKDF2-SHA256 hash of your passcode. The
passcode itself is never written anywhere — only a salted hash, which cannot
be reversed back into the passcode.

WHAT THIS PROTECTS, AND WHAT IT DOES NOT
----------------------------------------
This gate stops people wandering into your admin and messing with your draft.
It is checked in the browser, so a determined person with developer tools can
get past it. That is a property of static hosting, not a bug here.

It matters less than it sounds, because getting past the gate only lets
someone edit a draft in their OWN browser. They still cannot change your
website: publishing goes through the server, which holds the GitHub token and
checks ADMIN_PASSWORD independently.

If you deploy with a serverless function and set ADMIN_PASSWORD, that
server-side password takes over as the real gate and this file is ignored.
"""
import base64
import getpass
import hashlib
import json
import os
import datetime

ITERATIONS = 310_000  # OWASP guidance for PBKDF2-SHA256
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    print(__doc__.split("WHAT THIS")[0].strip())
    print()

    pw = getpass.getpass("New passcode: ")
    if len(pw) < 8:
        print("\n  Too short — use at least 8 characters. Nothing was changed.")
        return 1

    again = getpass.getpass("Type it again: ")
    if pw != again:
        print("\n  Those did not match. Nothing was changed.")
        return 1

    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, ITERATIONS, dklen=32)

    payload = {
        "note": (
            "Salted PBKDF2-SHA256 hash of the admin passcode. Regenerate with "
            "tools/set-passcode.py. The passcode itself is not stored here and "
            "cannot be recovered from this file."
        ),
        "algorithm": "PBKDF2-SHA256",
        "iterations": ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
    }

    path = os.path.join(ROOT, "data", "admin.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print("\n  Saved to data/admin.json")
    print("  Commit and deploy for it to take effect.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
