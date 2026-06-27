# Business Model — App `display_point` (Quản lý Điểm Trưng Bày)

## Bối cảnh
- Đơn vị: RVHG (Rồng Vàng Hoàng Gia) — quản lý chương trình trưng bày qua hệ thống NPP.
- Quy mô: ~50 NPP, ~100 nhân viên bán hàng (NVBH). Mỗi năm chạy nhiều chương trình trưng bày.
- Một điểm bán có thể tham gia nhiều chương trình qua các năm (điểm dùng lại).
- Tích hợp thẳng vào ERPNext v16 (NPP = Customer có sẵn). Portal NPP đã tồn tại.

## Pain point hiện tại
- Chấm điểm trưng bày thủ công, không có chống trùng, không kiểm soát GPS/ảnh.
- Khó tổng hợp số điểm tham gia theo chương trình / NPP / NVBH để kickoff và trả thưởng.

## Actors & Roles
| Actor | Vai trò |
|---|---|
| **NVBH** (Sales Staff) | Tạo/sửa điểm bán, đăng ký điểm tham gia chương trình, chụp ảnh, quản hồ sơ cá nhân. Chỉ thấy dữ liệu của chính mình. |
| **Quản lý kênh** (Channel Manager) | Duyệt/từ chối lượt tham gia toàn hệ thống, tạo & quản chương trình, xem dashboard toàn cảnh. |
| **System Manager** | Quản trị, fixtures, cấu hình. |

## Use Cases
- **US-01**: NVBH tạo điểm bán mới (thông tin + ảnh cửa hàng + TK chủ điểm), hệ thống chống trùng theo SĐT.
- **US-02**: NVBH đăng ký điểm (mới hoặc có sẵn) tham gia một chương trình + chụp ảnh trưng bày riêng → gửi duyệt.
- **US-03**: QL kênh duyệt/từ chối lượt tham gia. Sau duyệt: NVBH sửa được, KHÔNG xoá; mọi sửa đổi được ghi lịch sử.
- **US-04**: NVBH quản hồ sơ cá nhân (tên, SĐT, CCCD, TK ngân hàng, ảnh đại diện).
- **US-05**: QL kênh tạo chương trình (thời gian, ngân sách, mức thưởng/điểm, mục tiêu).
- **US-06**: Dashboard 3 cấp (NVBH / NPP / QL kênh) để kickoff & theo dõi tiến độ chương trình.

## Data sources hiện tại
- ERPNext Customer (50 NPP có sẵn). User accounts cho NVBH (cần tạo/map).

## Integration scope
- Core: `Customer` (NPP — link), `User` (đăng nhập — link).
- Portal NPP hiện có: tầng quản lý chương trình + dashboard QL kênh phục vụ ở đây; app `display_point` là nơi sinh dữ liệu điểm/lượt tham gia.

## Constraints
- Mobile-first (NVBH dùng điện thoại ngoài thị trường).
- House style: whitelisted methods (không Server/Client Script rải rác), SPA vanilla-JS no-build, CSS prefix `dp-`.
- Maintainer: Chiến (solo).
