# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Nắn workflow_state lệch chuẩn Unicode về canonical cho mọi
lượt tham gia cũ (vd 'Nháp' dạng NFD → 'Nháp' NFC) để khớp workflow."""

import unicodedata

import frappe

_CANON = ("Nháp", "Chờ duyệt", "Đã duyệt", "Từ chối")


def _fold(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


def execute():
    fold_map = {_fold(c): c for c in _CANON}
    for p in frappe.get_all("Display Participation", fields=["name", "workflow_state"]):
        cur = p.workflow_state
        if not cur:
            continue
        canon = fold_map.get(_fold(cur))
        if canon and canon != cur:
            frappe.db.set_value("Display Participation", p.name, "workflow_state", canon, update_modified=False)
