# Copyright (c) 2024, manoj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_seconds


class DingCallLogs(Document):
	def before_insert(self):
		if not self.call_handler:
			self.call_handler = frappe.session.user
		if not self.start_time:
			self.start_time = now_datetime()

	def validate(self):
		if self.start_time and self.end_time:
			seconds = time_diff_in_seconds(self.end_time, self.start_time)
			if seconds < 0:
				frappe.throw("End time cannot be before start time.")
			self.duration = int(seconds)
