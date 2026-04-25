# Copyright (c) 2026, manoj and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestDingSettings(FrappeTestCase):
	def test_single_loadable(self):
		settings = frappe.get_single("Ding Settings")
		for fieldname in (
			"company_profile_url",
			"company_website_url",
			"ecommerce_url",
			"price_list_url",
		):
			self.assertTrue(hasattr(settings, fieldname))
