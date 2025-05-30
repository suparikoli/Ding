frappe.ui.form.on('Customer', {
    refresh: function (frm) {
        // Function to create Ding Call Logs document
        function createDingCallLogs(customerName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Customer';
            new_log.reference_docname = customerName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';

            // Open the form for the new document
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        // Check if it's a new document
        var isNewDocument = frm.doc.__islocal;

        // Check if either mobile_no or phone is missing
        if (!isNewDocument && (!frm.doc.mobile_no && !frm.doc.phone)) {
            // Display alert at the top if both are missing
            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });
        } else if (!isNewDocument) {
            // Add custom button with phone icon to create CallLog document
            frm.add_custom_button('<i class="fa fa-phone"></i> Ding', function () {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            });
        }

        // Check if customer_geolocation field is empty or null
        var hasLocation = frm.doc.customer_geolocation;

        if (!isNewDocument) {
            // Add custom button to create Customer Meet document if location is present
            if (hasLocation) {
                frm.add_custom_button('Field Meet', function () {
                frappe.new_doc('Customer Meet', {
                    customer: frm.doc.name
                });
                });
            } else {
                // Display alert at the top if geolocation is missing
                frappe.show_alert({
                    message: __("Customer Location Missing. Ding Field Meet not available."),
                    indicator: 'orange'
                });
            }

            // Add custom button to log or update location based on whether location is present
            frm.add_custom_button(hasLocation ? 'Update Location' : 'Add Missing GeoLocation', function () {
                frappe.confirm(
                    hasLocation
                        ? __('Do you want to update your current location?')
                        : __('Do you want to log your current location?'),
                    function () {
                        navigator.geolocation.getCurrentPosition(function (position) {
                            var latitude = position.coords.latitude;
                            var longitude = position.coords.longitude;
                            var geolocation = latitude + ',' + longitude;
                            frm.set_value('customer_geolocation', geolocation);

                            frappe.show_alert({
                                message: hasLocation
                                    ? __('Location updated successfully.')
                                    : __('Location logged successfully.'),
                                indicator: 'green'
                            });
                        }, function (error) {
                            frappe.show_alert({
                                message: __('Failed to fetch location. Please try again.'),
                                indicator: 'red'
                            });
                        });
                    }
                );
            });
        }
    }
});
