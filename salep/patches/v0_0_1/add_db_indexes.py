# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] DB index chống trùng + dashboard (doc/06 dòng 37). Idempotent."""

import frappe


def execute():
    # Chống trùng điểm theo SĐT + tra cứu tái sử dụng điểm nhanh.
    frappe.db.add_index("Display Point", ["phone"])

    # Unique cặp điểm+chương trình & GROUP BY dashboard theo (point, program).
    frappe.db.add_index("Display Participation", ["display_point", "promotion_program"])
