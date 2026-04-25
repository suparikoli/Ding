# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Scheduled tasks for the field sales module."""

from __future__ import annotations

import frappe
from frappe.utils import add_to_date, now_datetime


def purge_old_heartbeats(days: int = 90) -> None:
	"""Delete heartbeats older than `days` days. Runs daily."""
	cutoff = add_to_date(now_datetime(), days=-int(days))
	count = frappe.db.sql(
		"DELETE FROM `tabField Rep Heartbeat` WHERE timestamp < %s",
		(cutoff,),
	)
	frappe.db.commit()
	frappe.logger().info(f"ding heartbeat purge: removed rows older than {cutoff}")


def sweep_abandoned_checkins() -> None:
	"""Close Meets that were checked in but never checked out.

	Threshold comes from Field Sales Settings.abandoned_checkin_minutes (default 120).
	"""
	settings = frappe.get_cached_doc("Field Sales Settings")
	threshold_min = int(getattr(settings, "abandoned_checkin_minutes", 0) or 120)
	cutoff = add_to_date(now_datetime(), minutes=-threshold_min)

	for meet_doctype in ("Lead Meet", "Customer Meet", "Contact Meet"):
		stale = frappe.get_all(
			meet_doctype,
			filters={
				"check_in_time": ["<", cutoff],
				"check_out_time": ["is", "not set"],
			},
			pluck="name",
			limit=200,
		)
		for name in stale:
			try:
				doc = frappe.get_doc(meet_doctype, name)
				doc.check_out_time = add_to_date(doc.check_in_time, minutes=30)
				doc.save(ignore_permissions=True)
				if doc.day_plan and doc.visit_stop_row:
					frappe.db.set_value(
						"Visit Stop",
						doc.visit_stop_row,
						"status",
						"No Show",
						update_modified=False,
					)
			except Exception as exc:
				frappe.logger().warning(
					f"ding sweep_abandoned_checkins skipped {meet_doctype} {name}: {exc}"
				)
	frappe.db.commit()
