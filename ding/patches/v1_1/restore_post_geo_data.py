# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Post-sync restore for Phase 2 fieldtype migration.

Reads the pre-sync snapshot, converts each captured value to the new fieldtype
representation, and writes back via `frappe.db.set_value`. Idempotent — safe to
re-run; if the snapshot file is missing, exits silently.
"""

import json
import os
from datetime import datetime, time as time_cls

import frappe

SNAPSHOT_FILE = "ding_v1_1_snapshot.json"

MEET_SCHEMA = {
	"Lead Meet": "lead_location",
	"Customer Meet": "customer_location",
	"Contact Meet": "contact_location",
}

PARENT_GEO_CUSTOM_FIELDS = (
	("Lead", "lead_geolocation"),
	("Customer", "customer_geolocation"),
	("Contact", "contact_geolocation"),
)


def execute():
	path = _snapshot_path()
	if not os.path.exists(path):
		frappe.logger().info("ding v1_1 snapshot not found — nothing to restore.")
		return

	with open(path) as f:
		snapshot = json.load(f)

	_promote_parent_custom_fields()
	_restore_meets(snapshot.get("meets") or {})
	_restore_parent_geos(snapshot.get("parent_geos") or {})
	_restore_call_log_durations(snapshot.get("call_log_durations") or [])

	frappe.db.commit()
	frappe.logger().info("ding v1_1 restore complete.")


def _promote_parent_custom_fields():
	"""Flip the Lead/Customer/Contact *_geolocation Custom Fields to Geolocation.

	Frappe blocks `fieldtype` mutations on Custom Field via `.save()`, so we
	delete the Data-typed record, alter the underlying column from VARCHAR to
	LONGTEXT, and recreate the Custom Field as Geolocation. Existing string
	values in the column are preserved through the ALTER (LONGTEXT can hold
	what the VARCHAR did) and converted to GeoJSON later in
	`_restore_parent_geos`.
	"""
	for parent_doctype, geo_field in PARENT_GEO_CUSTOM_FIELDS:
		cf_name = frappe.db.get_value(
			"Custom Field",
			{"dt": parent_doctype, "fieldname": geo_field},
			"name",
		)
		current_fieldtype = (
			frappe.db.get_value("Custom Field", cf_name, "fieldtype") if cf_name else None
		)
		if current_fieldtype == "Geolocation":
			continue

		# Capture metadata before deletion.
		cf_meta = None
		if cf_name:
			cf_meta = frappe.db.get_value(
				"Custom Field",
				cf_name,
				["label", "insert_after", "module", "description"],
				as_dict=True,
			)
			# Bypass DocType validation by deleting via DB directly so the field
			# definition stays out of Frappe's "fieldtype cannot change" check.
			frappe.db.sql("DELETE FROM `tabCustom Field` WHERE name=%s", (cf_name,))
			frappe.db.commit()
			frappe.clear_cache(doctype=parent_doctype)

		# Convert the column type so Frappe's CustomField.insert() doesn't try
		# to widen it itself (which can fail under strict mode).
		try:
			frappe.db.sql(
				f"ALTER TABLE `tab{parent_doctype}` MODIFY `{geo_field}` LONGTEXT NULL"
			)
		except Exception as exc:
			frappe.logger().warning(
				f"ding v1_1 ALTER {parent_doctype}.{geo_field} skipped: {exc}"
			)

		new_cf = frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": parent_doctype,
				"fieldname": geo_field,
				"fieldtype": "Geolocation",
				"label": (cf_meta or {}).get("label") or geo_field.replace("_", " ").title(),
				"insert_after": (cf_meta or {}).get("insert_after") or "address_html",
				"module": (cf_meta or {}).get("module") or "ding",
				"description": (cf_meta or {}).get("description"),
			}
		)
		new_cf.insert(ignore_permissions=True)
		frappe.clear_cache(doctype=parent_doctype)


def _restore_meets(meets):
	for meet_doctype, parent_field in MEET_SCHEMA.items():
		if not frappe.db.table_exists(meet_doctype):
			continue
		for row in meets.get(meet_doctype, []):
			updates = {}
			creation = row.get("creation")

			geo = _to_geojson(row.get("logged_geo_location"))
			if geo is not None:
				updates["logged_geo_location"] = geo

			parent_geo = _to_geojson(row.get("parent_location"))
			if parent_geo is not None:
				updates[parent_field] = parent_geo

			ci = _to_datetime(row.get("check_in_time"), creation)
			if ci is not None:
				updates["check_in_time"] = ci

			co = _to_datetime(row.get("check_out_time"), creation)
			if co is not None:
				updates["check_out_time"] = co

			dur = _to_int(row.get("duration"))
			if dur is not None:
				updates["duration"] = dur

			dist = _to_float(row.get("distance"))
			if dist is not None:
				updates["distance"] = dist

			if updates:
				try:
					frappe.db.set_value(
						meet_doctype, row["name"], updates, update_modified=False
					)
				except Exception as exc:
					frappe.logger().warning(
						f"ding v1_1 restore: skipped {meet_doctype} {row['name']}: {exc}"
					)


def _restore_parent_geos(parent_geos):
	for parent_doctype, payload in parent_geos.items():
		if not frappe.db.table_exists(parent_doctype):
			continue
		field = payload.get("field")
		for row in payload.get("rows", []):
			geo = _to_geojson(row.get("geo"))
			if geo is not None and geo != row.get("geo"):
				try:
					frappe.db.set_value(
						parent_doctype, row["name"], field, geo, update_modified=False
					)
				except Exception as exc:
					frappe.logger().warning(
						f"ding v1_1 restore: skipped {parent_doctype} {row['name']}: {exc}"
					)


def _restore_call_log_durations(rows):
	if not frappe.db.table_exists("Ding Call Logs"):
		return
	for row in rows:
		dur = _to_int(row.get("duration"))
		if dur is None:
			continue
		try:
			frappe.db.set_value(
				"Ding Call Logs", row["name"], "duration", dur, update_modified=False
			)
		except Exception as exc:
			frappe.logger().warning(
				f"ding v1_1 restore: skipped Call Log {row['name']}: {exc}"
			)


def _to_geojson(value):
	"""'lat,lng' → GeoJSON string. Already-GeoJSON values pass through."""
	if not value:
		return None
	s = str(value).strip()
	if not s:
		return None
	if s.startswith("{"):
		return s  # already GeoJSON
	if "," not in s:
		return None
	try:
		lat_str, lng_str = (p.strip() for p in s.split(",", 1))
		lat, lng = float(lat_str), float(lng_str)
	except (ValueError, AttributeError):
		return None
	return json.dumps(
		{
			"type": "FeatureCollection",
			"features": [
				{
					"type": "Feature",
					"properties": {},
					"geometry": {"type": "Point", "coordinates": [lng, lat]},
				}
			],
		}
	)


def _to_datetime(value, creation_str):
	"""Combine a stored time string with the doc's creation date.

	If the value already looks like a full datetime ("YYYY-MM-DD HH:MM:SS"),
	return it as-is.
	"""
	if not value:
		return None
	s = str(value).strip()
	if not s:
		return None
	if " " in s and "-" in s:  # already a datetime string
		return s
	# Bare time "HH:MM:SS" or "HH:MM"
	parts = s.split(":")
	try:
		h = int(parts[0])
		m = int(parts[1]) if len(parts) > 1 else 0
		sec = int(parts[2]) if len(parts) > 2 else 0
	except (ValueError, IndexError):
		return None
	if creation_str:
		try:
			creation = datetime.fromisoformat(str(creation_str).split(".")[0])
		except ValueError:
			creation = datetime.now()
	else:
		creation = datetime.now()
	combined = datetime.combine(creation.date(), time_cls(h, m, sec))
	return combined.strftime("%Y-%m-%d %H:%M:%S")


def _to_int(value):
	if value in (None, "", b""):
		return None
	try:
		return int(float(value))
	except (ValueError, TypeError):
		return None


def _to_float(value):
	if value in (None, "", b""):
		return None
	try:
		return float(value)
	except (ValueError, TypeError):
		return None


def _snapshot_path():
	return os.path.join(frappe.get_site_path("private", "files"), SNAPSHOT_FILE)
