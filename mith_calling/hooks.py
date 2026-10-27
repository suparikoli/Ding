app_name = "mith_calling"
app_title = "Mith Calling"
app_publisher = "Mithtech Innovative Solutions PVT LTD"
app_description = "Calling from documents: call and WhatsApp buttons, call logs, and Tata Tele Smartflo as a telephony provider"
app_email = "manoj@mith.tech"
app_license = "mit"

# ding (renamed) plus the smartflo app (merged in as the Smartflo module), 2026-10-24.
# ding's field sales moved to mith_field_sales.

add_to_apps_screen = [
	{
		"name": "mith_calling",
		"logo": "/assets/mith_calling/images/smartflo_logo.png",
		"title": "SmartFlo",
		"route": "/app/smartflo",
	}
]

# Includes in <head>
# ------------------

# Smartflo dialer and phone panel
app_include_js = [
	"/assets/mith_calling/js/smartflo_dialer.js",
	"/assets/mith_calling/js/smartflo_phone_panel.js",
]

# Call, WhatsApp and call-log buttons on the client forms
doctype_js = {
	"Customer": "public/js/customer.js",
	"Lead": "public/js/lead.js",
	"Contact": "public/js/contact.js",
}

# Smartflo posts call events to the old app's path; keep it working after the merge.
override_whitelisted_methods = {
	"smartflo.tatatelebiz_smartflo_integration.api.webhook.handle_event": "mith_calling.smartflo.api.webhook.handle_event",
}
