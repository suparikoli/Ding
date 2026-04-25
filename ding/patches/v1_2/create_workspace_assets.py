# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Create Field Sales Number Cards and Dashboard Charts on migrate.

Idempotent — re-running this patch is safe; existing docs are skipped.
"""

import json

import frappe


NUMBER_CARDS = [
	{
		"name": "Field Sales — Today's Planned Visits",
		"label": "Field Sales — Today's Planned Visits",
		"document_type": "Visit Stop",
		"parent_document_type": "Day Plan",
		"function": "Count",
		"is_public": 1,
		"color": "#3b82f6",
		"filters_json": json.dumps([
			["Day Plan", "plan_date", "=", "Today", False],
		]),
	},
	{
		"name": "Field Sales — Today's Completed Visits",
		"label": "Field Sales — Today's Completed Visits",
		"document_type": "Visit Stop",
		"parent_document_type": "Day Plan",
		"function": "Count",
		"is_public": 1,
		"color": "#10b981",
		"filters_json": json.dumps([
			["Visit Stop", "status", "=", "Done", False],
			["Day Plan", "plan_date", "=", "Today", False],
		]),
	},
	{
		"name": "Field Sales — Active Agents",
		"label": "Field Sales — Active Agents",
		"document_type": "Field Rep Heartbeat",
		"function": "Count",
		"aggregate_function_based_on": "rep",
		"is_public": 1,
		"color": "#f59e0b",
		"filters_json": json.dumps([
			["Field Rep Heartbeat", "timestamp", ">", "Now - 30 minutes", False],
		]),
	},
	{
		"name": "Field Sales — Open Day Plans",
		"label": "Field Sales — Open Day Plans",
		"document_type": "Day Plan",
		"function": "Count",
		"is_public": 1,
		"color": "#6366f1",
		"filters_json": json.dumps([
			["Day Plan", "plan_date", "=", "Today", False],
			["Day Plan", "status", "in", ["Released", "In Progress"], False],
		]),
	},
	{
		"name": "Field Sales — Off-target Visits (7d)",
		"label": "Field Sales — Off-target Visits (7d)",
		"document_type": "Customer Meet",
		"function": "Count",
		"is_public": 1,
		"color": "#ef4444",
		"filters_json": json.dumps([
			["Customer Meet", "off_target", "=", 1, False],
			["Customer Meet", "check_in_time", ">", "Now - 7 days", False],
		]),
	},
]


DASHBOARD_CHARTS = [
	{
		"name": "Field Sales — Visits per Day",
		"chart_name": "Field Sales — Visits per Day",
		"chart_type": "Count",
		"document_type": "Customer Meet",
		"based_on": "check_in_time",
		"timespan": "Last Month",
		"time_interval": "Daily",
		"type": "Line",
		"is_public": 1,
		"timeseries": 1,
	},
	{
		"name": "Field Sales — Adherence (30d)",
		"chart_name": "Field Sales — Adherence (30d)",
		"chart_type": "Sum",
		"document_type": "Day Plan",
		"based_on": "plan_date",
		"value_based_on": "adherence_pct",
		"timespan": "Last Month",
		"time_interval": "Daily",
		"type": "Bar",
		"is_public": 1,
		"timeseries": 1,
	},
	{
		"name": "Field Sales — Visits by Type (30d)",
		"chart_name": "Field Sales — Visits by Type (30d)",
		"chart_type": "Group By",
		"document_type": "Customer Meet",
		"group_by_based_on": "visit_type",
		"group_by_type": "Count",
		"number_of_groups": 7,
		"is_public": 1,
		"filters_json": json.dumps([
			["Customer Meet", "check_in_time", ">", "Now - 30 days", False],
		]),
	},
]


def execute():
	for spec in NUMBER_CARDS:
		_upsert("Number Card", spec)
	for spec in DASHBOARD_CHARTS:
		_upsert("Dashboard Chart", spec)
	_attach_to_workspace()
	frappe.db.commit()
	frappe.logger().info("ding workspace assets created.")


def _upsert(doctype, spec):
	name = spec["name"]
	if frappe.db.exists(doctype, name):
		return
	payload = {"doctype": doctype, **spec, "module": "Field Sales"}
	if doctype == "Number Card":
		payload.setdefault("type", "Document Type")
	if doctype == "Dashboard Chart":
		payload.setdefault("filters_json", "[]")
		payload.setdefault("dynamic_filters_json", "[]")
	doc = frappe.get_doc(payload)
	doc.insert(ignore_permissions=True)


def _attach_to_workspace():
	if not frappe.db.exists("Workspace", "Field Sales"):
		return
	# Clean up legacy URL-typed shortcuts whose `link_to` doctype doesn't
	# exist (older versions of this patch shipped a "Mobile App (PWA)"
	# shortcut with type='URL' that fails Frappe's link validator).
	frappe.db.sql(
		"DELETE FROM `tabWorkspace Shortcut` WHERE parent = 'Field Sales' AND type = 'URL'"
	)
	# Wipe stale number-card and chart references — earlier failed runs may
	# have left rows pointing at cards/charts that never got created.
	frappe.db.sql(
		"DELETE FROM `tabNumber Card Link` WHERE parenttype = 'Workspace' AND parent = 'Field Sales'"
	)
	frappe.db.sql(
		"DELETE FROM `tabWorkspace Chart` WHERE parent = 'Field Sales'"
	)
	frappe.db.commit()

	ws = frappe.get_doc("Workspace", "Field Sales")
	if not ws.type:
		ws.type = "Workspace"
	for spec in NUMBER_CARDS:
		if frappe.db.exists("Number Card", spec["name"]):
			ws.append("number_cards", {"number_card_name": spec["name"]})
	for spec in DASHBOARD_CHARTS:
		if frappe.db.exists("Dashboard Chart", spec["name"]):
			ws.append("charts", {"chart_name": spec["name"], "label": spec["chart_name"]})
	ws.save(ignore_permissions=True)
