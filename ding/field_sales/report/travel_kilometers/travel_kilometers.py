# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Per-agent travel kilometers per day.

When heartbeats are present (Phase 7.4), uses consecutive heartbeat distance
for actual road-ish length. Falls back to the Day Plan's planned Haversine
distance when heartbeats are missing.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe.utils import add_days, today

from ding.field_sales.utils import haversine_meters, parse_geo


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -7)
	to_date = filters.get("to_date") or today()

	plans = frappe.db.sql(
		"""
		SELECT name, plan_date, assigned_to, summary_planned_distance_m
		FROM `tabDay Plan`
		WHERE plan_date BETWEEN %(from)s AND %(to)s
		""",
		{"from": from_date, "to": to_date},
		as_dict=True,
	)
	if filters.get("agent"):
		plans = [p for p in plans if p["assigned_to"] == filters["agent"]]

	# Heartbeats grouped (rep, date) → ordered list of points.
	hb_rows = frappe.db.sql(
		"""
		SELECT rep, DATE(timestamp) AS d, timestamp, geolocation
		FROM `tabField Rep Heartbeat`
		WHERE DATE(timestamp) BETWEEN %(from)s AND %(to)s
		ORDER BY rep, timestamp
		""",
		{"from": from_date, "to": to_date},
		as_dict=True,
	)
	hb_path: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
	for r in hb_rows:
		p = parse_geo(r.get("geolocation"))
		if p:
			hb_path[(r["rep"], str(r["d"]))].append(p)

	out = []
	for plan in plans:
		key = (plan["assigned_to"], str(plan["plan_date"]))
		actual_m = _path_meters(hb_path.get(key, []))
		planned_m = float(plan.get("summary_planned_distance_m") or 0)
		out.append({
			"plan_date": plan["plan_date"],
			"assigned_to": plan["assigned_to"],
			"plan_name": plan["name"],
			"planned_km": round(planned_m / 1000.0, 2),
			"actual_km": round(actual_m / 1000.0, 2),
			"source": "Heartbeat" if actual_m > 0 else "Planned only",
		})

	out.sort(key=lambda r: (r["plan_date"], r["assigned_to"]), reverse=True)

	columns = [
		{"fieldname": "plan_date", "label": "Date", "fieldtype": "Date", "width": 100},
		{"fieldname": "assigned_to", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 220},
		{"fieldname": "plan_name", "label": "Day Plan", "fieldtype": "Link", "options": "Day Plan", "width": 200},
		{"fieldname": "planned_km", "label": "Planned km", "fieldtype": "Float", "precision": 2, "width": 110},
		{"fieldname": "actual_km", "label": "Actual km", "fieldtype": "Float", "precision": 2, "width": 110},
		{"fieldname": "source", "label": "Source", "fieldtype": "Data", "width": 130},
	]
	return columns, out


def _path_meters(points):
	if len(points) < 2:
		return 0.0
	total = 0.0
	for a, b in zip(points, points[1:]):
		total += haversine_meters(a, b)
	return total
