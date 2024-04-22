function addLocationButton(frm, field) {
    frm.add_custom_button(__('Add Location'), function() {
        frappe.confirm(__('Do you want to log your current location?'), function() {
            // Get user's current location and add it to the specified field
            navigator.geolocation.getCurrentPosition(function(position) {
                var latitude = position.coords.latitude;
                var longitude = position.coords.longitude;
                var geolocation = latitude + ',' + longitude;
                frm.set_value(field, geolocation);
                frappe.msgprint(__('Location logged successfully.'));
            });
        });
    });
}

frappe.ui.form.on('Customer', {
    refresh: function(frm) {
        addLocationButton(frm, 'customer_geolocation');
    }
});

frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        addLocationButton(frm, 'custom_lead_geolocation');
    }
});

frappe.ui.form.on('Suspect', {
    refresh: function(frm) {
        addLocationButton(frm, 'custom_suspect_geolocation');
    }
});
