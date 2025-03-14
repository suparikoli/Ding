frappe.ui.form.on('Contact', {
    refresh: function (frm) {
        // Function to create Ding Call Logs document
        function createDingCallLogs(contactName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Contact';
            new_log.reference_docname = contactName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';

            // Open the form for the new document
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        // Check if it's a new document
        var isNewDocument = frm.doc.__islocal;

        // Check if either mobile_no or phone is missing and it's not a new document
        if (!isNewDocument && (!frm.doc.mobile_no && !frm.doc.phone)) {
            // Display alert if both are missing and it's not a new document
            frappe.msgprint("Phone and Mobile number are missing. Ding can't place calls.");
        } else if (!isNewDocument) {
            // Add custom button with phone icon to create CallLog document if at least one is present and it's not a new document
            frm.add_custom_button('<i class="fa fa-phone"></i> Ding', function () {
                // Create the Ding Call Logs document if it's not a new document
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            });
        }

        // Check if contact_geolocation field is empty or null and it's not a new document
        var hasLocation = frm.doc.contact_geolocation;
        if (!isNewDocument) {
            // Add custom button to create Contact Meet document if location is present and it's not a new document
            if (hasLocation) {
                frm.add_custom_button(__('Field Meet'), function () {
                    frappe.new_doc('Contact Meet', {
                        contact: frm.doc.name
                    });
                });
            } else {
                // If geolocation is missing and it's not a new document, show a message and log the contact
                frappe.msgprint("Contact Location Missing. Ding Field Meet not available.");
                // Log the contact here
            }

            // Add custom button to log or update location based on whether location is present or not and it's not a new document
            frm.add_custom_button(hasLocation ? __('Update Location') : __('Add Missing GeoLocation'), function () {
                // If location is present, confirm update; otherwise, confirm add
                frappe.confirm(hasLocation ? __('Do you want to update your current location?') : __('Do you want to log your current location?'), function () {
                    // Get user's current location and update or add it to contact_geolocation
                    navigator.geolocation.getCurrentPosition(function (position) {
                        var latitude = position.coords.latitude;
                        var longitude = position.coords.longitude;
                        var geolocation = latitude + ',' + longitude;
                        frm.set_value('contact_geolocation', geolocation);
                        frappe.msgprint(hasLocation ? __('Location updated successfully.') : __('Location logged successfully.'));
                    });
                });
            });
        }
        // End of custom button to log location
    }
});
