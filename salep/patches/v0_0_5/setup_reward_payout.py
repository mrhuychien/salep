# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Trả thưởng 2 lần (doc/09 §2) cho site đã cài: cấp quyền DocType mới
Display Reward Payout (System Manager full; Channel Manager read/write/create/delete) — tái
dùng install._grant_permissions cho đúng DocType này — và unique (participation, payout_round):
mỗi lượt mỗi lần trả một bản ghi (R2). Idempotent."""

import frappe

from salep.install import _grant_permissions

DOCTYPE = "Display Reward Payout"
UNIQUE_FIELDS = ["participation", "payout_round"]
UNIQUE_NAME = "unique_participation_payout_round"


def add_unique_index():
    """Unique (participation, payout_round). Idempotent (kiểm trên bảng của chính site)."""
    table = f"tab{DOCTYPE}"
    if frappe.db.has_index(table, UNIQUE_NAME):
        return
    frappe.db.add_unique(DOCTYPE, UNIQUE_FIELDS, constraint_name=UNIQUE_NAME)
    if not frappe.db.has_index(table, UNIQUE_NAME):
        # add_unique dò information_schema KHÔNG lọc theo database → trên server MariaDB nhiều
        # site, site khác đã có constraint cùng tên thì bỏ qua nhầm. Tạo thẳng trên bảng site này
        # (tên bảng/cột là hằng trong code, không có dữ liệu người dùng).
        frappe.db.sql_ddl(
            f"ALTER TABLE `{table}` ADD UNIQUE INDEX `{UNIQUE_NAME}` (`participation`, `payout_round`)"
        )


def execute():
    _grant_permissions([DOCTYPE])
    add_unique_index()
    frappe.clear_cache(doctype=DOCTYPE)
