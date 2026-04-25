# Copyright (c) 2026, manoj and contributors
# For license information, please see license.txt
"""Server-side context for the Ding Field PWA at /field/.

Runs in unsandboxed Frappe context (unlike the Jinja template), so we can
freely call frappe.get_roles() and inject the result.
"""

import frappe


def get_context(context):
	context.no_cache = 1
	context.ding_user = frappe.session.user
	context.ding_csrf = getattr(frappe.local.session, "csrf_token", "") or ""
	context.ding_roles = frappe.get_roles(frappe.session.user) if frappe.session.user != "Guest" else []

	# Maps config — pulled here (unsandboxed) so the PWA can pick the right SDK
	# without an extra round-trip on first load.
	provider = "OpenStreetMap"
	api_key = ""
	try:
		settings = frappe.get_cached_doc("Field Sales Settings")
		provider = settings.maps_provider or provider
		api_key = settings.get_password("maps_api_key", raise_exception=False) or ""
	except Exception:
		pass
	context.maps_provider = provider
	context.maps_api_key = api_key
	return context
