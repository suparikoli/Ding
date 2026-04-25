let _dingSettingsPromise = null;
function getDingSettings() {
    if (!_dingSettingsPromise) {
        _dingSettingsPromise = frappe.db.get_doc('Ding Settings');
    }
    return _dingSettingsPromise;
}

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
            audio.play().catch(err => console.debug('Ding notification sound blocked:', err));
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

            // ------------------- WhatsApp Company Profile + Pricelist (from Ding Settings) -------------------
            getDingSettings().then(settings => {
                const greetingName = frm.doc.lead_name;

                if (frm.doc.mobile_no && settings.company_profile_url) {
                    frm.add_custom_button("📄 Company Profile (WhatsApp)", function () {
                        const lines = [
                            `Hi ${greetingName || ''}, this is the link to our company profile.`,
                            settings.company_profile_url,
                        ];
                        if (settings.company_website_url) {
                            lines.push('', 'Here is the link to our company website:', settings.company_website_url);
                        }
                        if (settings.ecommerce_url) {
                            lines.push('', 'And for eCommerce visit:', settings.ecommerce_url);
                        }
                        const url = "https://wa.me/" + frm.doc.mobile_no + "?text=" + encodeURIComponent(lines.join('\n'));
                        window.open(url, "_blank");
                    }, dingGroup);
                }

                if (frm.doc.mobile_no && settings.price_list_url) {
                    frm.add_custom_button("💰 Price List (WhatsApp)", function () {
                        const msg = `Hi ${greetingName || ''}, here is the latest pricelist.\n${settings.price_list_url}`;
                        const url = "https://wa.me/" + frm.doc.mobile_no + "?text=" + encodeURIComponent(msg);
                        window.open(url, "_blank");
                    }, dingGroup);
                }
            });
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

        // ------------------- Plan visit (adds to today's Day Plan) -------------------
        frm.add_custom_button("📅 Plan visit", function () {
            dingPromptPlanVisit('Lead', frm.doc.name);
        }, dingGroup);

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

window.dingPromptPlanVisit = window.dingPromptPlanVisit || function (clientDoctype, clientName) {
    const dialog = new frappe.ui.Dialog({
        title: __('Plan a visit'),
        fields: [
            { label: __('Date'), fieldname: 'plan_date', fieldtype: 'Date', default: frappe.datetime.get_today(), reqd: 1 },
            { label: __('Agent'), fieldname: 'agent', fieldtype: 'Link', options: 'User', default: frappe.session.user, reqd: 1 },
            { label: __('Visit Type'), fieldname: 'visit_type', fieldtype: 'Select',
              options: 'Sales\nDemo\nService\nDelivery\nCollection\nSurvey\nOther', default: 'Sales' },
            { label: __('Objective'), fieldname: 'objective', fieldtype: 'Small Text' },
        ],
        primary_action_label: __('Add to plan'),
        primary_action: function (values) {
            frappe.call({
                method: 'ding.field_sales.api.add_to_day_plan',
                args: {
                    client_doctype: clientDoctype,
                    client_name: clientName,
                    agent: values.agent,
                    plan_date: values.plan_date,
                    visit_type: values.visit_type,
                    objective: values.objective || ''
                },
                callback: function (r) {
                    dialog.hide();
                    if (r.message && r.message.plan_name) {
                        const verb = r.message.added ? __('Added to plan') : __('Already on plan');
                        frappe.show_alert({ message: verb, indicator: 'green' });
                        frappe.set_route('Form', 'Day Plan', r.message.plan_name);
                    }
                }
            });
        }
    });
    dialog.show();
};
