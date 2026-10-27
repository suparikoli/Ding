import frappe
from frappe import _
import json
import hmac
import hashlib


@frappe.whitelist(allow_guest=True)
def handle_event():
    """Endpoint for receiving Smartflo Webhook events."""
    settings = frappe.get_single("Smartflo Settings")
    if not settings.enable_webhook_processing:
        return {"status": "ignored", "message": "Webhook processing is disabled."}

    # Validate webhook secret if configured
    webhook_secret = settings.get_password("webhook_secret") if settings.webhook_secret else None
    if webhook_secret:
        signature = frappe.request.headers.get("X-Smartflo-Signature", "")
        raw_body = frappe.request.get_data(as_text=True)
        expected = hmac.new(
            webhook_secret.encode(), raw_body.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            frappe.local.response.http_status_code = 401
            return {"status": "error", "message": "Invalid signature"}

    try:
        data = frappe.request.get_data(as_text=True)
        payload = json.loads(data)

        if settings.enable_debug_logs:
            frappe.logger("smartflo").debug(f"Received Webhook: {data}")

        settings.db_set("last_webhook_received_at", frappe.utils.now())

        event_type = payload.get("event")

        if event_type == "call.ringing":
            handle_ringing(payload)
        elif event_type == "call.connected":
            handle_connected(payload)
        elif event_type in ("call.completed", "call.hangup"):
            handle_completed(payload)

        return {"status": "success"}
    except json.JSONDecodeError:
        frappe.log_error("Smartflo Webhook Error", "Invalid JSON payload")
        frappe.local.response.http_status_code = 400
        return {"status": "error", "message": "Invalid JSON"}
    except Exception as e:
        frappe.log_error("Smartflo Webhook Error", str(e))
        return {"status": "error"}


def handle_ringing(payload):
    """Broadcast an incoming call so the UI popup can be shown."""
    call_uuid = payload.get("uuid") or payload.get("call_id")
    if not call_uuid:
        return

    direction = payload.get("direction", "Incoming").capitalize()

    if not frappe.db.exists("Smartflo Logs", {"id": call_uuid}):
        doc = frappe.get_doc({
            "doctype": "Smartflo Logs",
            "id": call_uuid,
            "from": payload.get("caller_number"),
            "to": payload.get("destination_number"),
            "type": direction,
            "status": "Ringing",
            "start_time": frappe.utils.now(),
        })
        doc.insert(ignore_permissions=True)
    else:
        doc = frappe.get_doc("Smartflo Logs", {"id": call_uuid})

    frappe.publish_realtime(
        "smartflo_incoming_call",
        message={
            "uuid": call_uuid,
            "caller": payload.get("caller_number"),
            "direction": direction,
            "call_log_name": doc.name,
        },
        after_commit=True,
    )


def handle_connected(payload):
    """Update call log status to In Progress."""
    call_uuid = payload.get("uuid")
    if not call_uuid:
        return
    if frappe.db.exists("Smartflo Logs", {"id": call_uuid}):
        frappe.db.set_value("Smartflo Logs", {"id": call_uuid}, "status", "In Progress")


def handle_completed(payload):
    """Finalize the call log with duration, recording, and final status."""
    call_uuid = payload.get("uuid")
    if not call_uuid:
        return

    filters = {"id": call_uuid}
    if not frappe.db.exists("Smartflo Logs", filters):
        doc = frappe.get_doc({
            "doctype": "Smartflo Logs",
            "id": call_uuid,
            "from": payload.get("caller_number"),
            "to": payload.get("destination_number"),
            "type": payload.get("direction", "Incoming").capitalize(),
        })
        doc.status = payload.get("status", "Completed").capitalize()
        doc.duration = payload.get("duration", 0)
        doc.end_time = frappe.utils.now()
        if payload.get("recording_url"):
            doc.recording_url = payload.get("recording_url")
        doc.insert(ignore_permissions=True)
    else:
        log_name = frappe.db.get_value("Smartflo Logs", filters, "name")
        doc = frappe.get_doc("Smartflo Logs", log_name)
        doc.status = payload.get("status", "Completed").capitalize()
        doc.duration = payload.get("duration", 0)
        doc.end_time = frappe.utils.now()
        if payload.get("recording_url"):
            doc.recording_url = payload.get("recording_url")
        doc.save(ignore_permissions=True)
