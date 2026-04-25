# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class FieldVisitItem(Document):
	def validate(self):
		qty = float(self.qty or 0)
		rate = float(self.rate or 0)
		discount = float(self.discount_pct or 0) / 100.0
		self.amount = round(qty * rate * (1 - discount), 2)
