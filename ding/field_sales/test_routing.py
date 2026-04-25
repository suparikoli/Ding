# Copyright (c) 2026, manoj and Contributors
# See license.txt

import unittest

from ding.field_sales.routing import optimize_haversine_2opt
from ding.field_sales.utils import haversine_meters


def _matrix(points):
	n = len(points)
	out = [[0.0] * n for _ in range(n)]
	for i in range(n):
		for j in range(i + 1, n):
			d = haversine_meters(points[i], points[j])
			out[i][j] = d
			out[j][i] = d
	return out


class TestOptimizeRoute(unittest.TestCase):
	def test_no_stops(self):
		self.assertEqual(optimize_haversine_2opt([], has_depot=False), [])

	def test_single_stop(self):
		matrix = _matrix([(0.0, 0.0), (1.0, 1.0)])
		# depot=0, one stop=1 → output [0] in stops-space
		self.assertEqual(optimize_haversine_2opt(matrix, has_depot=True), [0])

	def test_returns_all_stop_indices(self):
		# 4 stops in a square; depot at one corner.
		matrix = _matrix(
			[(0.0, 0.0), (0.0, 0.001), (0.001, 0.001), (0.001, 0.0), (-0.001, 0.0)]
		)
		ord_ = optimize_haversine_2opt(matrix, has_depot=True)
		self.assertEqual(sorted(ord_), [0, 1, 2, 3])

	def test_total_distance_is_lte_input_order(self):
		import random
		random.seed(42)
		points = [(random.uniform(0, 0.05), random.uniform(0, 0.05)) for _ in range(10)]
		matrix = _matrix(points)
		ord_ = optimize_haversine_2opt(matrix, has_depot=False)

		def total(route):
			return sum(matrix[a][b] for a, b in zip(route, route[1:]))

		self.assertLessEqual(total(ord_), total(list(range(len(points)))))
