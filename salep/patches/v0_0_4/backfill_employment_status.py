# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Hồ sơ NV cũ có employment_status rỗng → 'Đang làm' (doc/08 §4).
Idempotent — chỉ chạm dòng còn rỗng."""

import frappe

STAFF_WORKING = "Đang làm"


def execute():
    if not frappe.db.has_column("Sales Staff Profile", "employment_status"):
        return
    # frappe.qb: 1 câu UPDATE hàng loạt (không load từng doc), giá trị tham số hoá;
    # không đổi `modified` vì chỉ chuẩn hoá dữ liệu cũ.
    profile = frappe.qb.DocType("Sales Staff Profile")
    (
        frappe.qb.update(profile)
        .set(profile.employment_status, STAFF_WORKING)
        .where(profile.employment_status.isnull() | (profile.employment_status == ""))
    ).run()
