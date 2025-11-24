frappe.ui.form.on('Lead', {
    refresh: function (frm) {

        function createDingCallLogs(leadName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Lead';
            new_log.reference_docname = leadName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        function playNotificationSound() {
            const audio = new Audio('/assets/frappe/sounds/ting.mp3');
            audio.play().catch(() => {});
        }

        var isNewDocument = frm.doc.__islocal;
        if (isNewDocument) {
            frm.enable_save();
            return;
        }

        // Create parent dropdown group
        const dingGroup = __('Ding');

        // ------------------- Mobile Number Buttons -------------------
        if (frm.doc.mobile_no) {
            frm.add_custom_button("📞 Ding Mobile", function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.mobile_no;
            }, dingGroup);

            frm.add_custom_button("<i class='fa fa-whatsapp'></i> WhatsApp Mobile", function () {
                window.open('https://wa.me/' + frm.doc.mobile_no, '_blank');
            }, dingGroup);
        }

        // ------------------- Phone Number Buttons -------------------
        if (frm.doc.phone) {
            frm.add_custom_button("📞 Ding Phone", function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.phone;
            }, dingGroup);

            frm.add_custom_button("<i class='fa fa-whatsapp'></i> WhatsApp Phone", function () {
                window.open('https://wa.me/' + frm.doc.phone, '_blank');
            }, dingGroup);
        }

        // ------------------- Call Logs -------------------
        if (!frm.doc.mobile_no && !frm.doc.phone) {
            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });
        } else {

            frm.add_custom_button("<i class='fa fa-phone'></i> Ding Log", function () {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            }, dingGroup);

            frm.add_custom_button("<i class='fa fa-list'></i> Call Logs", function () {
                if (frm.doc.mobile_no) {
                    let route = '/app/ding-call-logs?mobile_no=' + encodeURIComponent(frm.doc.mobile_no);
                    window.open(route, '_blank');
                } else {
                    frappe.msgprint(__('Mobile number is missing.'));
                }
            }, dingGroup);
        }

        // ------------------- Field Meet + Geolocation -------------------
        var hasLocation = frm.doc.lead_geolocation;

        if (hasLocation) {
            frm.add_custom_button("Field Meet", function () {
                frappe.new_doc('Lead Meet', { lead: frm.doc.name });
            }, dingGroup);
        } else {
            frappe.show_alert({
                message: __("Lead Location Missing. Ding Field Meet not available."),
                indicator: 'orange'
            });
        }

        frm.add_custom_button(hasLocation ? "Update Location" : "Add Missing GeoLocation", function () {
            frappe.confirm(
                hasLocation ? __('Do you want to update your current location?') : __('Do you want to log your current location?'),
                function () {
                    navigator.geolocation.getCurrentPosition(function (position) {
                        var latitude = position.coords.latitude;
                        var longitude = position.coords.longitude;
                        frm.set_value('lead_geolocation', latitude + ',' + longitude);

                        frappe.show_alert({
                            message: hasLocation ? __('Location updated successfully.') : __('Location logged successfully.'),
                            indicator: 'green'
                        });
                    }, function () {
                        frappe.show_alert({
                            message: __('Failed to fetch location. Please try again.'),
                            indicator: 'red'
                        });
                    });
                }
            );
        }, dingGroup);
    },

    validate: function (frm) {
        let mobile = frm.doc.mobile_no;
        let phone = frm.doc.phone;
        let whatsapp = frm.doc.whatsapp_no;

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
