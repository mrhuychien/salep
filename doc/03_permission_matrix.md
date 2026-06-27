# Permission Matrix — App `display_point`

Roles: **Sales Staff** (NVBH), **Channel Manager** (QL kênh), **System Manager**.

## Sales Staff Profile
| Role | R | W | C | D | If Owner | Notes |
|---|---|---|---|---|---|---|
| Sales Staff | ✓ | ✓ | ✓ | | ✓ | chỉ hồ sơ của chính mình |
| Channel Manager | ✓ | ✓ | | | | đọc/sửa để đối chiếu trả thưởng |
| System Manager | ✓ | ✓ | ✓ | ✓ | | |

## Display Point
| Role | R | W | C | D | If Owner | Notes |
|---|---|---|---|---|---|---|
| Sales Staff | ✓ | ✓ | ✓ | ✓ | ✓ | chỉ điểm mình tạo; xoá chỉ khi chưa có Participation đã duyệt |
| Channel Manager | ✓ | ✓ | | | | toàn bộ |
| System Manager | ✓ | ✓ | ✓ | ✓ | | |

## Promotion Program
| Role | R | W | C | D | If Owner | Notes |
|---|---|---|---|---|---|---|
| Sales Staff | ✓ | | | | | chỉ đọc để chọn chương trình |
| Channel Manager | ✓ | ✓ | ✓ | ✓ | | quản toàn bộ chương trình |
| System Manager | ✓ | ✓ | ✓ | ✓ | | |

## Display Participation
| Role | R | W | C | D | If Owner | Notes |
|---|---|---|---|---|---|---|
| Sales Staff | ✓ | ✓ | ✓ | ✓(*) | ✓ | (*) xoá chỉ khi Nháp/Từ chối; Đã duyệt → KHÔNG xoá |
| Channel Manager | ✓ | ✓ | | | | duyệt/từ chối toàn bộ (transition workflow) |
| System Manager | ✓ | ✓ | ✓ | ✓ | | |

## Quy tắc bổ sung (enforce ở controller, không chỉ DocPerm)
- NVBH `If Owner` mọi DocType của mình → chỉ thấy/sửa dữ liệu chính mình tạo.
- Display Participation: `on_trash` chặn nếu `workflow_state == "Đã duyệt"` (kể cả System Manager nên cân nhắc — đề xuất chỉ System Manager được xoá ngoại lệ).
- Không dùng permlevel (mày đã chốt bỏ cho CCCD/bank).
- **User Permission**: KHÔNG cần theo NPP cho NVBH (đã dùng If Owner). QL kênh thấy toàn bộ — không restrict.
