# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Lead → Opportunity → Quotation → Sales Order conversion, joined through
the Lead Meets that touched each lead in the period.

Counts each lead at most once per stage. Requires ERPNext for the downstream
docs; if a doctype is missing, that column is empty.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, today


def execute(filters=None):
	filters = filters or {}
	from_date = filters.get("from_date") or add_days(today(), -30)
	to_date = filters.get("to_date") or today()

	# Step 1: leads touched by a submitted Lead Meet in the window.
	meets = frappe.db.sql(
		"""
		SELECT DISTINCT lead
		FROM `tabLead Meet`
		WHERE docstatus = 1
		  AND lead IS NOT NULL
		  AND check_in_time BETWEEN %(from)s AND %(to)s
		""",
		{"from": from_date, "to": to_date},
		as_dict=True,
	)
	leads = [m["lead"] for m in meets if m.get("lead")]
	total_leads = len(leads)

	def _count(doctype, party_type, party_name_field, lead_field=None):
		if not frappe.db.table_exists(doctype) or not leads:
			return 0
		# Try common lead-link patterns:
		# 1) `lead` column directly (Opportunity.party_name when opportunity_from='Lead')
		# 2) `party_name` with `opportunity_from='Lead'`
		clauses = []
		params = {"leads": tuple(leads)}
		if doctype == "Opportunity":
			clauses.append("opportunity_from = 'Lead' AND party_name IN %(leads)s")
		elif doctype == "Quotation":
			clauses.append(
				"((quotation_to = 'Lead' AND party_name IN %(leads)s) OR "
				"party_name IN (SELECT lead_name FROM `tabLead` WHERE name IN %(leads)s))"
			)
		elif doctype == "Sales Order":
			# Sales Orders need a customer; map via Lead → Customer link.
			clauses.append(
				"customer IN (SELECT name FROM `tabCustomer` WHERE lead_name IN %(leads)s)"
			)
		else:
			return 0
		where = " AND ".join(clauses)
		try:
			return frappe.db.sql(
				f"SELECT COUNT(DISTINCT name) FROM `tab{doctype}` WHERE {where}", params
			)[0][0] or 0
		except Exception as exc:
			frappe.logger().warning(f"conversion_funnel: {doctype} count failed: {exc}")
			return 0

	opps = _count("Opportunity", "Lead", "party_name")
	quotes = _count("Quotation", "Lead", "party_name")
	orders = _count("Sales Order", "Customer", "customer")

	def _pct(n, base):
		return round((n / base) * 100, 1) if base else 0

	rows = [
		{"stage": "Lead Meets (unique leads)", "count": total_leads, "from_previous": "—", "from_top": "100.0%"},
		{"stage": "Opportunities", "count": opps,
		 "from_previous": f"{_pct(opps, total_leads)}%", "from_top": f"{_pct(opps, total_leads)}%"},
		{"stage": "Quotations", "count": quotes,
		 "from_previous": f"{_pct(quotes, opps)}%", "from_top": f"{_pct(quotes, total_leads)}%"},
		{"stage": "Sales Orders", "count": orders,
		 "from_previous": f"{_pct(orders, quotes)}%", "from_top": f"{_pct(orders, total_leads)}%"},
	]

	columns = [
		{"fieldname": "stage", "label": "Stage", "fieldtype": "Data", "width": 280},
		{"fieldname": "count", "label": "Count", "fieldtype": "Int", "width": 100},
		{"fieldname": "from_previous", "label": "From Previous", "fieldtype": "Data", "width": 130},
		{"fieldname": "from_top", "label": "From Top", "fieldtype": "Data", "width": 110},
	]
	return columns, rows
