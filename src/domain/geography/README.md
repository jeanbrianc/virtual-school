# Bundled introductory maps

`maps.json` is generated from Natural Earth vector data pinned to Git tag `v5.1.2`:

- [110m admin-1 states/provinces GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_1_states_provinces.geojson), excluding District of Columbia to retain exactly 50 states.
- [110m admin-0 countries GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson), selecting eleven reviewed introductory targets: Canada, United States of America, Mexico, Brazil, Australia, India, China, France, Japan, Egypt, and South Africa.

Natural Earth map data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). These generated assets replace the preserved dataset whose US-state licensing lineage could not be established. Made with Natural Earth.

Run `python3 scripts/generate-geography.py` to regenerate. For offline regeneration, pass `--states-source FILE --countries-source FILE`. The script verifies pinned SHA-256 source hashes before parsing. No map requests, API keys, or new service costs are used at runtime.

State polygons use a simple local equirectangular projection corrected at midpoint latitude. Alaska and Hawaii have separate insets, with independent scales; they are not geographically placed or shown to the same scale as the mainland. The world map uses equirectangular longitude/latitude projection. Coordinates are rounded to one decimal; there is no additional geometry simplification beyond the upstream 110m dataset. Maps are introductory representations, not navigation aids or authoritative boundary references. Small islands and details may be omitted. Only the eleven reviewed country shapes are interactive; this is not a complete map of all countries.
