// Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
// For license information, please see license.txt
//
// webrtc_phone.js — Smartflo Call Notification Panel
//
// Displays a premium fixed-position call panel for:
//   • Inbound calls  — via frappe.realtime 'smartflo_incoming_call' event
//   • Outbound calls — via window.smartflo_webrtc.show_panel_for_outbound()

(function () {
    "use strict";

    console.log("[Smartflo WebRTC] Loading webrtc_phone.js...");

    const CALL_OP_API = "mith_calling.smartflo.api.client.call_operation";
    const AGENTS_API = "mith_calling.smartflo.doctype.agent_mapping.webrtc_dialer.get_agent_users";

    var _panel_el = null;
    var _timer_iv = null;
    var _call_secs = 0;
    var _is_muted = false;
    var _call_ref_id = null;

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API — defined FIRST so it's always available on window,
    // even if the Frappe realtime hooks below fail.
    // ═══════════════════════════════════════════════════════════════════════
    window.smartflo_webrtc = {
        show_panel_for_outbound: function (dest_number, ref_id) {
            console.log("[Smartflo WebRTC] show_panel_for_outbound called:", dest_number, ref_id);
            _call_ref_id = ref_id || null;
            show_panel("outbound", dest_number);
        },
        set_active: function (ref_id) {
            console.log("[Smartflo WebRTC] set_active called:", ref_id);
            _call_ref_id = ref_id || _call_ref_id;
            set_state("active", _panel_el && _panel_el.dataset.label);
            start_timer();
        },
        close: function () {
            console.log("[Smartflo WebRTC] close called");
            stop_timer();
            auto_close(0);
        },
    };

    console.log("[Smartflo WebRTC] window.smartflo_webrtc initialized:", window.smartflo_webrtc);

    // ── Inbound call realtime listener ───────────────────────────────────────
    function init_realtime() {
        console.log("[Smartflo WebRTC] init_realtime attempt...");
        try {
            if (typeof frappe === "undefined") {
                console.log("[Smartflo WebRTC] frappe is undefined, skipping realtime init");
                return;
            }
            if (frappe.session && frappe.session.user === "Guest") {
                console.log("[Smartflo WebRTC] user is Guest, skipping realtime init");
                return;
            }
            console.log("[Smartflo WebRTC] Binding smartflo_incoming_call event");
            frappe.realtime.on("smartflo_incoming_call", function (msg) {
                console.log("[Smartflo WebRTC] smartflo_incoming_call event received:", msg);
                var caller = (msg && (msg.caller || msg.from)) || "Unknown";
                _call_ref_id = (msg && (msg.uuid || msg.call_id)) || null;

                // Only automatically show the popup for INCOMING calls.
                // Outbound calls should remain silent as per user requirements.
                if (msg.direction === "Incoming") {
                    show_panel("incoming", caller);
                }
            });
        } catch (e) {
            console.error("[Smartflo WebRTC] Error in init_realtime:", e);
        }
    }

    // Try immediately and also after Frappe finishes loading
    init_realtime();
    if (typeof frappe !== "undefined" && frappe.after_ajax) {
        frappe.after_ajax(init_realtime);
    } else {
        // Plain DOM fallback
        window.addEventListener("load", init_realtime);
    }

    // ══════════════════════════════════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════════════════════════════════
    var PANEL_CSS = [
        "#sflo-phone-panel{position:fixed;bottom:24px;right:24px;width:280px;",
        "border-radius:20px;background:rgba(15,20,35,0.95);",
        "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);",
        "box-shadow:0 24px 64px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.08);",
        "color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
        "z-index:99999;overflow:hidden;",
        "transform:translateY(130%);opacity:0;",
        "transition:transform .38s cubic-bezier(.34,1.56,.64,1),opacity .25s ease;",
        "user-select:none;}",

        "#sflo-phone-panel.sflo-visible{transform:translateY(0);opacity:1;}",

        ".sflo-header{padding:22px 20px 0;text-align:center;}",

        ".sflo-avatar{width:64px;height:64px;border-radius:50%;margin:0 auto 12px;",
        "display:flex;align-items:center;justify-content:center;font-size:28px;",
        "background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);",
        "box-shadow:0 4px 20px rgba(102,126,234,.4);}",

        ".sflo-avatar.sflo-ringing{animation:sflo-pulse 1.1s ease-in-out infinite;}",
        "@keyframes sflo-pulse{0%,100%{box-shadow:0 0 0 0 rgba(102,126,234,.7);}",
        "55%{box-shadow:0 0 0 22px rgba(102,126,234,0);}}",

        ".sflo-caller{font-size:19px;font-weight:700;letter-spacing:-.3px;margin-bottom:4px;}",
        ".sflo-status{font-size:11px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}",
        ".sflo-timer{font-size:14px;font-weight:600;color:#4ade80;min-height:20px;margin-bottom:4px;letter-spacing:.5px;}",
        ".sflo-hint{font-size:11px;color:rgba(255,255,255,.35);margin:4px 0 0;padding:0 10px;line-height:1.4;}",
        ".sflo-sep{height:1px;background:rgba(255,255,255,.07);margin:14px 0 0;}",

        // Circular button row
        ".sflo-btn-row{display:flex;justify-content:space-around;align-items:flex-start;",
        "padding:18px 12px 22px;gap:8px;}",
        ".sflo-btn-row.sflo-two{justify-content:center;gap:48px;}",

        ".sflo-bw{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;}",
        ".sflo-bw span{font-size:10.5px;color:rgba(255,255,255,.5);letter-spacing:.3px;",
        "font-family:inherit;text-align:center;}",

        // The circle
        ".sflo-c{width:58px;height:58px;border-radius:50%;",
        "background:rgba(255,255,255,.1);border:none;",
        "display:flex;align-items:center;justify-content:center;",
        "cursor:pointer;padding:0;color:rgba(255,255,255,.9);",
        "transition:background .15s,transform .1s,box-shadow .15s;}",
        ".sflo-c:hover{background:rgba(255,255,255,.18);box-shadow:0 4px 16px rgba(0,0,0,.3);}",
        ".sflo-c:active{transform:scale(.91);}",
        ".sflo-c svg{width:24px;height:24px;stroke:currentColor;stroke-width:1.8;",
        "fill:none;stroke-linecap:round;stroke-linejoin:round;}",

        // Variants
        ".sflo-c-end{background:#ef4444;color:#fff;box-shadow:0 6px 20px rgba(239,68,68,.45);}",
        ".sflo-c-end:hover{background:#dc2626;}",
        ".sflo-c-ans{background:#22c55e;color:#fff;width:66px;height:66px;",
        "box-shadow:0 6px 20px rgba(34,197,94,.45);}",
        ".sflo-c-ans:hover{background:#16a34a;}",
        ".sflo-c-mute-on{background:rgba(250,204,21,.25);color:#fbbf24;}",
        ".sflo-c-cp{background:rgba(102,126,234,.25);color:#a5b4fc;}",
        ".sflo-c-cp:hover{background:rgba(102,126,234,.45);}",

        // Transfer area
        ".sflo-xfer{padding:0 18px 16px;display:none;}",
        ".sflo-xfer.sflo-open{display:block;}",
        ".sflo-xfer select{width:100%;background:rgba(255,255,255,.1);",
        "border:1px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;",
        "padding:8px 12px;font-size:12.5px;margin-bottom:8px;appearance:none;cursor:pointer;}",
        ".sflo-xfer select option{background:#1e2535;}",
        ".sflo-xfer-go{width:100%;background:rgba(102,126,234,.25);",
        "border:1px solid rgba(102,126,234,.45);border-radius:10px;color:#a5b4fc;",
        "padding:8px;font-size:12.5px;font-family:inherit;cursor:pointer;",
        "transition:background .15s;display:flex;align-items:center;justify-content:center;gap:6px;}",
        ".sflo-xfer-go:hover{background:rgba(102,126,234,.45);}",

        ".sflo-end-msg{padding:18px 20px;text-align:center;",
        "color:rgba(255,255,255,.45);font-size:13px;}"
    ].join("");

    // ══════════════════════════════════════════════════════════════════════
    // SVG Icons
    // ══════════════════════════════════════════════════════════════════════
    var ICONS = {
        mic: '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>',
        mic_off: '<svg viewBox="0 0 24 24"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8"/></svg>',
        phone_off: '<svg viewBox="0 0 24 24"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 2 2 0 0 1-.29-.22M5 3H2a2 2 0 0 0-2 2c0 .91.07 1.79.2 2.65"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
        transfer: '<svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
        phone: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    };

    function ic(name) { return ICONS[name] || ""; }

    function btn_wrap(id, circle_cls, icon_name, lbl) {
        return '<div class="sflo-bw">' +
            '<button class="sflo-c ' + circle_cls + '" id="' + id + '" type="button">' + ic(icon_name) + '</button>' +
            '<span>' + lbl + '</span>' +
            '</div>';
    }

    // ══════════════════════════════════════════════════════════════════════
    // CSS injection
    // ══════════════════════════════════════════════════════════════════════
    function ensure_css() {
        if (document.getElementById("sflo-css")) return;
        var s = document.createElement("style");
        s.id = "sflo-css";
        s.textContent = PANEL_CSS;
        document.head.appendChild(s);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Timer
    // ══════════════════════════════════════════════════════════════════════
    function start_timer() {
        _call_secs = 0;
        _timer_iv = setInterval(function () {
            _call_secs++;
            var el = _panel_el && _panel_el.querySelector("#sflo-timer");
            if (el) el.textContent = fmt(_call_secs);
        }, 1000);
    }
    function stop_timer() { clearInterval(_timer_iv); _call_secs = 0; }
    function fmt(s) { var m = Math.floor(s / 60); return pad(m) + ":" + pad(s % 60); }
    function pad(n) { return ("0" + n).slice(-2); }

    // ══════════════════════════════════════════════════════════════════════
    // Panel lifecycle
    // ══════════════════════════════════════════════════════════════════════
    function show_panel(state, label) {
        console.log("[Smartflo WebRTC] show_panel:", state, label);
        ensure_css();
        if (!_panel_el) {
            console.log("[Smartflo WebRTC] Creating #sflo-phone-panel element");
            _panel_el = document.createElement("div");
            _panel_el.id = "sflo-phone-panel";
            document.body.appendChild(_panel_el);
        }
        _panel_el.dataset.label = label || "";
        render(state, label);
        // Double rAF ensures the initial CSS transition triggers
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (_panel_el) {
                    console.log("[Smartflo WebRTC] Making panel visible");
                    _panel_el.classList.add("sflo-visible");
                }
            });
        });
    }

    var STATUS_TEXT = {
        incoming: "Incoming call",
        outbound: "Ringing your CloudPhone\u2026",
        active: "Connected",
        ended: "Call ended",
        missed: "Missed call",
        transferred: "Transferred",
        dismissed: "Dismissed",
    };

    function render(state, label) {
        var ringing = state === "incoming";
        var outbound = state === "outbound";
        var active = state === "active";
        var ended = (state === "ended" || state === "missed" ||
            state === "transferred" || state === "dismissed");
        var status = STATUS_TEXT[state] || state;
        var safe_lbl = label ? label.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "Unknown";

        var h = "";
        // Header
        h += '<div class="sflo-header">';
        h += '<div class="sflo-avatar' + (ringing ? " sflo-ringing" : "") + '">\u260E\uFE0F</div>';
        h += '<div class="sflo-caller">' + safe_lbl + '</div>';
        h += '<div class="sflo-status">' + status + '</div>';
        h += '<div class="sflo-timer" id="sflo-timer">' + (active ? fmt(_call_secs) : "") + '</div>';
        if (ringing) h += '<p class="sflo-hint">Answer on your Smartflo CloudPhone</p>';
        if (outbound) h += '<p class="sflo-hint">Pick up on your CloudPhone to connect</p>';
        h += '</div>';
        h += '<div class="sflo-sep"></div>';

        // Buttons
        if (ringing || outbound) {
            h += '<div class="sflo-btn-row sflo-two">';
            h += btn_wrap("sflo-dismiss", "sflo-c-end", "x", "Dismiss");
            h += btn_wrap("sflo-open-cp", "sflo-c sflo-c-ans sflo-c-cp", "phone", "CloudPhone");
            h += '</div>';
        }
        if (active) {
            h += '<div class="sflo-btn-row">';
            h += btn_wrap("sflo-mute", "sflo-c", "mic", "Mute");
            h += btn_wrap("sflo-end", "sflo-c sflo-c-end", "phone_off", "End");
            h += btn_wrap("sflo-xfer-t", "sflo-c", "transfer", "Transfer");
            h += '</div>';
            h += '<div class="sflo-xfer" id="sflo-xfer">';
            h += '<select id="sflo-xfer-sel"><option value="">Select agent\u2026</option></select>';
            h += '<button class="sflo-xfer-go" id="sflo-xfer-go" type="button">' + ic("check") + ' Transfer Now</button>';
            h += '</div>';
        }
        if (ended) {
            h += '<div class="sflo-end-msg">' + status + '</div>';
        }

        _panel_el.innerHTML = h;
        wire(state, label);
    }

    function wire(state, label) {
        if (state === "incoming" || state === "outbound") {
            var dismiss = _panel_el && _panel_el.querySelector("#sflo-dismiss");
            var open_cp = _panel_el && _panel_el.querySelector("#sflo-open-cp");
            if (dismiss) dismiss.addEventListener("click", function () {
                set_state("dismissed", label); auto_close(1500);
            });
            if (open_cp) open_cp.addEventListener("click", function () {
                window.open("https://cloudphone.tatateleservices.com/", "_blank");
            });
        }

        if (state === "active") {
            var mute = _panel_el && _panel_el.querySelector("#sflo-mute");
            var end = _panel_el && _panel_el.querySelector("#sflo-end");
            var xfer = _panel_el && _panel_el.querySelector("#sflo-xfer-t");
            var xfer_go = _panel_el && _panel_el.querySelector("#sflo-xfer-go");

            if (mute) mute.addEventListener("click", do_mute);
            if (end) end.addEventListener("click", do_end);
            if (xfer) xfer.addEventListener("click", function () {
                var area = _panel_el && _panel_el.querySelector("#sflo-xfer");
                if (area && area.classList.toggle("sflo-open")) load_agents();
            });
            if (xfer_go) xfer_go.addEventListener("click", function () {
                var sel = _panel_el && _panel_el.querySelector("#sflo-xfer-sel");
                if (sel && sel.value) do_transfer(sel.value);
            });
        }
    }

    function set_state(state, label) {
        console.log("[Smartflo WebRTC] set_state:", state, label);
        if (!_panel_el) return;
        _is_muted = false;
        render(state, label || (_panel_el.dataset && _panel_el.dataset.label) || "");
    }

    function auto_close(ms) {
        console.log("[Smartflo WebRTC] auto_close scheduled in", ms, "ms");
        setTimeout(function () {
            if (!_panel_el) return;
            _panel_el.classList.remove("sflo-visible");
            setTimeout(function () {
                if (_panel_el && _panel_el.parentNode) {
                    console.log("[Smartflo WebRTC] Removing panel from DOM");
                    _panel_el.parentNode.removeChild(_panel_el);
                }
                _panel_el = null;
            }, 420);
        }, ms);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Actions
    // ══════════════════════════════════════════════════════════════════════
    function do_mute() {
        _is_muted = !_is_muted;
        var btn = _panel_el && _panel_el.querySelector("#sflo-mute");
        if (btn) {
            if (_is_muted) {
                btn.classList.add("sflo-c-mute-on");
                btn.innerHTML = ic("mic_off");
                var sp = btn.parentNode && btn.parentNode.querySelector("span");
                if (sp) sp.textContent = "Unmute";
            } else {
                btn.classList.remove("sflo-c-mute-on");
                btn.innerHTML = ic("mic");
                var sp2 = btn.parentNode && btn.parentNode.querySelector("span");
                if (sp2) sp2.textContent = "Mute";
            }
        }
        if (typeof frappe !== "undefined") {
            frappe.show_alert({ message: _is_muted ? "Mute on CloudPhone for audio" : "Unmuted", indicator: "blue" }, 2);
        }
    }

    function do_end() {
        stop_timer();
        set_state("ended", _panel_el && _panel_el.dataset.label);
        auto_close(1500);
        if (_call_ref_id && typeof frappe !== "undefined") {
            frappe.call({
                method: "mith_calling.smartflo.api.client.hangup_call",
                args: { ref_id: _call_ref_id },
            });
        }
    }

    function do_transfer(agent_name) {
        if (typeof frappe === "undefined") return;
        frappe.call({
            method: CALL_OP_API,
            args: { call_id: _call_ref_id, operation_type: 4, target_user: agent_name },
            freeze: true,
            freeze_message: "Transferring\u2026",
            callback: function (r) {
                if (!r.exc) {
                    stop_timer();
                    set_state("transferred", _panel_el && _panel_el.dataset.label);
                    auto_close(2500);
                }
            },
        });
    }

    function load_agents() {
        if (typeof frappe === "undefined") return;
        frappe.call({
            method: AGENTS_API,
            args: { doctype: "Agent Mapping", txt: "", searchfield: "name", start: 0, page_len: 50, filters: {} },
            callback: function (r) {
                var sel = _panel_el && _panel_el.querySelector("#sflo-xfer-sel");
                if (!sel || !r.message) return;
                r.message.forEach(function (row) {
                    var o = document.createElement("option");
                    o.value = row[0];
                    o.textContent = row[1] || row[0];
                    sel.appendChild(o);
                });
            },
        });
    }

})();
