frappe.ui.form.on('Customer', {
    refresh: function(frm) {
        // Add custom button to create CallLog document
        frm.add_custom_button(__('LogCall'), function() {
            // Create the Ding Call Logs document
            createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
        });

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
    }
});

frappe.ui.form.on('Suspect', {
    refresh: function(frm) {
        // Add custom button to create CallLog document
        frm.add_custom_button(__('LogCall'), function() {
            // Create the Ding Call Logs document
            createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
        });

        // Function to create Ding Call Logs document
        function createDingCallLogs(suspectName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Suspect';
            new_log.reference_docname = suspectName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';

            // Open the form for the new document
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }
    }
});

frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        // Add custom button to create CallLog document
        frm.add_custom_button(__('LogCall'), function() {
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
    }
});
