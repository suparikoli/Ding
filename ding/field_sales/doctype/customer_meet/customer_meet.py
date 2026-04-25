# Copyright (c) 2024, manoj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_seconds

from ding.field_sales.meet_lifecycle import apply_before_submit, apply_on_submit, apply_validate
from ding.field_sales.rollup import rollup_meet_to_stop
from ding.field_sales.utils import haversine_meters, parse_geo


class CustomerMeet(Document):
	def before_insert(self):
		if not self.creator:
			self.creator = frappe.session.user
		if not self.check_in_time:
			self.check_in_time = now_datetime()
		if self.customer and not self.customer_location:
			self.customer_location = frappe.db.get_value(
				"Customer", self.customer, "customer_geolocation"
			)

	def validate(self):
		if self.check_in_time and self.check_out_time:
			seconds = time_diff_in_seconds(self.check_out_time, self.check_in_time)
			if seconds < 0:
				frappe.throw("Check-out time cannot be before check-in time.")
			self.duration = int(seconds)
		target = parse_geo(self.customer_location)
		actual = parse_geo(self.logged_geo_location)
		if target and actual:
			self.distance = round(haversine_meters(target, actual), 1)
		apply_validate(self)

	def before_submit(self):
		apply_before_submit(self)

	def on_update(self):
		rollup_meet_to_stop(self)

	def on_submit(self):
		apply_on_submit(self)
		rollup_meet_to_stop(self)
