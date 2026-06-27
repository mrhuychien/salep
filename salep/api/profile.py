# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""API hồ sơ NVBH (Sales Staff Profile) — mỗi User một hồ sơ, If Owner."""

import frappe
from frappe import _

_EDITABLE_FIELDS = (
    "full_name",
    "phone",
    "cccd",
    "profile_photo",
    "bank_account_name",
    "bank_account_no",
    "bank_name",
)


@frappe.whitelist()
def get_my_profile():
    """Trả hồ sơ của NVBH đang đăng nhập, hoặc None nếu chưa có."""
    name = frappe.db.get_value("Sales Staff Profile", {"user": frappe.session.user}, "name")
    if not name:
        return None
    return frappe.get_doc("Sales Staff Profile", name).as_dict()


@frappe.whitelist()
def upsert_my_profile(full_name, phone, distributor=None, **kwargs):
    """Tạo mới hoặc cập nhật hồ sơ của chính NVBH đang đăng nhập.

    `user` luôn ép = session.user (không cho sửa của người khác). `distributor`
    chỉ bắt buộc khi tạo mới (sau đó NV không tự đổi NPP).
    """
    name = frappe.db.get_value("Sales Staff Profile", {"user": frappe.session.user}, "name")

    if name:
        doc = frappe.get_doc("Sales Staff Profile", name)
        doc.check_permission("write")
    else:
        if not distributor:
            frappe.throw(_("Tạo hồ sơ lần đầu cần chọn NPP trực thuộc."))
        doc = frappe.new_doc("Sales Staff Profile")
        doc.user = frappe.session.user
        doc.distributor = distributor

    doc.full_name = full_name
    doc.phone = phone
    for field in _EDITABLE_FIELDS:
        if field in kwargs and kwargs[field] is not None:
            doc.set(field, kwargs[field])

    doc.save()
    return {"name": doc.name}
