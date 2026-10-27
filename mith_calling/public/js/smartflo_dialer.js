// Global Injector for CRM Forms
['Lead', 'Customer', 'Contact', 'Opportunity'].forEach(doctype => {
    frappe.ui.form.on(doctype, {
        refresh: function (frm) {
            let phone_field = frm.doc.mobile_no || frm.doc.phone || frm.doc.whatsapp_no;

            if (!frm.is_new() && frappe.session.user !== "Administrator") {
                frappe.call({
                    method: 'mith_calling.smartflo.doctype.agent_mapping.agent_mapping.get_phone_mask_setting',
                    callback: function (r) {
                        if (r.message && r.message.hide_field) {
                            const fields_to_hide = ['mobile_no', 'phone', 'whatsapp_no'];
                            fields_to_hide.forEach(f => {
                                if (frm.fields_dict[f]) {
                                    frm.set_df_property(f, 'hidden', 1);
                                }
                            });
                        }
                    }
                });
            }

            const dropdown_label = __('Call using Smartflo');
            const dial_number = (number) => {
                if (!number) return;

                frappe.call({
                    method: "mith_calling.smartflo.api.client.initiate_outbound_call",
                    args: {
                        number: number.replace(/\D/g, ''),
                        reference_doctype: frm.doctype,
                        reference_name: frm.doc.name
                    }
                });
            };

            if (frm.doc.phone) {
                frm.add_custom_button(__('Call Phone'), () => dial_number(frm.doc.phone), dropdown_label);
            }
            if (frm.doc.mobile_no) {
                frm.add_custom_button(__('Call Mobile'), () => dial_number(frm.doc.mobile_no), dropdown_label);
            }
            if (frm.doc.whatsapp_no) {
                frm.add_custom_button(__('Call WhatsApp Number'), () => dial_number(frm.doc.whatsapp_no), dropdown_label);
            }
        }
    });
});
