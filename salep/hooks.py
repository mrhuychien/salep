app_name = "salep"
app_title = "Salep — Điểm Trưng Bày"
app_publisher = "Chien"
app_description = "Quản lý Điểm Trưng Bày (display_point) cho RVHG trên ERPNext v16"
app_email = "mrhuychien@gmail.com"
app_license = "mit"

# ---------------------------------------------------------------------------
# Document Events (house style: logic ở salep.api.*, KHÔNG Server/Client Script)
# Xem doc/05_integration_plan.md
# ---------------------------------------------------------------------------
doc_events = {
    "Display Point": {
        "validate": "salep.api.point.validate_point",          # chống trùng SĐT, cảnh báo GPS
        "before_insert": "salep.api.point.set_distributor",    # fetch NPP từ profile NVBH
    },
    "Display Participation": {
        "validate": "salep.api.participation.validate_participation",  # unique cặp point+program, reject_reason
        "on_update": "salep.api.participation.on_state_change",        # set approved_by/on khi Đã duyệt
        "on_trash": "salep.api.participation.guard_delete",            # chặn xoá khi Đã duyệt
    },
}

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------
after_install = "salep.install.after_install"

# ---------------------------------------------------------------------------
# Fixtures — xem doc/06_fixtures_plan.md
# Lưu ý: Custom DocPerm KHÔNG ship qua fixture (hash name) → cấp quyền bằng
# add_permission() trong salep/install.py. Workflow/Role được cài idempotent
# bằng patch; danh sách dưới để round-trip khi `bench export-fixtures` trên bench thật.
# ---------------------------------------------------------------------------
fixtures = [
    {"doctype": "Role", "filters": [["name", "in", ["Sales Staff", "Channel Manager"]]]},
    {"doctype": "Workflow", "filters": [["name", "in", ["Display Participation Approval"]]]},
    {"doctype": "Workflow State", "filters": [["name", "in",
        ["Nháp", "Chờ duyệt", "Đã duyệt", "Từ chối"]]]},
    {"doctype": "Workflow Action Master", "filters": [["name", "in",
        ["Gửi duyệt", "Duyệt", "Từ chối", "Gửi lại"]]]},
    {"doctype": "Custom Field", "filters": [["dt", "in", ["Customer"]]]},
    {"doctype": "Property Setter", "filters": [["doc_type", "in",
        ["Display Point", "Display Participation"]]]},
    {"doctype": "Print Format", "filters": [["module", "=", "Display Point"]]},
]
