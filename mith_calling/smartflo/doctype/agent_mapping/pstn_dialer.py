# Copyright (c) 2026, Mithtech Innovative Solutions PVT LTD and contributors
# For license information, please see license.txt
#
# pstn_dialer.py — PSTN / Mobile / Landline routing module
#
# For PSTN mode the browser UI shows NO popup widget after a successful call.
# If the agent or the forwarding number is unreachable, a structured response
# is returned so the JavaScript layer can show an appropriate offline message.

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


def _is_offline_error(error_str):
    """
    Heuristic: check whether an API error string looks like an agent-offline
    or unreachable error rather than a generic configuration problem.
    """
    keywords = [
        "offline", "not registered", "not available", "unreachable",
        "no answer", "agent busy", "extension busy", "agent not found",
        "unavailable", "unregistered",
    ]
    lowered = error_str.lower()
    return any(kw in lowered for kw in keywords)


# ---------------------------------------------------------------------------
# Core routing function — reusable by client.py / other callers
# ---------------------------------------------------------------------------

def initiate_pstn_call(forward_number, caller_id, destination_number):
    """
    Place an outbound call using the PSTN (Mobile/Landline) routing path.

    Smartflo rings `forward_number` first (Leg A). When the agent answers
    that physical number, Smartflo bridges the call to `destination_number`
    (Leg B) showing `caller_id` to the destination.

    Args:
        forward_number (str): Agent's physical mobile/landline.
        caller_id (str): DID number shown to the destination.
        destination_number (str): Target phone number to dial.

    Returns:
        dict: Raw JSON from Smartflo click_to_call API.

    Raises:
        Exception: Propagated if the API call fails unexpectedly.
    """
    forward_number, caller_id, destination_number = _apply_country_code(
        _sanitize(forward_number),
        _sanitize(caller_id),
        _sanitize(destination_number),
    )

    frappe.logger("smartflo").info(
        f"[PSTN] Dispatch -> Forward: {forward_number} | Dest: {destination_number} | CallerID: {caller_id}"
    )

    api = SmartfloAPI()
    return api.make_outbound_session_call(
        agent_number=forward_number,
        destination_number=destination_number,
        caller_id=caller_id,
    )


# ---------------------------------------------------------------------------
# Whitelisted endpoint — called directly by agent_mapping.js via frappe.call()
# Returns a structured dict; does NOT raise on agent-offline errors so the
# JS layer can distinguish offline vs. hard errors.
# ---------------------------------------------------------------------------

@frappe.whitelist()
def test_pstn_call(agent_mapping_name, destination_number):
    """
    Initiate a PSTN test call from the Agent Mapping form.

    Unlike most Frappe whitelist methods this function NEVER raises on
    agent-offline failures — instead it returns a structured response so
    the browser can show the appropriate UI (no popup for PSTN mode;
    offline message with a link when the agent device can't be reached).

    Returns:
        dict with keys:
            _status: "success" | "agent_offline" | "error"
            _message: human-readable description
            + all fields from the Smartflo API response on success
    """
    doc = frappe.get_doc("Agent Mapping", agent_mapping_name)

    if doc.device_type != "PSTN (Mobile/Landline)":
        return {
            "_status": "error",
            "_message": "This agent is configured for Softphone routing. Use 'Test Softphone Call' instead.",
        }
    if not doc.call_forward_number:
        return {
            "_status": "error",
            "_message": "Call Forwarding Number is required for PSTN routing. Please fill it in.",
        }

    try:
        result = initiate_pstn_call(
            forward_number=doc.call_forward_number,
            caller_id=doc.did_number,
            destination_number=destination_number,
        )
        result["_status"] = "success"
        return result

    except Exception as e:
        error_str = str(e)
        frappe.log_error("PSTN Dialer — Test Failed", error_str)

        if _is_offline_error(error_str):
            return {
                "_status": "agent_offline",
                "_message": (
                    "Your PSTN device could not be reached. "
                    "Please ensure your mobile/landline is reachable."
                ),
            }

        return {
            "_status": "error",
            "_message": f"Call failed: {error_str}",
        }
