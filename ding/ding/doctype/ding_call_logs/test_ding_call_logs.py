# Copyright (c) 2024, manoj and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime


class TestDingCallLogs(FrappeTestCase):
	def _new_log(self, **kwargs):
		doc = frappe.new_doc("Ding Call Logs")
		doc.type = "Outgoing"
		doc.mobile_no = "9999999999"
		for k, v in kwargs.items():
			setattr(doc, k, v)
		return doc

	def test_before_insert_sets_defaults(self):
		doc = self._new_log()
		doc.insert(ignore_permissions=True)
		try:
			self.assertEqual(doc.call_handler, frappe.session.user)
			self.assertIsNotNone(doc.start_time)
		finally:
			doc.delete(ignore_permissions=True)

	def test_validate_computes_duration(self):
		start = now_datetime()
		doc = self._new_log(start_time=start, end_time=add_to_date(start, seconds=90))
		doc.insert(ignore_permissions=True)
		try:
			self.assertEqual(int(doc.duration), 90)
		finally:
			doc.delete(ignore_permissions=True)

	def test_validate_rejects_end_before_start(self):
		start = now_datetime()
		doc = self._new_log(start_time=start, end_time=add_to_date(start, seconds=-30))
		with self.assertRaises(frappe.ValidationError):
			doc.insert(ignore_permissions=True)
