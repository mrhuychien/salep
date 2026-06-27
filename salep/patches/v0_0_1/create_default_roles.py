# Copyright (c) 2024, Chien and contributors
"""[pre_model_sync] Tạo Sales Staff & Channel Manager nếu chưa có (doc/06)."""

import frappe

ROLES = ("Sales Staff", "Channel Manager")


def execute():
    for role_name in ROLES:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc(
                {"doctype": "Role", "role_name": role_name, "desk_access": 1}
            ).insert(ignore_permissions=True)
