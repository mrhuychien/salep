# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DisplayParticipation(Document):
    """Lượt tham gia trưng bày (transaction). Validate/state/guard wire qua
    hooks.doc_events → salep.api.participation. Workflow: Display Participation Approval."""

    pass
