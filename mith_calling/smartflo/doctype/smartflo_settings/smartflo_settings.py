# Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from mith_calling.smartflo.api.client import SmartfloAPI


class SmartfloSettings(Document):
    @frappe.whitelist()
    def test_smartflo_connection(self):
        try:
            api = SmartfloAPI()
            result = api.test_connection()
            frappe.msgprint("Successfully connected to Smartflo API!", title="Success", indicator="green")
            return result
        except Exception as e:
            frappe.throw(f"Connection failed: {str(e)}")
