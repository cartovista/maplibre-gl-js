"""
Extract Los Angeles building footprints from Overture Maps (S3 GeoParquet) via DuckDB.

Output: la_buildings.geojson  (~400K+ polygons covering LA basin)

Usage:
  python extract_la_buildings.py

Requirements (siting conda env):
  duckdb >= 1.0  with spatial + httpfs extensions
"""

import os
import sys
import time
import duckdb

OUT = os.path.join(os.path.dirname(__file__), "la_buildings.geojson")
RELEASE = "2026-03-18.0"

# Los Angeles basin: downtown + Hollywood + Santa Monica + San Fernando Valley + Burbank
BBOX = (-118.67, 33.70, -118.15, 34.17)

print(f"Connecting to DuckDB {duckdb.__version__} ...")
con = duckdb.connect(":memory:")

print("Installing extensions ...")
con.execute("INSTALL httpfs")
con.execute("LOAD httpfs")
con.execute("INSTALL spatial")
con.execute("LOAD spatial")

con.execute("SET s3_region = 'us-west-2'")

parquet = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*"

sql = f"""
COPY (
    SELECT
        id,
        COALESCE(height, 0)           AS height,
        COALESCE(num_floors, 0)       AS num_floors,
        sources[1].dataset            AS source,
        geometry
    FROM read_parquet('{parquet}', filename=true, hive_partitioning=1)
    WHERE bbox.xmin BETWEEN {BBOX[0]} AND {BBOX[2]}
      AND bbox.ymin BETWEEN {BBOX[1]} AND {BBOX[3]}
) TO '{OUT}'
WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326')
"""

print(f"Querying Overture release {RELEASE} for Los Angeles bbox {BBOX} ...")
print("(This streams ~1-2 GB of parquet from S3 — expect 3-10 min depending on connection)")
t0 = time.time()
con.execute(sql)
elapsed = time.time() - t0

size_mb = os.path.getsize(OUT) / 1_048_576
print(f"\nDone in {elapsed:.1f}s  →  {OUT}  ({size_mb:.1f} MB)")

# Quick feature count
count = con.execute(f"SELECT COUNT(*) FROM ST_Read('{OUT}')").fetchone()[0]
print(f"Feature count: {count:,}")
con.close()
