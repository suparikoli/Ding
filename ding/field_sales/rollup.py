# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Roll up Meet → Visit Stop status when a linked Meet changes."""

import frappe


def rollup_meet_to_stop(meet) -> None:
	"""Mirror the Meet's state into its linked Visit Stop, if any.

	- Sets `actual_start_time` to `check_in_time` once.
	- Sets `actual_duration` from the Meet's duration on each save.
	- Flips `status` to `Done` once `check_out_time` is set, otherwise
	  `In Progress`.
	"""
	if not getattr(meet, "day_plan", None) or not getattr(meet, "visit_stop_row", None):
		return

	updates = {}
	if meet.check_in_time:
		updates["actual_start_time"] = meet.check_in_time
	if meet.duration:
		updates["actual_duration"] = int(meet.duration)
	if meet.check_out_time:
		updates["status"] = "Done"
	else:
		# Don't downgrade a stop that was already Done by another save.
		current = frappe.db.get_value("Visit Stop", meet.visit_stop_row, "status")
		if current != "Done":
			updates["status"] = "In Progress"
	updates["meet_doctype"] = meet.doctype
	updates["meet_name"] = meet.name

	for field, value in updates.items():
		frappe.db.set_value(
			"Visit Stop", meet.visit_stop_row, field, value, update_modified=False
		)

	# Trigger a recompute on the parent Day Plan so the summary refreshes.
	plan = frappe.get_doc("Day Plan", meet.day_plan)
	if plan.docstatus == 0:
		plan.save(ignore_permissions=True)
