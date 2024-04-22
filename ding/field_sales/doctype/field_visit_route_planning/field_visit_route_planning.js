// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Field Visit Route Planning', {
    refresh: function(frm) {
        // Add buttons to trigger the update and open in Google Maps
        frm.add_custom_button(__('Update List'), function() {
            updateGeolocationList(frm);
        });
        frm.add_custom_button(__('Open in Google Maps'), function() {
            openShortestRoute(frm.doc.geolocation_list);
        });
    }
});

// Function to update geolocation_list field
function updateGeolocationList(frm) {
    var geolocationList = [];

    // Fetch lat,long data from Field Visit Customer Locations
    ['customer_list', 'lead_list', 'suspect_list'].forEach(function(listName) {
        if (frm.doc[listName]) {
            $.each(frm.doc[listName], function(i, row) {
                var location = null;
                if (listName === 'customer_list' && row.customer_location) {
                    location = row.customer_location;
                } else if (listName === 'lead_list' && row.lead_location) {
                    location = row.lead_location;
                } else if (listName === 'suspect_list' && row.suspect_location) {
                    location = row.suspect_location;
                }
                if (location) {
                    geolocationList.push(location);
                }
            });
        }
    });

    var updatedGeolocationList = geolocationList.join('|');
    frm.set_value('geolocation_list', updatedGeolocationList);
    frappe.msgprint(__('Geolocation list updated successfully.'));
}

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the Earth in km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

// Function to find shortest route and open in Google Maps
function openShortestRoute(geolocationList) {
    var locations = geolocationList.split('|');
    var distances = [];

    for (var i = 0; i < locations.length - 1; i++) {
        var latLong1 = locations[i].split(',');
        var latLong2 = locations[i + 1].split(',');
        var distance = calculateDistance(parseFloat(latLong1[0]), parseFloat(latLong1[1]), parseFloat(latLong2[0]), parseFloat(latLong2[1]));
        distances.push(distance);
    }

    var sortedIndices = distances.map(function(_, i) { return i; }).sort(function(a, b) { return distances[a] - distances[b]; });
    var arrangedLocations = [locations[0]];

    for (var i = 0; i < sortedIndices.length; i++) {
        arrangedLocations.push(locations[sortedIndices[i] + 1]);
    }

    var url = "https://www.google.com/maps?dir=your+starting+address&daddr=";

    for (var i = 0; i < arrangedLocations.length; i++) {
        url += "+to:" + arrangedLocations[i];
    }

    window.open(url, '_blank');
}
