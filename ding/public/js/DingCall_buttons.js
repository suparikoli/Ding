// Function to play the notification sound
function playNotificationSound() {
    var audio = new Audio('https://e15.justsigns.co.in/files/callsound.mp3');
    audio.play();
}

frappe.ui.form.on('Contact', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Customer', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Lead', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Opportunity', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Prospect', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Suspect', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

frappe.ui.form.on('Ding Call Logs', {
    refresh: function (frm) {
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });
        }

    }
});

