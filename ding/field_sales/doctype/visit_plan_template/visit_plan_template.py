# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import today


class VisitPlanTemplate(Document):
	@frappe.whitelist()
	def apply_to_day_plan(self, plan_name: str | None = None, plan_date: str | None = None,
	                     agent: str | None = None) -> str:
		"""Append this template's rows to a Day Plan.

		If `plan_name` is given, append to that plan. Otherwise create/load a
		Day Plan for `(agent, plan_date)` (defaults today + default_assignee).
		Returns the Day Plan name.
		"""
		from ding.field_sales.api import _resolve_user

		agent = _resolve_user(agent or self.default_assignee)
		plan_date = plan_date or today()

		if plan_name:
			plan = frappe.get_doc("Day Plan", plan_name)
		else:
			existing = frappe.db.get_value(
				"Day Plan", {"assigned_to": agent, "plan_date": plan_date}, "name"
			)
			if existing:
				plan = frappe.get_doc("Day Plan", existing)
			else:
				plan = frappe.new_doc("Day Plan")
				plan.assigned_to = agent
				plan.plan_date = plan_date
				plan.status = "Draft"

		plan.check_permission("write")
		existing_keys = {(s.client_doctype, s.client_name) for s in plan.stops or []}
		next_seq = max([(s.sequence or 0) for s in plan.stops or []], default=0) + 1
		added = 0
		for row in self.rows or []:
			key = (row.client_doctype, row.client_name)
			if key in existing_keys:
				continue
			plan.append("stops", {
				"sequence": next_seq,
				"client_doctype": row.client_doctype,
				"client_name": row.client_name,
				"visit_type": row.default_visit_type or "Sales",
				"objective": row.default_objective,
				"planned_duration": row.default_duration or 1800,
				"status": "Pending",
			})
			next_seq += 1
			added += 1
		plan.save(ignore_permissions=False)
		frappe.msgprint(f"Added {added} stop(s) from template '{self.template_name}'.")
		return plan.name


@frappe.whitelist()
def apply_template(template: str, plan_name: str | None = None,
                   plan_date: str | None = None, agent: str | None = None) -> str:
	"""Module-level whitelisted wrapper for `VisitPlanTemplate.apply_to_day_plan`."""
	doc = frappe.get_doc("Visit Plan Template", template)
	doc.check_permission("read")
	return doc.apply_to_day_plan(plan_name=plan_name, plan_date=plan_date, agent=agent)
