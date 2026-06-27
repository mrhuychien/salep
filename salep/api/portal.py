# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Read endpoints phục vụ SPA portal NVBH (/dp).

Chỉ đọc + tổng hợp nhẹ cho màn hình. Ghi dữ liệu dùng api.point / api.participation
/ api.profile. Mọi method enforce quyền qua filter owner hoặc check_permission.
"""

import frappe
from frappe import _

STATE_APPROVED = "Đã duyệt"


@frappe.whitelist()
def list_programs(running_only=1):
    """Chương trình để NVBH chọn đăng ký. running_only → chỉ 'Đang chạy'."""
    filters = {}
    if frappe.utils.cint(running_only):
        filters["status"] = "Đang chạy"
    return frappe.get_list(
        "Promotion Program",
        filters=filters,
        fields=[
            "name", "program_name", "status", "start_date", "end_date",
            "target_points", "reward_per_point",
        ],
        order_by="start_date desc",
        limit_page_length=50,
    )


@frappe.whitelist()
def list_my_participations(search=None, state=None):
    """Lượt tham gia của NVBH đang đăng nhập (If Owner), kèm tên/ảnh điểm bán."""
    filters = {"owner": frappe.session.user}
    if state:
        filters["workflow_state"] = state

    rows = frappe.get_list(
        "Display Participation",
        filters=filters,
        fields=[
            "name", "display_point", "promotion_program", "distributor",
            "workflow_state", "display_photo", "modified",
        ],
        order_by="modified desc",
        limit_page_length=100,
    )

    # Bổ sung tên/SĐT/ảnh điểm để render thẻ danh sách (1 query gộp, tránh N+1).
    point_names = list({r.display_point for r in rows if r.display_point})
    points = {}
    if point_names:
        for p in frappe.get_all(
            "Display Point",
            filters={"name": ("in", point_names)},
            fields=["name", "point_name", "phone", "store_photo"],
        ):
            points[p.name] = p

    for r in rows:
        p = points.get(r.display_point) or {}
        r["point_name"] = p.get("point_name")
        r["point_phone"] = p.get("phone")
        r["point_photo"] = p.get("store_photo")

    if search:
        s = search.lower()
        rows = [
            r for r in rows
            if s in (r.get("point_name") or "").lower()
            or s in (r.get("point_phone") or "").lower()
        ]
    return rows


@frappe.whitelist()
def get_point(name):
    """Một điểm bán (cho preview khi đăng ký). Enforce quyền read."""
    doc = frappe.get_doc("Display Point", name)
    doc.check_permission("read")
    return doc.as_dict()


@frappe.whitelist()
def get_participation(name):
    """Chi tiết lượt tham gia + thông tin điểm/chương trình + mốc lịch sử."""
    doc = frappe.get_doc("Display Participation", name)
    doc.check_permission("read")
    data = doc.as_dict()

    point = frappe.db.get_value(
        "Display Point", doc.display_point,
        ["point_name", "phone", "address_line", "distributor", "store_photo"],
        as_dict=True,
    ) if doc.display_point else None

    program = frappe.db.get_value(
        "Promotion Program", doc.promotion_program,
        ["program_name", "start_date", "end_date", "status"],
        as_dict=True,
    ) if doc.promotion_program else None

    # Mốc lịch sử: tạo + duyệt/từ chối, kèm các lần chỉnh sửa (US-03: ghi lịch sử).
    timeline = [{"label": _("Tạo bởi {0}").format(doc.owner), "on": doc.creation}]
    if doc.workflow_state == STATE_APPROVED and doc.approved_by:
        timeline.append({"label": _("Duyệt bởi {0}").format(doc.approved_by), "on": doc.approved_on})
    if doc.workflow_state == "Từ chối" and doc.reject_reason:
        timeline.append({"label": _("Từ chối"), "on": doc.modified, "note": doc.reject_reason})

    # track_changes ghi mỗi lần sửa vào Version → hiện cho người dùng (get_all bỏ qua
    # quyền trên Version; đã check_permission read lượt ở trên).
    for v in frappe.get_all(
        "Version",
        filters={"ref_doctype": "Display Participation", "docname": name},
        fields=["owner", "creation"],
        order_by="creation asc",
        limit_page_length=20,
    ):
        timeline.append({"label": _("Chỉnh sửa bởi {0}").format(v.owner), "on": v.creation})

    timeline.sort(key=lambda e: str(e["on"]))
    return {"doc": data, "point": point, "program": program, "timeline": timeline}
