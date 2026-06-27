# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""after_install: tạo Role + cấp quyền bằng add_permission().

doc/06: KHÔNG ship custom_docperm.json (name bị hash, đổi giữa site) → cấp quyền
bằng code. Mọi seed bọc try/except + log_error để lỗi seed không làm chết install.
"""

import frappe
from frappe.permissions import add_permission, update_permission_property

ROLES = ("Sales Staff", "Channel Manager")

# (read, write, create, delete, if_owner) theo doc/03_permission_matrix.md
PERMISSIONS = {
    "Sales Staff Profile": {
        "Sales Staff": dict(read=1, write=1, create=1, delete=0, if_owner=1),
        "Channel Manager": dict(read=1, write=1, create=0, delete=0, if_owner=0),
        "System Manager": dict(read=1, write=1, create=1, delete=1, if_owner=0),
    },
    "Display Point": {
        "Sales Staff": dict(read=1, write=1, create=1, delete=1, if_owner=1),
        "Channel Manager": dict(read=1, write=1, create=0, delete=0, if_owner=0),
        "System Manager": dict(read=1, write=1, create=1, delete=1, if_owner=0),
    },
    "Promotion Program": {
        "Sales Staff": dict(read=1, write=0, create=0, delete=0, if_owner=0),
        "Channel Manager": dict(read=1, write=1, create=1, delete=1, if_owner=0),
        "System Manager": dict(read=1, write=1, create=1, delete=1, if_owner=0),
    },
    "Display Participation": {
        "Sales Staff": dict(read=1, write=1, create=1, delete=1, if_owner=1),
        "Channel Manager": dict(read=1, write=1, create=0, delete=0, if_owner=0),
        "System Manager": dict(read=1, write=1, create=1, delete=1, if_owner=0),
    },
}


def after_install():
    _create_roles()
    _grant_permissions()
    frappe.clear_cache()


def _create_roles():
    for role_name in ROLES:
        try:
            if not frappe.db.exists("Role", role_name):
                frappe.get_doc(
                    {"doctype": "Role", "role_name": role_name, "desk_access": 1}
                ).insert(ignore_permissions=True)
        except Exception:
            frappe.log_error(title=f"salep: tạo role {role_name} thất bại")


def _grant_permissions():
    for doctype, role_perms in PERMISSIONS.items():
        for role, perms in role_perms.items():
            try:
                # add_permission tạo Custom DocPerm (read=1 mặc định) nếu chưa có.
                add_permission(doctype, role, 0)
                # Chữ ký: update_permission_property(doctype, role, permlevel, ptype, value)
                for ptype, value in perms.items():
                    update_permission_property(doctype, role, 0, ptype, value)
            except Exception:
                frappe.log_error(title=f"salep: cấp quyền {doctype}/{role} thất bại")
