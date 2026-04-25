# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Route efficiency: planned vs actual route per Day Plan.

Planned distance comes from `summary_planned_distance_m`. Actual is the sum of
Haversine distances between consecutive Meet check-in points (sequenced by
`actual_start_time`) — a "as the agent flew" approximation. Plans where actual
diverges from planned by more than the threshold are flagged.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, today

from ding.field_sales.utils import haversine_meters, parse_geo


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -7)
	to_date = filters.get("to_date") or today()
	threshold_pct = float(filters.get("divergence_threshold_pct") or 30)

	plans = frappe.db.sql(
		"""
		SELECT name, plan_date, assigned_to, summary_planned_distance_m,
		       summary_planned_count, summary_completed_count
		FROM `tabDay Plan`
		WHERE plan_date BETWEEN %(from)s AND %(to)s
		""",
		{"from": from_date, "to": to_date},
		as_dict=True,
	)
	if filters.get("agent"):
		plans = [p for p in plans if p["assigned_to"] == filters["agent"]]

	out = []
	for plan in plans:
		stops = frappe.get_all(
			"Visit Stop",
			filters={"parent": plan["name"]},
			fields=["meet_doctype", "meet_name", "actual_start_time"],
			order_by="actual_start_time asc",
		)
		points = []
		for s in stops:
			if not s.get("meet_doctype") or not s.get("meet_name"):
				continue
			geo = frappe.db.get_value(s["meet_doctype"], s["meet_name"], "logged_geo_location")
			p = parse_geo(geo)
			if p:
				points.append(p)
		actual_m = 0.0
		for a, b in zip(points, points[1:]):
			actual_m += haversine_meters(a, b)
		planned_m = float(plan.get("summary_planned_distance_m") or 0)
		divergence_pct = (
			round(((actual_m - planned_m) / planned_m) * 100, 1) if planned_m else 0
		)
		flagged = abs(divergence_pct) >= threshold_pct
		out.append({
			"plan_date": plan["plan_date"],
			"assigned_to": plan["assigned_to"],
			"plan_name": plan["name"],
			"completed": plan.get("summary_completed_count") or 0,
			"planned_km": round(planned_m / 1000.0, 2),
			"actual_km": round(actual_m / 1000.0, 2),
			"divergence_pct": divergence_pct,
			"flagged": "🚩" if flagged else "",
		})

	out.sort(key=lambda r: (-abs(r["divergence_pct"]), r["plan_date"]))

	columns = [
		{"fieldname": "plan_date", "label": "Date", "fieldtype": "Date", "width": 100},
		{"fieldname": "assigned_to", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 220},
		{"fieldname": "plan_name", "label": "Day Plan", "fieldtype": "Link", "options": "Day Plan", "width": 200},
		{"fieldname": "completed", "label": "Done", "fieldtype": "Int", "width": 70},
		{"fieldname": "planned_km", "label": "Planned km", "fieldtype": "Float", "precision": 2, "width": 110},
		{"fieldname": "actual_km", "label": "Actual km", "fieldtype": "Float", "precision": 2, "width": 110},
		{"fieldname": "divergence_pct", "label": "Divergence %", "fieldtype": "Percent", "width": 120},
		{"fieldname": "flagged", "label": "", "fieldtype": "Data", "width": 50},
	]
	return columns, out
