# salep — Quản lý Điểm Trưng Bày (display_point)

Custom app ERPNext **v16** cho RVHG: NVBH tạo điểm bán + đăng ký lượt tham gia
chương trình trưng bày, QL kênh duyệt, dashboard 3 cấp. Thiết kế đầy đủ ở `doc/`
(`01_business_model` → `06_fixtures_plan`).

> App name = `salep` (package `salep`), module = **Display Point**.

### Phạm vi app (doc/01:33, doc/05:39–40)
`salep` gồm: **portal NVBH** (`/dp`) + toàn bộ **DocType và whitelisted methods** (kể cả các
method dashboard). **Giao diện quản chương trình + dashboard QL kênh KHÔNG nằm ở đây** — đó là
UI của **portal NPP (app nhà phân phối) đã có sẵn**, chỉ gọi sang `salep.api.dashboard.channel_summary`
(và `npp_summary`). `salep` là nơi *sinh* dữ liệu điểm/lượt tham gia và *cung cấp API*; app NPP *tiêu thụ*.

## DocTypes (module Display Point)
| DocType | Vai trò | Naming |
|---|---|---|
| Sales Staff Profile | Hồ sơ NVBH (link User + Customer/NPP) | `NV-.#####` |
| Display Point | Điểm bán (master, bền, chống trùng SĐT) | `DP-.YYYY.-.#####` |
| Promotion Program | Chương trình trưng bày | `CT-.YYYY.-.###` |
| Display Participation | Lượt tham gia (transaction, có workflow) | `DPT-.YYYY.-.#####` |

## Kiến trúc (house style)
- Backend = **whitelisted methods** trong `salep/api/*`, wire qua `hooks.doc_events`. KHÔNG Server/Client Script rải rác.
- Permissions cấp bằng `add_permission()` trong `salep/install.py` (KHÔNG ship custom_docperm.json).
- Workflow **Display Participation Approval** + Roles cài bằng patch idempotent (`salep/patches/v0_0_1/`).
- `patches.txt` có header `[pre_model_sync]` / `[post_model_sync]`.
- DB index: `Display Point.phone`, `(display_point, promotion_program)` trên lượt.

## API (portal gọi)
- `salep.api.point.create_point` / `.list_my_points`
- `salep.api.participation.create_participation` / `.submit_for_approval` / `.approve` / `.reject`
- `salep.api.profile.get_my_profile` / `.upsert_my_profile`
- `salep.api.dashboard.staff_summary` / `.npp_summary` / `.channel_summary` (role-gated)
- `salep.api.portal.list_programs` / `.list_my_participations` / `.get_point` / `.get_participation` (read cho SPA)

## SPA Portal NVBH — `/dp` (frappe-portal-spa)
www page `salep/www/dp.{py,html}`, asset `salep/public/salep/` → `/assets/salep/salep/`.
Vanilla JS **no-build**, hash router, view code-split, **import map cache-bust**, CSS prefix `dp-`
(design "Vibrant Professionalism" dịch sang CSS variables, không nạp Tailwind CDN).
- Routes: `#/` (dashboard) · `#/points` (lượt tham gia + lọc trạng thái) · `#/points/new` (tạo điểm) ·
  `#/programs` · `#/participations/new` (đăng ký + camera + GPS) · `#/participations/:name` (chi tiết + duyệt) ·
  `#/participations/:name/edit` (chỉnh sửa ảnh/GPS, đổi điểm/CT khi chưa duyệt) · `#/profile`.
- Sửa lượt theo Allow Edit doc/04 (NVBH: Nháp/Đã duyệt/Từ chối, KHÔNG ở Chờ duyệt); mọi sửa ghi `Version` và hiện ở timeline.
- Camera: `<input capture="environment">` + `upload_file`; GPS: `navigator.geolocation`.
- Quyền thật kiểm ở server (whitelisted methods); UI chỉ ẩn nút.
- Đổi `lib/*` hay `components/*` → THÊM vào import map trong `dp.html`, nếu không sẽ kẹt bản cache cũ.

## Cài đặt
```bash
# trên bench thật (app này dev ở môi trường khác nên chưa có bench ở đây)
bench get-app salep <repo-url>
bench --site <site> install-app salep
# Sequence sau mọi thay đổi: migrate → build → restart → refresh trình duyệt
bench --site <site> migrate && bench build && bench restart
```
Sau cài: gán role **Sales Staff** cho User của NVBH (kèm tạo Sales Staff Profile),
role **Channel Manager** cho QL kênh.

## Còn lại (làm sau)
- Print Format (module Display Point) — export khi có mẫu.

> Dashboard QL kênh **không phải việc của `salep`**: method backend `channel_summary` /
> `npp_summary` đã xong (role-gated); phần UI (Chart.js, bản đồ GPS) dựng ở **portal NPP** — app
> riêng — gọi sang các method này. Nếu muốn, tôi có thể bàn giao "API contract" cho team NPP.
