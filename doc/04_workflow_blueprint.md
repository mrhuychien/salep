# Workflow Blueprint — Display Participation Approval

Workflow chỉ áp cho **Display Participation** (duyệt lượt tham gia, không phải duyệt điểm bán).

## States
| State | docstatus | Allow Edit Roles | Notes |
|---|---|---|---|
| Nháp | 0 | Sales Staff, Channel Manager | NVBH soạn |
| Chờ duyệt | 0 | Channel Manager | đã gửi, chờ QL kênh |
| Đã duyệt | 0 | Sales Staff, Channel Manager | **sửa được, KHÔNG xoá**; track_changes ghi mọi sửa |
| Từ chối | 0 | Sales Staff | NVBH sửa rồi gửi lại |

> Ghi chú: dùng docstatus 0 toàn bộ + workflow_state field (không Submittable) để cho phép sửa sau "Đã duyệt" mà vẫn track_changes. Khoá xoá xử lý ở controller `on_trash`.

## Transitions
| From | To | Action | Role | Condition |
|---|---|---|---|---|
| Nháp | Chờ duyệt | Gửi duyệt | Sales Staff | display_photo có ảnh, GPS hợp lệ |
| Chờ duyệt | Đã duyệt | Duyệt | Channel Manager | set approved_by, approved_on |
| Chờ duyệt | Từ chối | Từ chối | Channel Manager | reject_reason bắt buộc |
| Từ chối | Chờ duyệt | Gửi lại | Sales Staff | |

## Controller enforcement
- `on_trash`: nếu `workflow_state == "Đã duyệt"` → `frappe.throw("Lượt tham gia đã duyệt, không được xoá")`.
- `before_save` khi vào "Đã duyệt": set `approved_by = frappe.session.user`, `approved_on = now()`.
- `validate`: nếu state = "Từ chối" mà `reject_reason` rỗng → throw.
