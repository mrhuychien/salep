# 08 — NPP quản lý nhân viên phụ trách điểm bán (gán / chuyển / nghỉ việc)

Phạm vi: chủ NPP (nhà phân phối) quản lý **nhân viên phụ trách** điểm bán và lượt
tham gia chương trình, trên **cả hai portal**:

- `/npp` (app `npp`, tab Khuyến mại `views/khuyen-mai.js`) — gọi `npp.api.promo.*`
  (scope `require_customer()` = `User.custom_customer`).
- `/dp` (app `salep`) — tài khoản chủ NPP thấy **mọi** điểm bán / chương trình / lượt
  tham gia của NPP mình, gọi `salep.api.npp_manage.npp_*`.

Logic **ghi** (gán, bật/tắt, nghỉ việc) + lịch sử NV nằm **một chỗ**:
`salep.api.npp_manage` (app sở hữu mô hình dữ liệu). App `npp` chỉ xác định NPP
(`require_customer`) rồi gọi hàm lõi. Phần **đọc danh sách** mỗi app tự làm (như hiện tại).

## 1. Khái niệm

| Khái niệm | Định nghĩa |
|---|---|
| **NV phụ trách điểm bán** | `Display Point.owner` (User). Đây là cơ chế If Owner mà `/dp` đang dùng: NV thấy/sửa điểm của mình, chỉ đăng ký tham gia trên điểm của mình (`_assert_owns_point`). Gán = đổi `owner`. |
| **NV phụ trách lượt tham gia** | `Display Participation.owner`. NV này chụp ảnh báo cáo tháng (`list_points_to_visit` lọc owner), sửa lượt, gửi duyệt. |
| **owner_kind** | `"npp"` = owner là tài khoản NPP (xem `npp_users`) — **kể cả** khi chủ NPP có hồ sơ NV riêng (đích `"__npp__"` rơi vào chính tài khoản này); `"staff"` = owner có Sales Staff Profile **của NPP này**; `"other"` = còn lại (Administrator, NV đã xoá hồ sơ, NV NPP khác…). |
| **NPP giữ (chưa giao)** | điểm có `owner_kind == "npp"`. |
| **Tài khoản NPP** (`npp_users`) | User có `User.custom_customer == NPP` (field app `npp` ship; kiểm `has_field` trước) **∪** Portal User (`parenttype="Customer"`, `parent=NPP`). |
| **Chủ NPP** trên `/dp` | `npp_customer_of(user)`: `User.custom_customer` (nếu field tồn tại & có giá trị) → else `Portal User.parent` (parenttype Customer) → else `None`. Vì đây là danh tính để gán/chuyển điểm và khoá NV, user **không được tự gắn/đổi** `custom_customer` trên bản ghi User của mình (Frappe chia sẻ User cho chính họ quyền ghi): doc_event `User.validate` → `salep.api.npp_manage.guard_npp_binding` chỉ cho System Manager, code server (`ignore_permissions`) và cài đặt/migrate đặt/đổi field (§4). |
| **Chương trình còn hiệu lực** | `status != "Kết thúc"` **và** (`end_date` rỗng hoặc `end_date >= today()`). |
| **Nghỉ việc** | `Sales Staff Profile.employment_status == "Nghỉ việc"`. Rỗng/None coi như `"Đang làm"`. |

## 2. Luật chuyển — `assign_points` (nguồn duy nhất)

Với mỗi điểm P trong lô, đích là user U:

1. Nếu `P.owner != U`: `frappe.db.set_value("Display Point", P, "owner", U, update_modified=False)`.
2. Mọi `Display Participation` của P (cùng distributor) thuộc chương trình **còn hiệu lực**
   mà `owner != U` → `owner = U` (`update_modified=False`). Kể cả khi P đã thuộc U
   (gán lại = "sửa" lượt lạc chủ).
3. Lượt của chương trình **đã kết thúc** giữ nguyên người thực hiện → KPI/lịch sử cũ không dời.
4. Nếu (1) đổi owner **hoặc** (2) chuyển ≥1 lượt → ghi 1 dòng `Display Point Transfer`.
   Không đổi gì → `skipped += 1`, không ghi log.
5. **Kiểm tra trước, ghi sau**: mọi điểm phải tồn tại và `distributor == NPP`, đích hợp lệ;
   lỗi bất kỳ → throw trước khi ghi (không chuyển nửa vời). Phần ghi bọc try/except:
   lỗi → `frappe.db.rollback()` + `frappe.log_error(...)` + throw tiếng Việt nêu bước lỗi.
6. Đích hợp lệ:
   - `target == "__npp__"` → U = `npp_owner_user(NPP)`.
   - else `target` = tên Sales Staff Profile: phải thuộc NPP, `employment_status != "Nghỉ việc"`,
     User `enabled == 1`. Sai → throw.
7. Giới hạn lô `BULK_MAX = 1000` điểm/lần gọi (hàm public). `offboard_staff` gọi bản nội bộ không cap.

`npp_owner_user(NPP)`: session user nếu `npp_customer_of(session.user) == NPP`; else user
**enabled** đầu tiên trong `npp_users(NPP)` (custom_customer trước, order by creation);
không có → throw "Không xác định được tài khoản NPP để nhận bàn giao".

## 3. Nghỉ việc — `offboard_staff`

1. Hồ sơ phải thuộc NPP. `prof.user == session.user` → throw "Không thể tự cho mình nghỉ việc".
2. `target` mặc định `"__npp__"`; `target == staff` → throw. Đích kiểm như §2.6.
3. Chuyển **mọi** điểm `{distributor: NPP, owner: prof.user}` theo §2 (`reason="Nghỉ việc"`).
4. Chuyển nốt lượt **còn hiệu lực** NV còn giữ (`{distributor: NPP, owner: prof.user}`) trên
   điểm của người khác → U (không ghi log điểm; cộng vào `participations`).
5. Hồ sơ (`get_doc` + `save(ignore_permissions=True)` → có Version):
   `employment_status="Nghỉ việc"`, `left_on=today()`, `handover_to=U` (chỉ set field tồn tại).
6. `User.enabled = 0` — **trừ khi** `prof.user` là tài khoản NPP — thuộc `npp_users(NPP)` (không khoá
   tài khoản chủ NPP) **hoặc** là chủ NPP khác (`npp_customer_of(prof.user)` có giá trị, vd. hồ sơ NV cũ
   còn treo ở NPP này) — hoặc là tài khoản nội bộ (Administrator, System/Channel/Sales/Accounts Manager).
7. Chạy lại trên NV đã nghỉ = quét phần còn sót (idempotent).

Bên `/npp`:
- `set_staff_active(staff, 1)` trên NV đã nghỉ → `employment_status="Đang làm"`, xoá
  `left_on`/`handover_to` (điểm **không** tự quay về).
- `set_staff_active(..., 0)` từ chối tự khoá chính mình và tài khoản nội bộ; `delete_staff` không khoá
  tài khoản NPP / nội bộ. `hooks.ignore_links_on_delete = ["Display Point Transfer"]` → nhật ký
  bàn giao không chặn xoá hồ sơ NV / điểm bán.
- `delete_staff` bị chặn nếu NV còn điểm bán (`{distributor, owner: user}`) → thông báo
  "Nhân viên còn N điểm bán — dùng Nghỉ việc để bàn giao trước khi xoá." — **trừ** hồ sơ NV
  của chính tài khoản NPP (điểm của nó là "NPP giữ", xoá hồ sơ không làm điểm mồ côi).
- Tạm dừng (`set_staff_active(…, 0)`) và xoá có khoá tài khoản → đăng xuất mọi phiên của NV
  (`clear_sessions`, lỗi chỉ ghi log). Mọi endpoint GHI của `promo.py` chỉ nhận POST.

## 4. Schema (app `salep`)

**Sales Staff Profile** — thêm sau `distributor`:

| fieldname | type | ghi chú |
|---|---|---|
| `employment_status` | Select `Đang làm\nNghỉ việc`, default `Đang làm` | `in_list_view`, `in_standard_filter` |
| `left_on` | Date, read_only | `depends_on: eval:doc.employment_status=='Nghỉ việc'` |
| `handover_to` | Link User, read_only | như trên, label "Bàn giao cho" |

**Khoá danh tính hồ sơ** — doc_event `Sales Staff Profile.validate` → `salep.api.profile.validate_profile`
(NV/chủ NPP có quyền ghi If Owner trên hồ sơ mình tạo, gọi được `frappe.client.*` trực tiếp; mà §3 khoá
tài khoản theo `prof.user`):
- Tạo mới: chỉ được tạo hồ sơ có `user == session.user` (code server như npp `create_staff` chèn với
  `ignore_permissions`).
- Sửa: không được đổi `user` / `distributor`.
- Bỏ qua cho System Manager / Channel Manager, `ignore_permissions`, cài đặt/migrate/patch.

Cùng lý do, `User.custom_customer` (danh tính chủ NPP, §1) có doc_event `User.validate` →
`salep.api.npp_manage.guard_npp_binding`: chỉ System Manager (hoặc code server `ignore_permissions`,
cài đặt/migrate/patch) được đặt/đổi giá trị.

**DocType mới `Display Point Transfer`** (module Display Point, `autoname: hash`,
không submit, `track_changes: 0`, `in_create: 1`, sort `creation desc`):

| fieldname | type | ghi chú |
|---|---|---|
| `display_point` | Link Display Point, reqd, search_index | |
| `distributor` | Link Customer, reqd, search_index | |
| `from_user` | Link User, search_index | owner cũ |
| `to_user` | Link User, reqd, search_index | owner mới |
| `from_staff` | Link Sales Staff Profile | nếu owner cũ là NV |
| `to_staff` | Link Sales Staff Profile | nếu owner mới là NV |
| `reason` | Select `Gán lại\nNghỉ việc`, default `Gán lại` | |
| `participations_moved` | Int | |
| `note` | Small Text | |

Người thao tác = `owner`, thời điểm = `creation`. Quyền (install.py + patch):
System Manager full; Channel Manager read. NPP đọc qua whitelisted methods (đã scope).

**Patches** `[post_model_sync]` (idempotent):
- `salep.patches.v0_0_4.grant_transfer_perms` — cấp quyền DocType mới (tái dùng `install._grant_permissions` cho đúng doctype đó).
- `salep.patches.v0_0_4.backfill_employment_status` — `employment_status` rỗng → `Đang làm`.
- `salep.patches.v0_0_4.add_assignment_indexes` — `Display Point (distributor, owner)`.

Deploy: `bench --site <site> migrate && bench build && bench restart` (cả 2 app), rồi refresh.
App `npp` mới + `salep` cũ → nút gán/nghỉ việc/lịch sử báo "Cần cập nhật app salep…";
tính năng cũ vẫn chạy.

## 5. API — `salep/api/npp_manage.py`

### 5.1 Hằng & hàm lõi (KHÔNG whitelist; người gọi PHẢI tự xác định NPP)

```python
STAFF_WORKING = "Đang làm"; STAFF_LEFT = "Nghỉ việc"
REASON_ASSIGN = "Gán lại"; REASON_OFFBOARD = "Nghỉ việc"
TARGET_NPP = "__npp__"; BULK_MAX = 1000

npp_customer_of(user=None) -> str | None
npp_users(distributor) -> list[str]
npp_owner_user(distributor) -> str
owner_resolver(distributor) -> callable(user) -> {"owner_kind", "staff", "staff_name", "staff_left"}
active_program_names() -> set[str]
overview(distributor) -> dict                      # §5.3
participations(distributor, program=None) -> list  # §5.3
staff_history(distributor, staff) -> dict          # §5.3
assign_points(distributor, points, target, note=None, reason=REASON_ASSIGN) -> dict
set_points_active(distributor, points, active) -> dict
offboard_staff(distributor, staff, target=TARGET_NPP, note=None) -> dict
```

`points` nhận list hoặc chuỗi JSON (`frappe.parse_json`). `active` nhận 0/1/"0"/"1"/bool (`cint`).

### 5.2 Whitelisted cho `/dp` — gate `_require_npp()`

`_require_npp()`: Guest → PermissionError; `npp_customer_of()` rỗng → PermissionError
"Chỉ tài khoản nhà phân phối mới dùng được chức năng này." Trả distributor.

| Method | Gọi |
|---|---|
| `npp_overview()` | `overview(d)` |
| `npp_participations(program=None)` | `participations(d, program)` |
| `npp_staff_history(staff)` | `staff_history(d, staff)` |
| `npp_assign_points(points, target, note=None)` | `assign_points(d, …)` |
| `npp_set_points_active(points, active)` | `set_points_active(d, …)` |
| `npp_offboard_staff(staff, target=None, note=None)` | `offboard_staff(d, staff, target or TARGET_NPP, note)` |

### 5.3 Shape trả về

`owner_resolver(user)` →
`{"owner_kind": "staff"|"npp"|"other", "staff": <profile name>|None, "staff_name": <nhãn>, "staff_left": bool}`
— nhãn: staff → `full_name`; npp → `"NPP (chưa giao)"`; other → `frappe.utils.get_fullname(user)` hoặc user.

`overview(d)`:
```
{
  "customer": d, "customer_name": str,
  "totals": {programs, running, points, active_points, unassigned_points, participated_points,
             participations, approved, pending, staff, staff_working, staff_left},
  "programs": [{program, program_name, status, start_date, end_date, is_active,
                participations, approved, pending, points, approved_points, coverage_pct,
                reward_per_point}],                                   // key cuối: doc/10 §4
  "points":   [{name, point_name, phone, address_line, is_active, latitude, longitude, store_photo,
                creation, owner, owner_kind, staff, staff_name, staff_left,
                participations, approved, participated,
                tax_code, bank_account_name, bank_account_no, bank_name}],   // 4 key cuối: doc/10 §4
  "staff":    [{name, user, full_name, phone, employment_status, resigned, left_on, active,
                is_self, points, participations, approved, pending,
                cccd}]                                                // key cuối: doc/10 §4
}
```
- `programs`: mọi Promotion Program (như `/npp`), chỉ số tính trên lượt của NPP; sắp
  "Đang chạy" trước rồi theo `approved` giảm dần. `coverage_pct` = approved_points / active_points × 100.
- `points`: sắp `point_name asc`; `participations/approved` = số lượt của điểm.
  `tax_code`, `bank_*` = MST + tài khoản nhận thưởng của điểm (thêm cho xuất Excel — doc/10 §4; chuỗi
  hoặc `None`, cùng truy vấn Display Point).
- `staff`: hồ sơ của NPP (kể cả đã nghỉ), sắp: đang làm trước, rồi `full_name`. `active` = `User.enabled`;
  `is_self` = `user == session.user`; `points` = số điểm owner = user (trong NPP);
  `participations/approved/pending` theo owner (trong NPP). Dates → `str` hoặc `None`.
  `cccd` = `Sales Staff Profile.cccd` (chuỗi hoặc `None`, cùng truy vấn hồ sơ — doc/10 §4).
- `programs[i].reward_per_point` = `Promotion Program.reward_per_point` qua `flt` (rỗng → `0`; cùng
  giá trị với `payout.progress().programs[i]`, cùng truy vấn `_program_map()` — doc/10 §4).
- `pending` = lượt có `workflow_state` không thuộc {Đã duyệt, Từ chối}.

`participations(d, program=None)` — lượt của NPP, `order_by modified desc`, `limit 2000`:
```
[{name, display_point, point_name, point_phone, point_active, promotion_program, program_name,
  program_status, program_active, workflow_state, reject_reason, modified, latitude, longitude,
  owner, owner_kind, staff, staff_name, staff_left, point_owner, point_staff_name}]
```

`staff_history(d, staff)` — throw PermissionError nếu hồ sơ không thuộc NPP:
```
{
  "staff": {name, user, full_name, phone, cccd, employment_status, resigned, left_on, handover_to,
            handover_label, active, is_self, creation, last_login},
  "stats": {points, active_points, participations, approved, pending, active_participations},
  "points": [{name, point_name, phone, address_line, is_active, latitude, longitude,
              participations, approved}],
  "participations": [{name, display_point, point_name, promotion_program, program_name,
                      program_status, program_active, workflow_state, modified,
                      reject_reason, latitude, longitude, point_phone}],   // 4 key cuối: doc/10 §4
  "transfers": [{name, creation, display_point, point_name, direction ("in"|"out"),
                 counterpart_label, reason, note, by_label, participations_moved}]
}
```
- `points` = điểm owner = user trong NPP; `participations` = lượt owner = user trong NPP
  (mọi chương trình, modified desc, limit 1000); `reject_reason/latitude/longitude` = của LƯỢT,
  `point_phone` = SĐT điểm trong NPP (điểm NV đang giữ, hoặc nạp theo lô cùng tên điểm cho lượt
  "lạc chủ"; điểm ngoài NPP / đã xoá → `None`) — cùng nghĩa `participations()`;
  `transfers` = log có `from_user` hoặc `to_user` = user trong NPP, `creation desc`, limit 300 (bỏ qua nếu bảng chưa tồn tại → `[]`).
  `direction="in"` khi `to_user == user`; `counterpart_label` = nhãn bên kia (owner_resolver);
  `by_label` = fullname của người thao tác (`owner`).

`assign_points(...)` →
`{"moved": int, "skipped": int, "participations": int, "target": {"user", "staff", "label", "kind"}}`

`set_points_active(...)` → `{"updated": int}` (set_value `is_active`, chỉ điểm thuộc NPP; kiểm trước, ghi sau).

`offboard_staff(...)` →
`{"staff": name, "points": int, "participations": int, "target": {...}, "disabled": bool}`

## 6. Thay đổi endpoint có sẵn (app `salep`)

- `portal.get_point(name)` / `portal.get_participation(name)`: thay `check_permission("read")`
  bằng kiểm: `frappe.has_permission(doc.doctype, "read", doc=doc)` **hoặc**
  `npp_customer_of() == doc.distributor` (chủ NPP đọc được mọi điểm/lượt của NPP mình); else
  `frappe.throw(..., frappe.PermissionError)`.
- `portal.list_program_participations(program)`: nếu `npp_customer_of()` có giá trị và user
  **không** có Channel Manager/System Manager → `frappe.get_all` lọc
  `{promotion_program, distributor: npp}`; mọi trường hợp: mỗi dòng thêm `owner` +
  `staff_name` (nhãn theo Sales Staff Profile; không có → fullname/user).
- `www/dp.py`: context thêm `dp_npp_customer`, `dp_is_npp_owner`, `shell_build`;
  `dp_is_npp` = 1 nếu `_is_npp(user)` **hoặc** là chủ NPP.
  `DP_CONTEXT` thêm `nppCustomer`, `isNppOwner`, `shellBuild`.

## 7. API — app `npp` (`npp/api/promo.py`)

- `npp_overview` (giữ nguyên key cũ) bổ sung:
  - `totals.unassigned_points`, `totals.staff_left`
  - `points[i]`: `owner, owner_kind, staff, staff_name, staff_left, participations, approved`
  - `staff[i]`: `points, employment_status, resigned, left_on`
  (tính tại chỗ, cùng định nghĩa §1; field `employment_status` thiếu → coi như "Đang làm").
  - doc/10 §4 (xuất Excel): `points[i]` thêm `tax_code, bank_account_name, bank_account_no, bank_name,
    creation` (`creation` = str hoặc `None`).
  - `staff[]` / `totals.staff` **không** còn dòng giả cho tài khoản NPP (owner là tài khoản NPP
    mà không có hồ sơ NV) — điểm của nó đã hiện là "NPP giữ".
- `npp_participations` mỗi dòng thêm `staff, staff_name, staff_left, owner_kind, program_active,
  point_phone`; giới hạn 2000 dòng (UI báo khi chạm trần).
- Mới (bọc hàm lõi salep qua `_npp_manage()`; ImportError → throw
  "Cần cập nhật app salep (bench migrate) để dùng chức năng này."):
  - `staff_history(staff, customer=None)`
  - `assign_points(points, target, note=None, customer=None)`
  - `set_points_active(points, active, customer=None)`
  - `offboard_staff(staff, target=None, note=None, customer=None)`
- `set_staff_active` (kích hoạt NV đã nghỉ → về Đang làm), `delete_staff` (chặn khi còn điểm) — xem §3.

## 8. Giao diện

### `/npp` → Khuyến mại (`views/khuyen-mai.js`)
- Giữ tab đang mở sau mỗi thao tác (không reset về Nhân viên).
- **Nhân viên**: lọc trạng thái (Đang làm / Đã nghỉ / Tất cả) + tìm; cột Điểm bán; badge
  Hoạt động / Tạm dừng / Đã nghỉ. Bấm NV → modal: thông tin + KPI + nút Sửa / Đổi MK /
  Tạm dừng-Kích hoạt / 🔁 Chuyển điểm / 🚪 Nghỉ việc / Xoá + **Lịch sử hoạt động**
  (pill Điểm bán / Tham gia / Bàn giao, tải từ `staff_history`). Điểm trong lịch sử chọn
  được nhiều → "Chuyển N điểm". Drill sang điểm bán có "← Quay lại" (quy ước backBar).
- **Điểm bán**: cột **Phụ trách**; lọc: tìm (không dấu), Phụ trách (Tất cả / NPP giữ /
  từng NV / Khác), Trạng thái, Tham gia; "Xoá lọc"; thẻ "N điểm NPP đang giữ — chia cho NV".
  Checkbox từng dòng + chọn tất cả (theo bộ lọc) → thanh thao tác hàng loạt cố định đáy:
  "Đã chọn N" · Gán NV phụ trách · Ngừng HĐ · Kích hoạt · Bỏ chọn. Phân trang 20 dòng.
- **Chương trình**: danh sách lượt tham gia thêm cột **Phụ trách**, lọc Chương trình /
  Phụ trách / Trạng thái / tìm; checkbox + bulk "Gán NV phụ trách điểm bán" (gộp điểm trùng).
- Modal **Gán NV**: N điểm đã chọn (liệt kê ≤5 + "…"), chọn đích (NPP giữ lại / NV đang làm,
  có ô tìm khi ≥5 NV), ghi chú, ghi rõ luật §2.2–2.3. Modal **Nghỉ việc**: số điểm/lượt sẽ bàn
  giao, đích (Về NPP — mặc định / NV khác), ghi chú, cảnh báo khoá tài khoản. Xong → nếu về NPP,
  chuyển sang tab Điểm bán lọc "NPP giữ" để chia lại.

### `/dp` (chủ NPP) — mobile-first
- Bottom nav thêm tab **Quản lý** (`/npp`) khi `isNppOwner`.
- `#/npp?t=staff|points|programs` (view `npp-manage.js`): 3 pill như trên, danh sách dạng thẻ,
  lọc như `/npp`, chế độ **Chọn nhiều** (bật/tắt) + thanh thao tác cố định trên bottom nav,
  sheet Gán NV / Nghỉ việc, "Xem thêm" 30 dòng/lần. Bấm điểm → sheet chi tiết + thao tác;
  bấm lượt → `#/participations/:name` (chủ NPP đọc được).
- `#/npp/staff/:name` (view `npp-staff.js`): lịch sử hoạt động 1 NV + Chuyển điểm / Nghỉ việc.
- Trang chủ: thẻ "Quản lý NPP" (số NV, điểm, điểm chưa giao) → `#/npp`.
- Chương trình → chi tiết: chủ NPP thấy mọi lượt của NPP + tên NV phụ trách.
- Chống shell cũ: `BUILD` trong shell.js ↔ `SHELL_BUILD` ở dp.py (banner khi lệch), router
  self-heal (route lạ → reload 1 lần), link sang route mới dùng full-load khi shell cũ.
