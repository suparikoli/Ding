# Copyright (c) 2024, manoj and contributors
# For license information, please see license.txt
"""Cleanup hooks for `bench --site <s> uninstall-app ding`.

Wired via hooks.py::before_uninstall.

We deliberately do NOT delete the field_sales DocType records (Day Plan, Meet,
etc.) — Frappe's uninstall handles those automatically when the module is
removed. This file only cleans up the things Frappe doesn't auto-remove:

  - Custom Fields the app added to standard doctypes (Lead/Customer/Contact
    geolocations).
  - The two roles we created (Field Agent, Field Operations Manager) — only
    if they no longer have any users assigned. Otherwise we leave them alone
    so admins don't lose role assignments.
  - The migration snapshot file from Phase 2.
"""

import os

import frappe


def before_uninstall():
	_remove_custom_fields()
	_remove_roles_if_empty()
	_remove_migration_snapshot()


def _remove_custom_fields():
	custom_fields = [
		{"dt": "Customer", "fieldname": "customer_geolocation"},
		{"dt": "Lead", "fieldname": "lead_geolocation"},
		{"dt": "Contact", "fieldname": "contact_geolocation"},
	]
	for field_data in custom_fields:
		try:
			cf_name = frappe.db.get_value(
				"Custom Field",
				{"dt": field_data["dt"], "fieldname": field_data["fieldname"]},
				"name",
			)
			if cf_name:
				frappe.delete_doc("Custom Field", cf_name, force=True, ignore_permissions=True)
		except Exception as exc:
			frappe.log_error(
				f"Error removing custom field {field_data['fieldname']} "
				f"from {field_data['dt']}: {exc}"
			)


def _remove_roles_if_empty():
	for role_name in ("Field Agent", "Field Operations Manager"):
		if not frappe.db.exists("Role", role_name):
			continue
		# Has users? Skip.
		assigned = frappe.db.count("Has Role", {"role": role_name})
		if assigned:
			continue
		try:
			frappe.delete_doc("Role", role_name, force=True, ignore_permissions=True)
		except Exception as exc:
			frappe.log_error(f"Error removing role {role_name}: {exc}")


def _remove_migration_snapshot():
	try:
		path = os.path.join(
			frappe.get_site_path("private", "files"),
			"ding_v1_1_snapshot.json",
		)
		if os.path.exists(path):
			os.remove(path)
	except Exception:
		pass
