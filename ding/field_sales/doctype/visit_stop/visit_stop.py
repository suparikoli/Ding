# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


PARENT_GEO_FIELD = {
	"Lead": "lead_geolocation",
	"Customer": "customer_geolocation",
	"Contact": "contact_geolocation",
}


class VisitStop(Document):
	def validate(self):
		if self.status == "Skipped" and not self.skip_reason:
			frappe.throw("Provide a skip reason for a skipped stop.")
		if self.client_doctype and self.client_name and not self.client_geolocation:
			geo_field = PARENT_GEO_FIELD.get(self.client_doctype)
			if geo_field:
				value = frappe.db.get_value(self.client_doctype, self.client_name, geo_field)
				if value:
					self.client_geolocation = value
