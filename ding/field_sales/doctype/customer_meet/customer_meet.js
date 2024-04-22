// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Customer Meet', {
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



        // Add POS button
        frm.add_custom_button(__('POS'), function() {
            // Open POS URL with customer prefilled
            var customer = frm.doc.customer;
            if (customer) {
                var posUrl = `https://e15.justsigns.co.in/app/point-of-sale?customer=${encodeURIComponent(customer)}`;
                window.open(posUrl, '_blank');
            } else {
                frappe.msgprint(__('Please select a customer.'));
            }
        });

        // Add "Get Directions" button
        frm.add_custom_button(__('Get Directions'), function() {
            var customerLocation = frm.doc.customer_location;
            if (isValidLatLong(customerLocation)) {
                var googleMapsUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(customerLocation);
                window.open(googleMapsUrl, '_blank');
            } else {
                frappe.msgprint(__('Invalid Customer Location.'));
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

        // Add "Update Customer Location" button
        frm.add_custom_button(__('Update Customer Location'), function() {
            var customerLocation = frm.doc.customer_location;
            if (!customerLocation || !isValidLatLong(customerLocation)) {
                var customerName = frm.doc.customer;
                if (customerName) {
                    var customerUrl = frappe.urllib.get_base_url() + '/app/customer/' + customerName;
                    window.open(customerUrl, '_blank');
                } else {
                    frappe.msgprint(__('Please select a customer.'));
                }
            }
        });
    },

    customer_location: function(frm) {
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
    var customerLocation = frm.doc.customer_location;
    var loggedGeoLocation = frm.doc.logged_geo_location;
    if (customerLocation && loggedGeoLocation) {
        var distance = calculateDistance(customerLocation, loggedGeoLocation);
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
