// Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Smartflo Call Report"] = {
    "filters": [
        {
            "fieldname": "date_range",
            "label": __("Date Range"),
            "fieldtype": "DateRange",
            "default": [frappe.datetime.add_days(frappe.datetime.nowdate(), -30), frappe.datetime.nowdate()],
            "reqd": 1
        },
        {
            "fieldname": "direction",
            "label": __("Direction"),
            "fieldtype": "Select",
            "options": "\nIncoming\nOutgoing"
        },
        {
            "fieldname": "status",
            "label": __("Status"),
            "fieldtype": "Select",
            "options": "\nRinging\nIn Progress\nCompleted\nFailed\nBusy\nNo Answer\nQueued\nCancelled"
        },
        {
            "fieldname": "agent",
            "label": __("Agent"),
            "fieldtype": "Link",
            "options": "User"
        }
    ]
};
