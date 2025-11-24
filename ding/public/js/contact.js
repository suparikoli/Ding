frappe.ui.form.on('Contact', {
    refresh: function (frm) {

        // ------------------- Utility: Create Ding Call Logs -------------------
        function createDingCallLogs(contactName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Contact';
            new_log.reference_docname = contactName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';

            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        // ------------------- Utility: Play Notification Sound -------------------
        function playNotificationSound() {
            const audio = new Audio('/assets/frappe/sounds/ting.mp3');
            audio.play().catch(() => {});
        }

        var isNewDocument = frm.doc.__islocal;

        // Create parent dropdown group
        const dingGroup = __('Ding');

        // ------------------- Phone & Mobile Checks -------------------
        if (!isNewDocument && (!frm.doc.mobile_no && !frm.doc.phone)) {

            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });

        } else if (!isNewDocument) {

            frm.add_custom_button('<i class="fa fa-phone"></i> Ding Log', function () {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            }, dingGroup);

            frm.add_custom_button('<i class="fa fa-list"></i> Call Logs', function () {
                if (frm.doc.mobile_no) {
                    let route = '/app/ding-call-logs?mobile_no=' + encodeURIComponent(frm.doc.mobile_no);
                    window.open(route, '_blank');
                } else {
                    frappe.msgprint(__('Mobile number is missing.'));
                }
            }, dingGroup);
        }

        // ------------------- Ding Mobile & WhatsApp Buttons -------------------
        if (frm.doc.mobile_no) {

            frm.add_custom_button("📞 Ding Mobile", function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.mobile_no;
            }, dingGroup);

            frm.add_custom_button('<i class="fa fa-whatsapp"></i> WhatsApp Mobile', function () {
                window.open('https://wa.me/' + frm.doc.mobile_no, '_blank');
            }, dingGroup);
        }

        if (frm.doc.phone) {

            frm.add_custom_button("📞 Ding Phone", function () {
                playNotificationSound();
                window.location.href = 'tel:' + frm.doc.phone;
            }, dingGroup);

            frm.add_custom_button('<i class="fa fa-whatsapp"></i> WhatsApp Phone', function () {
                window.open('https://wa.me/' + frm.doc.phone, '_blank');
            }, dingGroup);
        }

        // ------------------- GeoLocation Buttons -------------------
        var hasLocation = frm.doc.contact_geolocation;

        if (!isNewDocument) {

            if (hasLocation) {
                frm.add_custom_button("Field Meet", function () {
                    frappe.new_doc('Contact Meet', { contact: frm.doc.name });
                }, dingGroup);
            } else {
                frappe.show_alert({
                    message: __("Contact Location Missing. Ding Field Meet not available."),
                    indicator: 'orange'
                });
            }

            frm.add_custom_button(hasLocation ? "Update Location" : "Add Missing GeoLocation", function () {

                frappe.confirm(
                    hasLocation
                        ? __('Do you want to update your current location?')
                        : __('Do you want to log your current location?'),

                    function () {

                        navigator.geolocation.getCurrentPosition(function (position) {

                            var latitude = position.coords.latitude;
                            var longitude = position.coords.longitude;
                            var geolocation = latitude + ',' + longitude;

                            frm.set_value('contact_geolocation', geolocation);

                            frappe.show_alert({
                                message: hasLocation
                                    ? __('Location updated successfully.')
                                    : __('Location logged successfully.'),
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
        }
    }
});
