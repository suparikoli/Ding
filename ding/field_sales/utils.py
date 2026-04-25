# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import json
import math


def parse_geo(value):
	"""Parse a location value into a (lat, lng) tuple of floats, or None.

	Accepts:
	  - GeoJSON FeatureCollection / Feature / Point (dict)
	  - GeoJSON serialized as JSON string (Frappe Geolocation column form)
	  - Legacy "lat,lng" string (kept for backward compatibility during migration)
	"""
	if value is None or value == "":
		return None

	if isinstance(value, dict):
		return _parse_geojson_obj(value)

	if isinstance(value, str):
		s = value.strip()
		if not s:
			return None
		if s.startswith("{") or s.startswith("["):
			try:
				return _parse_geojson_obj(json.loads(s))
			except (json.JSONDecodeError, ValueError):
				return None
		# Legacy "lat,lng"
		try:
			lat_str, lng_str = (p.strip() for p in s.split(",", 1))
			return float(lat_str), float(lng_str)
		except (ValueError, AttributeError):
			return None

	return None


def _parse_geojson_obj(obj):
	if not isinstance(obj, dict):
		return None
	t = obj.get("type")
	if t == "FeatureCollection":
		for feat in obj.get("features") or []:
			result = _parse_geojson_obj(feat)
			if result is not None:
				return result
		return None
	if t == "Feature":
		return _parse_geojson_obj(obj.get("geometry") or {})
	if t == "Point":
		coords = obj.get("coordinates") or []
		if len(coords) >= 2:
			try:
				# GeoJSON stores [lng, lat]; we return (lat, lng).
				return float(coords[1]), float(coords[0])
			except (TypeError, ValueError):
				return None
	return None


def to_geojson_point(lat, lng):
	"""Build a Frappe-compatible Geolocation value for a single point.

	Returns a JSON string (matches what the Geolocation widget stores).
	"""
	return json.dumps(
		{
			"type": "FeatureCollection",
			"features": [
				{
					"type": "Feature",
					"properties": {},
					"geometry": {"type": "Point", "coordinates": [float(lng), float(lat)]},
				}
			],
		}
	)


def haversine_meters(a, b):
	R = 6_371_000
	lat1, lon1 = map(math.radians, a)
	lat2, lon2 = map(math.radians, b)
	dlat, dlon = lat2 - lat1, lon2 - lon1
	h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
	return 2 * R * math.asin(math.sqrt(h))
