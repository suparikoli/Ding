# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from ding.field_sales.utils import haversine_meters, parse_geo


class DayPlan(Document):
	def validate(self):
		self._normalize_sequence()
		self._recompute_summaries()

	def before_submit(self):
		open_stops = [s for s in (self.stops or []) if s.status in ("Pending", "In Progress")]
		if open_stops and "Field Operations Manager" not in frappe.get_roles():
			frappe.throw(
				f"{len(open_stops)} stops are still open. Close them or ask a manager to force-close."
			)

	def on_submit(self):
		self.db_set("status", "Completed", update_modified=False)

	def on_cancel(self):
		self.db_set("status", "Cancelled", update_modified=False)

	def _normalize_sequence(self):
		stops = sorted(self.stops or [], key=lambda s: (s.sequence or 0, s.idx or 0))
		for i, stop in enumerate(stops, start=1):
			stop.sequence = i
		self.stops = stops

	def _recompute_summaries(self):
		stops = self.stops or []
		self.summary_planned_count = len(stops)
		self.summary_completed_count = sum(1 for s in stops if s.status == "Done")
		self.summary_skipped_count = sum(1 for s in stops if s.status == "Skipped")
		self.summary_no_show_count = sum(1 for s in stops if s.status == "No Show")
		self.summary_planned_minutes = sum(int(s.planned_duration or 0) for s in stops)
		self.summary_actual_minutes = sum(int(s.actual_duration or 0) for s in stops)
		self.adherence_pct = (
			(self.summary_completed_count / self.summary_planned_count) * 100
			if self.summary_planned_count
			else 0
		)
		self.summary_planned_distance_m = self._planned_distance()

		if self.docstatus == 0:
			if self.summary_completed_count == self.summary_planned_count and stops:
				self.status = "Completed"
			elif any(s.status in ("In Progress", "Done", "Skipped", "No Show") for s in stops):
				self.status = "In Progress"

	def _planned_distance(self):
		points = []
		start = parse_geo(self.start_geolocation)
		if start:
			points.append(start)
		for stop in self.stops or []:
			p = parse_geo(stop.client_geolocation)
			if p:
				points.append(p)
		total = 0.0
		for a, b in zip(points, points[1:]):
			total += haversine_meters(a, b)
		return round(total, 1)


@frappe.whitelist()
def optimize_day_plan(plan_name: str) -> dict:
	"""Reorder a Day Plan's stops along an optimized route.

	Returns the new sequence as `[(row_name, new_sequence), ...]`.
	"""
	from ding.field_sales.maps import optimize_route

	plan = frappe.get_doc("Day Plan", plan_name)
	plan.check_permission("write")

	start = parse_geo(plan.start_geolocation)
	stops = []
	stops_meta = []
	for stop in plan.stops or []:
		p = parse_geo(stop.client_geolocation)
		if not p:
			continue
		stops.append(p)
		stops_meta.append(stop)

	if len(stops) < 2:
		return {"changed": False, "reason": "fewer than 2 geolocated stops"}

	order = optimize_route(start, stops)
	if not order:
		return {"changed": False, "reason": "optimizer returned no order"}

	# Apply the new sequence; keep non-geolocated stops at the end in original order.
	geolocated_names = {s.name for s in stops_meta}
	new_seq = 1
	updates = []
	for idx in order:
		stop = stops_meta[idx]
		stop.sequence = new_seq
		updates.append((stop.name, new_seq))
		new_seq += 1
	for stop in plan.stops or []:
		if stop.name not in geolocated_names:
			stop.sequence = new_seq
			updates.append((stop.name, new_seq))
			new_seq += 1

	plan.save(ignore_permissions=False)
	return {"changed": True, "updates": updates, "planned_distance_m": plan.summary_planned_distance_m}


@frappe.whitelist()
def directions_url_for_plan(plan_name: str) -> str:
	"""Build a directions deep-link in the configured provider format."""
	from ding.field_sales.maps import directions_url

	plan = frappe.get_doc("Day Plan", plan_name)
	plan.check_permission("read")

	start = parse_geo(plan.start_geolocation) or (0.0, 0.0)
	points = []
	for stop in sorted(plan.stops or [], key=lambda s: s.sequence or 0):
		p = parse_geo(stop.client_geolocation)
		if p:
			points.append(p)
	if not points:
		frappe.throw("No geolocated stops to route.")
	destination = points[-1]
	waypoints = points[:-1]
	return directions_url(start, destination, waypoints)
