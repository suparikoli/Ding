import frappe

def remove_custom_fields():
    custom_fields = [
        {
            "dt": "Customer",
            "fieldname": "customer_geolocation"
        },
        {
            "dt": "Lead",
            "fieldname": "lead_geolocation"
        },
        {
            "dt": "Contact",
            "fieldname": "contact_geolocation"
        }
    ]

    for field_data in custom_fields:
        try:
            # Get the Custom Field document
            custom_field = frappe.get_doc(
                "Custom Field",
                {"dt": field_data["dt"], "fieldname": field_data["fieldname"]}
            )
            # Delete the Custom Field
            custom_field.delete()
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Error removing custom field {field_data['fieldname']} from {field_data['dt']}: {str(e)}")

def before_uninstall():
    remove_custom_fields()