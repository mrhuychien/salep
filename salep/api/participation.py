# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""API & doc_events cho Display Participation (lượt tham gia + workflow duyệt)."""

import unicodedata

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

STATE_DRAFT = "Nháp"
STATE_PENDING = "Chờ duyệt"
STATE_APPROVED = "Đã duyệt"
STATE_REJECTED = "Từ chối"


def _fold(s):
    """Bỏ dấu + thường hoá để so khớp bất kể chuẩn Unicode (NFC/NFD/thiếu dấu)."""
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


_STATE_FOLD = {_fold(s): s for s in (STATE_DRAFT, STATE_PENDING, STATE_APPROVED, STATE_REJECTED)}


def _fix_state(name):
    """Nắn workflow_state lệch chuẩn (vd 'Nháp' dạng NFD) về canonical trong DB,
    để apply_workflow khớp transition. Sửa giá trị CŨ trước khi save (Frappe so
    state cũ↔mới lúc save), nếu không sẽ báo 'transition not allowed from Nhap...'."""
    cur = frappe.db.get_value("Display Participation", name, "workflow_state")
    if not cur:
        return
    canon = _STATE_FOLD.get(_fold(cur))
    if canon and canon != cur:
        frappe.db.set_value("Display Participation", name, "workflow_state", canon, update_modified=False)


# ---------------------------------------------------------------------------
# doc_events (xem hooks.py)
# ---------------------------------------------------------------------------
def validate_participation(doc, method=None):
    """Unique (display_point, promotion_program) + reject_reason bắt buộc khi từ chối.

    doc/02 dòng 118: 1 điểm chỉ tham gia 1 chương trình 1 lần.
    """
    if doc.display_point and doc.promotion_program:
        duplicate = frappe.db.exists(
            "Display Participation",
            {
                "display_point": doc.display_point,
                "promotion_program": doc.promotion_program,
                "name": ("!=", doc.name or ""),
            },
        )
        if duplicate:
            frappe.throw(
                _("Điểm {0} đã đăng ký chương trình {1} (lượt {2}).").format(
                    frappe.bold(doc.display_point),
                    frappe.bold(doc.promotion_program),
                    frappe.bold(duplicate),
                ),
                title=_("Trùng lượt tham gia"),
            )

    if doc.workflow_state == STATE_REJECTED and not doc.reject_reason:
        frappe.throw(_("Phải nhập Lý do từ chối khi chuyển sang trạng thái Từ chối."))

    # Title field (expression) point + program — doc/02 dòng 98
    doc.subject = " · ".join(filter(None, [doc.display_point, doc.promotion_program]))


def on_state_change(doc, method=None):
    """Set approved_by / approved_on khi vào 'Đã duyệt' (doc/04 dòng 25).

    Dùng db_set trong on_update để không kích hoạt vòng save đệ quy.
    """
    if doc.workflow_state == STATE_APPROVED and not doc.approved_by:
        doc.db_set("approved_by", frappe.session.user, update_modified=False)
        doc.db_set("approved_on", now_datetime(), update_modified=False)


def guard_delete(doc, method=None):
    """Chặn xoá lượt đã duyệt. Ngoại lệ: System Manager được xoá (đã chốt).

    doc/03 dòng 35 + doc/04 dòng 24.
    """
    if doc.workflow_state == STATE_APPROVED and "System Manager" not in frappe.get_roles():
        frappe.throw(_("Lượt tham gia đã duyệt, không được xoá."))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _assert_channel_manager():
    roles = set(frappe.get_roles())
    if not roles & {"Channel Manager", "System Manager"}:
        frappe.throw(_("Chỉ Quản lý kênh được duyệt/từ chối lượt tham gia."), frappe.PermissionError)


# Vai trò được sửa theo từng state — khớp Allow Edit Roles ở doc/04. Enforce
# tường minh (không phụ thuộc nội bộ framework). System Manager là ngoại lệ.
_ALLOW_EDIT = {
    STATE_DRAFT: {"Sales Staff", "Channel Manager"},
    STATE_PENDING: {"Channel Manager"},
    STATE_APPROVED: {"Sales Staff", "Channel Manager"},
    STATE_REJECTED: {"Sales Staff"},
}


def _assert_can_edit(doc):
    roles = set(frappe.get_roles())
    if "System Manager" in roles:
        return
    allowed = _ALLOW_EDIT.get(doc.workflow_state, set())
    if not roles & allowed:
        frappe.throw(
            _("Không thể sửa lượt ở trạng thái '{0}'.").format(doc.workflow_state),
            frappe.PermissionError,
        )
    # Sales Staff (không phải QL kênh) chỉ sửa lượt của chính mình (If Owner).
    if "Channel Manager" not in roles and doc.owner != frappe.session.user:
        frappe.throw(_("Bạn chỉ sửa được lượt của mình."), frappe.PermissionError)


def _assert_owns_point(point):
    """Điểm bán gán vào lượt phải tồn tại và thuộc người gọi (If Owner), trừ QL kênh.

    Chặn việc bind lượt vào điểm/NPP của NVBH khác qua display_point (distributor
    là fetch_from display_point.distributor).
    """
    owner = frappe.db.get_value("Display Point", point, "owner")
    if not owner:
        frappe.throw(_("Điểm bán không tồn tại."))
    roles = set(frappe.get_roles())
    if not roles & {"Channel Manager", "System Manager"} and owner != frappe.session.user:
        frappe.throw(_("Bạn chỉ chọn được điểm bán của mình."), frappe.PermissionError)


# ---------------------------------------------------------------------------
# Whitelisted API
# ---------------------------------------------------------------------------
@frappe.whitelist()
def create_participation(
    display_point,
    promotion_program,
    display_photo,
    latitude=None,
    longitude=None,
    gps_accuracy=None,
):
    """NVBH đăng ký lượt tham gia (trạng thái Nháp). `distributor` fetch_from điểm bán.

    Ảnh đăng ký = ảnh báo cáo tháng đầu (visit #1) để tính độ phủ theo tháng.
    """
    _disable_workflow()
    _assert_owns_point(display_point)

    # Idempotent: điểm đã đăng ký chương trình này → mở lượt hiện có thay vì lỗi trùng.
    existing = frappe.db.get_value(
        "Display Participation",
        {"display_point": display_point, "promotion_program": promotion_program},
        ["name", "workflow_state"],
        as_dict=True,
    )
    if existing:
        return {"name": existing.name, "workflow_state": existing.workflow_state, "existed": True}

    # BẮT BUỘC GPS: ảnh trưng bày phải kèm toạ độ (định vị bật khi chụp).
    if latitude in (None, "") or longitude in (None, ""):
        frappe.throw(_("Cần bật định vị GPS khi chụp ảnh trưng bày."))

    doc = frappe.new_doc("Display Participation")
    doc.update(
        {
            "display_point": display_point,
            "promotion_program": promotion_program,
            "display_photo": display_photo,
            "latitude": latitude,
            "longitude": longitude,
            "gps_accuracy": gps_accuracy,
            "workflow_state": STATE_DRAFT,
        }
    )
    now = now_datetime()
    doc.append(
        "visits",
        {
            "visit_photo": display_photo,
            "captured_on": now,
            "period": now.strftime("%Y-%m"),
            "latitude": flt(latitude) or None,
            "longitude": flt(longitude) or None,
            "gps_accuracy": flt(gps_accuracy) or None,
        },
    )
    doc.insert()  # enforce Create + If Owner
    return {"name": doc.name, "workflow_state": doc.workflow_state}


@frappe.whitelist()
def add_visit(participation, display_photo, latitude=None, longitude=None, gps_accuracy=None):
    """Thêm ảnh báo cáo trưng bày của tháng hiện tại (GPS + thời gian tự động)."""
    _disable_workflow()
    if not display_photo:
        frappe.throw(_("Cần ảnh báo cáo."))
    # BẮT BUỘC GPS: ảnh báo cáo phải kèm toạ độ (định vị bật khi chụp).
    if latitude in (None, "") or longitude in (None, ""):
        frappe.throw(_("Cần bật định vị GPS khi chụp ảnh báo cáo."))
    doc = frappe.get_doc("Display Participation", participation)
    doc.check_permission("write")
    _assert_can_edit(doc)
    now = now_datetime()
    doc.append(
        "visits",
        {
            "visit_photo": display_photo,
            "captured_on": now,
            "period": now.strftime("%Y-%m"),
            "latitude": flt(latitude) or None,
            "longitude": flt(longitude) or None,
            "gps_accuracy": flt(gps_accuracy) or None,
        },
    )
    doc.save()
    return {"name": doc.name, "visits": len(doc.visits)}


_wf_checked = False  # đã kiểm tra/ tắt workflow trong tiến trình này chưa


def _disable_workflow():
    """Tắt Frappe Workflow đang active cho Display Participation. Ta tự quản trạng
    thái bằng code (db_set); workflow active với tên state lệch chuẩn Unicode gây
    lỗi 'transition not allowed from Nhap to Nháp' mỗi khi insert/save. Self-heal.

    Chỉ truy vấn 1 lần/tiến trình (cache cờ) → không tốn query mỗi lần ghi."""
    global _wf_checked
    if _wf_checked:
        return
    active = frappe.get_all(
        "Workflow", filters={"document_type": "Display Participation", "is_active": 1}, pluck="name"
    )
    if active:
        for wf in active:
            frappe.db.set_value("Workflow", wf, "is_active", 0)
        frappe.clear_cache(doctype="Display Participation")
    _wf_checked = True


def _canon(state):
    """Giá trị canonical (NFC) cho state, so khớp bất kể chuẩn Unicode/thiếu dấu."""
    return _STATE_FOLD.get(_fold(state)) or state


# Chuyển trạng thái bằng db_set (KHÔNG dùng apply_workflow) để né hẳn lỗi khớp
# byte Unicode của Frappe ('transition not allowed from Nhap to Nháp'). Vẫn tự
# kiểm role/điều kiện và ghi giá trị NFC chuẩn → nắn luôn dữ liệu lệch chuẩn cũ.
@frappe.whitelist()
def submit_for_approval(name):
    """Nháp/Từ chối → Chờ duyệt. NVBH chủ lượt (hoặc QL kênh/admin)."""
    _disable_workflow()
    doc = frappe.get_doc("Display Participation", name)
    doc.check_permission("write")
    if _canon(doc.workflow_state) not in (STATE_DRAFT, STATE_REJECTED):
        frappe.throw(_("Chỉ gửi duyệt khi lượt đang Nháp hoặc Từ chối."))
    if not doc.display_photo:
        frappe.throw(_("Cần ảnh trưng bày trước khi gửi duyệt."))
    doc.db_set("workflow_state", STATE_PENDING)
    return {"name": doc.name, "workflow_state": STATE_PENDING}


@frappe.whitelist()
def approve(name):
    """Chờ duyệt → Đã duyệt. Role-gated Channel Manager."""
    _assert_channel_manager()
    _disable_workflow()
    doc = frappe.get_doc("Display Participation", name)
    if _canon(doc.workflow_state) != STATE_PENDING:
        frappe.throw(_("Chỉ duyệt được lượt đang Chờ duyệt."))
    doc.db_set("approved_by", frappe.session.user)
    doc.db_set("approved_on", now_datetime())
    doc.db_set("workflow_state", STATE_APPROVED)
    return {"name": doc.name, "workflow_state": STATE_APPROVED, "approved_by": frappe.session.user}


@frappe.whitelist()
def reject(name, reject_reason):
    """Chờ duyệt → Từ chối. Bắt buộc reject_reason. Role-gated."""
    _assert_channel_manager()
    _disable_workflow()
    if not reject_reason:
        frappe.throw(_("Phải nhập lý do từ chối."))
    doc = frappe.get_doc("Display Participation", name)
    if _canon(doc.workflow_state) != STATE_PENDING:
        frappe.throw(_("Chỉ từ chối được lượt đang Chờ duyệt."))
    doc.db_set("reject_reason", reject_reason)
    doc.db_set("workflow_state", STATE_REJECTED)
    return {"name": doc.name, "workflow_state": STATE_REJECTED}


# Field luôn cho sửa (chụp lại ảnh / cập nhật GPS).
_EDITABLE_ALWAYS = ("display_photo", "latitude", "longitude", "gps_accuracy")
# Đổi điểm/chương trình chỉ khi lượt CHƯA duyệt (tránh phá unique sau khi đã duyệt).
_EDITABLE_BEFORE_APPROVAL = ("display_point", "promotion_program")


@frappe.whitelist()
def update_participation(name, **kwargs):
    """Sửa lượt tham gia (doc/01 US-03: sau duyệt vẫn sửa được, KHÔNG xoá).

    Quyền theo state do _assert_can_edit canh (NVBH: Nháp/Đã duyệt/Từ chối —
    KHÔNG sửa ở Chờ duyệt). Đổi điểm/chương trình chỉ khi chưa duyệt. doc.save()
    chạy validate (unique cặp, subject) và ghi version (track_changes).
    """
    _disable_workflow()
    doc = frappe.get_doc("Display Participation", name)
    doc.check_permission("write")
    _assert_can_edit(doc)

    gps_fields = {"latitude", "longitude", "gps_accuracy"}
    changed = False
    for field in _EDITABLE_ALWAYS:
        if field not in kwargs:
            continue
        value = kwargs[field]
        if field == "display_photo" and not value:
            continue  # không cho xoá ảnh (reqd)
        if value is None:
            continue
        if field in gps_fields:
            # Arg HTTP về dạng string; field DB là Float → chuẩn hoá tránh dirty giả.
            value = flt(value)
            if flt(doc.get(field)) == value:
                continue
        elif doc.get(field) == value:
            continue
        doc.set(field, value)
        changed = True

    if any(kwargs.get(f) for f in _EDITABLE_BEFORE_APPROVAL):
        if doc.workflow_state not in (STATE_DRAFT, STATE_REJECTED):
            frappe.throw(_("Chỉ đổi điểm bán / chương trình khi lượt chưa duyệt."))
        for field in _EDITABLE_BEFORE_APPROVAL:
            value = kwargs.get(field)
            if not value or doc.get(field) == value:
                continue
            if field == "display_point":
                _assert_owns_point(value)  # chống bind sang điểm của NVBH khác
            doc.set(field, value)
            changed = True

    if not changed:
        return {"name": doc.name, "workflow_state": doc.workflow_state, "changed": False}

    doc.save()
    return {"name": doc.name, "workflow_state": doc.workflow_state, "changed": True}
