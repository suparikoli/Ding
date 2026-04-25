// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Field Visit Route Planning', {
    refresh: function(frm) {
        // Add a button to open shortest route on Google Maps
        frm.add_custom_button(__('Open in Google Maps'), function() {
            openShortestRoute(frm.doc.geolocation_list);
        });

        // Add a button to trigger the update
        frm.add_custom_button(__('Update List'), function() {
            updateGeolocationList(frm);
        });
    }
});

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the Earth in km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

// Open Google Maps directions for the planned route. Origin is the device's
// current GPS position; falls back to "Current Location" string if denied.
function openShortestRoute(geolocationList) {
    if (!geolocationList) {
        frappe.msgprint(__('No locations to route. Click "Update List" first.'));
        return;
    }
    var stops = geolocationList.split('|').filter(function(s) { return s && s.indexOf(',') > -1; });
    if (!stops.length) {
        frappe.msgprint(__('No valid locations found.'));
        return;
    }
    var destination = stops[stops.length - 1];
    var waypoints = stops.slice(0, -1).join('|');

    function buildAndOpen(origin) {
        var url = 'https://www.google.com/maps/dir/?api=1'
            + '&origin=' + encodeURIComponent(origin)
            + '&destination=' + encodeURIComponent(destination)
            + (waypoints ? '&waypoints=' + encodeURIComponent(waypoints) : '');
        window.open(url, '_blank');
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(pos) { buildAndOpen(pos.coords.latitude + ',' + pos.coords.longitude); },
            function() { buildAndOpen('Current Location'); }
        );
    } else {
        buildAndOpen('Current Location');
    }
}

// Function to update geolocation_list field
function updateGeolocationList(frm) {
    // Initialize an empty array to store lat,lng pairs
    var geolocationList = [];

    // Fetch lat,long data from Field Visit Customer Locations
    if (frm.doc.customer_list) {
        frm.doc.customer_list.forEach(function(row) {
            if (row.customer_location) {
                geolocationList.push(row.customer_location);
            }
        });
    }

    // Fetch lat,long data from Field Visit Lead Locations
    if (frm.doc.lead_list) {
        frm.doc.lead_list.forEach(function(row) {
            if (row.lead_location) {
                geolocationList.push(row.lead_location);
            }
        });
    }

    // Fetch lat,long data from Field Visit Contact Locations
    if (frm.doc.contact_list) {
        frm.doc.contact_list.forEach(function(row) {
            if (row.contact_location) {
                geolocationList.push(row.contact_location);
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
