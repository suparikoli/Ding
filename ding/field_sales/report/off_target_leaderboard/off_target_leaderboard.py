# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Ranks agents by their average off-target distance and the share of visits
flagged off_target. Worst → best, so managers can see chronic patterns first.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, today


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -30)
	to_date = filters.get("to_date") or today()

	per_agent = {}
	for meet_doctype in ("Lead Meet", "Customer Meet", "Contact Meet"):
		rows = frappe.db.sql(
			f"""
			SELECT creator, distance, off_target
			FROM `tab{meet_doctype}`
			WHERE docstatus = 1
			  AND check_in_time BETWEEN %(from)s AND %(to)s
			  AND distance IS NOT NULL
			""",
			{"from": from_date, "to": to_date},
			as_dict=True,
		)
		for r in rows:
			if not r.creator:
				continue
			bucket = per_agent.setdefault(
				r.creator,
				{"creator": r.creator, "visits": 0, "total_distance": 0.0, "off_target_count": 0},
			)
			bucket["visits"] += 1
			bucket["total_distance"] += float(r.distance or 0)
			bucket["off_target_count"] += 1 if r.off_target else 0

	out = []
	for bucket in per_agent.values():
		visits = bucket["visits"] or 1
		bucket["avg_distance"] = round(bucket["total_distance"] / visits, 1)
		bucket["off_target_pct"] = round((bucket["off_target_count"] / visits) * 100, 1)
		out.append(bucket)

	out.sort(key=lambda r: (-r["off_target_pct"], -r["avg_distance"]))

	columns = [
		{"fieldname": "creator", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 240},
		{"fieldname": "visits", "label": "Visits", "fieldtype": "Int", "width": 90},
		{"fieldname": "off_target_count", "label": "Off-target", "fieldtype": "Int", "width": 110},
		{"fieldname": "off_target_pct", "label": "Off-target %", "fieldtype": "Percent", "width": 120},
		{"fieldname": "avg_distance", "label": "Avg Distance (m)", "fieldtype": "Float", "precision": 1, "width": 150},
	]
	return columns, out
