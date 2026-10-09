# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Cấp quyền DocType mới Display Point Transfer (doc/08 §4): System
Manager full, Channel Manager chỉ đọc. Tái dùng install._grant_permissions cho đúng
DocType này (không đụng quyền đã chỉnh tay của DocType khác). Idempotent."""

import frappe

from salep.install import _grant_permissions

DOCTYPE = "Display Point Transfer"


def execute():
    _grant_permissions([DOCTYPE])
    frappe.clear_cache(doctype=DOCTYPE)
