# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Cài Workflow 'Display Participation Approval' (doc/04). Idempotent."""

import frappe

WORKFLOW_NAME = "Display Participation Approval"
STATE_FIELD = "workflow_state"

# (state, style)
STATES = [
    ("Nháp", ""),
    ("Chờ duyệt", "Warning"),
    ("Đã duyệt", "Success"),
    ("Từ chối", "Danger"),
]
ACTIONS = ["Gửi duyệt", "Duyệt", "Từ chối", "Gửi lại"]

# (state, doc_status, allow_edit) — doc/04 States
DOC_STATES = [
    ("Nháp", "0", "Sales Staff"),
    ("Chờ duyệt", "0", "Channel Manager"),
    ("Đã duyệt", "0", "Sales Staff"),
    ("Từ chối", "0", "Sales Staff"),
]

# (from, action, to, allowed_role, condition) — doc/04 Transitions
TRANSITIONS = [
    ("Nháp", "Gửi duyệt", "Chờ duyệt", "Sales Staff", "doc.display_photo"),
    ("Chờ duyệt", "Duyệt", "Đã duyệt", "Channel Manager", ""),
    ("Chờ duyệt", "Từ chối", "Từ chối", "Channel Manager", "doc.reject_reason"),
    ("Từ chối", "Gửi lại", "Chờ duyệt", "Sales Staff", ""),
]


def execute():
    _ensure_masters()
    _upsert_workflow()


def _ensure_masters():
    for state, style in STATES:
        if not frappe.db.exists("Workflow State", state):
            frappe.get_doc(
                {"doctype": "Workflow State", "workflow_state_name": state, "style": style}
            ).insert(ignore_permissions=True)

    for action in ACTIONS:
        if not frappe.db.exists("Workflow Action Master", action):
            frappe.get_doc(
                {"doctype": "Workflow Action Master", "workflow_action_name": action}
            ).insert(ignore_permissions=True)


def _upsert_workflow():
    if frappe.db.exists("Workflow", WORKFLOW_NAME):
        wf = frappe.get_doc("Workflow", WORKFLOW_NAME)
        wf.states = []
        wf.transitions = []
    else:
        wf = frappe.new_doc("Workflow")
        wf.workflow_name = WORKFLOW_NAME

    wf.document_type = "Display Participation"
    wf.workflow_state_field = STATE_FIELD
    wf.is_active = 1
    wf.override_status = 0
    wf.send_email_alert = 0

    for state, doc_status, allow_edit in DOC_STATES:
        wf.append("states", {"state": state, "doc_status": doc_status, "allow_edit": allow_edit})

    for from_state, action, to_state, allowed, condition in TRANSITIONS:
        wf.append(
            "transitions",
            {
                "state": from_state,
                "action": action,
                "next_state": to_state,
                "allowed": allowed,
                "allow_self_approval": 1,
                "condition": condition,
            },
        )

    wf.save(ignore_permissions=True)
