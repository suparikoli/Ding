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

// Function to find shortest route and open in Google Maps
function openShortestRoute(geolocationList) {
    // Split geolocationList into lat,long pairs
    var locations = geolocationList.split('|');

    // Calculate distances between each pair of adjacent locations
    var distances = [];
    for (var i = 0; i < locations.length - 1; i++) {
        var latLong1 = locations[i].split(',');
        var latLong2 = locations[i + 1].split(',');
        var distance = calculateDistance(parseFloat(latLong1[0]), parseFloat(latLong1[1]), parseFloat(latLong2[0]), parseFloat(latLong2[1]));
        distances.push(distance);
    }

    // Create an array of indices in ascending order of distances
    var sortedIndices = distances.map(function(_, i) { return i; }).sort(function(a, b) { return distances[a] - distances[b]; });

    // Arrange locations in the order of the shortest route
    var arrangedLocations = [locations[0]];
    for (var i = 0; i < sortedIndices.length; i++) {
        arrangedLocations.push(locations[sortedIndices[i] + 1]);
    }

    // Construct the Google Maps URL with the arranged locations
    var url = "https://www.google.com/maps?dir=your+starting+address&daddr=";
    for (var i = 0; i < arrangedLocations.length; i++) {
        url += "+to:" + arrangedLocations[i];
    }
    
    // Open the URL in a new tab/window
    window.open(url, '_blank');
}

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
