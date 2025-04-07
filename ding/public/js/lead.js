frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        // Function to create Ding Call Logs document
        function createDingCallLogs(leadName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Lead';
            new_log.reference_docname = leadName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';

            // Open the form for the new document
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        // Check if it's a new document
        var isNewDocument = frm.doc.__islocal;

        // For new documents, ensure save is enabled and skip other checks
        if (isNewDocument) {
            frm.enable_save();
            return;
        }

        // Existing functionality for saved documents
        // Check if either mobile_no or phone is missing
        if (!frm.doc.mobile_no && !frm.doc.phone) {
            // Display alert at the top
            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });
        } else {
            // Add custom button with phone icon to create CallLog document
            frm.add_custom_button(__('<i class="fa fa-phone"></i> Ding'), function() {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            });
        }

        // Check if lead_geolocation field is empty or null
        var hasLocation = frm.doc.lead_geolocation;

        // Add custom button to create Lead Meet document if location is present
        if (hasLocation) {
            frm.add_custom_button(__('Field Meet'), function() {
                frappe.new_doc('Lead Meet', {
                    lead: frm.doc.name
                });
            });
        } else {
            // Display alert at the top if geolocation is missing
            frappe.show_alert({
                message: __("Lead Location Missing. Ding Field Meet not available."),
                indicator: 'orange'
            });
        }

        // Add custom button to log or update location based on whether location is present
        frm.add_custom_button(hasLocation ? __('Update Location') : __('Add Missing GeoLocation'), function() {
            frappe.confirm(
                hasLocation ? __('Do you want to update your current location?') : __('Do you want to log your current location?'),
                function() {
                    navigator.geolocation.getCurrentPosition(function(position) {
                        var latitude = position.coords.latitude;
                        var longitude = position.coords.longitude;
                        var geolocation = latitude + ',' + longitude;
                        frm.set_value('lead_geolocation', geolocation);

                        frappe.show_alert({
                            message: hasLocation ? __('Location updated successfully.') : __('Location logged successfully.'),
                            indicator: 'green'
                        });
                    }, function(error) {
                        frappe.show_alert({
                            message: __('Failed to fetch location. Please try again.'),
                            indicator: 'red'
                        });
                    });
                }
            );
        });

        // Check if status is 'Converted'
        if (frm.doc.status === 'Converted') {
            // Disable all fields and hide 'Save' button
            frm.set_read_only();
            frm.disable_save();

            // Show notification at the top
            frappe.show_alert({
                message: __('Lead has been converted. Editing is disabled by Ding.'),
                indicator: 'blue'
            });
        } else {
            // Enable all fields and show 'Save' button
            frm.set_read_only(false);
            frm.enable_save();
        }
    }
});