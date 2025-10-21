frappe.ui.form.on('Lead', {
    refresh: function (frm) {

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

        // Function to play sound (for Ding buttons)
        function playNotificationSound() {
            const audio = new Audio('/assets/frappe/sounds/ting.mp3'); // or your custom sound path
            audio.play().catch(() => {});
        }

        // Check if it's a new document
        var isNewDocument = frm.doc.__islocal;

        // For new documents, ensure save is enabled and skip other checks
        if (isNewDocument) {
            frm.enable_save();
            return;
        }

        // ------------------- Contact Info Buttons -------------------

        // If Mobile number exists
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('📞 Ding Mobile'), function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });

            frm.add_custom_button(__('<i class="fa fa-whatsapp"></i> WhatsApp Mobile'), function () {
                window.open('https://wa.me/' + frm.doc.mobile_no, '_blank');
            });
        }

        // If Phone number exists
        if (frm.doc.phone) {
            frm.add_custom_button(__('📞 Ding Phone'), function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.phone;
            });

            frm.add_custom_button(__('<i class="fa fa-whatsapp"></i> WhatsApp Phone'), function () {
                window.open('https://wa.me/' + frm.doc.phone, '_blank');
            });
        }

        // ------------------- Call Logs & Alerts -------------------

        if (!frm.doc.mobile_no && !frm.doc.phone) {
            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });
        } else {
            frm.add_custom_button('<i class="fa fa-phone"></i> Ding Log', function () {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            });

            frm.add_custom_button('<i class="fa fa-list"></i> Call Logs', function () {
                if (frm.doc.mobile_no) {
                    let route = '/app/ding-call-logs?mobile_no=' + encodeURIComponent(frm.doc.mobile_no);
                    window.open(route, '_blank');
                } else {
                    frappe.msgprint(__('Mobile number is missing.'));
                }
            });
        }

        // ------------------- Geolocation -------------------

        var hasLocation = frm.doc.lead_geolocation;

        if (hasLocation) {
            frm.add_custom_button(__('Field Meet'), function () {
                frappe.new_doc('Lead Meet', {
                    lead: frm.doc.name
                });
            });
        } else {
            frappe.show_alert({
                message: __("Lead Location Missing. Ding Field Meet not available."),
                indicator: 'orange'
            });
        }

        frm.add_custom_button(hasLocation ? 'Update Location' : 'Add Missing GeoLocation', function () {
            frappe.confirm(
                hasLocation ? __('Do you want to update your current location?') : __('Do you want to log your current location?'),
                function () {
                    navigator.geolocation.getCurrentPosition(function (position) {
                        var latitude = position.coords.latitude;
                        var longitude = position.coords.longitude;
                        var geolocation = latitude + ',' + longitude;
                        frm.set_value('lead_geolocation', geolocation);

                        frappe.show_alert({
                            message: hasLocation ? __('Location updated successfully.') : __('Location logged successfully.'),
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
    },

    // ------------------- Validate Block -------------------
    validate: function (frm) {
        let mobile = frm.doc.mobile_no;
        let phone = frm.doc.phone;
        let whatsapp = frm.doc.whatsapp_no;

        // Priority: Mobile > Phone > WhatsApp
        if (mobile) {
            if (!phone) frm.set_value("phone", mobile);
            if (!whatsapp) frm.set_value("whatsapp_no", mobile);
        } else if (phone) {
            if (!mobile) frm.set_value("mobile_no", phone);
            if (!whatsapp) frm.set_value("whatsapp_no", phone);
        } else if (whatsapp) {
            if (!mobile) frm.set_value("mobile_no", whatsapp);
            if (!phone) frm.set_value("phone", whatsapp);
        }
    }
});
