// Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
// For license information, please see license.txt

frappe.ui.form.on("Smartflo Settings", {
	refresh(frm) {
		// Add refresh logic here if needed
	},

	test_api_connection(frm) {
		if (!frm.doc.api_token) {
			frappe.msgprint(__("Please save the API Token first."));
			return;
		}

		frm.call({
			method: "test_smartflo_connection",
			doc: frm.doc,
			freeze: true,
			freeze_message: __("Testing Connection..."),
			callback: function (r) {
				if (!r.exc) {
					console.log(r.message);
				}
			}
		});
	}
});
