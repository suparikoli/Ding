# Copyright (c) 2026, manoj and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

from ding.field_sales.utils import to_geojson_point


class TestDayPlan(FrappeTestCase):
	def _new_plan(self, **kwargs):
		doc = frappe.new_doc("Day Plan")
		doc.plan_date = kwargs.pop("plan_date", today())
		doc.assigned_to = kwargs.pop("assigned_to", frappe.session.user)
		for k, v in kwargs.items():
			setattr(doc, k, v)
		return doc

	def test_create_with_one_stop(self):
		plan = self._new_plan()
		plan.append("stops", {
			"sequence": 1,
			"client_doctype": "Lead",
			"client_name": frappe.db.get_value("Lead", {}, "name") or "TEST-LEAD",
			"client_geolocation": to_geojson_point(12.97, 77.59),
			"visit_type": "Sales",
			"planned_duration": 1800,
		})
		plan.insert(ignore_permissions=True)
		try:
			self.assertEqual(plan.summary_planned_count, 1)
			self.assertGreaterEqual(int(plan.summary_planned_minutes or 0), 1800)
		finally:
			plan.delete(ignore_permissions=True)

	def test_skipped_requires_reason(self):
		plan = self._new_plan()
		plan.append("stops", {
			"sequence": 1,
			"client_doctype": "Lead",
			"client_name": frappe.db.get_value("Lead", {}, "name") or "TEST-LEAD",
			"client_geolocation": to_geojson_point(12.97, 77.59),
			"status": "Skipped",
		})
		with self.assertRaises(frappe.ValidationError):
			plan.insert(ignore_permissions=True)
