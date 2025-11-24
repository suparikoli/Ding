frappe.ui.form.on('Customer', {
    refresh: function (frm) {

        // ------------------- Utility: Create Ding Call Logs -------------------
        function createDingCallLogs(customerName, mobileNo, phoneNo) {
            var new_log = frappe.model.get_new_doc('Ding Call Logs');
            new_log.reference_doctype = 'Customer';
            new_log.reference_docname = customerName;
            new_log.mobile_no = mobileNo;
            new_log.phone = phoneNo;
            new_log.type = 'Outgoing';
            frappe.set_route('Form', 'Ding Call Logs', new_log.name);
        }

        // ------------------- Utility: Play Notification Sound -------------------
        function playNotificationSound() {
            const audio = new Audio('/assets/frappe/sounds/ting.mp3');
            audio.play().catch(() => { });
        }

        var isNewDocument = frm.doc.__islocal;

        // Create parent dropdown
        const dingGroup = __('Ding');

        // ------------------- Phone & Mobile Checks -------------------
        if (!isNewDocument && (!frm.doc.mobile_no && !frm.doc.phone)) {
            frappe.show_alert({
                message: __("Phone and Mobile number are missing. Ding can't place calls."),
                indicator: 'red'
            });
        } else if (!isNewDocument) {

            // Ding Log
            frm.add_custom_button('<i class="fa fa-phone"></i> Ding Log', function () {
                createDingCallLogs(frm.doc.name, frm.doc.mobile_no, frm.doc.phone);
            }, dingGroup);

            // Call Logs List Button
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

            // ------------------- WhatsApp Company Profile -------------------
            if (frm.doc.mobile_no) {
                frm.add_custom_button("📄 Company Profile (WhatsApp)", function () {
                    let msg =
                        `Hi ${frm.doc.lead_name}, this is the link to our company profile.\n` +
                        `https://static.polemarch.in/polemarch.pdf\n\n` +
                        `Here is the link to our company website:\n` +
                        `https://polemarch.in\n\n` +
                        `And for eCommerce visit:\n` +
                        `https://deals.polemarch.in`;

                    let url = "https://wa.me/" + frm.doc.mobile_no + "?text=" + encodeURIComponent(msg);
                    window.open(url, "_blank");
                }, dingGroup);
            }

            // ------------------- WhatsApp Pricelist -------------------
            if (frm.doc.mobile_no) {
                frm.add_custom_button("💰 Price List (WhatsApp)", function () {
                    let msg =
                        `Hi ${frm.doc.lead_name}, here is the latest pricelist.\n` +
                        `https://static.polemarch.in/price-list.pdf`;

                    let url = "https://wa.me/" + frm.doc.mobile_no + "?text=" + encodeURIComponent(msg);
                    window.open(url, "_blank");
                }, dingGroup);
            }
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
        var hasLocation = frm.doc.customer_geolocation;

        if (!isNewDocument) {

            if (hasLocation) {
                frm.add_custom_button("Field Meet", function () {
                    frappe.new_doc('Customer Meet', {
                        customer: frm.doc.name
                    });
                }, dingGroup);
            } else {
                frappe.show_alert({
                    message: __("Customer Location Missing. Ding Field Meet not available."),
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

                            frm.set_value('customer_geolocation', geolocation);

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
