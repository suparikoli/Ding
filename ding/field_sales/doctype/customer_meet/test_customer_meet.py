# Copyright (c) 2024, manoj and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from ding.field_sales.utils import to_geojson_point


class TestCustomerMeet(FrappeTestCase):
	def _new_meet(self, **kwargs):
		doc = frappe.new_doc("Customer Meet")
		for k, v in kwargs.items():
			setattr(doc, k, v)
		return doc

	def test_before_insert_defaults_creator_and_check_in_time(self):
		doc = self._new_meet()
		doc.insert(ignore_permissions=True)
		try:
			self.assertEqual(doc.creator, frappe.session.user)
			self.assertIsNotNone(doc.check_in_time)
		finally:
			doc.delete(ignore_permissions=True)

	def test_validate_computes_distance(self):
		doc = self._new_meet(
			customer_location=to_geojson_point(0.0, 0.0),
			logged_geo_location=to_geojson_point(1.0, 0.0),
		)
		doc.insert(ignore_permissions=True)
		try:
			self.assertIsNotNone(doc.distance)
			self.assertAlmostEqual(float(doc.distance), 111_195, delta=50)
		finally:
			doc.delete(ignore_permissions=True)

	def test_validate_computes_duration(self):
		start = now_datetime()
		doc = self._new_meet(
			check_in_time=start,
			check_out_time=add_to_date(start, seconds=120),
		)
		doc.insert(ignore_permissions=True)
		try:
			self.assertEqual(int(doc.duration), 120)
		finally:
			doc.delete(ignore_permissions=True)

	def test_validate_rejects_check_out_before_check_in(self):
		start = now_datetime()
		doc = self._new_meet(
			check_in_time=start,
			check_out_time=add_to_date(start, seconds=-60),
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert(ignore_permissions=True)
