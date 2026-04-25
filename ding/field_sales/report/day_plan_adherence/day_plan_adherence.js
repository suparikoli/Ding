// Copyright (c) 2026, manoj and contributors
// For license information, please see license.txt

frappe.query_reports["Day Plan Adherence"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.add_days(frappe.datetime.get_today(), -7),
            reqd: 1
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        },
        {
            fieldname: "agent",
            label: __("Agent"),
            fieldtype: "Link",
            options: "User"
        },
        {
            fieldname: "territory",
            label: __("Territory"),
            fieldtype: "Link",
            options: "Territory"
        },
        {
            fieldname: "status",
            label: __("Status"),
            fieldtype: "Select",
            options: "\nDraft\nReleased\nIn Progress\nCompleted\nCancelled"
        }
    ]
};
