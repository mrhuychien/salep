# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DisplayPointTransfer(Document):
    """Nhật ký bàn giao điểm bán (đổi NV phụ trách). Chỉ ghi bằng code qua
    salep.api.npp_manage (gán lại / nghỉ việc) — người thao tác = owner, thời điểm = creation."""

    pass
