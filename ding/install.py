import frappe


def add_custom_fields():
    """after_install hook entry point. Runs once on app install."""
    _add_geolocation_custom_fields()
    _ensure_field_sales_roles()


def _add_geolocation_custom_fields():
    custom_fields = [
        {
            "dt": "Customer",
            "label": "Customer GeoLocation",
            "fieldname": "customer_geolocation",
            "fieldtype": "Geolocation",
            "insert_after": "address_html",
            "module": "ding",
        },
        {
            "dt": "Lead",
            "label": "Lead GeoLocation",
            "fieldname": "lead_geolocation",
            "fieldtype": "Geolocation",
            "insert_after": "address_html",
            "module": "ding",
        },
        {
            "dt": "Contact",
            "label": "Contact GeoLocation",
            "fieldname": "contact_geolocation",
            "fieldtype": "Geolocation",
            "insert_after": "address",
            "module": "ding",
        },
    ]

    for field_data in custom_fields:
        if frappe.db.exists(
            "Custom Field",
            {"dt": field_data["dt"], "fieldname": field_data["fieldname"]},
        ):
            continue
        custom_field = frappe.get_doc({"doctype": "Custom Field", **field_data})
        custom_field.insert(ignore_permissions=True)


def _ensure_field_sales_roles():
    """Bootstrap the two field-sales roles. Idempotent."""
    for role_name, desk_access in (
        ("Field Agent", 1),
        ("Field Operations Manager", 1),
    ):
        if frappe.db.exists("Role", role_name):
            continue
        frappe.get_doc(
            {
                "doctype": "Role",
                "role_name": role_name,
                "desk_access": desk_access,
            }
        ).insert(ignore_permissions=True)
