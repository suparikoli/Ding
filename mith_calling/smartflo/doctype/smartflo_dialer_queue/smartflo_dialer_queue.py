import frappe
from frappe.model.document import Document


class SmartfloDialerQueue(Document):
    def validate(self):
        if not self.phone_number and self.target_type and self.target_name:
            phone_field = "mobile_no" if self.target_type == "Lead" else "phone"
            self.phone_number = frappe.db.get_value(self.target_type, self.target_name, phone_field)
        if not self.phone_number:
            frappe.throw("Phone number is required. Could not auto-detect from target.")

    @frappe.whitelist()
    def initiate_call(self):
        """Initiates a call for this queue item and updates status."""
        if self.status in ("Completed", "Dialing"):
            frappe.throw(f"Call already {self.status}.")

        from mith_calling.smartflo.api.client import initiate_outbound_call

        response = initiate_outbound_call(
            number=self.phone_number,
            reference_doctype=self.target_type,
            reference_name=self.target_name,
        )

        self.db_set("status", "Dialing")
        self.db_set("last_dialed_at", frappe.utils.now())
        self.db_set("retry_count", (self.retry_count or 0) + 1)

        if response and (response.get("uuid") or response.get("request_id")):
            call_uuid = response.get("uuid") or response.get("request_id")
            log_name = frappe.db.get_value("Smartflo Logs", {"id": call_uuid}, "name")
            if log_name:
                self.db_set("call_log", log_name)

        return response
