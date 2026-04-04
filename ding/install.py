import frappe


def add_custom_fields():
    custom_fields = [
        {
            "dt": "Customer",
            "label": "Customer GeoLocation",
            "fieldname": "customer_geolocation",
            "fieldtype": "Data",
            "insert_after": "address_html",
            "module": "ding",
        },
        {
            "dt": "Lead",
            "label": "Lead GeoLocation",
            "fieldname": "lead_geolocation",
            "fieldtype": "Data",
            "insert_after": "address_html",
            "module": "ding",
        },
        {
            "dt": "Contact",
            "label": "Contact GeoLocation",
            "fieldname": "contact_geolocation",
            "fieldtype": "Data",
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
