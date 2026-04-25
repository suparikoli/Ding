# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt

import frappe

FIELD_AGENT_ROLE = "Field Agent"
FIELD_OPERATIONS_MANAGER_ROLE = "Field Operations Manager"


def _is_unrestricted(user: str) -> bool:
	roles = frappe.get_roles(user)
	return (
		"Administrator" in roles
		or "System Manager" in roles
		or FIELD_OPERATIONS_MANAGER_ROLE in roles
	)


def _own_creator_filter(user: str) -> str:
	if _is_unrestricted(user):
		return ""
	return f"`tabLead Meet`.`creator` = {frappe.db.escape(user)}"


def meet_query(user: str | None = None, doctype: str | None = None) -> str:
	user = user or frappe.session.user
	if _is_unrestricted(user):
		return ""
	table = f"`tab{doctype}`" if doctype else "`tabLead Meet`"
	return f"{table}.`creator` = {frappe.db.escape(user)}"


def meet_has_permission(doc, user: str | None = None, permission_type: str | None = None) -> bool:
	user = user or frappe.session.user
	if _is_unrestricted(user):
		return True
	return getattr(doc, "creator", None) == user


def route_planning_query(user: str | None = None, doctype: str | None = None) -> str:
	user = user or frappe.session.user
	if _is_unrestricted(user):
		return ""
	table = f"`tab{doctype}`" if doctype else "`tabField Visit Route Planning`"
	return f"{table}.`sales_representative` = {frappe.db.escape(user)}"


def day_plan_query(user: str | None = None, doctype: str | None = None) -> str:
	user = user or frappe.session.user
	if _is_unrestricted(user):
		return ""
	table = f"`tab{doctype}`" if doctype else "`tabDay Plan`"
	return f"{table}.`assigned_to` = {frappe.db.escape(user)}"


def heartbeat_query(user: str | None = None, doctype: str | None = None) -> str:
	user = user or frappe.session.user
	if _is_unrestricted(user):
		return ""
	table = f"`tab{doctype}`" if doctype else "`tabField Rep Heartbeat`"
	return f"{table}.`rep` = {frappe.db.escape(user)}"


def guard_concurrent_meet(doc, method: str | None = None) -> None:
	"""Block a user from having two open Meets at once.

	"Open" here means the Meet has a check_in_time but no check_out_time.
	Phase 4 replaces this with a `status` Select; for now we use the time fields.
	"""
	user = doc.creator or frappe.session.user
	if not user or user == "Administrator":
		return
	if not getattr(doc, "check_in_time", None):
		return
	if getattr(doc, "check_out_time", None):
		return
	for meet_doctype in ("Lead Meet", "Customer Meet", "Contact Meet"):
		filters = {
			"creator": user,
			"check_in_time": ["is", "set"],
			"check_out_time": ["is", "not set"],
		}
		if doc.doctype == meet_doctype and not doc.is_new():
			filters["name"] = ["!=", doc.name]
		conflict = frappe.db.get_value(meet_doctype, filters, "name")
		if conflict:
			frappe.throw(
				f"You already have an open {meet_doctype} ({conflict}). "
				"Close it before starting another."
			)
