# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Pluggable maps/routing provider.

All public functions accept (lat, lng) tuples; GeoJSON conversion happens at the
edges (`utils.parse_geo` / `utils.to_geojson_point`).

The provider is read once per call from `Field Sales Settings`. If the call
fails for any reason (network, missing key, provider error), the function
returns `None` for geocode/distance_matrix, an empty list for optimize_route,
and a Google-Maps URL for directions_url. Callers must handle `None`.
"""

from __future__ import annotations

import json
from typing import Optional
from urllib import parse as urlparse
from urllib import request as urlrequest
from urllib.error import URLError

import frappe

from ding.field_sales.routing import optimize_haversine_2opt
from ding.field_sales.utils import haversine_meters

DEFAULT_TIMEOUT = 8


def _settings():
	try:
		return frappe.get_cached_doc("Field Sales Settings")
	except Exception:
		return None


def _provider() -> str:
	s = _settings()
	return (s.maps_provider if s else None) or "OpenStreetMap"


def _api_key() -> Optional[str]:
	s = _settings()
	if not s or not s.maps_api_key:
		return None
	# Password fields decrypt automatically when accessed from a loaded doc.
	return str(s.get_password("maps_api_key", raise_exception=False) or "")


def _osrm_base() -> str:
	s = _settings()
	url = (s.maps_self_hosted_url if s else "") or "https://router.project-osrm.org"
	return url.rstrip("/")


def _http_get_json(url: str, headers: Optional[dict] = None):
	headers = dict(headers or {})
	headers.setdefault("Accept", "application/json")
	try:
		req = urlrequest.Request(url, headers=headers)
		with urlrequest.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
			return json.loads(resp.read().decode("utf-8"))
	except (URLError, TimeoutError, ValueError) as exc:
		frappe.logger().warning(f"ding maps GET {url} failed: {exc}")
		return None


def _http_post_json(url: str, payload: dict, headers: Optional[dict] = None):
	headers = dict(headers or {})
	headers.setdefault("Accept", "application/json")
	headers.setdefault("Content-Type", "application/json")
	try:
		req = urlrequest.Request(
			url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
		)
		with urlrequest.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
			return json.loads(resp.read().decode("utf-8"))
	except (URLError, TimeoutError, ValueError) as exc:
		frappe.logger().warning(f"ding maps POST {url} failed: {exc}")
		return None


# ---------------------------------------------------------------------------
# geocode
# ---------------------------------------------------------------------------

def geocode(address: str) -> Optional[tuple[float, float]]:
	"""Address → (lat, lng). Returns None if disabled or the call fails."""
	s = _settings()
	if not address or not s or not s.enable_geocoding:
		return None
	provider = _provider()
	if provider == "OpenStreetMap":
		return _geocode_nominatim(address, s)
	if provider == "OpenRouteService":
		return _geocode_ors(address)
	if provider == "Mapbox":
		return _geocode_mapbox(address)
	if provider == "Google":
		return _geocode_google(address)
	if provider == "HERE":
		return _geocode_here(address)
	# OSRM doesn't do geocoding — fall back to Nominatim.
	return _geocode_nominatim(address, s)


def _geocode_nominatim(address, s):
	url = "https://nominatim.openstreetmap.org/search?" + urlparse.urlencode(
		{"q": address, "format": "json", "limit": 1}
	)
	ua = (s.nominatim_user_agent if s else "") or "ding-field-sales/1.0"
	data = _http_get_json(url, {"User-Agent": ua})
	if data and len(data) > 0:
		return float(data[0]["lat"]), float(data[0]["lon"])
	return None


def _geocode_ors(address):
	key = _api_key()
	if not key:
		return None
	url = "https://api.openrouteservice.org/geocode/search?" + urlparse.urlencode(
		{"api_key": key, "text": address, "size": 1}
	)
	data = _http_get_json(url)
	feats = (data or {}).get("features") or []
	if feats:
		coords = feats[0]["geometry"]["coordinates"]
		return float(coords[1]), float(coords[0])
	return None


def _geocode_mapbox(address):
	key = _api_key()
	if not key:
		return None
	url = (
		f"https://api.mapbox.com/geocoding/v5/mapbox.places/{urlparse.quote(address)}.json?"
		+ urlparse.urlencode({"access_token": key, "limit": 1})
	)
	data = _http_get_json(url)
	feats = (data or {}).get("features") or []
	if feats:
		coords = feats[0]["geometry"]["coordinates"]
		return float(coords[1]), float(coords[0])
	return None


def _geocode_google(address):
	key = _api_key()
	if not key:
		return None
	url = "https://maps.googleapis.com/maps/api/geocode/json?" + urlparse.urlencode(
		{"address": address, "key": key}
	)
	data = _http_get_json(url)
	results = (data or {}).get("results") or []
	if results:
		loc = results[0]["geometry"]["location"]
		return float(loc["lat"]), float(loc["lng"])
	return None


def _geocode_here(address):
	key = _api_key()
	if not key:
		return None
	url = "https://geocode.search.hereapi.com/v1/geocode?" + urlparse.urlencode(
		{"q": address, "apiKey": key, "limit": 1}
	)
	data = _http_get_json(url)
	items = (data or {}).get("items") or []
	if items:
		pos = items[0]["position"]
		return float(pos["lat"]), float(pos["lng"])
	return None


# ---------------------------------------------------------------------------
# directions_url — open in maps deep link
# ---------------------------------------------------------------------------

def directions_url(origin, destination, waypoints=None) -> str:
	"""Build a deep-link to the configured directions provider.

	`origin`, `destination`, `waypoints[i]` are (lat, lng) tuples or strings.
	"""
	provider = (_settings().directions_provider if _settings() else None) or "Google Maps URL"
	o = _coord_str(origin)
	d = _coord_str(destination)
	wps = [_coord_str(w) for w in (waypoints or []) if w]
	if provider == "Mapbox URL":
		# Static-style deep-link via Mapbox web app
		stops = "/".join([o, *wps, d])
		return f"https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{stops}"
	if provider == "OpenStreetMap (browser)":
		# OSM doesn't have a multi-stop "open" URL; show map at destination.
		return f"https://www.openstreetmap.org/?mlat={destination[0]}&mlon={destination[1]}#map=15/{destination[0]}/{destination[1]}"
	# Default: Google Maps deep-link
	params = {"api": "1", "origin": o, "destination": d}
	if wps:
		params["waypoints"] = "|".join(wps)
	return "https://www.google.com/maps/dir/?" + urlparse.urlencode(params)


def _coord_str(c):
	if isinstance(c, (tuple, list)) and len(c) >= 2:
		return f"{c[0]},{c[1]}"
	return str(c)


# ---------------------------------------------------------------------------
# distance_matrix — pairwise distances
# ---------------------------------------------------------------------------

def distance_matrix(points):
	"""Return an N×N distance matrix in meters. Falls back to Haversine on failure."""
	s = _settings()
	use_road = bool(s and s.enable_road_distance_optimization)
	if not use_road:
		return _haversine_matrix(points)
	provider = _provider()
	try:
		if provider == "OpenRouteService":
			return _matrix_ors(points) or _haversine_matrix(points)
		if provider == "OSRM":
			return _matrix_osrm(points) or _haversine_matrix(points)
		if provider == "Mapbox":
			return _matrix_mapbox(points) or _haversine_matrix(points)
		if provider == "Google":
			return _matrix_google(points) or _haversine_matrix(points)
		if provider == "HERE":
			return _matrix_here(points) or _haversine_matrix(points)
	except Exception as exc:
		frappe.logger().warning(f"ding distance_matrix({provider}) failed: {exc}")
	return _haversine_matrix(points)


def _haversine_matrix(points):
	n = len(points)
	out = [[0.0] * n for _ in range(n)]
	for i in range(n):
		for j in range(i + 1, n):
			d = haversine_meters(points[i], points[j])
			out[i][j] = d
			out[j][i] = d
	return out


def _matrix_ors(points):
	key = _api_key()
	if not key:
		return None
	url = "https://api.openrouteservice.org/v2/matrix/driving-car"
	body = {
		"locations": [[p[1], p[0]] for p in points],
		"metrics": ["distance"],
	}
	data = _http_post_json(url, body, {"Authorization": key})
	return (data or {}).get("distances")


def _matrix_osrm(points):
	coords = ";".join(f"{p[1]},{p[0]}" for p in points)
	url = f"{_osrm_base()}/table/v1/driving/{coords}?annotations=distance"
	data = _http_get_json(url)
	return (data or {}).get("distances")


def _matrix_mapbox(points):
	key = _api_key()
	if not key or len(points) > 25:
		return None
	coords = ";".join(f"{p[1]},{p[0]}" for p in points)
	url = (
		f"https://api.mapbox.com/directions-matrix/v1/mapbox/driving/{coords}"
		f"?annotations=distance&access_token={urlparse.quote(key)}"
	)
	data = _http_get_json(url)
	return (data or {}).get("distances")


def _matrix_google(points):
	key = _api_key()
	if not key:
		return None
	origins = "|".join(f"{p[0]},{p[1]}" for p in points)
	url = "https://maps.googleapis.com/maps/api/distancematrix/json?" + urlparse.urlencode(
		{"origins": origins, "destinations": origins, "key": key}
	)
	data = _http_get_json(url)
	rows = (data or {}).get("rows") or []
	if not rows:
		return None
	matrix = []
	for r in rows:
		row = []
		for el in r.get("elements") or []:
			dist = (el.get("distance") or {}).get("value")
			row.append(float(dist) if dist is not None else 0.0)
		matrix.append(row)
	return matrix


def _matrix_here(points):
	key = _api_key()
	if not key:
		return None
	url = "https://matrix.router.hereapi.com/v8/matrix?async=false&apiKey=" + urlparse.quote(key)
	body = {
		"origins": [{"lat": p[0], "lng": p[1]} for p in points],
		"destinations": [{"lat": p[0], "lng": p[1]} for p in points],
		"regionDefinition": {"type": "world"},
		"matrixAttributes": ["distances"],
	}
	data = _http_post_json(url, body)
	dists = (data or {}).get("matrix", {}).get("distances")
	if not dists:
		return None
	n = len(points)
	return [dists[i * n : (i + 1) * n] for i in range(n)]


# ---------------------------------------------------------------------------
# optimize_route
# ---------------------------------------------------------------------------

def optimize_route(start, stops, time_windows=None) -> list[int]:
	"""Return an ordering (list of indices into `stops`) optimizing total distance.

	If the configured provider supports a true VRP/TSP endpoint (ORS,
	OSRM /trip), use that. Otherwise compute a distance matrix and run the
	local Haversine-based 2-opt fallback in `routing.py`.
	"""
	if not stops:
		return []
	provider = _provider()
	try:
		if provider == "OpenRouteService":
			ord_ = _optimize_ors(start, stops)
			if ord_ is not None:
				return ord_
		if provider == "OSRM":
			ord_ = _optimize_osrm(start, stops)
			if ord_ is not None:
				return ord_
	except Exception as exc:
		frappe.logger().warning(f"ding optimize_route({provider}) failed: {exc}")
	# Fallback: matrix + 2-opt
	points = [start] + list(stops) if start else list(stops)
	matrix = distance_matrix(points)
	if start:
		# 2-opt on matrix; depot is index 0, return path through stops only.
		ord_ = optimize_haversine_2opt(matrix, has_depot=True, time_windows=time_windows)
		# ord_ contains indices relative to `points` excluding depot — already 0-based on stops
		return ord_
	return optimize_haversine_2opt(matrix, has_depot=False, time_windows=time_windows)


def _optimize_ors(start, stops):
	key = _api_key()
	if not key:
		return None
	url = "https://api.openrouteservice.org/optimization"
	jobs = [
		{"id": i, "location": [p[1], p[0]]} for i, p in enumerate(stops)
	]
	vehicles = [
		{
			"id": 1,
			"profile": "driving-car",
			"start": [start[1], start[0]] if start else None,
		}
	]
	body = {"jobs": jobs, "vehicles": vehicles}
	data = _http_post_json(url, body, {"Authorization": key})
	routes = (data or {}).get("routes") or []
	if not routes:
		return None
	steps = routes[0].get("steps") or []
	return [s["job"] for s in steps if s.get("type") == "job" and "job" in s]


def _optimize_osrm(start, stops):
	"""OSRM /trip solves a TSP. Depot is the first coordinate when source=first."""
	coords_list = []
	if start:
		coords_list.append(start)
	coords_list.extend(stops)
	if len(coords_list) < 2:
		return None
	coords = ";".join(f"{p[1]},{p[0]}" for p in coords_list)
	src = "source=first" if start else "source=any"
	url = f"{_osrm_base()}/trip/v1/driving/{coords}?{src}&roundtrip=false"
	data = _http_get_json(url)
	trips = (data or {}).get("trips") or []
	wps = (data or {}).get("waypoints") or []
	if not trips or not wps:
		return None
	# waypoint_index gives the visit order; skip depot (index 0 in coords_list).
	indexed = sorted(enumerate(wps), key=lambda iw: iw[1].get("waypoint_index", 0))
	order = []
	for orig_i, _ in indexed:
		if start and orig_i == 0:
			continue  # skip depot
		order.append(orig_i - (1 if start else 0))
	return order
