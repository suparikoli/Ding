# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Bump the existing Field Sales Settings to default to Google Maps.

Idempotent — only changes the row if it's still on the old default and the
admin hasn't picked something else. Existing custom selections are preserved.
"""

import frappe


def execute():
	if not frappe.db.table_exists("Field Sales Settings"):
		return
	current = frappe.db.get_single_value("Field Sales Settings", "maps_provider")
	if current and current not in ("OpenStreetMap", ""):
		return
	frappe.db.set_value(
		"Field Sales Settings", "Field Sales Settings", "maps_provider", "Google"
	)
	frappe.db.commit()
	frappe.logger().info("ding: maps_provider default → Google")
