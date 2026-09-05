#!/usr/bin/env python3
"""Keep the iPhone web payload within explicit production budgets."""
from pathlib import Path
import gzip


ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'client'
ASSET_SUFFIXES = {'.js', '.css'}
RAW_BUDGET = 900_000
GZIP_BUDGET = 275_000

assets = [path for path in ROOT.rglob('*') if path.is_file() and path.suffix in ASSET_SUFFIXES]
if not assets:
    raise SystemExit('No production JavaScript or CSS assets were found. Run the build first.')

raw_size = sum(path.stat().st_size for path in assets)
gzip_size = sum(len(gzip.compress(path.read_bytes(), compresslevel=9)) for path in assets)
print(f'Web assets: {len(assets)} files, {raw_size:,} raw bytes, {gzip_size:,} gzip bytes')
if raw_size > RAW_BUDGET:
    raise SystemExit(f'Raw asset budget exceeded: {raw_size:,} > {RAW_BUDGET:,} bytes')
if gzip_size > GZIP_BUDGET:
    raise SystemExit(f'Gzip asset budget exceeded: {gzip_size:,} > {GZIP_BUDGET:,} bytes')
