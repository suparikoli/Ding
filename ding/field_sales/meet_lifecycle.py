# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Shared Meet validate/submit logic across Lead/Customer/Contact Meet."""

from __future__ import annotations

import frappe


NO_SHOW_THRESHOLD_SECONDS = 60


def apply_validate(meet) -> None:
	"""Run on each Meet's `validate`. Wired in via the controller."""
	_set_off_target(meet)
	_rollup_total_expense(meet)
	_advance_status(meet)


def apply_before_submit(meet) -> None:
	"""Final lifecycle decisions made when the agent submits a Meet."""
	_finalize_status_on_submit(meet)
	_validate_required_for_completion(meet)


def apply_on_submit(meet) -> None:
	"""Side-effects after the Meet is submitted: optional Stock Entry for parts."""
	_post_service_stock_entry(meet)


def _set_off_target(meet) -> None:
	threshold = _off_target_threshold()
	dist = float(meet.get("distance") or 0)
	meet.off_target = 1 if dist > threshold else 0
	if meet.off_target and not (meet.get("comment") or "").strip():
		# Don't throw at validate time — wait until submit. Just hint.
		frappe.msgprint(
			f"Check-in is {dist:.0f}m from the target (threshold {threshold:.0f}m). "
			"Please add a comment explaining why before submitting.",
			indicator="orange",
			alert=True,
		)


def _rollup_total_expense(meet) -> None:
	rows = meet.get("expenses") or []
	meet.total_expense = sum(float(r.amount or 0) for r in rows)

	# Customer Meet only — these fields don't exist on Lead/Contact Meet.
	if meet.meta.has_field("visit_total"):
		items = meet.get("visit_items") or []
		meet.visit_total = sum(float(r.amount or 0) for r in items)
	if meet.meta.has_field("total_collected"):
		payments = meet.get("payments_collected") or []
		meet.total_collected = sum(float(r.amount or 0) for r in payments)


def _advance_status(meet) -> None:
	if meet.docstatus != 0:
		return
	# Don't override an explicit Cancelled / No Show set by the user.
	if meet.status in ("Cancelled", "No Show"):
		return
	if meet.check_out_time:
		duration = int(meet.duration or 0)
		meet.status = "No Show" if duration < NO_SHOW_THRESHOLD_SECONDS else "Completed"
	elif meet.check_in_time:
		meet.status = "Checked in"
	elif meet.status not in ("En route", "Planned"):
		meet.status = "Planned"


def _finalize_status_on_submit(meet) -> None:
	if meet.status not in ("Completed", "No Show"):
		duration = int(meet.duration or 0)
		meet.status = "No Show" if duration < NO_SHOW_THRESHOLD_SECONDS else "Completed"


def _validate_required_for_completion(meet) -> None:
	if meet.off_target and not (meet.get("comment") or "").strip():
		frappe.throw(
			"This visit was off-target. Add a comment explaining why before submitting."
		)


def _off_target_threshold() -> float:
	try:
		s = frappe.get_cached_doc("Field Sales Settings")
		return float(getattr(s, "off_target_threshold_meters", 0) or 500)
	except Exception:
		return 500.0


def _post_service_stock_entry(meet) -> None:
	"""For Service visits with parts_used, optionally post a Material Issue.

	Controlled by Field Sales Settings.auto_create_stock_entry_for_service_parts.
	No-op when ERPNext / Stock Entry isn't installed, or settings flag is off.
	"""
	if meet.get("visit_type") != "Service":
		return
	if not meet.get("parts_used"):
		return
	if not frappe.db.table_exists("Stock Entry"):
		return
	try:
		settings = frappe.get_cached_doc("Field Sales Settings")
	except Exception:
		return
	if not getattr(settings, "auto_create_stock_entry_for_service_parts", 0):
		return

	default_company = frappe.defaults.get_global_default("company")
	if not default_company:
		return

	rows = []
	for p in meet.parts_used:
		if not p.get("item_code") or not float(p.get("qty") or 0):
			continue
		rows.append({
			"item_code": p.item_code,
			"qty": float(p.qty),
			"serial_no": p.get("serial_no") or None,
		})
	if not rows:
		return

	try:
		stock_entry = frappe.new_doc("Stock Entry")
		stock_entry.stock_entry_type = "Material Issue"
		stock_entry.company = default_company
		stock_entry.posting_date = frappe.utils.nowdate()
		stock_entry.purpose = "Material Issue"
		for row in rows:
			stock_entry.append("items", {
				"item_code": row["item_code"],
				"qty": row["qty"],
				"serial_no": row["serial_no"],
			})
		stock_entry.flags.ignore_validate_warnings = True
		stock_entry.insert(ignore_permissions=True)
		# Don't auto-submit — let the warehouse confirm.
		frappe.msgprint(
			f"Draft Stock Entry <a href='/app/stock-entry/{stock_entry.name}'>"
			f"{stock_entry.name}</a> created for service parts."
		)
	except Exception as exc:
		frappe.logger().warning(f"ding service Stock Entry skipped for {meet.name}: {exc}")
