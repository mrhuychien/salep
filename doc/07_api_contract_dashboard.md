# API Contract — Dashboard methods (cho portal NPP)

App `salep` **cung cấp** các whitelisted method dưới đây; **portal NPP (app nhà phân
phối) tiêu thụ** để dựng UI quản chương trình + dashboard QL kênh (Chart.js, bản đồ GPS).
`salep` KHÔNG dựng UI này (xem doc/01:33, doc/05:39–40).

Nguồn: `salep/salep/api/dashboard.py`. Cùng site/bench với app NPP → không cross-origin.

---

## 1. Cách gọi

**Client-side (trong www page / Desk của portal NPP):**
```js
const r = await frappe.call({ method: "salep.api.dashboard.channel_summary" });
const data = r.message;            // payload nằm trong .message
// npp_summary có tham số:
const r2 = await frappe.call({
  method: "salep.api.dashboard.npp_summary",
  args: { distributor: "CUST-0001" }   // optional; bỏ trống = toàn bộ NPP
});
```

**HTTP thuần** (nếu cần): `POST /api/method/salep.api.dashboard.channel_summary`
- Header: `X-Frappe-CSRF-Token` (frappe.call tự gắn), cookie session.
- Response envelope: `{ "message": <payload mô tả dưới> }`.

**Server-side (Python, cùng bench):**
```python
from salep.api.dashboard import channel_summary
data = channel_summary()
```

### Phân quyền
- `channel_summary`, `npp_summary`: **chỉ** role `Channel Manager` hoặc `System Manager`.
  Thiếu quyền → HTTP **403** (`frappe.PermissionError`, message: *"Chỉ Quản lý kênh xem được dashboard này."*).
- `staff_summary`: cho NVBH xem dữ liệu của chính mình — dùng ở portal NVBH `/dp`, **không** dành cho portal NPP.

### Lưu ý kiểu dữ liệu
- `COUNT(...)` → số nguyên. `SUM(workflow_state = 'Đã duyệt')` và `budget_used` là tổng hợp (Decimal)
  → JSON có thể ra số hoặc chuỗi số tuỳ driver. **Phía NPP nên `Number(x)` trước khi tính/vẽ.**
- Mảng rỗng `[]` khi chưa có dữ liệu (không phải `null`).
- `distributor` / `npp` = **docname của Customer** (vd `CUST-0001`); cần tên hiển thị thì NPP tự lookup `Customer.customer_name`.
- `program` = docname Promotion Program (vd `CT-2024-001`). `status` ∈ `Nháp | Đang chạy | Kết thúc`.
- `latitude/longitude` = Float (precision 8). Ngày (`start_date`,…) định dạng ISO `YYYY-MM-DD`.

---

## 2. `channel_summary()` → object

Toàn cảnh cho QL kênh. Không tham số.

| Key | Kiểu | Ý nghĩa |
|---|---|---|
| `program_progress` | array | Tiến độ + ngân sách từng chương trình |
| `rank_npp` | array | Xếp hạng NPP theo số lượt **đã duyệt** (top 20) |
| `rank_staff` | array | Xếp hạng NVBH theo số lượt **đã duyệt** (top 20) |
| `gps_points` | array | Điểm GPS các lượt **đã duyệt** (cho bản đồ) |

**`program_progress[]`**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `program` | string | docname Promotion Program |
| `program_name` | string | Tên chương trình |
| `status` | string | `Nháp` / `Đang chạy` / `Kết thúc` |
| `target_points` | int | Mục tiêu số điểm (có thể 0/null) |
| `budget` | number | Ngân sách (Currency) |
| `reward_per_point` | number | Thưởng/điểm |
| `total` | int | Tổng lượt tham gia (mọi trạng thái) |
| `approved` | int | Số lượt **đã duyệt** |
| `budget_used` | number | = `approved × reward_per_point` (đã tính sẵn) |

> Tiến độ % do NPP tự suy: `progress = target_points ? approved / target_points * 100 : null`.
> Ngân sách còn lại: `budget - budget_used`.

**`rank_npp[]`**: `{ npp: string (Customer), approved: int }`
**`rank_staff[]`**: `{ staff_user: string (User id), full_name: string|null, approved: int }`
**`gps_points[]`**: `{ name, display_point, promotion_program, distributor, latitude, longitude }`

### Ví dụ
```json
{
  "program_progress": [
    {"program": "CT-2024-001", "program_name": "Trưng bày Tết 2024", "status": "Đang chạy",
     "target_points": 100, "budget": 500000000, "reward_per_point": 200000,
     "total": 58, "approved": 45, "budget_used": 9000000}
  ],
  "rank_npp":   [{"npp": "CUST-0001", "approved": 30}, {"npp": "CUST-0007", "approved": 15}],
  "rank_staff": [{"staff_user": "an@npp.vn", "full_name": "Nguyễn Văn An", "approved": 22}],
  "gps_points": [{"name": "DPT-2024-00042", "display_point": "DP-2024-00100",
     "promotion_program": "CT-2024-001", "distributor": "CUST-0001",
     "latitude": 10.762622, "longitude": 106.660172}]
}
```

---

## 3. `npp_summary(distributor=None)` → array

Tổng hợp theo NPP. Truyền `distributor` (Customer docname) để lọc 1 NPP; bỏ trống = mọi NPP.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `npp` | string | docname Customer (NPP) |
| `total_participations` | int | Tổng lượt tham gia của NPP |
| `approved_participations` | int | Số lượt **đã duyệt** |
| `distinct_points` | int | Số điểm bán khác nhau đã tham gia |

Sắp xếp giảm dần theo `approved_participations`.

### Ví dụ
```json
[
  {"npp": "CUST-0001", "total_participations": 40, "approved_participations": 30, "distinct_points": 28},
  {"npp": "CUST-0007", "total_participations": 20, "approved_participations": 15, "distinct_points": 15}
]
```

---

## 4. Hợp đồng & thay đổi
- Trạng thái workflow tham chiếu: `Nháp`, `Chờ duyệt`, `Đã duyệt`, `Từ chối` (doc/04). "Đã duyệt" là mốc tính KPI.
- Mọi metric tính từ `Display Participation` (đã denormalize `distributor` từ điểm bán) — không cần JOIN Customer.
- Nếu cần thêm field/cắt lát mới (theo tháng, theo nhóm hàng…), mở rộng ở `salep` rồi cập nhật contract này; **không** đổi/đập shape cũ để khỏi vỡ portal NPP.
