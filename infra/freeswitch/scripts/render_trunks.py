#!/usr/bin/env python3
"""Render Jinja-based SIP trunk configs for the FreeSWITCH ``external`` profile.

Usage:

    python infra/freeswitch/scripts/render_trunks.py \
        --template infra/sip-trunks/_template.xml.j2 \
        --inputs infra/sip-trunks/*.yaml \
        --out infra/freeswitch/sip_profiles/external

Each YAML file produces a single rendered XML file named ``<slug>.xml``.
The script is deliberately dependency-light (``pyyaml`` + ``jinja2``) so it
can run in CI or as an init-container in a Kubernetes Pod.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--template", required=True, help="Path to Jinja template.")
    ap.add_argument("--inputs", help="Glob of YAML files, each with gateway parameters.")
    ap.add_argument(
        "--url",
        help="Dashboard API URL that returns FreeSWITCH gateway XML, e.g. /api/numbers/freeswitch.",
    )
    ap.add_argument("--token", default=os.environ.get("LIVOCALL_DASHBOARD_TOKEN", ""))
    ap.add_argument("--org-id", default=os.environ.get("LIVOCALL_ORG_ID", ""))
    ap.add_argument(
        "--out",
        required=True,
        help="Directory to write rendered XML files into.",
    )
    args = ap.parse_args()

    tpl_path = Path(args.template)
    if not tpl_path.exists():
        sys.stderr.write(f"template not found: {tpl_path}\n")
        return 1

    env = Environment(
        loader=FileSystemLoader(tpl_path.parent),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
    )
    template = env.get_template(tpl_path.name)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.url:
        import urllib.request

        req = urllib.request.Request(args.url)
        if args.token:
            req.add_header("Authorization", f"Bearer {args.token}")
        if args.org_id:
            req.add_header("X-LivoCall-Org-Id", args.org_id)
        with urllib.request.urlopen(req, timeout=15) as response:
            xml = response.read().decode("utf-8")
        out_path = out_dir / "livocall_custom.xml"
        out_path.write_text(xml)
        print(f"{args.url} -> {out_path}")
        return 0

    if not args.inputs:
        sys.stderr.write("--inputs or --url is required\n")
        return 1

    files = sorted(glob.glob(args.inputs))
    if not files:
        sys.stderr.write(f"no inputs matched: {args.inputs}\n")
        return 1

    rendered = 0
    for f in files:
        data = yaml.safe_load(Path(f).read_text()) or {}
        slug = data.get("slug") or Path(f).stem.split(".")[0]
        data["slug"] = slug
        xml = template.render(**data)
        out_path = out_dir / f"{slug}.xml"
        out_path.write_text(xml)
        rendered += 1
        print(f"{f} -> {out_path}")

    print(f"rendered {rendered} trunk(s) into {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
