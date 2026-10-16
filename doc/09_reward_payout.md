# 09 — Trả thưởng điểm bán trong chương trình (2 lần)

Mỗi **lượt tham gia đã duyệt** (`Display Participation`, `workflow_state = "Đã duyệt"`) được
trả thưởng **2 lần**. Mỗi lần ghi nhận: **ngày trả**, **ảnh trả thưởng** (chọn từ thư viện —
ảnh chuyển khoản, biên nhận…; **không** yêu cầu GPS, **không** bắt chụp camera), ghi chú.
Phần quản lý có danh sách **theo dõi tiến độ trả thưởng** theo chương trình (Lần 1, Lần 2).

Logic nằm **một chỗ**: `salep.api.payout` (app sở hữu dữ liệu). App `npp` chỉ xác định phạm vi
(NPP hoặc quản lý kênh) rồi gọi hàm lõi — như doc/08.

## 1. Luật

| # | Luật |
|---|---|
| R1 | Chỉ lượt `Đã duyệt` mới trả thưởng được. |
| R2 | Mỗi lượt tối đa 2 lần (`payout_round` ∈ {1, 2}); mỗi (lượt, lần) **một** bản ghi (unique). |
| R3 | Lần 2 chỉ ghi được khi đã có Lần 1; ngày Lần 2 ≥ ngày Lần 1. |
| R4 | `payout_date` bắt buộc, không ở tương lai (≤ hôm nay). |
| R5 | ≥ 1 ảnh, tối đa 10. Mỗi ảnh là URL file đã upload lên site (`/files/…` hoặc `/private/files/…`) **và** có bản ghi `File` với `file_url` đó — chặn URL ngoài / `javascript:`. |
| R6 | Ghi lại 1 lần đã có = **cập nhật** (ngày/ảnh/ghi chú thay mới; Version ghi lịch sử). |
| R7 | Xoá 1 lần: chỉ chủ NPP / quản lý; không xoá Lần 1 khi đã có Lần 2. |

**Ai được ghi (record/update):** NV phụ trách lượt (`participation.owner == session.user`),
chủ NPP của `participation.distributor` (`npp_manage.npp_customer_of()`), Channel Manager /
System Manager. Bên app `npp`: chủ NPP (qua `require_customer`) và quản lý kênh
(`promo_admin.ADMIN_ROLES`, gồm Accounts Manager — kế toán trả thưởng).
**Ai được xem:** như trên. **Ai được xoá:** chủ NPP, Channel/System Manager; bên `npp`: chủ
NPP + `ADMIN_ROLES`.

## 2. Schema — DocType mới `Display Reward Payout` (module Display Point)

`autoname: "DRP-.YYYY.-.#####"`, `track_changes: 1`, không submit, `permissions: []`
(cấp bằng install/patch: System Manager full; Channel Manager read/write/create/delete),
`make_attachments_public: 1` (ảnh tải lên ở form Desk mặc định public như portal; file private
chỉ người có quyền đọc DocType mở được → chủ NPP / NV / kế toán thấy ảnh hỏng).

| fieldname | type | ghi chú |
|---|---|---|
| `participation` | Link Display Participation, reqd, search_index | |
| `payout_round` | Int, reqd | 1 hoặc 2 |
| `payout_date` | Date, reqd | |
| `display_point` | Link Display Point, read_only | set từ lượt |
| `promotion_program` | Link Promotion Program, read_only, search_index | set từ lượt |
| `distributor` | Link Customer, read_only, search_index | set từ lượt |
| `photos` | Table Display Photo | ảnh trả thưởng (GPS để trống) |
| `note` | Small Text | |

Bản ghi đã lưu **không đổi được `participation`** (validate chặn, kể cả sửa trên Desk — muốn chuyển
lượt thì xoá rồi ghi lại): R3/R7 chỉ kiểm lượt mới, chuyển Lần 1 đi sẽ để Lần 2 của lượt cũ mồ côi.
Đổi `payout_round` đã bị R2/R3 chặn.
Người ghi = `owner` (tạo) / `modified_by` (sửa gần nhất); thời điểm = `creation` / `modified`.
Ảnh dùng lại child table `Display Photo` (`parenttype = "Display Reward Payout"`,
`parentfield = "photos"`) → **không** lẫn vào thống kê ảnh trưng bày (lọc
`parentfield = 'display_photos'`).

Patch `[post_model_sync]` `salep.patches.v0_0_5.setup_reward_payout` (idempotent): cấp quyền
DocType mới + `frappe.db.add_unique("Display Reward Payout", ["participation", "payout_round"])`.
`install.py`: PERMISSIONS + gọi cùng logic trong `after_install`.
`hooks.ignore_links_on_delete` **không** thêm (xoá lượt đã duyệt vốn bị chặn).

## 3. API — `salep/api/payout.py`

### 3.1 Hàm lõi (KHÔNG whitelist; người gọi tự kiểm phạm vi)

```python
PAYOUT_DOCTYPE = "Display Reward Payout"; ROUNDS = (1, 2); MAX_PHOTOS = 10
payout_map(participations) -> {participation: {1: row|None, 2: row|None}}
participation_payouts(participation) -> dict          # §3.3
record_payout(participation, payout_round, payout_date, photos, note=None) -> dict
delete_payout(participation, payout_round) -> dict
progress(distributor=None, program=None) -> dict      # §3.3 (distributor None = mọi NPP)
can_view(part) / can_record(part) / can_delete(part) -> bool   # quyền phía salep (§1)
```

`photos`: list hoặc chuỗi JSON; mỗi phần tử là chuỗi URL hoặc `{image|file_url}`.
`payout_round`: `cint`. Kiểm tra trước, ghi sau (try/except → rollback + `log_error(defer_insert=True)`
+ throw tiếng Việt). Ghi bằng `get_doc(...).insert/save(ignore_permissions=True)` sau khi
người gọi đã kiểm phạm vi.

### 3.2 Whitelisted (portal `/dp` và chung)

| Method | Quyền | Gọi |
|---|---|---|
| `get_payouts(participation)` | `can_view` | `participation_payouts` |
| `record(participation, payout_round, payout_date, photos, note=None)` — POST | `can_record` | `record_payout` |
| `remove(participation, payout_round)` — POST | `can_delete` | `delete_payout` |
| `npp_payout_progress(program=None)` | chủ NPP (`npp_manage._require_npp`) | `progress(distributor=npp, program)` |

`portal.get_participation` bổ sung (thêm key, không đổi key cũ): `payouts` (= `participation_payouts`
khi `Đã duyệt`, else `None`), `can_record_payout`, `can_delete_payout`.
`portal.list_my_participations`: mỗi dòng thêm `payouts_done` (0/1/2).

### 3.3 Shape

`participation_payouts(p)` →
```
{"participation": p, "eligible": bool, "reward_per_point": number,
 "rounds": [{"round": 1|2, "paid": bool, "name", "payout_date", "note",
             "photos": [{"url"}], "recorded_by", "recorded_by_label", "recorded_on"}]}
```
(luôn đủ 2 phần tử, `paid=false` → các trường còn lại `None`/`[]`).

`progress(distributor=None, program=None)` →
```
{"totals": {"eligible", "paid_1", "paid_2"},
 "programs": [{"program", "program_name", "status", "start_date", "end_date", "reward_per_point",
               "eligible", "paid_1", "paid_2", "pct_1", "pct_2"}],
 "rows": [{"participation", "display_point", "point_name", "point_phone", "distributor",
           "distributor_name", "promotion_program", "program_name", "owner", "staff_name",
           "round_1": {"name", "payout_date", "photos"} | None,
           "round_2": {...} | None,
           "status": "none" | "r1" | "done",
           // doc/10 §4 (xuất Excel):
           "reward_per_point", "point_tax_code", "point_bank_account_name", "point_bank_account_no",
           "point_bank_name"}]}
```
- `eligible` = số lượt `Đã duyệt` (trong phạm vi + lọc chương trình); `pct_*` = paid/eligible×100 (1 số lẻ).
- `programs`: chỉ chương trình có ≥1 lượt đã duyệt trong phạm vi; sắp "Đang chạy" trước, rồi `start_date` giảm dần.
- `rows`: lượt đã duyệt, sắp chưa trả trước (`none`, `r1`, `done`), rồi `point_name`; `photos` = số ảnh;
  `staff_name` theo Sales Staff Profile của owner (không có → fullname/user). Giới hạn 5000 dòng.
- `rows[i].reward_per_point` = thưởng/điểm của chương trình của lượt (số, rỗng → 0); `point_tax_code`,
  `point_bank_*` = MST + tài khoản nhận thưởng của điểm bán (chuỗi hoặc `None`) — lấy trong CÙNG lô truy
  vấn Display Point (không N+1). Wrapper app `npp` trả nguyên `rows` nên `/npp`, `/ql-km` có luôn các key này.

## 4. API — app `npp`

`npp/api/promo.py` (chủ NPP; `customer = require_customer()`; lượt phải thuộc NPP):
`payout_progress(program=None)`, `participation_payouts(name)`,
`record_payout(participation, payout_round, payout_date, photos, note=None)` — POST,
`delete_payout(participation, payout_round)` — POST.

`npp/api/promo_admin.py` (quản lý kênh, `_guard()`): `payout_progress(program=None, customer=None)`
(customer = lọc 1 NPP, rỗng = mọi NPP), `participation_payouts(name)`, `record_payout(...)` — POST,
`delete_payout(...)` — POST.

Bọc hàm lõi qua import lười `salep.api.payout`; ImportError → "Cần cập nhật app salep (bench
migrate) để dùng chức năng này."

## 5. Giao diện

**Form ghi trả thưởng (dùng chung ý tưởng ở 3 nơi):** tiêu đề "💰 Trả thưởng lần N — <điểm bán>";
ngày trả (`type=date`, mặc định hôm nay, `max` = hôm nay); ảnh: `<input type="file"
accept="image/*" multiple>` **không** `capture` (mở thư viện), lưới xem trước + xoá từng ảnh,
upload qua `/api/method/upload_file` (resize như sẵn có; ảnh không phải JPG/PNG — WebP, AVIF, GIF… —
luôn đổi sang JPEG vì tài khoản portal chỉ upload được JPG/PNG/GIF; trình duyệt không đọc được ảnh
(HEIC trên Android) → báo lỗi tiếng Việt, không gửi), không xin GPS; ghi chú; nút
"Lưu trả thưởng" (chống bấm 2 lần). Đã có → "Sửa" mở form điền sẵn.

- **`/dp`** — Chi tiết lượt (`participation-detail.js`): khi `Đã duyệt` có thẻ **Trả thưởng**
  2 dòng Lần 1 / Lần 2 (✓ ngày · người ghi · ảnh bấm phóng to, hoặc "Chưa trả"), nút ghi/sửa
  theo `can_record_payout`, xoá theo `can_delete_payout`. Danh sách lượt: lượt đã duyệt hiện
  chip "Trả thưởng 0/2 · 1/2 · 2/2". Quản lý NPP (`npp-manage.js`): pill thứ 4 **Trả thưởng**
  — chọn chương trình, thẻ tiến độ (Lần 1 x/N, Lần 2 y/N + thanh %), lọc trạng thái (Chưa trả /
  Đã trả lần 1 / Đủ 2 lần), phụ trách, tìm; thẻ → `#/participations/<name>`.
- **`/npp` Khuyến mại** (`khuyen-mai.js`): tab **💰 Trả thưởng** — bảng tiến độ theo chương trình,
  danh sách lượt (Điểm bán · Phụ trách · Lần 1 · Lần 2) + lọc; bấm dòng → modal trả thưởng
  (2 lần, ảnh, ghi/sửa/xoá). Modal chi tiết lượt ở tab Chương trình có mục Trả thưởng.
- **`/ql-km`** (`quan-ly-khuyenmai.js`): sub-tab **💰 Trả thưởng** — như trên cho mọi NPP, thêm
  cột/lọc NPP; kế toán ghi được.
