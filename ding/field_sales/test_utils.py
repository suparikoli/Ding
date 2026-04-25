# Copyright (c) 2026, manoj and Contributors
# See license.txt

import json
import unittest

from ding.field_sales.utils import haversine_meters, parse_geo, to_geojson_point


class TestFieldSalesUtils(unittest.TestCase):
	def test_parse_geo_legacy_string(self):
		self.assertEqual(parse_geo("12.97, 77.59"), (12.97, 77.59))
		self.assertEqual(parse_geo("0,0"), (0.0, 0.0))
		self.assertEqual(parse_geo("-33.86,151.21"), (-33.86, 151.21))

	def test_parse_geo_geojson_string(self):
		geo = to_geojson_point(12.97, 77.59)
		self.assertEqual(parse_geo(geo), (12.97, 77.59))

	def test_parse_geo_geojson_dict(self):
		geo = json.loads(to_geojson_point(-33.86, 151.21))
		self.assertEqual(parse_geo(geo), (-33.86, 151.21))

	def test_parse_geo_bare_point_dict(self):
		point = {"type": "Point", "coordinates": [77.59, 12.97]}
		self.assertEqual(parse_geo(point), (12.97, 77.59))

	def test_parse_geo_malformed(self):
		self.assertIsNone(parse_geo(""))
		self.assertIsNone(parse_geo(None))
		self.assertIsNone(parse_geo("not-a-coord"))
		self.assertIsNone(parse_geo("12.97"))
		self.assertIsNone(parse_geo("a,b"))
		self.assertIsNone(parse_geo("{not json}"))
		self.assertIsNone(parse_geo({}))
		self.assertIsNone(parse_geo({"type": "FeatureCollection", "features": []}))

	def test_to_geojson_point_round_trip(self):
		geo = to_geojson_point(40.71, -74.00)
		parsed = json.loads(geo)
		self.assertEqual(parsed["type"], "FeatureCollection")
		self.assertEqual(len(parsed["features"]), 1)
		feat = parsed["features"][0]
		self.assertEqual(feat["geometry"]["type"], "Point")
		# GeoJSON convention: [lng, lat]
		self.assertEqual(feat["geometry"]["coordinates"], [-74.00, 40.71])

	def test_haversine_meters_known_pairs(self):
		self.assertAlmostEqual(haversine_meters((10.0, 20.0), (10.0, 20.0)), 0.0, places=3)
		self.assertAlmostEqual(haversine_meters((0.0, 0.0), (1.0, 0.0)), 111_195, delta=50)
