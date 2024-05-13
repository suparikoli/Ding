import frappe

def add_custom_fields():
    custom_fields = [
        {
            "dt": "Customer",
            "label": "Customer GeoLocation",
            "fieldname": "customer_geolocation",
            "fieldtype": "Data",
            "insert_after": "address_html",
            "module": "ding"
        },
        {
            "dt": "Lead",
            "label": "Lead GeoLocation",
            "fieldname": "lead_geolocation",
            "fieldtype": "Data",
            "insert_after": "address_html",
            "module": "ding"
        },
        {
            "dt": "Contact",
            "label": "Contact GeoLocation",
            "fieldname": "contact_geolocation",
            "fieldtype": "Data",
            "insert_after": "address",
            "module": "ding"
        }
    ]

    for field_data in custom_fields:
        custom_field = frappe.get_doc({
            "doctype": "Custom Field",
            "dt": field_data.get("dt"),
            "label": field_data.get("label"),
            "fieldname": field_data.get("fieldname"),
            "fieldtype": field_data.get("fieldtype"),
            "insert_after": field_data.get("insert_after"),
            "module": field_data.get("module")
        })
        custom_field.insert()

# Call the function to create the custom fields
add_custom_fields()
