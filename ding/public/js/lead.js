frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        // Add custom button to create CallLog document
        frm.add_custom_button(__('CallLog'), function() {
            // Create the Ding Call Logs document
            createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
        });

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

        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function() {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function() {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

        // Function to play the notification sound
        function playNotificationSound() {
            var audio = new Audio('https://e15.justsigns.co.in/files/callsound.mp3');
            audio.play();
        }

        // Add custom button to create Lead Meet document
        frm.add_custom_button(__('Meet'), function() {
            frappe.new_doc('Lead Meet', {
                lead: frm.doc.name
            });
        });

        // Add custom button to log location
        frm.add_custom_button(__('Add Location'), function() {
            frappe.confirm(__('Do you want to log your current location?'), function() {
                // Get user's current location and add it to custom_lead_geolocation
                navigator.geolocation.getCurrentPosition(function(position) {
                    var latitude = position.coords.latitude;
                    var longitude = position.coords.longitude;
                    var geolocation = latitude + ',' + longitude;
                    frm.set_value('custom_lead_geolocation', geolocation);
                    frappe.msgprint(__('Location logged successfully.'));
                });
            });
        });
    }
});
