# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DisplayRewardPayout(Document):
    """Trả thưởng 1 lần (Lần 1 / Lần 2) cho 1 lượt tham gia đã duyệt (doc/09). Ghi chủ yếu qua
    salep.api.payout (portal /dp, app npp); luật chung chạy cả khi QL kênh sửa trên Desk.
    Người ghi = owner / modified_by, thời điểm = creation / modified; ảnh ở bảng con `photos`."""

    def validate(self):
        # Import lười: tránh nạp salep.api khi Frappe chỉ load controller (sync DocType).
        from salep.api.payout import validate_payout_doc

        validate_payout_doc(self)

    def on_trash(self):
        from salep.api.payout import guard_payout_delete

        guard_payout_delete(self)
