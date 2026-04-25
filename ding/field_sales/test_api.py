# Copyright (c) 2026, manoj and Contributors
# See license.txt
"""Smoke tests for the whitelisted Field Sales API endpoints.

These run inside the Frappe test runner (`bench --site <s> run-tests --app ding`)
and require the test site to have the standard Frappe / ERPNext doctypes.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

from ding.field_sales.api import (
	add_to_day_plan,
	get_today_plan,
	heartbeat,
	stop_action,
	team_today_plans,
)
from ding.field_sales.utils import to_geojson_point


class TestFieldSalesAPI(FrappeTestCase):
	"""Endpoints assume a logged-in user; FrappeTestCase runs as Administrator."""

	def setUp(self):
		# Always operate on a clean per-day plan for the test user.
		existing = frappe.db.get_value(
			"Day Plan",
			{"assigned_to": frappe.session.user, "plan_date": today()},
			"name",
		)
		if existing:
			plan = frappe.get_doc("Day Plan", existing)
			if plan.docstatus == 0:
				plan.delete(ignore_permissions=True)

	def test_get_today_plan_empty(self):
		res = get_today_plan()
		self.assertIn("plan", res)

	def test_add_to_day_plan_creates_plan_and_appends(self):
		lead = self._ensure_lead()
		res = add_to_day_plan(client_doctype="Lead", client_name=lead, visit_type="Sales")
		self.assertTrue(res["plan_name"])
		self.assertTrue(res["added"])
		# Idempotent — second call should not duplicate.
		again = add_to_day_plan(client_doctype="Lead", client_name=lead, visit_type="Sales")
		self.assertFalse(again["added"])
		# Cleanup
		frappe.delete_doc("Day Plan", res["plan_name"], ignore_permissions=True, force=True)

	def test_heartbeat_creates_row(self):
		res = heartbeat(lat=12.97, lng=77.59, accuracy_m=15.0)
		self.assertTrue(res.get("name"))
		hb = frappe.get_doc("Field Rep Heartbeat", res["name"])
		self.assertEqual(hb.rep, frappe.session.user)
		hb.delete(ignore_permissions=True)

	def test_team_today_plans_runs(self):
		# As Administrator we count as manager — should return list (possibly empty).
		rows = team_today_plans()
		self.assertIsInstance(rows, list)

	def test_stop_action_skip(self):
		lead = self._ensure_lead()
		res = add_to_day_plan(client_doctype="Lead", client_name=lead)
		plan_name = res["plan_name"]
		try:
			plan = frappe.get_doc("Day Plan", plan_name)
			row = plan.stops[0]
			# Geolocate the stop so anything depending on parse_geo doesn't throw.
			frappe.db.set_value(
				"Visit Stop", row.name, "client_geolocation",
				to_geojson_point(12.97, 77.59), update_modified=False,
			)
			out = stop_action(plan_name=plan_name, stop_row=row.name,
			                  action="skip", payload="Customer unavailable")
			self.assertEqual(out["stop_status"], "Skipped")
		finally:
			frappe.delete_doc("Day Plan", plan_name, ignore_permissions=True, force=True)

	def _ensure_lead(self) -> str:
		existing = frappe.db.get_value("Lead", {}, "name")
		if existing:
			return existing
		lead = frappe.get_doc({
			"doctype": "Lead",
			"lead_name": "Ding Test Lead",
			"first_name": "Ding",
			"last_name": "Test",
			"company_name": "Ding Test Co",
			"status": "Open",
		})
		lead.insert(ignore_permissions=True)
		return lead.name
