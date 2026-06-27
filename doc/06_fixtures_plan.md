# Fixtures Plan — App `display_point`

## fixtures trong hooks.py
```python
fixtures = [
  {"doctype": "Role", "filters": [["name", "in", ["Sales Staff", "Channel Manager"]]]},
  {"doctype": "Workflow", "filters": [["name", "in", ["Display Participation Approval"]]]},
  {"doctype": "Workflow State", "filters": [["name", "in",
      ["Nháp", "Chờ duyệt", "Đã duyệt", "Từ chối"]]]},
  {"doctype": "Workflow Action Master", "filters": [["name", "in",
      ["Gửi duyệt", "Duyệt", "Từ chối", "Gửi lại"]]]},
  {"doctype": "Custom Field", "filters": [["dt", "in", ["Customer"]]]},
  {"doctype": "Print Format", "filters": [["module", "=", "Display Point"]]},
]
```

## Roles cần tạo
- **Sales Staff** — NVBH bán hàng (gán cùng User của profile).
- **Channel Manager** — QL kênh (duyệt + dashboard toàn cảnh).

## Custom Fields (nếu cần trên Customer)
- (Optional) `Customer.custom_is_npp` (Check) — đánh dấu Customer nào là NPP để filter trong Link. Cân nhắc ở build.

## Property Setters
- `Display Point.search_fields = "point_name,phone,distributor"`
- `Display Participation.search_fields = "display_point,promotion_program,workflow_state"`

## Naming series cần set (patch ở build)
- `DP-.YYYY.-.#####` (Display Point)
- `DPT-.YYYY.-.#####` (Display Participation)
- `CT-.YYYY.-.###` (Promotion Program)
- `NV-.#####` (Sales Staff Profile)

## Patches dự kiến (implement ở nextcode-build)
- `v0_0_1.create_default_roles` — tạo Sales Staff, Channel Manager nếu chưa có.
- `v0_0_1.setup_workflow` — cài workflow Display Participation.
- `v0_0_1.add_db_indexes` — index `phone` (Display Point), `(display_point, promotion_program)` (Participation) cho chống trùng + dashboard.

## Shipping checklist (frappe-app-shipping-gotchas)
- `__init__.py` đủ mọi thư mục module.
- `patches.txt` có header `[pre_model_sync]` / `[post_model_sync]`.
- Permissions set trong `install.py` qua `add_permission()`, KHÔNG ship custom_docperm.json làm fixture.
- Sequence deploy: migrate → build → restart → refresh.
