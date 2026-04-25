# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Pre-sync snapshot for Phase 2 fieldtype migration.

Captures the existing Data-typed values for the Meet + Call Log fields that are
about to change to Geolocation/Datetime/Duration/Float, and NULLs out the
Datetime-bound columns so the upcoming `ALTER TABLE` doesn't choke on
un-castable strings. Restored by `restore_post_geo_data.py` after schema sync.
"""

import json
import os

import frappe

SNAPSHOT_FILE = "ding_v1_1_snapshot.json"

MEET_SCHEMA = {
	"Lead Meet": {
		"parent_location_field": "lead_location",
		"parent_doctype": "Lead",
		"parent_geo_field": "lead_geolocation",
		"parent_link_field": "lead",
	},
	"Customer Meet": {
		"parent_location_field": "customer_location",
		"parent_doctype": "Customer",
		"parent_geo_field": "customer_geolocation",
		"parent_link_field": "customer",
	},
	"Contact Meet": {
		"parent_location_field": "contact_location",
		"parent_doctype": "Contact",
		"parent_geo_field": "contact_geolocation",
		"parent_link_field": "contact",
	},
}


def execute():
	snapshot = {"meets": {}, "parent_geos": {}, "call_log_durations": []}

	for meet_doctype, schema in MEET_SCHEMA.items():
		if not frappe.db.table_exists(meet_doctype):
			continue
		parent_field = schema["parent_location_field"]
		rows = frappe.db.sql(
			f"""
			SELECT name, creation, logged_geo_location, `{parent_field}` AS parent_location,
			       check_in_time, check_out_time, duration, distance
			FROM `tab{meet_doctype}`
			""",
			as_dict=True,
		)
		snapshot["meets"][meet_doctype] = [_serialize_row(r) for r in rows]

		# Defuse Datetime ALTER: only NULL columns whose strings won't parse as DATETIME.
		# Frappe stored these as "HH:MM:SS"; MySQL can't cast that to DATETIME.
		frappe.db.sql(
			f"UPDATE `tab{meet_doctype}` SET check_in_time = NULL "
			f"WHERE check_in_time IS NOT NULL AND check_in_time NOT LIKE '____-__-__ %'"
		)
		frappe.db.sql(
			f"UPDATE `tab{meet_doctype}` SET check_out_time = NULL "
			f"WHERE check_out_time IS NOT NULL AND check_out_time NOT LIKE '____-__-__ %'"
		)

	# Capture Lead/Customer/Contact custom-field geolocations in case the values
	# look like "lat,lng" today. Geolocation is LongText-backed so the column
	# itself doesn't need defusing.
	for parent_doctype, geo_field in (
		("Lead", "lead_geolocation"),
		("Customer", "customer_geolocation"),
		("Contact", "contact_geolocation"),
	):
		if not frappe.db.has_column(parent_doctype, geo_field):
			continue
		rows = frappe.db.sql(
			f"SELECT name, `{geo_field}` AS geo FROM `tab{parent_doctype}` "
			f"WHERE `{geo_field}` IS NOT NULL AND `{geo_field}` != ''",
			as_dict=True,
		)
		snapshot["parent_geos"][parent_doctype] = {"field": geo_field, "rows": rows}

	if frappe.db.table_exists("Ding Call Logs"):
		snapshot["call_log_durations"] = frappe.db.sql(
			"SELECT name, duration FROM `tabDing Call Logs` "
			"WHERE duration IS NOT NULL AND duration != ''",
			as_dict=True,
		)

	path = _snapshot_path()
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w") as f:
		json.dump(snapshot, f, default=str, indent=2)

	frappe.db.commit()
	frappe.logger().info(f"ding v1_1 snapshot written: {path}")


def _serialize_row(row):
	out = {}
	for k, v in row.items():
		out[k] = str(v) if v is not None else None
	return out


def _snapshot_path():
	return os.path.join(frappe.get_site_path("private", "files"), SNAPSHOT_FILE)
