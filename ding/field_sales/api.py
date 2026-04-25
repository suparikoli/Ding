# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Whitelisted endpoints used by the My Field Day page, Manager Map page, and the PWA.

All endpoints respect the same RBAC as the desk: Field Agents see only their
own data; Field Operations Managers see the team. Server-side authoritative —
never trust the client to claim a different user.
"""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime, today

from ding.field_sales.utils import haversine_meters, parse_geo, to_geojson_point


MEET_DOCTYPE_FOR_CLIENT = {
	"Lead": "Lead Meet",
	"Customer": "Customer Meet",
	"Contact": "Contact Meet",
}


# ---------------------------------------------------------------------------
# Day plan / agent endpoints
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_today_plan(date: str | None = None, user: str | None = None) -> dict:
	"""Return the calling agent's plan for `date` (defaults to today).

	Managers may pass `user` to fetch another agent's plan.
	"""
	user = _resolve_user(user)
	plan_date = date or today()
	plan_name = frappe.db.get_value(
		"Day Plan", {"assigned_to": user, "plan_date": plan_date}, "name"
	)
	if not plan_name:
		return {"plan": None}
	plan = frappe.get_doc("Day Plan", plan_name)
	plan.check_permission("read")
	return {"plan": plan.as_dict()}


@frappe.whitelist()
def stop_action(plan_name: str, stop_row: str, action: str, payload: str = "") -> dict:
	"""`action` ∈ {start, end, skip}. `payload` carries the skip reason."""
	plan = frappe.get_doc("Day Plan", plan_name)
	plan.check_permission("write")

	stop = next((s for s in plan.stops if s.name == stop_row), None)
	if not stop:
		frappe.throw(f"Stop row {stop_row} not found on {plan_name}.")

	if action == "start":
		_start_stop(plan, stop)
	elif action == "end":
		_end_stop(plan, stop)
	elif action == "skip":
		stop.status = "Skipped"
		stop.skip_reason = payload or "Not specified"
	else:
		frappe.throw(f"Unknown action: {action}")

	plan.save(ignore_permissions=False)
	return {"plan_name": plan.name, "stop_row": stop.name, "stop_status": stop.status}


def _start_stop(plan, stop) -> None:
	if stop.status not in ("Pending", "In Progress"):
		frappe.throw(f"Stop is already {stop.status}.")
	meet_doctype = MEET_DOCTYPE_FOR_CLIENT.get(stop.client_doctype)
	if not meet_doctype:
		frappe.throw(f"No Meet doctype for client type {stop.client_doctype}.")

	# Reuse existing Meet if one is already linked
	if stop.meet_name and frappe.db.exists(meet_doctype, stop.meet_name):
		meet = frappe.get_doc(meet_doctype, stop.meet_name)
	else:
		meet = frappe.new_doc(meet_doctype)
		client_field = stop.client_doctype.lower()
		setattr(meet, client_field, stop.client_name)
		meet.creator = plan.assigned_to
		meet.day_plan = plan.name
		meet.visit_stop_row = stop.name
		meet.visit_type = stop.visit_type
		meet.objective = stop.objective
		if stop.linked_doctype:
			meet.linked_doctype = stop.linked_doctype
			meet.linked_name = stop.linked_name
		meet.check_in_time = now_datetime()
		# Geolocation autofill from parent happens in the Meet's before_insert.
		meet.insert(ignore_permissions=True)

	stop.meet_doctype = meet_doctype
	stop.meet_name = meet.name
	stop.status = "In Progress"
	stop.actual_start_time = meet.check_in_time


def _end_stop(plan, stop) -> None:
	if not stop.meet_name:
		frappe.throw("This stop has no Meet to close.")
	meet = frappe.get_doc(stop.meet_doctype, stop.meet_name)
	if not meet.check_out_time:
		meet.check_out_time = now_datetime()
		meet.save(ignore_permissions=True)
	stop.status = "Done"
	stop.actual_duration = int(meet.duration or 0)


# ---------------------------------------------------------------------------
# Heartbeat & geofence
# ---------------------------------------------------------------------------

@frappe.whitelist()
def heartbeat(lat: float, lng: float, accuracy_m: float | None = None) -> dict:
	"""Append a Field Rep Heartbeat row for the calling user."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Authentication required.", frappe.PermissionError)

	geo = to_geojson_point(float(lat), float(lng))
	point = (float(lat), float(lng))

	geofence = _check_geofence(user, point)
	doc = frappe.get_doc(
		{
			"doctype": "Field Rep Heartbeat",
			"rep": user,
			"timestamp": now_datetime(),
			"geolocation": geo,
			"accuracy_m": float(accuracy_m) if accuracy_m is not None else None,
			"inside_geofence_doctype": geofence[0] if geofence else None,
			"inside_geofence_name": geofence[1] if geofence else None,
		}
	)
	doc.insert(ignore_permissions=True)
	return {
		"name": doc.name,
		"timestamp": str(doc.timestamp),
		"inside_geofence": geofence,
	}


def _check_geofence(user: str, point: tuple[float, float]):
	"""Find a Pending stop in today's plan whose geolocation is within the
	configured radius of `point`. Returns (client_doctype, client_name) or None.
	"""
	settings = _settings()
	radius = float(getattr(settings, "geofence_radius_m", 0) or 100)

	plan_name = frappe.db.get_value(
		"Day Plan", {"assigned_to": user, "plan_date": today()}, "name"
	)
	if not plan_name:
		return None
	stops = frappe.get_all(
		"Visit Stop",
		filters={"parent": plan_name, "status": "Pending"},
		fields=["client_doctype", "client_name", "client_geolocation"],
	)
	for stop in stops:
		target = parse_geo(stop.get("client_geolocation"))
		if not target:
			continue
		if haversine_meters(target, point) <= radius:
			return stop["client_doctype"], stop["client_name"]
	return None


# ---------------------------------------------------------------------------
# Manager-facing endpoints
# ---------------------------------------------------------------------------

@frappe.whitelist()
def team_live_positions(within_minutes: int = 30) -> list[dict]:
	"""Latest heartbeat per agent in the last N minutes. Manager-only."""
	if not _is_manager():
		frappe.throw("Only managers can see team positions.", frappe.PermissionError)

	rows = frappe.db.sql(
		"""
		SELECT h.rep, h.timestamp, h.geolocation, h.accuracy_m,
		       h.inside_geofence_doctype, h.inside_geofence_name
		FROM `tabField Rep Heartbeat` h
		INNER JOIN (
			SELECT rep, MAX(timestamp) AS latest
			FROM `tabField Rep Heartbeat`
			WHERE timestamp >= DATE_SUB(NOW(), INTERVAL %(mins)s MINUTE)
			GROUP BY rep
		) latest_h ON latest_h.rep = h.rep AND latest_h.latest = h.timestamp
		ORDER BY h.timestamp DESC
		""",
		{"mins": int(within_minutes)},
		as_dict=True,
	)
	return [dict(r) for r in rows]


@frappe.whitelist()
def list_geolocated_clients(
	include: str = "Lead,Customer,Contact",
	territory: str | None = None,
	search: str | None = None,
	limit: int = 500,
) -> list[dict]:
	"""Return Lead/Customer/Contact records that have a geolocation set.

	Used by the Plan-a-Day-on-Map page to populate the marker layer.
	Returns `[{type, name, label, geolocation, territory}]`.
	"""
	wanted = [t.strip() for t in (include or "").split(",") if t.strip()]
	out = []
	limit = max(1, min(int(limit or 500), 2000))

	specs = [
		("Lead",     "lead_name",       "lead_geolocation",     "territory"),
		("Customer", "customer_name",   "customer_geolocation", "territory"),
		("Contact",  "first_name",      "contact_geolocation",  None),
	]
	for client_type, label_field, geo_field, territory_field in specs:
		if client_type not in wanted:
			continue
		filters = [[client_type, geo_field, "is", "set"]]
		if territory and territory_field:
			filters.append([client_type, territory_field, "=", territory])
		if search:
			filters.append([client_type, label_field, "like", f"%{search}%"])
		fields = ["name", label_field, geo_field]
		if territory_field:
			fields.append(territory_field)
		try:
			rows = frappe.get_list(
				client_type, filters=filters, fields=fields,
				limit_page_length=limit, ignore_permissions=False,
			)
		except Exception:
			continue
		for r in rows:
			geo = r.get(geo_field)
			if not geo:
				continue
			out.append({
				"type": client_type,
				"name": r["name"],
				"label": r.get(label_field) or r["name"],
				"geolocation": geo,
				"territory": r.get(territory_field) if territory_field else None,
			})
	return out


@frappe.whitelist()
def plan_day_for_agent(
	agent: str,
	plan_date: str,
	stops: str | list,
	territory: str | None = None,
	notes: str | None = None,
	release: int | bool = 0,
) -> dict:
	"""Create (or replace) a Day Plan with the given sequenced stops.

	`stops` is a JSON string or list of dicts:
	    [{"client_doctype": "Customer", "client_name": "ACME",
	      "visit_type": "Sales", "objective": "...", "planned_duration": 1800}, ...]

	When `release=1`, the Day Plan is saved with status='Released' so the
	agent's notification fires. Otherwise saved as Draft.

	Manager-only — Field Agents can plan their own day via the Day Plan form.
	"""
	if not _is_manager() and frappe.session.user != agent:
		frappe.throw("Only managers can plan for other agents.", frappe.PermissionError)

	import json as _json
	if isinstance(stops, str):
		stops = _json.loads(stops or "[]")
	if not isinstance(stops, list):
		frappe.throw("stops must be a list of stop dicts.")

	plan_name = frappe.db.get_value(
		"Day Plan", {"assigned_to": agent, "plan_date": plan_date}, "name"
	)
	if plan_name:
		plan = frappe.get_doc("Day Plan", plan_name)
		if plan.docstatus != 0:
			frappe.throw(f"Plan {plan.name} is already submitted; amend or cancel first.")
		plan.set("stops", [])
	else:
		plan = frappe.new_doc("Day Plan")
		plan.assigned_to = agent
		plan.plan_date = plan_date
		plan.status = "Draft"

	if territory:
		plan.territory = territory
	if notes is not None:
		plan.notes = notes

	for i, s in enumerate(stops, start=1):
		plan.append("stops", {
			"sequence": int(s.get("sequence") or i),
			"client_doctype": s.get("client_doctype") or "Customer",
			"client_name": s.get("client_name"),
			"visit_type": s.get("visit_type") or "Sales",
			"objective": s.get("objective") or "",
			"planned_duration": int(s.get("planned_duration") or 1800),
			"planned_start_time": s.get("planned_start_time") or None,
			"priority": s.get("priority") or "Normal",
			"status": "Pending",
		})

	if int(release or 0):
		plan.status = "Released"

	plan.save(ignore_permissions=False)
	return {
		"plan_name": plan.name,
		"status": plan.status,
		"stop_count": len(plan.stops or []),
		"planned_distance_m": plan.summary_planned_distance_m,
	}


@frappe.whitelist()
def get_maps_config() -> dict:
	"""Return the front-end maps config — provider, API key (if any),
	directions provider. Used by the PWA, My Field Day, Manager Map, and
	the Day Plan form to bootstrap their map widgets.

	Returning the API key is intentional: Google Maps JS SDK requires a
	browser-visible key. Lock it down with HTTP-referrer + API restrictions
	in your Google Cloud project, not by hiding it.
	"""
	settings = _settings()
	provider = (settings.maps_provider if settings else None) or "OpenStreetMap"
	directions_provider = (settings.directions_provider if settings else None) or "Google Maps URL"
	api_key = ""
	if settings:
		try:
			api_key = settings.get_password("maps_api_key", raise_exception=False) or ""
		except Exception:
			api_key = ""
	return {
		"provider": provider,
		"api_key": api_key,
		"directions_provider": directions_provider,
		"has_google_key": provider == "Google" and bool(api_key),
	}


@frappe.whitelist()
def add_to_day_plan(
	client_doctype: str,
	client_name: str,
	agent: str | None = None,
	plan_date: str | None = None,
	visit_type: str = "Sales",
	objective: str = "",
) -> dict:
	"""Append a stop to (or create) a Day Plan for `agent` on `plan_date`."""
	if client_doctype not in MEET_DOCTYPE_FOR_CLIENT:
		frappe.throw(f"Unsupported client type: {client_doctype}")
	agent = _resolve_user(agent)
	plan_date = plan_date or today()

	plan_name = frappe.db.get_value(
		"Day Plan", {"assigned_to": agent, "plan_date": plan_date}, "name"
	)
	if plan_name:
		plan = frappe.get_doc("Day Plan", plan_name)
	else:
		plan = frappe.new_doc("Day Plan")
		plan.assigned_to = agent
		plan.plan_date = plan_date
		plan.status = "Draft"

	plan.check_permission("write")

	# Skip if the client is already on the plan.
	for stop in plan.stops or []:
		if stop.client_doctype == client_doctype and stop.client_name == client_name:
			return {"plan_name": plan.name, "stop_row": stop.name, "added": False}

	default_duration = 1800
	settings = _settings()
	if settings and settings.default_visit_duration:
		default_duration = int(settings.default_visit_duration)

	row = plan.append(
		"stops",
		{
			"sequence": (max([(s.sequence or 0) for s in plan.stops], default=0) + 1),
			"client_doctype": client_doctype,
			"client_name": client_name,
			"visit_type": visit_type,
			"objective": objective,
			"planned_duration": default_duration,
			"status": "Pending",
		},
	)
	plan.save(ignore_permissions=False)
	return {"plan_name": plan.name, "stop_row": row.name, "added": True}


@frappe.whitelist()
def team_today_plans() -> list[dict]:
	if not _is_manager():
		frappe.throw("Only managers can see team plans.", frappe.PermissionError)
	return frappe.get_all(
		"Day Plan",
		filters={"plan_date": today()},
		fields=[
			"name", "assigned_to", "plan_date", "status",
			"summary_planned_count", "summary_completed_count",
			"summary_skipped_count", "summary_no_show_count",
			"adherence_pct",
		],
		order_by="assigned_to",
	)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_user(claimed: str | None) -> str:
	caller = frappe.session.user
	if claimed and claimed != caller:
		if not _is_manager():
			frappe.throw("Cannot view another agent's plan.", frappe.PermissionError)
		return claimed
	return caller


def _is_manager() -> bool:
	roles = set(frappe.get_roles())
	return bool(
		roles & {"Field Operations Manager", "System Manager", "Administrator"}
	)


def _settings():
	try:
		return frappe.get_cached_doc("Field Sales Settings")
	except Exception:
		return None
