frappe.views.calendar["Customer Meet"] = {
    field_map: {
        start: "check_in_time",
        end: "check_out_time",
        id: "name",
        title: "customer",
        status: "status",
        allDay: 0
    },
    filters: [
        { fieldtype: "Link", fieldname: "creator", options: "User", label: __("Agent") },
        { fieldtype: "Select", fieldname: "visit_type",
          options: "\nSales\nDemo\nService\nDelivery\nCollection\nSurvey\nOther", label: __("Visit Type") }
    ],
    get_events_method: "frappe.desk.calendar.get_events"
};
