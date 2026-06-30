# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] DB index chống trùng + dashboard (doc/06 dòng 37). Idempotent."""

import frappe


def execute():
    # Chống trùng điểm theo SĐT + tra cứu tái sử dụng điểm nhanh.
    frappe.db.add_index("Display Point", ["phone"])
    # Danh sách/bản đồ điểm của NVBH (list_my_points lọc owner).
    frappe.db.add_index("Display Point", ["owner"])

    # Unique cặp điểm+chương trình & GROUP BY dashboard theo (point, program).
    frappe.db.add_index("Display Participation", ["display_point", "promotion_program"])
    # Hot path NVBH: staff_summary / list_my_participations / list_points_to_visit
    # (lọc owner [+ workflow_state]).
    frappe.db.add_index("Display Participation", ["owner", "workflow_state"])
    # list_program_participations + JOIN dashboard theo chương trình.
    frappe.db.add_index("Display Participation", ["promotion_program"])
    # npp_summary / rank theo NPP.
    frappe.db.add_index("Display Participation", ["distributor"])
