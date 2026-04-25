frappe.listview_settings['Customer Meet'] = {
    add_fields: ['status', 'visit_type', 'off_target', 'distance'],
    get_indicator: function(doc) {
        const map = {
            'Planned':    ['📋 ' + __('Planned'),    'gray',   'status,=,Planned'],
            'En route':   ['🚗 ' + __('En route'),   'blue',   'status,=,En route'],
            'Checked in': ['📍 ' + __('Checked in'), 'orange', 'status,=,Checked in'],
            'Completed':  ['✅ ' + __('Completed'),  'green',  'status,=,Completed'],
            'No Show':    ['🚫 ' + __('No Show'),    'red',    'status,=,No Show'],
            'Cancelled':  ['✖ '  + __('Cancelled'),  'gray',   'status,=,Cancelled'],
        };
        const ind = map[doc.status] || [doc.status || '', 'gray'];
        if (doc.off_target) ind[0] = '⚠ ' + ind[0];
        return ind;
    },
    onload: function(listview) {
        listview.page.add_inner_button(__('Off-target'), function() {
            listview.filter_area.add([['Customer Meet', 'off_target', '=', 1]]);
        }, __('Filter'));
    }
};
