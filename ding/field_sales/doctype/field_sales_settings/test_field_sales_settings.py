# Copyright (c) 2026, manoj and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestFieldSalesSettings(FrappeTestCase):
	def test_single_loadable(self):
		settings = frappe.get_single("Field Sales Settings")
		for fieldname in (
			"maps_provider",
			"directions_provider",
			"off_target_threshold_meters",
			"geofence_radius_m",
			"heartbeat_interval_seconds",
		):
			self.assertTrue(hasattr(settings, fieldname))
