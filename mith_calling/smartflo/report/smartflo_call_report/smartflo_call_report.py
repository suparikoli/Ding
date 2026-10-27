import frappe

def execute(filters=None):
    columns, data = [], []
    columns = get_columns()
    data = get_data(filters)
    
    chart = get_chart_data(data)
    report_summary = get_report_summary(data)
    
    return columns, data, None, chart, report_summary

def get_columns():
    return [
        {"fieldname": "call_id", "label": "Call ID", "fieldtype": "Link", "options": "Smartflo Logs", "width": 120},
        {"fieldname": "direction", "label": "Direction", "fieldtype": "Data", "width": 100},
        {"fieldname": "from", "label": "From", "fieldtype": "Data", "width": 120},
        {"fieldname": "to", "label": "To", "fieldtype": "Data", "width": 120},
        {"fieldname": "status", "label": "Status", "fieldtype": "Data", "width": 100},
        {"fieldname": "duration", "label": "Duration (Sec)", "fieldtype": "Int", "width": 120},
        {"fieldname": "start_time", "label": "Start Time", "fieldtype": "Datetime", "width": 150},
        {"fieldname": "agent", "label": "Agent", "fieldtype": "Link", "options": "User", "width": 150}
    ]

def get_data(filters):
    conditions = ""
    values = {}
    filters = filters or {}

    if filters.get("date_range") and len(filters["date_range"]) == 2:
        conditions += " AND start_time BETWEEN %(start_date)s AND %(end_date)s"
        values["start_date"] = filters.get("date_range")[0]
        values["end_date"] = filters.get("date_range")[1]
        
    if filters.get("status"):
        conditions += " AND status = %(status)s"
        values["status"] = filters.get("status")
        
    if filters.get("direction"):
        conditions += " AND type = %(direction)s"
        values["direction"] = filters.get("direction")

    query = f"""
        SELECT 
            name as call_id,
            type as direction,
            `from`,
            `to`,
            status,
            duration,
            start_time,
            employee_user_id as agent
        FROM `tabSmartflo Logs`
        WHERE docstatus < 2 {conditions}
        ORDER BY start_time DESC
    """
    
    return frappe.db.sql(query, values, as_dict=1)

def get_chart_data(data):
    if not data:
        return None
        
    status_counts = {}
    for row in data:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
        
    return {
        "data": {
            "labels": list(status_counts.keys()),
            "datasets": [
                {
                    "name": "Call Status",
                    "values": list(status_counts.values())
                }
            ]
        },
        "type": "donut",
        "colors": ["green", "red", "orange", "blue", "gray"]
    }

def get_report_summary(data):
    if not data:
        return []
        
    total_calls = len(data)
    total_duration = sum(row.duration for row in data if row.duration)
    answered_calls = sum(1 for row in data if row.status in ["Completed", "In Progress"])
    
    return [
        {
            "value": total_calls,
            "indicator": "Blue",
            "label": "Total Calls",
            "datatype": "Int",
        },
        {
            "value": answered_calls,
            "indicator": "Green",
            "label": "Answered",
            "datatype": "Int",
        },
        {
            "value": total_duration,
            "indicator": "Orange",
            "label": "Total Duration (sec)",
            "datatype": "Int",
        }
    ]
