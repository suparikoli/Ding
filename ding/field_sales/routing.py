# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Local route-optimization fallback.

Used when no external provider is configured (or when a provider call fails).
Plain Python, no external dependencies. Operates on a precomputed N×N
distance matrix; the matrix can be Haversine (default) or road-distance from
`maps.distance_matrix`.

`optimize_haversine_2opt(matrix, has_depot=False, time_windows=None)`:
- Greedy nearest-neighbour seed.
- 2-opt swap loop, capped at 200 iterations or until no improving swap.
- Returns indices into `stops` (excludes depot when `has_depot=True`).
- Time windows are an optional list of (open_minutes, close_minutes) pairs;
  swaps that violate a window are rejected (best-effort).
"""

from __future__ import annotations

MAX_2OPT_ITERATIONS = 200


def optimize_haversine_2opt(matrix, has_depot=False, time_windows=None):
	n = len(matrix)
	if n == 0:
		return []
	if n == 1:
		return [] if has_depot else [0]

	# Build initial route via nearest-neighbour from index 0 (depot if present).
	start = 0 if has_depot else 0
	visited = {start}
	route = [start]
	while len(route) < n:
		last = route[-1]
		next_idx = _nearest_unvisited(matrix, last, visited)
		if next_idx is None:
			break
		visited.add(next_idx)
		route.append(next_idx)

	# 2-opt improvement loop.
	improved = True
	iters = 0
	while improved and iters < MAX_2OPT_ITERATIONS:
		improved = False
		iters += 1
		for i in range(1, len(route) - 2):
			for j in range(i + 1, len(route)):
				if j - i == 1:
					continue
				new_route = route[:i] + route[i:j][::-1] + route[j:]
				if _total_distance(matrix, new_route) < _total_distance(matrix, route):
					if _windows_ok(new_route, matrix, time_windows, has_depot):
						route = new_route
						improved = True

	# Strip depot from output.
	if has_depot:
		out = [r for r in route if r != start]
		# Indices in `out` are in the depot-included space; shift to stops-only.
		return [r - 1 for r in out]
	return route


def _nearest_unvisited(matrix, src, visited):
	best = None
	best_d = float("inf")
	for j, d in enumerate(matrix[src]):
		if j in visited:
			continue
		if d < best_d:
			best_d = d
			best = j
	return best


def _total_distance(matrix, route):
	total = 0.0
	for a, b in zip(route, route[1:]):
		total += matrix[a][b]
	return total


def _windows_ok(route, matrix, time_windows, has_depot):
	"""Best-effort time-window check.

	`time_windows[i]` is `(open_minutes, close_minutes)` for stop i (in the
	depot-included indexing). `None` means no constraint. We approximate
	travel time as 30 km/h to convert distance into minutes.
	"""
	if not time_windows:
		return True
	clock = 0.0  # minutes since day start
	for a, b in zip(route, route[1:]):
		travel_min = (matrix[a][b] / 1000.0) / 30.0 * 60.0
		clock += travel_min
		win = time_windows[b] if b < len(time_windows) else None
		if win:
			open_m, close_m = win
			if close_m is not None and clock > close_m:
				return False
			if open_m is not None and clock < open_m:
				clock = open_m  # wait at site
	return True
