# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Time-on-territory: total time the agent spent on completed visits, grouped
by agent and visit type, optionally filtered by territory (via parent customer).
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, today


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -30)
	to_date = filters.get("to_date") or today()

	rows = []
	for meet_doctype in ("Lead Meet", "Customer Meet", "Contact Meet"):
		conditions = [
			"docstatus = 1",
			"check_in_time BETWEEN %(from)s AND %(to)s",
			"duration > 0",
		]
		params = {"from": from_date, "to": to_date}
		if filters.get("agent"):
			conditions.append("creator = %(agent)s")
			params["agent"] = filters["agent"]
		if filters.get("visit_type"):
			conditions.append("visit_type = %(visit_type)s")
			params["visit_type"] = filters["visit_type"]
		where = " AND ".join(conditions)
		group_rows = frappe.db.sql(
			f"""
			SELECT creator, visit_type,
			       COUNT(*) AS visits,
			       SUM(duration) AS total_seconds,
			       AVG(duration) AS avg_seconds
			FROM `tab{meet_doctype}`
			WHERE {where}
			GROUP BY creator, visit_type
			""",
			params,
			as_dict=True,
		)
		for r in group_rows:
			r["meet_type"] = meet_doctype
			rows.append(r)

	rows.sort(key=lambda r: (-r["total_seconds"] or 0, r["creator"] or ""))

	columns = [
		{"fieldname": "creator", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 220},
		{"fieldname": "meet_type", "label": "Meet Type", "fieldtype": "Data", "width": 130},
		{"fieldname": "visit_type", "label": "Visit Type", "fieldtype": "Data", "width": 110},
		{"fieldname": "visits", "label": "Visits", "fieldtype": "Int", "width": 80},
		{"fieldname": "total_seconds", "label": "Total Time", "fieldtype": "Duration", "width": 130},
		{"fieldname": "avg_seconds", "label": "Avg Time", "fieldtype": "Duration", "width": 130},
	]
	return columns, rows
