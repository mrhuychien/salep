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

# Danh tính hồ sơ: NPP khoá tài khoản / reset mật khẩu / cho nghỉ việc theo `user` của hồ sơ
# thuộc NPP mình (doc/08 §3) → người thường không được tự trỏ hồ sơ sang người / NPP khác.
_IDENTITY_FIELDS = ("user", "distributor")
_IDENTITY_ADMIN_ROLES = {"System Manager", "Channel Manager"}


# ---------------------------------------------------------------------------
# doc_events (xem hooks.py)
# ---------------------------------------------------------------------------
def validate_profile(doc, method=None):
    """Khoá danh tính hồ sơ NV (`user`, `distributor`) với người thường (NV / chủ NPP).

    Chủ bản ghi có quyền ghi If Owner nên gọi được frappe.client.* trực tiếp:
    - Tạo mới: chỉ được tạo hồ sơ của CHÍNH mình (code server như npp `create_staff`
      chèn hồ sơ cho user vừa tạo với ignore_permissions).
    - Sửa: không được đổi `user` / `distributor`.
    QL kênh / System Manager, code server (ignore_permissions) và cài đặt/migrate được phép.
    """
    if (
        doc.flags.ignore_permissions
        or frappe.flags.in_install
        or frappe.flags.in_migrate
        or frappe.flags.in_patch
        or set(frappe.get_roles()) & _IDENTITY_ADMIN_ROLES
    ):
        return
    if doc.is_new():
        if doc.get("user") and doc.get("user") != frappe.session.user:
            frappe.throw(
                _("Chỉ được tạo hồ sơ nhân viên cho chính tài khoản đang đăng nhập."), frappe.PermissionError
            )
        return
    before = doc.get_doc_before_save()
    # So sánh sau khi quy rỗng/None về một (form gửi "" cho Link trống, DB lưu NULL).
    if before and any((before.get(f) or None) != (doc.get(f) or None) for f in _IDENTITY_FIELDS):
        frappe.throw(
            _("Không được đổi tài khoản / NPP của hồ sơ nhân viên — liên hệ quản lý kênh."),
            frappe.PermissionError,
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
