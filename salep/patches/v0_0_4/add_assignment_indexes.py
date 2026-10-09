# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Index (distributor, owner) cho Display Point — lọc điểm theo NPP +
NV phụ trách (tổng quan NPP, nghỉ việc, chặn xoá NV còn điểm). Idempotent."""

import frappe


def execute():
    frappe.db.add_index("Display Point", ["distributor", "owner"])
