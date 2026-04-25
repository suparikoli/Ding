# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import frappe


def execute():
	for role_name in ("Field Agent", "Field Operations Manager"):
		if frappe.db.exists("Role", role_name):
			continue
		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": role_name,
				"desk_access": 1,
			}
		).insert(ignore_permissions=True)
