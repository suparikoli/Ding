// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Field Visit Route Planning', {
    refresh: function(frm) {
        // Add a button to trigger the update
        frm.add_custom_button(__('Update List'), function() {
            updateGeolocationList(frm);
        });
    }
});

// Function to update geolocation_list field
function updateGeolocationList(frm) {
    // Initialize an empty array to store lat,lng pairs
    var geolocationList = [];

    // Fetch lat,long data from Field Visit Customer Locations
    if (frm.doc['customer_list']) {
        $.each(frm.doc['customer_list'], function(i, row) {
            if (row.customer_location) {
                geolocationList.push(row.customer_location);
            }
        });
    }

    // Fetch lat,long data from Field Visit Lead Locations
    if (frm.doc['lead_list']) {
        $.each(frm.doc['lead_list'], function(i, row) {
            if (row.lead_location) {
                geolocationList.push(row.lead_location);
            }
        });
    }

    // Fetch lat,long data from Field Visit Suspect Locations
    if (frm.doc['suspect_list']) {
        $.each(frm.doc['suspect_list'], function(i, row) {
            if (row.suspect_location) {
                geolocationList.push(row.suspect_location);
            }
        });
    }

    // Join the array elements with '|' separator
    var updatedGeolocationList = geolocationList.join('|');
    
    // Update the geolocation_list field
    frm.set_value('geolocation_list', updatedGeolocationList);

    // Show success message
    frappe.msgprint(__('Geolocation list updated successfully.'));
}

