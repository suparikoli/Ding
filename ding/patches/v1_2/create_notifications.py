# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Create the Field Sales Notification fixtures on migrate.

Notifications fire automatically based on document events. Idempotent.
"""

import frappe


NOTIFICATIONS = [
	{
		"name": "Field Sales: Off-target Check-in",
		"subject": "Off-target check-in by {{ doc.creator }}",
		"document_type": "Customer Meet",
		"event": "Value Change",
		"value_changed": "off_target",
		"condition": "doc.off_target",
		"channel": "Email",
		"recipients": [{"receiver_by_role": "Field Operations Manager"}],
		"message": (
			"Agent {{ doc.creator }} checked in {{ doc.distance }}m from "
			"{{ doc.customer }} on {{ doc.check_in_time }}.\n\n"
			"Comment: {{ doc.comment or 'none' }}\n\n"
			"View: <a href='{{ frappe.utils.get_url() }}/app/customer-meet/{{ doc.name }}'>"
			"{{ doc.name }}</a>"
		),
	},
	{
		"name": "Field Sales: Day Plan Released",
		"subject": "Your Day Plan for {{ doc.plan_date }} is ready",
		"document_type": "Day Plan",
		"event": "Value Change",
		"value_changed": "status",
		"condition": "doc.status == 'Released'",
		"channel": "Email",
		"recipients": [{"receiver_by_document_field": "assigned_to"}],
		"message": (
			"Your Day Plan for {{ doc.plan_date }} has been released with "
			"{{ doc.summary_planned_count }} stops.\n\n"
			"Open: <a href='{{ frappe.utils.get_url() }}/app/day-plan/{{ doc.name }}'>"
			"{{ doc.name }}</a>"
		),
	},
	{
		"name": "Field Sales: Abandoned Check-in",
		"subject": "Abandoned check-in: {{ doc.name }}",
		"document_type": "Customer Meet",
		"event": "Value Change",
		"value_changed": "status",
		"condition": "doc.status == 'No Show' and not doc.check_out_time",
		"channel": "Email",
		"recipients": [{"receiver_by_role": "Field Operations Manager"}],
		"message": (
			"Visit {{ doc.name }} for {{ doc.customer }} was auto-closed as No Show.\n"
			"Agent: {{ doc.creator }}\n"
			"Check-in: {{ doc.check_in_time }}"
		),
	},
	{
		"name": "Field Sales: End of Day Adherence",
		"subject": "Day Plan completed: {{ doc.assigned_to }} ({{ '%.0f' % (doc.adherence_pct or 0) }}%)",
		"document_type": "Day Plan",
		"event": "Submit",
		"channel": "Email",
		"recipients": [{"receiver_by_role": "Field Operations Manager"}],
		"message": (
			"{{ doc.assigned_to }} closed their day:\n\n"
			"• Planned: {{ doc.summary_planned_count }}\n"
			"• Done: {{ doc.summary_completed_count }}\n"
			"• Skipped: {{ doc.summary_skipped_count }}\n"
			"• No Show: {{ doc.summary_no_show_count }}\n"
			"• Adherence: {{ '%.0f' % (doc.adherence_pct or 0) }}%\n\n"
			"<a href='{{ frappe.utils.get_url() }}/app/day-plan/{{ doc.name }}'>"
			"View plan</a>"
		),
	},
]


def execute():
	for spec in NOTIFICATIONS:
		_upsert(spec)
	frappe.db.commit()
	frappe.logger().info("ding notifications created.")


def _upsert(spec):
	if frappe.db.exists("Notification", spec["name"]):
		return
	recipients = spec.pop("recipients", [])
	doc = frappe.get_doc(
		{
			"doctype": "Notification",
			"enabled": 1,
			"send_to_all_assignees": 0,
			**spec,
		}
	)
	for r in recipients:
		doc.append("recipients", r)
	doc.insert(ignore_permissions=True)
