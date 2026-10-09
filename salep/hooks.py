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
    # NPP khoá / cho nghỉ việc theo hồ sơ NV và nhận diện chủ NPP qua User.custom_customer
    # → người thường không được tự đổi danh tính này (doc/08 §1, §3).
    "Sales Staff Profile": {
        "validate": "salep.api.profile.validate_profile",      # khoá user/distributor của hồ sơ
    },
    "User": {
        "validate": "salep.api.npp_manage.guard_npp_binding",  # chỉ System Manager gán custom_customer
    },
}

# Nhật ký bàn giao điểm (Display Point Transfer) là LỊCH SỬ — link tới điểm/hồ sơ NV không
# được chặn việc xoá hồ sơ NV hay điểm bán (doc/08).
ignore_links_on_delete = ["Display Point Transfer"]

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
