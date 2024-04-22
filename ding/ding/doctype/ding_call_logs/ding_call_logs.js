// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Ding Call Logs', {
    onload: function(frm) {
        // Set call_handler to current user
        frm.set_value('call_handler', frappe.session.user);

        // Set start_time to current time
        frm.set_value('start_time', frappe.datetime.now_datetime());
    },

    before_save: function(frm) {
        // Set end_time to current time before saving
        frm.set_value('end_time', frappe.datetime.now_datetime());

        // Calculate duration
        var start_time = frm.doc.start_time ? moment(frm.doc.start_time) : moment();
        var end_time = moment();
        var duration = moment.duration(end_time.diff(start_time));
        var durationFormatted = moment.utc(duration.asMilliseconds()).format('mm:ss');
        frm.set_value('duration', durationFormatted);
    }
});