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

# (from, action, to, allowed_roles, condition) — doc/04 Transitions.
# System Manager đi kèm mọi transition để admin vận hành/test được toàn luồng.
TRANSITIONS = [
    ("Nháp", "Gửi duyệt", "Chờ duyệt", ["Sales Staff", "System Manager"], "doc.display_photo"),
    ("Chờ duyệt", "Duyệt", "Đã duyệt", ["Channel Manager", "System Manager"], ""),
    ("Chờ duyệt", "Từ chối", "Từ chối", ["Channel Manager", "System Manager"], "doc.reject_reason"),
    ("Từ chối", "Gửi lại", "Chờ duyệt", ["Sales Staff", "System Manager"], ""),
]


def execute():
    _ensure_masters()
    _upsert_workflow()


def _ensure_masters():
    # ignore_if_duplicate → luôn đảm bảo bản canonical (NFC) tồn tại kể cả khi đã
    # có bản lệch chuẩn từ lần tạo trước.
    for state, style in STATES:
        frappe.get_doc(
            {"doctype": "Workflow State", "workflow_state_name": state, "style": style}
        ).insert(ignore_permissions=True, ignore_if_duplicate=True)

    for action in ACTIONS:
        frappe.get_doc(
            {"doctype": "Workflow Action Master", "workflow_action_name": action}
        ).insert(ignore_permissions=True, ignore_if_duplicate=True)


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

    for from_state, action, to_state, allowed_roles, condition in TRANSITIONS:
        for role in allowed_roles:
            wf.append(
                "transitions",
                {
                    "state": from_state,
                    "action": action,
                    "next_state": to_state,
                    "allowed": role,
                    "allow_self_approval": 1,
                    "condition": condition,
                },
            )

    wf.save(ignore_permissions=True)
