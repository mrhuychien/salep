# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Read endpoints phục vụ SPA portal NVBH (/dp).

Chỉ đọc + tổng hợp nhẹ cho màn hình. Ghi dữ liệu dùng api.point / api.participation
/ api.profile. Mọi method enforce quyền qua filter owner hoặc check_permission.
"""

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

STATE_APPROVED = "Đã duyệt"


def _month_bucket(d):
    """Số thứ tự tháng tuyệt đối để so sánh: year*12 + (month-1)."""
    d = getdate(d)
    return d.year * 12 + (d.month - 1)


def coverage(start, end, captured_list, now=None):
    """Độ phủ ảnh theo tháng của 1 lượt trong 1 chương trình.

    Chương trình [start, end): số tháng cần = số tháng đã trôi từ start tới now
    (cap theo tổng số tháng). VD 1/7→1/12 (5 tháng); ngày 2/8 cần 2 ảnh.
    """
    if not start or not end:
        return {"required": 0, "have": 0, "needs": False, "total": 0}
    now = now or now_datetime()
    sb, eb, nb = _month_bucket(start), _month_bucket(end), _month_bucket(now)
    total = max(0, eb - sb)
    required = max(0, min(nb - sb + 1, total))
    have_buckets = {_month_bucket(c) for c in captured_list if c}
    have = len([b for b in have_buckets if sb <= b < eb])
    return {"required": required, "have": have, "needs": have < required, "total": total, "ended": nb >= eb}


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


def _attach_point_info(rows):
    """Gộp tên/SĐT/ảnh điểm vào danh sách lượt (1 query, tránh N+1)."""
    point_names = list({r.display_point for r in rows if r.display_point})
    points = {}
    if point_names:
        for p in frappe.get_all(
            "Display Point",
            filters={"name": ("in", point_names)},
            fields=["name", "point_name", "phone", "store_photo", "latitude", "longitude"],
        ):
            points[p.name] = p
    for r in rows:
        p = points.get(r.display_point) or {}
        r["point_name"] = p.get("point_name")
        r["point_phone"] = p.get("phone")
        r["point_photo"] = p.get("store_photo")
        r["point_latitude"] = p.get("latitude")
        r["point_longitude"] = p.get("longitude")
    return rows


@frappe.whitelist()
def list_program_participations(program):
    """Danh sách điểm tham gia 1 chương trình. Theo quyền: Sales Staff thấy lượt
    của mình (If Owner), Channel Manager thấy tất cả. Kèm thông tin chương trình."""
    rows = frappe.get_list(
        "Display Participation",
        filters={"promotion_program": program},
        fields=["name", "display_point", "distributor", "workflow_state", "display_photo", "modified"],
        order_by="modified desc",
        limit_page_length=500,
    )
    _attach_point_info(rows)
    program_doc = frappe.db.get_value(
        "Promotion Program", program, ["program_name", "status", "start_date", "end_date"], as_dict=True
    )
    return {"program": program_doc, "participations": rows}


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

    # Ảnh báo cáo theo tháng + độ phủ.
    visits = sorted(
        [
            {
                "visit_photo": v.visit_photo,
                "captured_on": v.captured_on,
                "period": v.period,
                "latitude": v.latitude,
                "longitude": v.longitude,
            }
            for v in (doc.visits or [])
        ],
        key=lambda v: str(v["captured_on"] or ""),
    )
    cov = coverage(
        program and program.start_date,
        program and program.end_date,
        [v["captured_on"] for v in visits],
    ) if program else {"required": 0, "have": 0, "needs": False, "total": 0}

    return {
        "doc": data,
        "point": point,
        "program": program,
        "timeline": timeline,
        "visits": visits,
        "coverage": cov,
    }


@frappe.whitelist()
def list_points_to_visit():
    """Điểm cần ghé thăm: lượt ĐÃ DUYỆT của NVBH mà số ảnh báo cáo chưa đủ theo
    tháng (chương trình còn hạn). Yêu cầu #3 — nhắc nhở chăm sóc điểm bán."""
    user = frappe.session.user
    parts = frappe.get_list(
        "Display Participation",
        filters={"owner": user, "workflow_state": STATE_APPROVED},
        fields=["name", "display_point", "promotion_program", "distributor"],
        limit_page_length=500,
    )
    if not parts:
        return []

    prog_ids = list({p.promotion_program for p in parts if p.promotion_program})
    progs = {}
    if prog_ids:
        for pr in frappe.get_all(
            "Promotion Program",
            filters={"name": ("in", prog_ids)},
            fields=["name", "program_name", "start_date", "end_date"],
        ):
            progs[pr.name] = pr

    part_ids = [p.name for p in parts]
    visits_by_part = {}
    for v in frappe.get_all(
        "Display Visit", filters={"parent": ("in", part_ids)}, fields=["parent", "captured_on"]
    ):
        visits_by_part.setdefault(v.parent, []).append(v.captured_on)

    now = now_datetime()
    out = []
    for p in parts:
        pr = progs.get(p.promotion_program)
        if not pr:
            continue
        cov = coverage(pr.start_date, pr.end_date, visits_by_part.get(p.name, []), now)
        if cov["needs"] and not cov["ended"]:
            out.append(
                {
                    "participation": p.name,
                    "display_point": p.display_point,
                    "distributor": p.distributor,
                    "program": p.promotion_program,
                    "program_name": pr.program_name,
                    "have": cov["have"],
                    "required": cov["required"],
                    "missing": cov["required"] - cov["have"],
                }
            )

    point_names = list({o["display_point"] for o in out if o["display_point"]})
    points = {}
    if point_names:
        for pt in frappe.get_all(
            "Display Point", filters={"name": ("in", point_names)}, fields=["name", "point_name", "phone"]
        ):
            points[pt.name] = pt
    for o in out:
        pt = points.get(o["display_point"]) or {}
        o["point_name"] = pt.get("point_name")
        o["point_phone"] = pt.get("phone")
    out.sort(key=lambda o: -o["missing"])
    return out
