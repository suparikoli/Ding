frappe.query_reports["Route Efficiency"] = {
    filters: [
        { fieldname: "from_date", label: __("From Date"), fieldtype: "Date",
          default: frappe.datetime.add_days(frappe.datetime.get_today(), -7), reqd: 1 },
        { fieldname: "to_date", label: __("To Date"), fieldtype: "Date",
          default: frappe.datetime.get_today(), reqd: 1 },
        { fieldname: "agent", label: __("Agent"), fieldtype: "Link", options: "User" },
        { fieldname: "divergence_threshold_pct", label: __("Divergence Threshold %"),
          fieldtype: "Float", default: 30 }
    ]
};
