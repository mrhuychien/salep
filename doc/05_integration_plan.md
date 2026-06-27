# Integration & Hooks Plan — App `display_point`

## Touch points với core ERPNext
- `Customer` (NPP): link từ Sales Staff Profile, Display Point, Display Participation. KHÔNG tạo Customer mới cho điểm bán.
- `User`: link từ Sales Staff Profile (đăng nhập portal). NVBH cần User account + role Sales Staff.
- KHÔNG tạo Address con của Customer (đã chốt bỏ).

## hooks.py plan
```python
doc_events = {
  "Display Point": {
    "validate": "display_point.api.point.validate_point",       # chống trùng SĐT, cảnh báo GPS
    "before_insert": "display_point.api.point.set_distributor",   # fetch NPP từ profile NVBH
  },
  "Display Participation": {
    "validate": "display_point.api.participation.validate_participation",  # unique cặp point+program, reject_reason
    "on_update": "display_point.api.participation.on_state_change",        # set approved_by/on
    "on_trash": "display_point.api.participation.guard_delete",            # chặn xoá khi Đã duyệt
  },
}

fixtures = ["Role", "Workflow", "Workflow State", "Workflow Action Master",
            "Custom Field", "Property Setter", "Print Format"]
```

## Whitelisted API endpoints (portal gọi)
- `display_point.api.point.create_point` — tạo điểm (validate trùng).
- `display_point.api.point.list_my_points` — list điểm của NVBH (ifowner), search theo SĐT/tên để tái sử dụng.
- `display_point.api.participation.create_participation` — đăng ký lượt tham gia + ảnh.
- `display_point.api.participation.submit_for_approval` — Nháp → Chờ duyệt.
- `display_point.api.participation.approve` / `.reject` — QL kênh (role-gated).
- `display_point.api.profile.get_my_profile` / `.upsert_my_profile` — hồ sơ NVBH.
- **Dashboard** (role-gated, kiểu frappe-sales-analytics):
  - `display_point.api.dashboard.staff_summary` — NVBH: điểm của mình theo trạng thái/chương trình.
  - `display_point.api.dashboard.npp_summary` — theo NPP.
  - `display_point.api.dashboard.channel_summary` — QL kênh: toàn cảnh, xếp hạng NPP/NV, ngân sách đã dùng = count(điểm duyệt) × reward_per_point vs budget, map GPS.

## Portal SPA (frappe-portal-spa)
- App `display_point` phục vụ portal NVBH (tạo điểm/lượt tham gia, hồ sơ, dashboard NVBH).
- Tầng quản chương trình + dashboard QL kênh nhúng vào **portal NPP đã có** (gọi cùng whitelisted methods).
- Mobile-first, hash router, code-split, Chart.js lazy, `<input capture="environment">` ép camera, `navigator.geolocation` lấy GPS. CSS prefix `dp-`.

## Background jobs
- Không cần job nặng ở v1. Dashboard query trực tiếp (có index).
