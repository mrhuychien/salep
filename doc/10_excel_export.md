# 10 — Xuất Excel các danh sách (điểm bán, tham gia trưng bày, trả thưởng, nhân viên…)

Mỗi danh sách quản lý có nút **"⬇️ Xuất Excel"**. File `.xlsx` thật (Office Open XML) được
dựng **ngay trên trình duyệt** từ dữ liệu đang hiển thị, **theo đúng bộ lọc / tìm kiếm hiện tại**
(toàn bộ kết quả lọc — mọi trang, không chỉ trang đang xem). Không thêm thư viện ngoài, không
round-trip server → xuất được cả khi danh sách đã lọc tay; dữ liệu đã được server scope sẵn
(NPP chỉ thấy NPP mình) nên file không chứa gì người dùng không được xem.

Server chỉ bổ sung vài cột còn thiếu cho file (MST, tài khoản nhận thưởng) — §4.

## 1. Module dùng chung `components/xlsx.js` (mỗi app 1 bản, cùng API)

- nextnpp: `npp/public/npp/components/xlsx.js` (+ import map `npp/www/npp.html`)
- salep: `salep/public/salep/components/xlsx.js` (+ import map `salep/www/dp.html`)

```js
// type: "text" (mặc định) | "int" | "number" | "percent" (0–100 → hiển thị 12,5%) | "date" | "datetime"
// value(row, index) → giá trị ô; null/undefined/"" → ô trống.
const sheet = { name: "Điểm bán", columns: [{ header, value, type, width }], rows };
await buildXlsx([sheet, ...])          // → Uint8Array (.xlsx)
await downloadXlsx(filename, sheets)   // dựng + tải về; trả số dòng đã xuất (tổng các sheet)
fileStamp(scopeLabel, base)            // → "DiemBan_NPP-Ha-Noi_2026-10-16.xlsx" (ASCII, bỏ dấu)
```

Yêu cầu của writer:
- Hợp lệ OOXML: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
  `xl/_rels/workbook.xml.rels`, `xl/styles.xml`, `xl/worksheets/sheetN.xml`. Chuỗi ghi
  `t="inlineStr"` (không cần sharedStrings) → **không bao giờ là công thức** (an toàn với `=…`).
- Dòng tiêu đề in đậm + nền nhạt, **cố định dòng tiêu đề** (freeze pane), **AutoFilter**, độ rộng cột.
- Số là số thật; `date` / `datetime` là số ngày Excel (gốc 1899-12-30) định dạng `dd/mm/yyyy` /
  `dd/mm/yyyy hh:mm`; nhận `YYYY-MM-DD` hoặc `YYYY-MM-DD HH:MM:SS[.ffffff]` — tự tách chuỗi,
  **không** dùng `new Date(str)` (Safari iOS). `percent` lưu số /100 với định dạng `0.0%`.
- XML-escape mọi chuỗi, bỏ ký tự cấm trong XML 1.0; chuỗi > 32 767 ký tự cắt bớt.
- Tên sheet ≤ 31 ký tự, bỏ `[]:*?/\`, không trùng.
- ZIP: nén `deflate-raw` bằng `CompressionStream` nếu trình duyệt có, nếu không → lưu (store);
  CRC32 đúng; cờ UTF-8 cho tên file trong zip.
- Tải về: `Blob` MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `<a download>` (gắn vào DOM rồi gỡ), `URL.revokeObjectURL` sau ~2 giây.
- Không có dòng nào → không tải, toast "Không có dòng nào để xuất".

## 2. Quy ước chung cho mọi danh sách

- Cột đầu **STT**; cột mã (`name`) giữ nguyên để đối chiếu ERP.
- Nhãn trạng thái tiếng Việt như trên màn hình (Hoạt động/Ngừng, Đã duyệt/Chờ duyệt…, Hoạt động/
  Tạm dừng/Đã nghỉ, Chưa trả / Đã trả lần 1 / Đủ 2 lần). Phụ trách = nhãn đang hiển thị
  (`staff_name`, "NPP (chưa giao)"…).
- Tên file: `<Base>_<Phạm vi>_<YYYY-MM-DD>.xlsx`; phạm vi = tên NPP (`/npp`, `/dp`) hoặc
  `ToanKenh` / tên NPP đang lọc (`/ql-km`); Base: `DiemBan`, `ThamGiaTrungBay`, `TraThuong`,
  `NhanVien`, `ChuongTrinh`, `CanDuyet`, `TuChoi`, `AnhTheoThang`, `LichSuNhanVien`.
- Nút đặt cạnh tiêu đề / hàng bộ lọc của danh sách; chống bấm 2 lần (disable khi đang dựng).
  Toast "Đã xuất N dòng".
- Đang nạp lại danh sách → khoá nút; nạp lại lỗi (danh sách cũ vẫn hiện) → mở lại nút và xuất đúng
  danh sách đang thấy (`/dp`: sau thao tác ghi, bộ đệm lượt / trả thưởng chỉ thay khi nạp lại xong).
- Thiếu dữ liệu bổ sung (trang lịch sử NV: `npp_overview` lỗi) → vẫn xuất, nhưng toast **cảnh báo**
  "Đã xuất N dòng — chưa tải được MST / tài khoản nhận thưởng, thử xuất lại" thay cho toast thành công.

## 3. Danh sách & cột

**Điểm bán** — STT · Mã điểm · Tên điểm bán · SĐT · Địa chỉ · Mã số thuế · NV phụ trách ·
Trạng thái · Số lượt tham gia · Lượt đã duyệt · Chủ TK nhận thưởng · Số TK · Ngân hàng ·
Vĩ độ · Kinh độ · Ngày tạo (`/ql-km` thêm cột NPP sau STT).

**Tham gia trưng bày** — STT · Mã lượt · Mã điểm · Điểm bán · SĐT điểm · Chương trình ·
NV phụ trách · Trạng thái duyệt · Lý do từ chối · Cập nhật (datetime) · Vĩ độ · Kinh độ
(`/ql-km` thêm NPP). **Lý do từ chối** chỉ ghi cho lượt đang "Từ chối" (như màn hình): gửi duyệt lại /
duyệt lại không xoá `reject_reason` cũ → lượt Chờ duyệt / Đã duyệt để ô trống. Xuất từ tab Chương
trình kèm sheet **Chương trình**: Chương trình · Trạng thái · Bắt đầu · Kết thúc · Thưởng/điểm ·
Lượt tham gia · Đã duyệt · Điểm đã duyệt · Độ phủ %.

**Trả thưởng** — sheet **Chi tiết**: STT · Chương trình · Mã lượt · Mã điểm · Điểm bán · SĐT ·
NV phụ trách · (NPP) · Lần 1 – ngày · Lần 1 – số ảnh · Lần 2 – ngày · Lần 2 – số ảnh ·
Trạng thái · Thưởng/điểm · Chủ TK nhận thưởng · Số TK · Ngân hàng; sheet **Tổng hợp**:
Chương trình · Trạng thái CT · Đủ điều kiện · Đã trả lần 1 · % lần 1 · Đã trả lần 2 · % lần 2.

**Nhân viên** — STT · Mã NV · Họ tên · SĐT (đăng nhập) · CCCD · Trạng thái · Ngày nghỉ ·
Số điểm phụ trách · Lượt tham gia · Đã duyệt · Tỷ lệ duyệt %.

**`/ql-km`** (mọi NPP): Cần duyệt, Từ chối, Ảnh theo tháng, Chương trình (danh sách + chi tiết 1
chương trình), Điểm bán, Nhân viên, Trả thưởng — mỗi tab xuất đúng dữ liệu đã tải, cột theo §3
(dữ liệu nhóm theo NPP được "trải phẳng" thành dòng có cột NPP).

**`/dp` Quản lý NPP**: pill Nhân viên / Điểm bán / Chương trình (lượt tham gia) / Trả thưởng như
trên; trang lịch sử 1 NV (`#/npp/staff/:name`) xuất sheet Điểm bán · Tham gia · Bàn giao.

## 4. Bổ sung dữ liệu phía server (thêm key, không đổi key cũ)

- salep `npp_manage.overview().points[i]` + nextnpp `promo.npp_overview().points[i]`:
  `tax_code`, `bank_account_name`, `bank_account_no`, `bank_name` (+ `creation` nếu chưa có).
- salep `npp_manage.overview().staff[i]`: `cccd`; `.programs[i]`: `reward_per_point` (`flt`, rỗng → 0 —
  như `payout.progress().programs[i]`).
- salep `npp_manage.staff_history().participations[i]` (dùng chung cho nextnpp `promo.staff_history`):
  `reject_reason`, `latitude`, `longitude` (của lượt), `point_phone` (SĐT điểm trong NPP, ngoài NPP/
  đã xoá → `None`) — cùng nghĩa `participations()`.
- salep `payout.progress().rows[i]`: `reward_per_point`, `point_tax_code`,
  `point_bank_account_name`, `point_bank_account_no`, `point_bank_name`. Phạm vi 1 NPP (`distributor`
  khác None — `/dp`, `/npp`, `/ql-km` lọc 1 NPP): chỉ tra điểm **thuộc NPP đó**; lượt cũ trỏ điểm đã
  chuyển sang NPP khác → `point_name` = mã điểm, `point_phone` / MST / TK = `None` (như
  `participations()` / `staff_history()`). Mọi NPP (`distributor=None`) → tra không lọc NPP.
- nextnpp `promo_admin.points_by_npp()` mỗi điểm: `tax_code`, bank fields, `creation`,
  `owner`, `staff_name` (nhãn NV phụ trách), `participations`, `approved` (mọi chương trình).
- nextnpp `promo_admin.staff_by_npp()` mỗi NV: `cccd`, `employment_status` (thiếu cột / rỗng →
  "Đang làm"), `resigned`, `left_on`, `points` (số điểm NV giữ trong NPP của NV).
- nextnpp `promo_admin.programs()`: `approved_points` (số điểm có ≥1 lượt đã duyệt), `coverage_pct`
  (= approved_points / mọi điểm đang hoạt động × 100, cùng định nghĩa `program_detail.coverage.pct`).
- nextnpp `promo_admin.pending_participations()` / `rejected_participations()` /
  `program_detail().participants_by_npp[].items[]`: `point_phone`, `latitude`, `longitude` (GPS của
  lượt); `rejected_participations` thêm `workflow_state = "Từ chối"`; `program_detail` thêm `reject_reason`.
- nextnpp `promo.npp_overview().staff[i]`: dòng không có hồ sơ cũng có `cccd: None` (cùng shape).
Phạm vi giữ nguyên (NPP chỉ thấy điểm của mình; quản lý kênh thấy mọi NPP). Cột tuỳ chọn ở `/ql-km`
hiện khi server CÓ gửi key (không phụ thuộc dữ liệu) → server cũ vẫn xuất được, chỉ thiếu cột.
