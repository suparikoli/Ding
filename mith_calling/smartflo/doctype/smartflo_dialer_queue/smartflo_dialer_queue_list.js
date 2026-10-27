// Smartflo Dialer Queue List Script

frappe.listview_settings['Smartflo Dialer Queue'] = {
    add_fields: ["status", "agent", "phone_number", "target_type", "target_name", "priority"],

    get_indicator: function (doc) {
        if (doc.status === "Pending") {
            return [__("Pending"), "orange", "status,=,Pending"];
        } else if (doc.status === "Dialing") {
            return [__("Dialing"), "blue", "status,=,Dialing"];
        } else if (doc.status === "Completed") {
            return [__("Completed"), "green", "status,=,Completed"];
        } else if (doc.status === "Failed") {
            return [__("Failed"), "red", "status,=,Failed"];
        }
    },

    onload: function (listview) {
        listview.page.add_inner_button(__("Start Auto Dialer"), function () {
            start_auto_dialer(listview);
        }, __("Smartflo"));
    }
};

function start_auto_dialer(listview) {
    if (!listview.data || listview.data.length === 0) {
        frappe.msgprint(__("No numbers in the queue to dial."));
        return;
    }

    let pending_calls = listview.data.filter(d => d.status === "Pending" || d.status === "Failed");

    if (pending_calls.length === 0) {
        frappe.msgprint(__("No pending calls to dial."));
        return;
    }

    // Auto Dialer Controller Scope
    let current_call_index = 0;

    let dial_next = function () {
        if (current_call_index >= pending_calls.length) {
            frappe.msgprint(__("Auto Dialer Finished."));
            listview.refresh();
            return;
        }

        let call_doc = pending_calls[current_call_index];

        frappe.confirm(`Calling ${call_doc.target_name} (${call_doc.phone_number})... Proceed?`, () => {
            frappe.call({
                method: "mith_calling.smartflo.doctype.smartflo_dialer_queue.smartflo_dialer_queue.initiate_call",
                doc: call_doc,
                callback: function (r) {
                    if (!r.exc) {
                        frappe.show_alert({ message: __("Call Initiated"), indicator: "blue" });
                        // Mark current as complete, wait for disposition logic
                        current_call_index++;
                        listview.refresh();

                        // We would typically listen to websocket for hangup to trigger the next dial here.
                        // For now, we wait 5 seconds and dial next for demonstration
                        // setTimeout(dial_next, 5000); 
                    }
                }
            });
        }, () => {
            // Cancelled by user, stop dialer
            frappe.msgprint(__("Auto Dialer Stopped."));
        });
    };

    // Start sequence
    dial_next();
}
