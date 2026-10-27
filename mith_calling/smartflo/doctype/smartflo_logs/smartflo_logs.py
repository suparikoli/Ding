# Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SmartfloLogs(Document):
    def before_save(self):
        self.link_to_erpnext_entities()

    def link_to_erpnext_entities(self):
        """Automatically link the call to an existing ERPNext Lead, Contact, or Customer based on the phone number."""
        external_number = self.get("from") if self.type == "Incoming" else self.get("to")
        if not external_number or len(external_number) < 4:
            return

        search_number = "%" + external_number[-10:] + "%"
        existing_links = [link.link_doctype for link in self.get("links", [])]

        # 1. Check Customer via Contact Phone
        if "Customer" not in existing_links:
            contacts = frappe.get_all(
                "Contact Phone", filters={"phone": ("like", search_number)}, pluck="parent"
            )
            if contacts:
                customer_links = frappe.get_all(
                    "Dynamic Link",
                    filters={
                        "parent": ("in", contacts),
                        "parenttype": "Contact",
                        "link_doctype": "Customer",
                    },
                    pluck="link_name",
                    limit=1,
                )
                if customer_links:
                    self.append("links", {"link_doctype": "Customer", "link_name": customer_links[0]})
                    self.customer = customer_links[0]

        # 2. Check Contact
        if "Contact" not in existing_links:
            contact = frappe.db.get_value("Contact Phone", {"phone": ("like", search_number)}, "parent")
            if contact:
                self.append("links", {"link_doctype": "Contact", "link_name": contact})

        # 3. Check Lead
        if "Lead" not in existing_links:
            lead = frappe.db.get_value(
                "Lead", {"phone": ("like", search_number), "status": ("!=", "Converted")}, "name"
            )
            if not lead:
                lead = frappe.db.get_value(
                    "Lead", {"mobile_no": ("like", search_number), "status": ("!=", "Converted")}, "name"
                )
            if lead:
                self.append("links", {"link_doctype": "Lead", "link_name": lead})
