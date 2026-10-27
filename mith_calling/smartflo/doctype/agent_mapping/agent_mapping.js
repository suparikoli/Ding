// Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
// For license information, please see license.txt
//
// agent_mapping.js — UI controller for the Agent Mapping form
//
// === Flow summary ===
//
// PSTN mode (test_pstn_call):
//   prompt(dest) → frappe.call(PSTN_HANDLER) → check r.message._status
//     success      → brief toast (no popup widget)
//     agent_offline → MsgBox with link to cloudphone.tatateleservices.com
//     error         → frappe.throw with the error message
//
// WebRTC mode (test_softphone_call):
//   getUserMedia({audio}) → [denied → stop with guidance message]
//   → enumerateDevices    → check_agent_online via python
//   → [offline → MsgBox with cloudphone link]
//   → prompt(dest)        → show_webrtc_call_dialog()
//   → inside dialog, frappe.call(WEBRTC_HANDLER) → update status area
//   → Mute / End Call / Transfer actions operate on live call

// ── Python module paths ────────────────────────────────────────────────────
const WEBRTC_HANDLER = "mith_calling.smartflo.doctype.agent_mapping.webrtc_dialer.test_softphone_call";
const PSTN_HANDLER = "mith_calling.smartflo.doctype.agent_mapping.pstn_dialer.test_pstn_call";
const WEBRTC_ONLINE_CHECK = "mith_calling.smartflo.doctype.agent_mapping.webrtc_dialer.check_agent_online";
const HANGUP_HANDLER = "mith_calling.smartflo.api.client.hangup_call";
const TRANSFER_HANDLER = "mith_calling.smartflo.api.client.call_operation";
const CLOUDPHONE_URL = "https://cloudphone.tatateleservices.com/";

// ── Frappe form events ─────────────────────────────────────────────────────
frappe.ui.form.on("Agent Mapping", {

    refresh(frm) {
        toggle_routing_fields(frm);
    },

    device_type(frm) {
        toggle_routing_fields(frm);
    },

    // ── WebRTC test button ─────────────────────────────────────────────────
    test_softphone_call(frm) {
        if (!frm.doc.smartflo_agent_id) {
            frappe.msgprint({
                title: __("Configuration Required"),
                indicator: "orange",
                message: __("Please enter the Agent Extension ID before testing the Softphone call."),
            });
            return;
        }
        start_webrtc_call_flow(frm);
    },

    // ── PSTN test button ───────────────────────────────────────────────────
    test_pstn_call(frm) {
        if (!frm.doc.call_forward_number) {
            frappe.msgprint({
                title: __("Configuration Required"),
                indicator: "orange",
                message: __("Please enter the Call Forwarding Number before testing the PSTN call."),
            });
            return;
        }
        start_pstn_call_flow(frm);
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// PSTN FLOW
// ═══════════════════════════════════════════════════════════════════════════

function start_pstn_call_flow(frm) {
    frappe.prompt(
        [{
            label: __("Destination Number"),
            fieldname: "destination_number",
            fieldtype: "Phone",
            reqd: 1,
            description: __("Number to dial via PSTN (mobile/landline)"),
        }],
        (values) => {
            frappe.call({
                method: PSTN_HANDLER,
                args: {
                    agent_mapping_name: frm.doc.name,
                    destination_number: values.destination_number,
                },
                freeze: true,
                freeze_message: __("Initiating PSTN call via Smartflo…"),
                callback(r) {
                    const msg = r.message || {};
                    if (r.exc) {
                        // Hard server error (500 etc.) — show generic alert
                        frappe.msgprint({
                            title: __("PSTN Call Error"),
                            indicator: "red",
                            message: __("The call request failed. Check the Frappe error log for details."),
                        });
                        return;
                    }
                    handle_pstn_response(msg, values.destination_number);
                },
            });
        },
        __("Test PSTN Call"),
        __("Call Now")
    );
}

function handle_pstn_response(msg, destination_number) {
    switch (msg._status) {

        case "success":
            // PSTN: no popup widget — just a brief informational toast
            frappe.show_alert({
                message: __("PSTN call to {0} initiated. Your forwarding number will ring shortly.", [destination_number]),
                indicator: "green",
            }, 6);
            break;

        case "agent_offline":
            // Show the offline guidance with the cloudphone link
            frappe.msgprint({
                title: __("Agent Device Unreachable"),
                indicator: "orange",
                message: `
                    <p>${__(msg._message || "Your PSTN device could not be reached.")}</p>
                    <p style="margin-top:12px;">
                        ${__("Please log in to the Smartflo cloud phone portal and ensure your device is online:")}
                    </p>
                    <p style="margin-top:8px;">
                        <a href="${CLOUDPHONE_URL}" target="_blank" class="btn btn-sm btn-primary">
                            🔗 ${__("Open Smartflo CloudPhone")}
                        </a>
                    </p>
                `,
            });
            break;

        case "error":
        default:
            frappe.msgprint({
                title: __("PSTN Call Failed"),
                indicator: "red",
                message: msg._message || __("An unexpected error occurred."),
            });
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBRTC FLOW  — online check → prompt → click-to-call → softphone panel
// ═══════════════════════════════════════════════════════════════════════════

function start_webrtc_call_flow(frm) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        frappe.msgprint({
            title: __("Browser Not Supported"),
            indicator: "red",
            message: __("Your browser does not support audio devices. Please use a modern browser like Chrome or Firefox."),
        });
        return;
    }

    // 1. Ask for Microphone/Speaker Permissions explicitly.
    // Even though audio is handled by the CloudPhone tab, the user requested
    // an explicit prompt here for security/assurance.
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
            // Permission granted. We don't actually need the stream in this tab,
            // so we immediately stop its tracks to release the hardware lock.
            stream.getTracks().forEach(t => t.stop());

            // 2. Check if the agent is registered with Smartflo PBX
            frappe.call({
                method: WEBRTC_ONLINE_CHECK,
                args: { agent_mapping_name: frm.doc.name },
                callback(r) {
                    const status = r.message || { online: true };

                    if (!status.online) {
                        // 3a. Agent is offline. Show a WARNING but DO NOT BLOCK.
                        // They might just need to open the tab now.
                        frappe.msgprint({
                            title: __("CloudPhone Not Registered"),
                            indicator: "orange",
                            message: `
                                <p>${__("Your WebRTC extension currently appears offline.")}</p>
                                <p style="margin-top:12px;">
                                    ${__("Please ensure the Smartflo CloudPhone portal is open in another tab before answering:")}
                                </p>
                                <p style="margin-top:8px; margin-bottom: 12px;">
                                    <a href="${CLOUDPHONE_URL}" target="_blank" class="btn btn-sm btn-primary">
                                        🔗 ${__("Open Smartflo CloudPhone")}
                                    </a>
                                </p>
                            `,
                        });
                    }

                    // 3b. Proceed to ask for destination number regardless of online status
                    prompt_for_webrtc_dest(frm);
                }
            });
        })
        .catch(function (err) {
            // Permission denied or hardware missing
            frappe.msgprint({
                title: __("Microphone Required"),
                indicator: "red",
                message: __("You must allow microphone access to make Softphone calls.<br><br>Error: ") + err.message,
            });
        });
}

function prompt_for_webrtc_dest(frm) {
    frappe.prompt(
        [{
            label: __("Destination Number"),
            fieldname: "destination_number",
            fieldtype: "Phone",
            reqd: 1,
            description: __("Number to dial — you will receive the call on your Smartflo CloudPhone"),
        }],
        (values) => fire_webrtc_call(frm, values.destination_number),
        __("Softphone Call"),
        __("Call")
    );
}

function fire_webrtc_call(frm, destination_number) {
    console.log("[Smartflo WebRTC] Initiating outbound call to:", destination_number);

    // Show the softphone panel immediately (optimistic UI)
    if (window.smartflo_webrtc && window.smartflo_webrtc.show_panel_for_outbound) {
        console.log("[Smartflo WebRTC] Found window.smartflo_webrtc, calling show_panel_for_outbound");
        window.smartflo_webrtc.show_panel_for_outbound(destination_number);
    } else {
        console.warn("[Smartflo WebRTC] window.smartflo_webrtc.show_panel_for_outbound NOT FOUND!");
        frappe.show_alert({
            message: __("Softphone UI script not fully loaded. Please refresh."),
            indicator: "orange"
        }, 5);
    }

    // Fire Smartflo click-to-call API — Smartflo will ring the agent's SIP
    // extension, which webrtc_phone.js will receive and let the agent answer
    frappe.call({
        method: WEBRTC_HANDLER,
        args: {
            agent_mapping_name: frm.doc.name,
            destination_number: destination_number,
        },
        callback(r) {
            const msg = r.message || {};
            if (r.exc || msg._status === "error") {
                frappe.msgprint({
                    title: __("Call Failed"),
                    indicator: "red",
                    message: msg._message || __("An unexpected error occurred. Check the error log."),
                });
                if (window.smartflo_webrtc && window.smartflo_webrtc.close) {
                    window.smartflo_webrtc.close();
                }
            } else {
                // On success: Smartflo API accepted the call. We know the UUID now.
                // We transition the panel to 'Active' so the Mute and Transfer buttons show up.
                const uuid = msg.uuid || msg.request_id || null;
                if (window.smartflo_webrtc && window.smartflo_webrtc.set_active) {
                    console.log("[Smartflo WebRTC] Call accepted, setting panel to active state");
                    window.smartflo_webrtc.set_active(uuid);
                }
            }
        },
    });
}

// ── Field visibility helper ────────────────────────────────────────────────

function toggle_routing_fields(frm) {
    const is_softphone = frm.doc.device_type === "Softphone (WebRTC)";
    const is_pstn = frm.doc.device_type === "PSTN (Mobile/Landline)";

    frm.toggle_display("smartflo_agent_id", is_softphone);
    frm.toggle_reqd("smartflo_agent_id", is_softphone);

    frm.toggle_display("call_forward_number", is_pstn);
    frm.toggle_reqd("call_forward_number", is_pstn);
}
