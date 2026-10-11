#!/usr/bin/env python3
"""Generate bundled SVG maps from pinned public-domain Natural Earth v5.1.2 GeoJSON."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import urllib.request

BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
SOURCES = {
    'states': ('ne_110m_admin_1_states_provinces.geojson', '0067dec6a2c4f9c7a644bf7a9a46163d8d881595953326d0c67d89934190aefe'),
    'countries': ('ne_110m_admin_0_countries.geojson', '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f'),
}
COUNTRIES = ['Canada', 'United States of America', 'Mexico', 'Brazil', 'Australia', 'India', 'China', 'France', 'Japan', 'Egypt', 'South Africa']


def read_source(kind, local):
    filename, expected = SOURCES[kind]
    raw = Path(local).read_bytes() if local else urllib.request.urlopen(BASE + filename, timeout=30).read()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected:
        raise ValueError(f'{kind} source hash mismatch: {actual}')
    return json.loads(raw)['features']


def rings(feature):
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return [ring for polygon in polygons for ring in polygon]


def fitted(features, box):
    # Equirectangular local projection; equal horizontal/vertical scale after
    # longitude correction at the area's midpoint. Insets intentionally differ in scale.
    latitudes = [p[1] for f in features for ring in rings(f) for p in ring]
    cosine = math.cos(math.radians((min(latitudes) + max(latitudes)) / 2))
    def project(point):
        lon, lat = point[:2]
        if features[0]['properties']['name'] == 'Alaska' and lon > 0:
            lon -= 360
        return lon * cosine, -lat
    points = [project(p) for f in features for ring in rings(f) for p in ring]
    xmin, xmax = min(p[0] for p in points), max(p[0] for p in points)
    ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
    x, y, width, height = box
    scale = min(width / (xmax-xmin), height / (ymax-ymin))
    dx, dy = x + (width-(xmax-xmin)*scale)/2, y + (height-(ymax-ymin)*scale)/2
    return lambda p: (dx+(project(p)[0]-xmin)*scale, dy+(project(p)[1]-ymin)*scale)


def path(feature, project):
    result = []
    for ring in rings(feature):
        coordinates = [project(p) for p in ring]
        result.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in coordinates) + 'Z')
    return ''.join(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--states-source')
    parser.add_argument('--countries-source')
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1] / 'src/domain/geography/maps.json'))
    args = parser.parse_args()
    states = [f for f in read_source('states', args.states_source) if f['properties']['name'] != 'District of Columbia']
    assert len(states) == 50 and len({f['properties']['name'] for f in states}) == 50
    mainland = [f for f in states if f['properties']['name'] not in ('Alaska', 'Hawaii')]
    mainland_project = fitted(mainland, (10, 10, 830, 350))
    state_paths = []
    for f in sorted(states, key=lambda f: f['properties']['name']):
        name = f['properties']['name']
        project = fitted([f], (20, 365, 210, 110)) if name == 'Alaska' else fitted([f], (270, 390, 120, 75)) if name == 'Hawaii' else mainland_project
        state_paths.append({'name': name, 'path': path(f, project)})
    country_features = read_source('countries', args.countries_source)
    by_name = {f['properties']['ADMIN']: f for f in country_features}
    countries = []
    for name in COUNTRIES:
        f = by_name[name]
        countries.append({'name': name, 'path': path(f, lambda p: ((p[0]+180)*2, (90-p[1])*2))})
    output = {'states': state_paths, 'countries': countries}
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'Generated {len(state_paths)} states and {len(countries)} reviewed country targets')


if __name__ == '__main__':
    main()
