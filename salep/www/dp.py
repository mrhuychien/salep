# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Context cho www page /dp — portal NVBH (SPA)."""

import frappe


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/dp"
        raise frappe.Redirect

    context.no_cache = 1
    context.add_breadcrumbs = 0

    roles = set(frappe.get_roles())
    profile = frappe.db.get_value(
        "Sales Staff Profile",
        {"user": frappe.session.user},
        ["name", "full_name", "distributor"],
        as_dict=True,
    )

    context.dp_user = frappe.session.user
    context.dp_full_name = (profile and profile.full_name) or frappe.utils.get_fullname() or frappe.session.user
    context.dp_staff_id = (profile and profile.name) or ""
    context.dp_distributor = (profile and profile.distributor) or ""
    context.dp_is_manager = 1 if roles & {"Channel Manager", "System Manager"} else 0
    context.dp_is_staff = 1 if "Sales Staff" in roles else 0
    context.dp_has_profile = 1 if profile else 0

    # Cache-bust: now() đã làm sạch ký tự để nhúng vào ?v= và import map.
    context.asset_version = frappe.utils.now().replace(" ", "T").replace(":", "-")
    context.csrf_token = frappe.sessions.get_csrf_token()
    return context
