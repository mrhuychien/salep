# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""API & doc_events cho Display Participation (lượt tham gia + workflow duyệt)."""

import frappe
from frappe import _
from frappe.model.workflow import apply_workflow
from frappe.utils import now_datetime

STATE_DRAFT = "Nháp"
STATE_PENDING = "Chờ duyệt"
STATE_APPROVED = "Đã duyệt"
STATE_REJECTED = "Từ chối"


# ---------------------------------------------------------------------------
# doc_events (xem hooks.py)
# ---------------------------------------------------------------------------
def validate_participation(doc, method=None):
    """Unique (display_point, promotion_program) + reject_reason bắt buộc khi từ chối.

    doc/02 dòng 118: 1 điểm chỉ tham gia 1 chương trình 1 lần.
    """
    if doc.display_point and doc.promotion_program:
        duplicate = frappe.db.exists(
            "Display Participation",
            {
                "display_point": doc.display_point,
                "promotion_program": doc.promotion_program,
                "name": ("!=", doc.name or ""),
            },
        )
        if duplicate:
            frappe.throw(
                _("Điểm {0} đã đăng ký chương trình {1} (lượt {2}).").format(
                    frappe.bold(doc.display_point),
                    frappe.bold(doc.promotion_program),
                    frappe.bold(duplicate),
                ),
                title=_("Trùng lượt tham gia"),
            )

    if doc.workflow_state == STATE_REJECTED and not doc.reject_reason:
        frappe.throw(_("Phải nhập Lý do từ chối khi chuyển sang trạng thái Từ chối."))

    # Title field (expression) point + program — doc/02 dòng 98
    doc.subject = " · ".join(filter(None, [doc.display_point, doc.promotion_program]))


def on_state_change(doc, method=None):
    """Set approved_by / approved_on khi vào 'Đã duyệt' (doc/04 dòng 25).

    Dùng db_set trong on_update để không kích hoạt vòng save đệ quy.
    """
    if doc.workflow_state == STATE_APPROVED and not doc.approved_by:
        doc.db_set("approved_by", frappe.session.user, update_modified=False)
        doc.db_set("approved_on", now_datetime(), update_modified=False)


def guard_delete(doc, method=None):
    """Chặn xoá lượt đã duyệt. Ngoại lệ: System Manager được xoá (đã chốt).

    doc/03 dòng 35 + doc/04 dòng 24.
    """
    if doc.workflow_state == STATE_APPROVED and "System Manager" not in frappe.get_roles():
        frappe.throw(_("Lượt tham gia đã duyệt, không được xoá."))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _assert_channel_manager():
    roles = set(frappe.get_roles())
    if not roles & {"Channel Manager", "System Manager"}:
        frappe.throw(_("Chỉ Quản lý kênh được duyệt/từ chối lượt tham gia."), frappe.PermissionError)


# ---------------------------------------------------------------------------
# Whitelisted API
# ---------------------------------------------------------------------------
@frappe.whitelist()
def create_participation(
    display_point,
    promotion_program,
    display_photo,
    latitude=None,
    longitude=None,
    gps_accuracy=None,
):
    """NVBH đăng ký lượt tham gia (trạng thái Nháp). `distributor` fetch_from điểm bán."""
    doc = frappe.new_doc("Display Participation")
    doc.update(
        {
            "display_point": display_point,
            "promotion_program": promotion_program,
            "display_photo": display_photo,
            "latitude": latitude,
            "longitude": longitude,
            "gps_accuracy": gps_accuracy,
            "workflow_state": STATE_DRAFT,
        }
    )
    doc.insert()  # enforce Create + If Owner
    return {"name": doc.name, "workflow_state": doc.workflow_state}


@frappe.whitelist()
def submit_for_approval(name):
    """Nháp/Từ chối → Chờ duyệt (action 'Gửi duyệt'/'Gửi lại'). NVBH chủ lượt."""
    doc = frappe.get_doc("Display Participation", name)
    doc.check_permission("write")
    action = "Gửi lại" if doc.workflow_state == STATE_REJECTED else "Gửi duyệt"
    apply_workflow(doc, action)
    return {"name": doc.name, "workflow_state": doc.workflow_state}


@frappe.whitelist()
def approve(name):
    """Chờ duyệt → Đã duyệt (action 'Duyệt'). Role-gated Channel Manager."""
    _assert_channel_manager()
    doc = frappe.get_doc("Display Participation", name)
    apply_workflow(doc, "Duyệt")
    return {"name": doc.name, "workflow_state": doc.workflow_state, "approved_by": doc.approved_by}


@frappe.whitelist()
def reject(name, reject_reason):
    """Chờ duyệt → Từ chối (action 'Từ chối'). Bắt buộc reject_reason. Role-gated."""
    _assert_channel_manager()
    if not reject_reason:
        frappe.throw(_("Phải nhập lý do từ chối."))
    doc = frappe.get_doc("Display Participation", name)
    doc.reject_reason = reject_reason
    apply_workflow(doc, "Từ chối")
    return {"name": doc.name, "workflow_state": doc.workflow_state}
