// Copyright (c) 2026, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Visit Plan Template', {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Apply to Day Plan'), function() {
                const dialog = new frappe.ui.Dialog({
                    title: __('Apply Template to Day Plan'),
                    fields: [
                        { label: __('Date'), fieldname: 'plan_date', fieldtype: 'Date',
                          default: frappe.datetime.get_today(), reqd: 1 },
                        { label: __('Agent'), fieldname: 'agent', fieldtype: 'Link',
                          options: 'User',
                          default: frm.doc.default_assignee || frappe.session.user, reqd: 1 }
                    ],
                    primary_action_label: __('Apply'),
                    primary_action: function(values) {
                        frm.call({
                            method: 'apply_to_day_plan',
                            args: {
                                plan_date: values.plan_date,
                                agent: values.agent
                            },
                            callback: function(r) {
                                dialog.hide();
                                if (r.message) {
                                    frappe.set_route('Form', 'Day Plan', r.message);
                                }
                            }
                        });
                    }
                });
                dialog.show();
            });
        }
    }
});
