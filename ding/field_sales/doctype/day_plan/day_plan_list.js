frappe.listview_settings['Day Plan'] = {
    add_fields: ['status', 'plan_date', 'assigned_to', 'adherence_pct',
                 'summary_planned_count', 'summary_completed_count'],
    get_indicator: function(doc) {
        const map = {
            'Draft':       [__('Draft'),       'gray',   'status,=,Draft'],
            'Released':    [__('Released'),    'blue',   'status,=,Released'],
            'In Progress': [__('In Progress'), 'orange', 'status,=,In Progress'],
            'Completed':   [__('Completed'),   'green',  'status,=,Completed'],
            'Cancelled':   [__('Cancelled'),   'gray',   'status,=,Cancelled'],
        };
        return map[doc.status] || [doc.status || '', 'gray'];
    },
    formatters: {
        adherence_pct: function(value) {
            if (value == null) return '';
            const v = Number(value);
            const cls = v >= 80 ? 'text-success' : v >= 50 ? 'text-warning' : 'text-danger';
            return `<span class="${cls}">${v.toFixed(0)}%</span>`;
        }
    },
    onload: function(listview) {
        listview.page.add_inner_button(__('Today'), function() {
            listview.filter_area.add([
                ['Day Plan', 'plan_date', '=', frappe.datetime.get_today()]
            ]);
        }, __('Filter'));
        listview.page.add_inner_button(__('My plans'), function() {
            listview.filter_area.add([
                ['Day Plan', 'assigned_to', '=', frappe.session.user]
            ]);
        }, __('Filter'));
    }
};
