frappe.ui.form.on('Suspect', {
    refresh: function(frm) {
        // Add custom button to create Suspect Meet document
        frm.add_custom_button(__('Meet'), function() {
            frappe.new_doc('Suspect Meet', {
                suspect: frm.doc.name
            });
        });
    }
});

frappe.ui.form.on('Customer', {
    refresh: function(frm) {
        // Add custom button to create Customer Meet document
        frm.add_custom_button(__('Meet'), function() {
            frappe.new_doc('Customer Meet', {
                customer: frm.doc.name
            });
        });
    }
});

frappe.ui.form.on('Lead', {
    refresh: function(frm) {
        // Add custom button to create Lead Meet document
        frm.add_custom_button(__('Meet'), function() {
            frappe.new_doc('Lead Meet', {
                lead: frm.doc.name
            });
        });
    }
});
