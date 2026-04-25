# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.utils import add_days, today


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -7)
	to_date = filters.get("to_date") or today()

	conditions = ["dp.plan_date BETWEEN %(from_date)s AND %(to_date)s"]
	params = {"from_date": from_date, "to_date": to_date}
	if filters.get("agent"):
		conditions.append("dp.assigned_to = %(agent)s")
		params["agent"] = filters["agent"]
	if filters.get("territory"):
		conditions.append("dp.territory = %(territory)s")
		params["territory"] = filters["territory"]
	if filters.get("status"):
		conditions.append("dp.status = %(status)s")
		params["status"] = filters["status"]

	where = " AND ".join(conditions)
	rows = frappe.db.sql(
		f"""
		SELECT
			dp.name AS plan_name,
			dp.plan_date,
			dp.assigned_to,
			dp.territory,
			dp.status,
			dp.summary_planned_count,
			dp.summary_completed_count,
			dp.summary_skipped_count,
			dp.summary_no_show_count,
			dp.summary_planned_minutes,
			dp.summary_actual_minutes,
			dp.summary_planned_distance_m,
			dp.adherence_pct
		FROM `tabDay Plan` dp
		WHERE {where}
		ORDER BY dp.plan_date DESC, dp.assigned_to
		""",
		params,
		as_dict=True,
	)

	columns = [
		{"fieldname": "plan_name", "label": "Day Plan", "fieldtype": "Link", "options": "Day Plan", "width": 200},
		{"fieldname": "plan_date", "label": "Date", "fieldtype": "Date", "width": 100},
		{"fieldname": "assigned_to", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 200},
		{"fieldname": "territory", "label": "Territory", "fieldtype": "Link", "options": "Territory", "width": 130},
		{"fieldname": "status", "label": "Status", "fieldtype": "Data", "width": 110},
		{"fieldname": "summary_planned_count", "label": "Planned", "fieldtype": "Int", "width": 80},
		{"fieldname": "summary_completed_count", "label": "Done", "fieldtype": "Int", "width": 80},
		{"fieldname": "summary_skipped_count", "label": "Skipped", "fieldtype": "Int", "width": 80},
		{"fieldname": "summary_no_show_count", "label": "No Show", "fieldtype": "Int", "width": 80},
		{"fieldname": "adherence_pct", "label": "Adherence %", "fieldtype": "Percent", "width": 100},
		{"fieldname": "summary_planned_minutes", "label": "Planned", "fieldtype": "Duration", "width": 100},
		{"fieldname": "summary_actual_minutes", "label": "Actual", "fieldtype": "Duration", "width": 100},
		{"fieldname": "summary_planned_distance_m", "label": "Plan km", "fieldtype": "Float", "precision": 1, "width": 100},
	]
	# convert distance from meters to km for the report column
	for r in rows:
		r["summary_planned_distance_m"] = round((r.get("summary_planned_distance_m") or 0) / 1000.0, 2)
	return columns, rows
