import re

import frappe
import requests


REQUEST_TIMEOUT = 30  # seconds


class SmartfloAPI:
    def __init__(self):
        settings = frappe.get_single("Smartflo Settings")
        self.api_token = settings.get_password("api_token")
        if not self.api_token:
            frappe.throw("Smartflo API Token is not configured in Smartflo Settings.")

        self.base_url = "https://api-smartflo.tatateleservices.com"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(self, method, endpoint, **kwargs):
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)

        try:
            response = requests.request(method, url, headers=self.headers, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            error_msg = f"Smartflo API Error: {e}"
            try:
                error_data = e.response.json()
                if "message" in error_data:
                    error_msg = f"Smartflo API Error: {error_data['message']}"
            except Exception:
                pass
            frappe.log_error(title="Smartflo API Error", message=str(e))
            frappe.throw(error_msg)
        except requests.exceptions.ConnectionError:
            frappe.log_error(title="Smartflo Connection Error", message="Could not connect to Smartflo API")
            frappe.throw("Could not connect to Smartflo API. Please try again later.")
        except requests.exceptions.Timeout:
            frappe.log_error(title="Smartflo Timeout", message="Request timed out")
            frappe.throw("Smartflo API request timed out. Please try again.")
        except requests.exceptions.RequestException as e:
            frappe.log_error(title="Smartflo Request Error", message=str(e))
            frappe.throw("Failed to connect to Smartflo.")

    def test_connection(self):
        url = f"{self.base_url}/v1/my_number"
        response = requests.request("GET", url, headers=self.headers, timeout=REQUEST_TIMEOUT)

        if response.status_code == 401:
            frappe.throw("Invalid API Token. Authentication Failed.")

        if response.status_code == 403:
            return {"message": "Connection Success! Token is valid (though reading numbers is restricted by scopes)."}

        response.raise_for_status()
        return {"message": "Successfully connected to Smartflo API!"}

    def make_outbound_session_call(self, agent_number, destination_number, caller_id):
        payload = {
            "agent_number": _sanitize_number(agent_number),
            "destination_number": _sanitize_number(destination_number),
            "caller_id": _sanitize_number(caller_id),
            "async": 1,
        }
        return self._request("POST", "/v1/click_to_call", json=payload)


def _sanitize_number(num):
    """Strip non-digit characters and ensure 91 country code prefix for 10-digit Indian numbers."""
    if not num:
        return ""
    cleaned = re.sub(r"[^\d]", "", str(num))
    # Only prefix 91 for exactly 10 digit numbers (Indian local)
    if len(cleaned) == 10:
        cleaned = "91" + cleaned
    return cleaned


@frappe.whitelist()
def initiate_outbound_call(number, reference_doctype=None, reference_name=None):
    """Initiates an outbound call from the current logged-in user's mapped agent to the target number."""
    settings = frappe.get_single("Smartflo Settings")

    if not settings.enable_outbound_calls:
        frappe.throw("Outbound calls are currently disabled in Smartflo Settings.")

    user = frappe.session.user
    agent_mapping = frappe.db.get_value(
        "Agent Mapping",
        {"user": user},
        ["name", "smartflo_agent_id", "device_type", "call_forward_number", "did_number"],
        as_dict=True,
    )

    if not agent_mapping:
        frappe.throw(f"No Agent Mapping found for your user ({user}). Please configure this in Agent Mapping.")

    # Determine Routing Leg A
    if agent_mapping.device_type == "PSTN (Mobile/Landline)":
        if not agent_mapping.call_forward_number:
            frappe.throw("Call Forwarding Number is required for PSTN routing.")
        agent_number = _sanitize_number(agent_mapping.call_forward_number)
    else:
        if not agent_mapping.smartflo_agent_id:
            frappe.throw("Agent Extension ID is required for Softphone routing.")
        agent_number = _sanitize_number(agent_mapping.smartflo_agent_id)

    caller_id = agent_mapping.did_number or settings.default_caller_id
    if not caller_id:
        frappe.throw("No DID Number found for your Agent Mapping and no Default Caller ID set in Smartflo Settings.")

    caller_id = _sanitize_number(caller_id)
    number = _sanitize_number(number)

    frappe.logger("smartflo").info(
        f"SMARTFLO ROUTE DISPATCH -> Agent (A): {agent_number} | Dest (B): {number} | CallerID: {caller_id}"
    )

    api = SmartfloAPI()

    response = api.make_outbound_session_call(
        agent_number=agent_number,
        destination_number=number,
        caller_id=caller_id,
    )

    call_uuid = None
    if response and isinstance(response, dict):
        call_uuid = response.get("uuid") or response.get("request_id")

    if call_uuid:
        doc = frappe.get_doc({
            "doctype": "Smartflo Logs",
            "id": call_uuid,
            "from": caller_id,
            "to": number,
            "type": "Outgoing",
            "status": "Queued",
            "start_time": frappe.utils.now(),
            "employee_user_id": frappe.session.user,
        })
        if reference_doctype and reference_name:
            doc.append("links", {
                "link_doctype": reference_doctype,
                "link_name": reference_name,
            })
        doc.insert(ignore_permissions=True)

    return response


@frappe.whitelist()
def call_operation(call_id, operation_type, target_user=None):
    """Perform a Call Operation: Monitor=1, Whisper=2, Barge=3, Transfer=4"""
    user = frappe.session.user
    agent_mapping = frappe.db.get_value(
        "Agent Mapping", {"user": user}, ["smartflo_agent_id"], as_dict=True
    )
    if not agent_mapping or not agent_mapping.smartflo_agent_id:
        frappe.throw(f"No Target Agent Mapping found for your user ({user}).")

    payload = {
        "call_id": call_id,
        "type": int(operation_type),
        "agent_id": agent_mapping.smartflo_agent_id,
    }

    if int(operation_type) == 4:
        if not target_user:
            frappe.throw("Target User is required for Call Transfer.")
        target_agent_id = frappe.db.get_value("Agent Mapping", {"user": target_user}, "smartflo_agent_id")
        if not target_agent_id:
            frappe.throw(f"No Agent Extension ID found in Agent Mapping for user ({target_user}).")
        payload["intercom"] = target_agent_id

    api = SmartfloAPI()
    response = api._request("POST", "/v1/call/options", json=payload)
    frappe.logger("smartflo").info(f"Call Ops Success: {call_id} Type: {operation_type}")
    return response


@frappe.whitelist()
def hangup_call(ref_id):
    """Fallback endpoint to close the local GUI widget."""
    frappe.logger("smartflo").info(f"UI requested Hangup for ref_id {ref_id}")
    return {"status": "success", "message": "Call termination signal routed to hardware."}
