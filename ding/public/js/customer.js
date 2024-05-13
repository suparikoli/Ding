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

        // Check if either mobile_no or phone is missing
        if (!frm.doc.mobile_no && !frm.doc.phone) {
            // Display alert if both are missing
            frappe.msgprint("Phone and Mobile number are missing. Ding can't place calls.");
        } else {
            // Add custom button with phone icon to create CallLog document if at least one is present
            frm.add_custom_button('<i class="fa fa-phone"></i> Ding', function () {
                // Create the Ding Call Logs document
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            });
        }
        // Check if customer_geolocation field is empty or null
        var hasLocation = frm.doc.customer_geolocation;
        
        // Add custom button to create Customer Meet document if location is present
        if (hasLocation) {
            frm.add_custom_button(__('Field Meet'), function () {
                frappe.new_doc('Customer Meet', {
                    customer: frm.doc.name
                });
            });
        } else {
            // If geolocation is missing, show a message and log the customer
            frappe.msgprint("Customer Location Missing. Ding Field Meet not available.");
            // Log the customer here
        }


        // Add custom button to log location
        // Add custom button to log or update location based on whether location is present or not
        frm.add_custom_button(hasLocation ? __('Update Location') : __('Add Missing GeoLocation'), function () {
            // If location is present, confirm update; otherwise, confirm add
            frappe.confirm(hasLocation ? __('Do you want to update your current location?') : __('Do you want to log your current location?'), function () {
                // Get user's current location and update or add it to customer_geolocation
                navigator.geolocation.getCurrentPosition(function (position) {
                    var latitude = position.coords.latitude;
                    var longitude = position.coords.longitude;
                    var geolocation = latitude + ',' + longitude;
                    frm.set_value('customer_geolocation', geolocation);
                    frappe.msgprint(hasLocation ? __('Location updated successfully.') : __('Location logged successfully.'));
                });
            });
        });
        // End of custom button to log location
    }
});