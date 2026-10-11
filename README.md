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
> Hợp đồng API cho team NPP: [`doc/07_api_contract_dashboard.md`](doc/07_api_contract_dashboard.md).

## DocTypes (module Display Point)
| DocType | Vai trò | Naming |
|---|---|---|
| Sales Staff Profile | Hồ sơ NVBH (link User + Customer/NPP) | `NV-.#####` |
| Display Point | Điểm bán (master, bền, chống trùng SĐT) | `DP-.YYYY.-.#####` |
| Promotion Program | Chương trình trưng bày | `CT-.YYYY.-.###` |
| Display Participation | Lượt tham gia (transaction, có workflow) | `DPT-.YYYY.-.#####` |
| Display Point Transfer | Nhật ký bàn giao điểm bán (đổi NV phụ trách: gán lại / nghỉ việc), chỉ ghi bằng code | `hash` |
| Display Reward Payout | Trả thưởng điểm bán Lần 1 / Lần 2 cho lượt đã duyệt: ngày trả, ảnh (bảng con `Display Photo`, `parentfield = photos`), ghi chú | `DRP-.YYYY.-.#####` |

Sales Staff Profile có thêm `employment_status` (Đang làm / Nghỉ việc), `left_on`, `handover_to`.

## Kiến trúc (house style)
- Backend = **whitelisted methods** trong `salep/api/*`, wire qua `hooks.doc_events`. KHÔNG Server/Client Script rải rác.
- Permissions cấp bằng `add_permission()` trong `salep/install.py` (KHÔNG ship custom_docperm.json).
- Workflow **Display Participation Approval** + Roles cài bằng patch idempotent (`salep/patches/v0_0_1/`).
- `patches.txt` có header `[pre_model_sync]` / `[post_model_sync]`.
- DB index: `Display Point.phone`, `Display Point (distributor, owner)`, `(display_point, promotion_program)` trên lượt;
  unique `Display Reward Payout (participation, payout_round)`.

## API (portal gọi)
- `salep.api.point.create_point` / `.list_my_points`
- `salep.api.participation.create_participation` / `.submit_for_approval` / `.approve` / `.reject`
- `salep.api.profile.get_my_profile` / `.upsert_my_profile`
- `salep.api.dashboard.staff_summary` / `.npp_summary` / `.channel_summary` (role-gated)
- `salep.api.portal.list_programs` / `.list_my_participations` / `.get_point` / `.get_participation` (read cho SPA)
- `salep.api.npp_manage.npp_overview` / `.npp_participations` / `.npp_staff_history` /
  `.npp_assign_points` / `.npp_set_points_active` / `.npp_offboard_staff` — chủ NPP trên `/dp`
  (gate `_require_npp`: chỉ tài khoản NPP, tự scope theo NPP của mình)
- `salep.api.payout.get_payouts` / `.record` (POST) / `.remove` (POST) — trả thưởng 1 lượt (quyền
  `can_view` / `can_record` / `can_delete`) · `.npp_payout_progress` — tiến độ trả thưởng của NPP mình
  (gate `_require_npp`)

## Quản lý NV phụ trách điểm bán (chủ NPP) — [`doc/08`](doc/08_npp_staff_assignment.md)
NV phụ trách điểm = `Display Point.owner`, NV phụ trách lượt = `Display Participation.owner`.
Logic ghi nằm một chỗ ở `salep.api.npp_manage` (hàm lõi `assign_points`, `set_points_active`,
`offboard_staff`, `overview`, `participations`, `staff_history`); app `npp` (`/npp` → Khuyến mại)
gọi thẳng hàm lõi sau `require_customer()`, `/dp` gọi các method `npp_*`.
- Gán điểm cho NV (hoặc "NPP giữ lại" `__npp__`): đổi owner điểm + **mọi lượt của chương trình còn
  hiệu lực** sang người mới; lượt của chương trình **đã kết thúc giữ nguyên** người thực hiện (KPI cũ không dời).
- Kiểm tra trước, ghi sau: mọi điểm phải thuộc NPP, đích phải là NV của NPP đang làm + tài khoản hoạt động;
  lỗi giữa chừng → rollback toàn bộ. Tối đa 1000 điểm/lần. Mỗi điểm có thay đổi ghi 1 dòng `Display Point Transfer`.
- Nghỉ việc: bàn giao mọi điểm + lượt còn hiệu lực (mặc định về NPP), hồ sơ → `Nghỉ việc` (`left_on`,
  `handover_to`), khoá tài khoản NV (trừ tài khoản chủ NPP). Chạy lại = quét phần còn sót.
- Chủ NPP đọc được mọi điểm/lượt của NPP mình qua `portal.get_point` / `.get_participation` /
  `.list_program_participations` (mỗi lượt kèm `owner` + `staff_name`).

## Trả thưởng điểm bán (2 lần) — [`doc/09`](doc/09_reward_payout.md)
Mỗi lượt **đã duyệt** được trả thưởng **2 lần**; mỗi lần 1 bản ghi `Display Reward Payout` (ngày trả,
1–10 ảnh chọn từ thư viện — ảnh chuyển khoản / biên nhận, **không** GPS — và ghi chú). Logic nằm một chỗ
ở `salep.api.payout` (hàm lõi `payout_map`, `participation_payouts`, `record_payout`, `delete_payout`,
`progress`); app `npp` (`/npp` Khuyến mại, `/ql-km`) xác định phạm vi rồi gọi hàm lõi, `/dp` gọi các
method whitelisted.
- Chỉ lượt `Đã duyệt`; mỗi (lượt, lần) một bản ghi — ghi lại lần đã có = **cập nhật** (Version ghi lịch sử).
- Lần 2 cần có Lần 1, ngày Lần 2 ≥ ngày Lần 1; ngày trả bắt buộc, không ở tương lai.
- Ảnh phải là file đã upload lên site (`/files/…`, `/private/files/…`) và có bản ghi `File`.
- Ghi/sửa: NV phụ trách lượt, chủ NPP của lượt, Channel/System Manager. Xoá: chủ NPP, Channel/System
  Manager; không xoá Lần 1 khi đã có Lần 2.
- `portal.get_participation` trả thêm `payouts` / `can_record_payout` / `can_delete_payout`;
  `portal.list_my_participations` thêm `payouts_done` (0/1/2) mỗi lượt.
- Tiến độ (`progress`): tổng + từng chương trình (Lần 1 x/N, Lần 2 y/N, %) và danh sách lượt (chưa trả
  trước), tối đa 5000 dòng.

## SPA Portal NVBH — `/dp` (frappe-portal-spa)
www page `salep/www/dp.{py,html}`, asset `salep/public/salep/` → `/assets/salep/salep/`.
Vanilla JS **no-build**, hash router, view code-split, **import map cache-bust**, CSS prefix `dp-`
(design "Vibrant Professionalism" dịch sang CSS variables, không nạp Tailwind CDN).
- Routes: `#/` (dashboard) · `#/points` (lượt tham gia + lọc trạng thái) · `#/points/new` (tạo điểm) ·
  `#/programs` · `#/participations/new` (đăng ký + camera + GPS) · `#/participations/:name` (chi tiết + duyệt) ·
  `#/participations/:name/edit` (chỉnh sửa ảnh/GPS, đổi điểm/CT khi chưa duyệt) · `#/profile`.
- Routes chủ NPP (tab **Quản lý**, chỉ hiện khi `isNppOwner`): `#/npp?t=staff|points|programs`
  (nhân viên / điểm bán / chương trình, chọn nhiều + gán NV, nghỉ việc) · `#/npp/staff/:name`
  (lịch sử hoạt động 1 NV + chuyển điểm / nghỉ việc).
- Chống shell cũ: `SHELL_BUILD` ở `www/dp.py` phải khớp `BUILD` trong `shell.js` (lệch → banner tải lại).
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

> **Cập nhật doc/08 (gán / chuyển / nghỉ việc) BẮT BUỘC `bench migrate`**: tạo DocType
> `Display Point Transfer`, thêm field nghỉ việc vào Sales Staff Profile và chạy patch `v0_0_4`
> (cấp quyền, backfill `Đang làm`, index `(distributor, owner)`). Deploy cả 2 app `salep` + `npp`:
> `bench --site <site> migrate && bench build && bench restart`, rồi refresh. Chưa migrate → các nút
> gán/nghỉ việc báo "Cần cập nhật app salep (bench migrate)…".

> **Cập nhật doc/09 (trả thưởng 2 lần) BẮT BUỘC `bench migrate`**: tạo DocType `Display Reward Payout`
> và chạy patch `v0_0_5.setup_reward_payout` (cấp quyền System Manager / Channel Manager, unique
> `(participation, payout_round)`). Deploy cả 2 app `salep` + `npp`:
> `bench --site <site> migrate && bench build && bench restart`, rồi refresh (`SHELL_BUILD` = `dp-pay-r2`).
> Chưa migrate → ghi/xoá trả thưởng báo "Cần cập nhật app salep (bench migrate)…", phần xem coi như chưa trả.

## Còn lại (làm sau)
- Print Format (module Display Point) — export khi có mẫu.

> Dashboard QL kênh **không phải việc của `salep`**: method backend `channel_summary` /
> `npp_summary` đã xong (role-gated); phần UI (Chart.js, bản đồ GPS) dựng ở **portal NPP** — app
> riêng — gọi sang các method này. Nếu muốn, tôi có thể bàn giao "API contract" cho team NPP.
