# Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
# For license information, please see license.txt
#
# agent_mapping.py — AgentMapping Document controller
#
# This file is intentionally minimal. All outbound routing logic has been
# moved to dedicated modules alongside this doctype:
#
#   webrtc_dialer.py  —  Softphone (WebRTC) routing via agent extension ID
#   pstn_dialer.py    —  PSTN routing via a physical forwarding number
#
# The Agent Mapping form (agent_mapping.js) calls those modules directly
# via frappe.call() using their full Python module paths.

import frappe
from frappe.model.document import Document


class AgentMapping(Document):
    """
    Maps a Frappe User to their Smartflo telephony configuration.

    Fields:
        user                — linked Frappe User (unique, required)
        device_type         — "Softphone (WebRTC)" or "PSTN (Mobile/Landline)"
        smartflo_agent_id   — agent extension ID (Softphone path)
        call_forward_number — physical number to bridge (PSTN path)
        did_number          — outbound caller ID for this agent
        intercom            — internal extension for call transfer

    Routing logic is handled by:
        webrtc_dialer.test_softphone_call()
        pstn_dialer.test_pstn_call()
    """
@frappe.whitelist()
def get_phone_mask_setting():
    """
    Returns the 'hide_field' setting for the current user from Agent Mapping.
    """
    user = frappe.session.user
    hide_field = frappe.db.get_value("Agent Mapping", {"user": user}, "hide_field")
    return {
        "hide_field": bool(hide_field)
    }
