# salep — Quản lý Điểm Trưng Bày (display_point)

Custom app ERPNext **v16** cho RVHG: NVBH tạo điểm bán + đăng ký lượt tham gia
chương trình trưng bày, QL kênh duyệt, dashboard 3 cấp. Thiết kế đầy đủ ở `doc/`
(`01_business_model` → `06_fixtures_plan`).

> App name = `salep` (package `salep`), module = **Display Point**.

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
- SPA portal NVBH (vanilla-JS no-build, hash router, Chart.js lazy, CSS prefix `dp-`) — chờ thiết kế UI riêng.
- Print Format (module Display Point) — export khi có mẫu.
