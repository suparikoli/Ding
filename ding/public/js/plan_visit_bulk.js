// Copyright (c) 2026, manoj and contributors
// "Plan today" bulk action on Lead/Customer/Contact list views.
//
// Select multiple records → menu → "Add to Day Plan…" → pick agent + date
// + visit type → all selected are appended to that Day Plan (creating one
// if none exists for the agent on that date). Idempotent — clients already
// on the plan are skipped.

(function () {
    'use strict';

    function registerBulkAction(doctype, frappeDoctypeName) {
        const settings = frappe.listview_settings[doctype] || {};
        const prevOnload = settings.onload;
        settings.onload = function (listview) {
            if (typeof prevOnload === 'function') prevOnload(listview);
            listview.page.add_actions_menu_item(__('Add to Day Plan…'), function () {
                const selected = listview.get_checked_items();
                if (!selected || !selected.length) {
                    frappe.msgprint(__('Select one or more rows first.'));
                    return;
                }
                openBulkDialog(frappeDoctypeName, selected.map((s) => s.name));
            });
        };
        frappe.listview_settings[doctype] = settings;
    }

    function openBulkDialog(clientDoctype, names) {
        const dialog = new frappe.ui.Dialog({
            title: __('Add {0} {1} to a Day Plan', [names.length, clientDoctype.toLowerCase() + 's']),
            fields: [
                { label: __('Date'), fieldname: 'plan_date', fieldtype: 'Date',
                  default: frappe.datetime.get_today(), reqd: 1 },
                { label: __('Agent'), fieldname: 'agent', fieldtype: 'Link', options: 'User',
                  default: frappe.session.user, reqd: 1 },
                { label: __('Visit Type'), fieldname: 'visit_type', fieldtype: 'Select',
                  options: 'Sales\nDemo\nService\nDelivery\nCollection\nSurvey\nOther',
                  default: 'Sales' },
                { label: __('Objective (applied to each stop)'), fieldname: 'objective',
                  fieldtype: 'Small Text' }
            ],
            primary_action_label: __('Add {0} stops', [names.length]),
            primary_action: function (values) {
                dialog.disable_primary_action();
                let lastPlan = null;
                let added = 0;
                let skipped = 0;
                const tasks = names.map((name) =>
                    frappe.call({
                        method: 'ding.field_sales.api.add_to_day_plan',
                        args: {
                            client_doctype: clientDoctype,
                            client_name: name,
                            agent: values.agent,
                            plan_date: values.plan_date,
                            visit_type: values.visit_type,
                            objective: values.objective || ''
                        }
                    }).then((r) => {
                        if (r.message) {
                            lastPlan = r.message.plan_name || lastPlan;
                            if (r.message.added) added += 1; else skipped += 1;
                        }
                    })
                );
                Promise.all(tasks).then(() => {
                    dialog.hide();
                    frappe.show_alert({
                        message: __('{0} added · {1} already on plan', [added, skipped]),
                        indicator: 'green'
                    });
                    if (lastPlan) {
                        frappe.set_route('Form', 'Day Plan', lastPlan);
                    }
                });
            }
        });
        dialog.show();
    }

    if (typeof frappe !== 'undefined' && frappe.listview_settings) {
        registerBulkAction('Lead', 'Lead');
        registerBulkAction('Customer', 'Customer');
        registerBulkAction('Contact', 'Contact');
    }
})();
