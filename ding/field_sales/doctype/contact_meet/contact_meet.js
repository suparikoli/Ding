// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Contact Meet', {
    onload: function(frm) {
        // Make the Data fields visible
        frm.toggle_display(['check_in_time', 'check_out_time', 'duration', 'creator'], true);

        // Set the "Creator" field to the user who submitted the document (Doc Owner)
        frm.set_value('creator', frm.doc.owner);
    },
    
    refresh: function(frm) {
        frm.add_custom_button(__('Log Location'), function() {
            // Get user's current location and save latitude and longitude to the "Logged Geo-Location" field
            navigator.geolocation.getCurrentPosition(function(position) {
                var latitude = position.coords.latitude;
                var longitude = position.coords.longitude;
                console.log('Latitude:', latitude);
                console.log('Longitude:', longitude);

                // Set the "Logged Geo-Location" field
                frm.set_value('logged_geo_location', latitude + ',' + longitude);
            });
        });

        // Add "Get Directions" button
        frm.add_custom_button(__('Get Directions'), function() {
            var contactLocation = frm.doc.contact_location;
            if (isValidLatLong(contactLocation)) {
                var googleMapsUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(contactLocation);
                window.open(googleMapsUrl, '_blank');
            } else {
                frappe.msgprint(__('Invalid contact Location.'));
            }
        });

        frm.add_custom_button(__('Start Meet'), function() {
            // Save current time in the Check In Time field
            var currentTime = frappe.datetime.now_time();
            frm.set_value('check_in_time', currentTime);
        });

        frm.add_custom_button(__('End Meet'), function() {
            // Save current time in the Check Out Time field and calculate the duration
            var currentTime = frappe.datetime.now_time();
            frm.set_value('check_out_time', currentTime);

            // Calculate duration and set it in the "Duration" field
            var checkInTime = frm.doc.check_in_time;
            var checkOutTime = frm.doc.check_out_time;
            if (checkInTime && checkOutTime) {
                var duration = calculateTimeDifference(checkOutTime, checkInTime);
                frm.set_value('duration', duration);
            }
        });

        // Add "Update contact Location" button
        frm.add_custom_button(__('Update contact Location'), function() {
            var contactLocation = frm.doc.contact_geolocation;
            if (!contactLocation || !isValidLatLong(contactLocation)) {
                var contactName = frm.doc.contact;
                if (contactName) {
                    var contactUrl = frappe.urllib.get_base_url() + '/app/contact/' + contactName;
                    window.open(contactUrl, '_blank');
                } else {
                    frappe.msgprint(__('Please select a contact.'));
                }
            }
        });
    },

    contact_geolocation: function(frm) {
        calculateAndSetDistance(frm);
    },

    logged_geo_location: function(frm) {
        calculateAndSetDistance(frm);
    },

    after_save: function(frm) {
        // Display the rating after the document is saved
        frm.doc.__onload.rating && frm.dashboard.set_headline_alert('Rating', frm.doc.__onload.rating, "blue");
    }
});

function calculateTimeDifference(endTime, startTime) {
    var endTimeParts = endTime.split(':');
    var startTimeParts = startTime.split(':');
    var end = new Date(0, 0, 0, endTimeParts[0], endTimeParts[1], 0);
    var start = new Date(0, 0, 0, startTimeParts[0], startTimeParts[1], 0);

    var timeDiff = end - start;
    var hours = Math.floor(timeDiff / 1000 / 60 / 60);
    var minutes = Math.floor((timeDiff / 1000 / 60) % 60);

    return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
}

function calculateAndSetDistance(frm) {
    var contactLocation = frm.doc.contact_geolocation;
    var loggedGeoLocation = frm.doc.logged_geo_location;
    if (contactLocation && loggedGeoLocation) {
        var distance = calculateDistance(contactLocation, loggedGeoLocation);
        frm.set_value('distance', distance);
    }
}

function calculateDistance(location1, location2) {
    var latlong1 = location1.split(',');
    var latlong2 = location2.split(',');

    var lat1 = parseFloat(latlong1[0]);
    var lon1 = parseFloat(latlong1[1]);
    var lat2 = parseFloat(latlong2[0]);
    var lon2 = parseFloat(latlong2[1]);

    var radlat1 = Math.PI * lat1 / 180;
    var radlat2 = Math.PI * lat2 / 180;

    var theta = lon1 - lon2;
    var radtheta = Math.PI * theta / 180;

    var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    dist = Math.acos(dist);
    dist = dist * 180 / Math.PI;
    dist = dist * 60 * 1.1515;
    dist = dist * 1.609344;

    return dist.toFixed(2);
}

function isValidLatLong(location) {
    var latLongPattern = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
    return latLongPattern.test(location);
}
