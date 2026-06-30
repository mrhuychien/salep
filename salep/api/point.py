# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""API & doc_events cho Display Point.

House style: KHÔNG Server/Client Script — mọi logic ở đây, wire qua
hooks.doc_events và gọi từ portal qua whitelisted methods.
"""

import frappe
from frappe import _

GPS_ACCURACY_WARN_M = 100


# ---------------------------------------------------------------------------
# doc_events (xem hooks.py)
# ---------------------------------------------------------------------------
def validate_point(doc, method=None):
    """Chống trùng điểm theo SĐT + cảnh báo GPS kém chính xác.

    SĐT là khoá chống trùng nghiệp vụ (doc/02 dòng 58). Một SĐT chỉ ứng với
    một điểm bán; tham gia nhiều chương trình thì tái dùng cùng điểm.
    """
    if doc.phone:
        duplicate = frappe.db.exists(
            "Display Point",
            {"phone": doc.phone, "name": ("!=", doc.name or "")},
        )
        if duplicate:
            frappe.throw(
                _("SĐT {0} đã thuộc điểm {1}. Hãy tái sử dụng điểm đó thay vì tạo mới.").format(
                    frappe.bold(doc.phone), frappe.bold(duplicate)
                ),
                title=_("Trùng điểm bán"),
            )

    if doc.gps_accuracy and doc.gps_accuracy > GPS_ACCURACY_WARN_M:
        frappe.msgprint(
            _("Sai số GPS {0}m > {1}m — vị trí có thể không chính xác.").format(
                doc.gps_accuracy, GPS_ACCURACY_WARN_M
            ),
            indicator="orange",
            alert=True,
        )


def set_distributor(doc, method=None):
    """Fetch NPP từ hồ sơ NVBH đang đăng nhập (NV không chọn NPP thủ công).

    doc/02 dòng 41: distributor lấy từ Sales Staff Profile của session user.
    """
    if doc.distributor:
        return

    distributor = frappe.db.get_value(
        "Sales Staff Profile", {"user": frappe.session.user}, "distributor"
    )
    if not distributor:
        frappe.throw(
            _("Tài khoản {0} chưa có Hồ sơ NVBH (Sales Staff Profile) — không xác định được NPP.").format(
                frappe.bold(frappe.session.user)
            )
        )
    doc.distributor = distributor


# ---------------------------------------------------------------------------
# Whitelisted API (portal NVBH gọi)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def create_point(
    point_name,
    phone,
    address_line,
    store_photo=None,
    latitude=None,
    longitude=None,
    gps_accuracy=None,
    bank_account_name=None,
    bank_account_no=None,
    bank_name=None,
):
    """Tạo điểm bán mới. `distributor` tự fetch từ hồ sơ NVBH (before_insert),
    chống trùng SĐT chạy trong validate. Trả về tên điểm vừa tạo.
    """
    doc = frappe.new_doc("Display Point")
    doc.update(
        {
            "point_name": point_name,
            "phone": phone,
            "address_line": address_line,
            "store_photo": store_photo,
            "latitude": latitude,
            "longitude": longitude,
            "gps_accuracy": gps_accuracy,
            "bank_account_name": bank_account_name,
            "bank_account_no": bank_account_no,
            "bank_name": bank_name,
        }
    )
    doc.insert()  # insert() tự enforce quyền Create + If Owner
    return {"name": doc.name, "distributor": doc.distributor}


@frappe.whitelist()
def point_by_phone(phone):
    """Tra điểm theo SĐT (khoá chống trùng). Trả {name, owned} hoặc None.

    `owned` = điểm thuộc người gọi (hoặc QL kênh) → có thể dùng để đăng ký luôn.
    """
    if not phone:
        return None
    row = frappe.db.get_value("Display Point", {"phone": phone}, ["name", "owner"], as_dict=True)
    if not row:
        return None
    roles = set(frappe.get_roles())
    owned = row.owner == frappe.session.user or bool(roles & {"Channel Manager", "System Manager"})
    return {"name": row.name, "owned": owned}


@frappe.whitelist()
def list_my_points(search=None, limit=20):
    """Liệt kê điểm của NVBH đang đăng nhập (If Owner) để tái sử dụng.

    Cho phép tìm theo tên điểm hoặc SĐT (dùng lại điểm đã có thay vì tạo trùng).
    """
    filters = {"owner": frappe.session.user, "is_active": 1}
    or_filters = None
    if search:
        or_filters = {
            "point_name": ("like", f"%{search}%"),
            "phone": ("like", f"%{search}%"),
        }

    return frappe.get_list(
        "Display Point",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "point_name", "phone", "distributor", "address_line", "store_photo"],
        order_by="modified desc",
        limit_page_length=frappe.utils.cint(limit) or 20,
    )
