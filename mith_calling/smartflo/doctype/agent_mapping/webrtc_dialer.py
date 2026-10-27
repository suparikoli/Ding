# Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
# For license information, please see license.txt
#
# webrtc_dialer.py — WebRTC / Softphone routing module
#
# Smartflo does NOT expose raw SIP credentials. WebRTC calls are initiated via
# the standard click-to-call REST API (POST /v1/click_to_call) using the API
# token. The agent_number is the Smartflo-assigned Intercom / Extension ID
# (e.g. "1006"), and the agent must be logged into the Smartflo CloudPhone
# (cloudphone.tatateleservices.com) to receive the call in their browser.

import re
import requests
import frappe
from mith_calling.smartflo.api.client import SmartfloAPI


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _sanitize(num):
    """Strip all non-digit characters from a phone number string."""
    if not num:
        return ""
    return re.sub(r"[^\d]", "", str(num))


def _apply_country_code(*numbers):
    """Prefix bare 10-digit Indian numbers with the 91 country code (E.164)."""
    return ["91" + n if len(n) == 10 else n for n in numbers]


# ---------------------------------------------------------------------------
# Stub — kept for backward compatibility with cached browser JS.
# The new webrtc_phone.js (call notification panel) does NOT call this.
# Older browser tabs that still have the JsSIP version cached will call it
# and get None back, which causes the JS to do nothing further.
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_webrtc_credentials():
    """
    Deprecated stub — Smartflo does not expose raw SIP credentials.
    Returns None so cached browser JS does nothing.
    """
    return None


# ---------------------------------------------------------------------------
# Agent search — used by the Transfer dropdown in the call notification panel
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_agent_users(doctype, txt, searchfield, start, page_len, filters):
    """
    Search function for the 'Transfer to Agent' dropdown.
    Returns Agent Mapping records excluding the current session user.
    """
    return frappe.db.sql(
        """
        SELECT am.name, am.user
        FROM `tabAgent Mapping` am
        WHERE
            am.user != %(current_user)s
            AND (am.name LIKE %(txt)s OR am.user LIKE %(txt)s)
        ORDER BY am.user
        LIMIT %(start)s, %(page_len)s
        """,
        {
            "current_user": frappe.session.user,
            "txt": f"%{txt}%",
            "start": start,
            "page_len": page_len,
        },
    )


@frappe.whitelist()
def check_agent_online(agent_mapping_name):
    """
    Check whether the Smartflo agent extension is currently registered / online.

    Calls GET /v1/extension_status/<agent_id> on the Smartflo API.
    Falls back to {"online": True} if the endpoint is unavailable or
    returns an unexpected format, so that a temporary API issue does not
    block legitimate calls.

    Args:
        agent_mapping_name (str): Name of the Agent Mapping document.

    Returns:
        dict:
            online (bool)     — True if the extension is registered
            reason (str)      — human-readable status (present when offline)
            raw (dict|None)   — raw Smartflo response (when available)
    """
    doc = frappe.get_doc("Agent Mapping", agent_mapping_name)

    if not doc.smartflo_agent_id:
        return {"online": False, "reason": "No Agent Extension ID configured."}

    settings = frappe.get_single("Smartflo Settings")
    api_token = settings.get_password("api_token")
    if not api_token:
        return {"online": True, "reason": "Cannot check — API token not configured."}

    headers = {
        "Authorization": f"Bearer {api_token}",
        "Accept": "application/json",
    }

    # Smartflo extension status endpoint (adjust path if the API version changes)
    url = (
        f"https://api-smartflo.tatateleservices.com"
        f"/v1/extension_status/{_sanitize(doc.smartflo_agent_id)}"
    )

    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            # Accept common field names for "registered / online"
            is_online = bool(
                data.get("registered")
                or data.get("online")
                or data.get("available")
                or data.get("status") in ("registered", "online", "available")
            )
            return {"online": is_online, "raw": data}
        if resp.status_code in (401, 403):
            frappe.log_error("WebRTC Dialer — Auth error on status check", resp.text)
        # For 404 / unknown endpoints, fail open
        return {"online": True, "reason": "Status endpoint not available; assuming online."}

    except requests.exceptions.Timeout:
        return {"online": True, "reason": "Status check timed out; assuming online."}
    except Exception as e:
        frappe.log_error("WebRTC Dialer — Status check failed", str(e))
        return {"online": True, "reason": f"Could not verify status: {e}"}


# ---------------------------------------------------------------------------
# Core routing function — reusable by client.py / other callers
# ---------------------------------------------------------------------------

def initiate_softphone_call(agent_id, caller_id, destination_number):
    """
    Place an outbound call using the Softphone (WebRTC) routing path.

    Leg A is the agent's WebRTC extension (agent_id). Smartflo rings that
    extension in the softphone client; once the agent answers, Smartflo
    bridges the call to destination_number showing caller_id to the dest.

    Args:
        agent_id (str): Short agent extension / Node ID (e.g. "1001").
        caller_id (str): DID number displayed to the destination.
        destination_number (str): Target phone number.

    Returns:
        dict: Raw Smartflo click_to_call API response.

    Raises:
        Exception: On API failure.
    """
    agent_id, caller_id, destination_number = _apply_country_code(
        _sanitize(agent_id),
        _sanitize(caller_id),
        _sanitize(destination_number),
    )

    frappe.logger("smartflo").info(
        f"[WebRTC] Dispatch -> Agent: {agent_id} | Dest: {destination_number} | CallerID: {caller_id}"
    )

    api = SmartfloAPI()
    return api.make_outbound_session_call(
        agent_number=agent_id,
        destination_number=destination_number,
        caller_id=caller_id,
    )


# ---------------------------------------------------------------------------
# Whitelisted endpoint — called directly by agent_mapping.js via frappe.call()
# Returns a structured dict (same pattern as pstn_dialer for consistency).
# ---------------------------------------------------------------------------

@frappe.whitelist()
def test_softphone_call(agent_mapping_name, destination_number):
    """
    Initiate a Softphone (WebRTC) test call from the Agent Mapping form.

    The browser has already gated this call behind:
      • Microphone permission (navigator.mediaDevices.getUserMedia)
      • Agent online check (check_agent_online)

    Returns:
        dict with keys:
            _status:  "success" | "agent_offline" | "error"
            _message: human-readable description
            uuid / request_id: Smartflo call reference (on success)
            + all other Smartflo response fields
    """
    doc = frappe.get_doc("Agent Mapping", agent_mapping_name)

    if doc.device_type != "Softphone (WebRTC)":
        return {
            "_status": "error",
            "_message": "This agent is configured for PSTN routing. Use 'Test PSTN Call' instead.",
        }
    if not doc.smartflo_agent_id:
        return {
            "_status": "error",
            "_message": "Agent Extension ID is required for Softphone routing. Please fill it in.",
        }

    try:
        result = initiate_softphone_call(
            agent_id=doc.smartflo_agent_id,
            caller_id=doc.did_number,
            destination_number=destination_number,
        )
        result["_status"] = "success"
        return result

    except Exception as e:
        error_str = str(e)
        frappe.log_error("WebRTC Dialer — Test Failed", error_str)
        return {
            "_status": "error",
            "_message": f"Call failed: {error_str}",
        }
