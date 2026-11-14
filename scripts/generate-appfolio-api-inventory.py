#!/usr/bin/env python3
"""Regenerate or check the scope inventory from the supplied OpenAPI contract."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "database-api-openapi.json"
OUTPUT = ROOT / "docs/appfolio-api-inventory.md"
METHODS = ("get", "post", "put", "patch", "delete", "options", "head", "trace")


def markdown_table(headers, rows):
    widths = [
        max(3, len(header), *(len(row[index]) for row in rows))
        for index, header in enumerate(headers)
    ]

    def render_row(cells):
        return "| " + " | ".join(
            cell.ljust(width) for cell, width in zip(cells, widths)
        ) + " |"

    return [
        render_row(headers),
        "| " + " | ".join("-" * width for width in widths) + " |",
        *(render_row(row) for row in rows),
    ]


def render_inventory(source_bytes):
    contract = json.loads(source_bytes)
    operations = [
        (path, method, item[method])
        for path, item in sorted(contract["paths"].items())
        for method in METHODS
        if method in item
    ]
    identifiers = [operation.get("operationId") for _, _, operation in operations]
    if not operations or any(not identifier for identifier in identifiers):
        raise ValueError("Every operation must have an operationId.")
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Operation IDs must be unique.")

    counts = Counter(method for _, method, _ in operations)
    lines = [
        "# AppFolio API operation inventory",
        "",
        "Generated from [database-api-openapi.json](../database-api-openapi.json).",
        "Every listed operation is in version-one scope, including deprecated operations.",
        "This inventory records scope. It does not claim implementation or verification.",
        "",
        f"Source SHA-256: `{hashlib.sha256(source_bytes).hexdigest()}`.",
        "",
        "Regenerate with `python3 scripts/generate-appfolio-api-inventory.py`.",
        "Check with `python3 scripts/generate-appfolio-api-inventory.py --check`.",
        "",
        f"Total: {len(operations)} operations across {len(contract['paths'])} paths.",
        "",
    ]
    lines.extend(markdown_table(
        ["Method", "Operations"],
        [[method.upper(), str(counts[method])] for method in METHODS if counts[method]],
    ))
    lines.extend(
        [
            "",
            "## Operations",
            "",
            "Tool names use the contract's operation IDs. Empty request-body entries do not imply that an operation has no parameters.",
            "",
        ]
    )
    rows = []
    for path, method, operation in operations:
        formats = operation.get("requestBody", {}).get("content", {})
        body = ", ".join(f"`{kind}`" for kind in sorted(formats)) or "None declared"
        deprecated = "Yes" if operation.get("deprecated", False) else "No"
        rows.append([
            method.upper(), f"`{path}`", f"`{operation['operationId']}`", body, deprecated
        ])
    lines.extend(markdown_table(
        ["Method", "Path", "Operation ID and tool name", "Request body", "Deprecated"], rows
    ))
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the inventory is stale.")
    args = parser.parse_args()
    expected = render_inventory(SOURCE.read_bytes())
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            parser.exit(1, "API inventory is stale. Run the generator without --check.\n")
        print("API inventory matches the supplied OpenAPI contract.")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(expected, encoding="utf-8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
