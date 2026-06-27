# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class SalesStaffProfile(Document):
    """Hồ sơ NVBH. Logic nghiệp vụ (nếu có) wire qua hooks.doc_events → salep.api.profile."""

    pass
