# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Chủ NPP quản lý nhân viên phụ trách điểm bán: gán / chuyển / nghỉ việc (doc/08).

- NV phụ trách điểm = `Display Point.owner`; NV phụ trách lượt = `Display Participation.owner`
  (cơ chế If Owner mà /dp đang dùng) → gán = đổi `owner`.
- Logic GHI (gán, bật/tắt, nghỉ việc) + lịch sử NV nằm MỘT chỗ ở đây. App `npp` chỉ xác
  định NPP (`require_customer`) rồi gọi hàm lõi; /dp gọi các method `npp_*` (gate `_require_npp`).
- Hàm lõi KHÔNG whitelist: người gọi PHẢI tự xác định NPP (`distributor`) trước. Đọc bằng
  frappe.get_all (bỏ qua DocPerm If Owner) NHƯNG luôn lọc distributor = NPP.
"""

import frappe
from frappe import _
from frappe.utils import cint, get_fullname, getdate, today

STAFF_WORKING = "Đang làm"
STAFF_LEFT = "Nghỉ việc"
REASON_ASSIGN = "Gán lại"
REASON_OFFBOARD = "Nghỉ việc"
TARGET_NPP = "__npp__"
BULK_MAX = 1000

STATE_APPROVED = "Đã duyệt"
STATE_REJECTED = "Từ chối"
PROGRAM_RUNNING = "Đang chạy"
PROGRAM_ENDED = "Kết thúc"
NPP_LABEL = "NPP (chưa giao)"
TRANSFER_DOCTYPE = "Display Point Transfer"

# Cắt danh sách "in" dài thành từng phần (nghỉ việc không giới hạn số điểm).
_IN_CHUNK = 500
_STAFF_EXTRA_FIELDS = ("employment_status", "left_on", "handover_to")
# Tài khoản nội bộ: NPP không được khoá dù có hồ sơ NV thuộc NPP (set_value bỏ qua User.validate).
_INTERNAL_USERS = ("Administrator", "Guest")
_INTERNAL_ROLES = {"System Manager", "Channel Manager", "Sales Manager", "Accounts Manager"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _str(value):
    """Date/Datetime → str cho JSON; rỗng → None."""
    return str(value) if value else None


def _is_pending(state):
    """Chờ xử lý = chưa Đã duyệt/Từ chối (null-safe, tính cả Nháp)."""
    return (state or "") not in (STATE_APPROVED, STATE_REJECTED)


def _counter():
    return {"participations": 0, "approved": 0, "pending": 0}


def _bump(counter, state):
    """Cộng 1 lượt vào bộ đếm theo trạng thái duyệt."""
    counter["participations"] += 1
    if state == STATE_APPROVED:
        counter["approved"] += 1
    elif _is_pending(state):
        counter["pending"] += 1


def _employment_status(row):
    """Rỗng/None coi như Đang làm (hồ sơ cũ trước khi có field)."""
    return row.get("employment_status") or STAFF_WORKING


def _profile_fields(*fields):
    """Field hồ sơ NV + các field nghỉ việc NẾU đã migrate (tránh Unknown column)."""
    meta = frappe.get_meta("Sales Staff Profile")
    return list(fields) + [f for f in _STAFF_EXTRA_FIELDS if meta.has_field(f)]


def _chunks(values, size=_IN_CHUNK):
    values = list(values)
    for i in range(0, len(values), size):
        yield values[i:i + size]


def _preview(names, limit=5):
    """'A, B, C … (+N)' để báo lỗi gọn."""
    head = ", ".join(names[:limit])
    return head + (f" … (+{len(names) - limit})" if len(names) > limit else "")


def _parse_names(points):
    """`points` = list hoặc chuỗi JSON (frappe.parse_json) → list tên, bỏ rỗng/trùng, giữ thứ tự."""
    if isinstance(points, str):
        try:
            points = frappe.parse_json(points)
        except ValueError:
            # Không phải JSON → coi là 1 tên điểm.
            points = [points]
    if not isinstance(points, (list, tuple, set)):
        # JSON vô hướng ("DP-1", 123) → 1 tên điểm; null/rỗng → không có điểm nào.
        points = [points] if points not in (None, "") else []
    names = [str(p).strip() for p in points if p and str(p).strip()]
    return list(dict.fromkeys(names))


def _clean_note(note):
    return (note or "").strip() or None


def _is_internal_user(user):
    """Administrator / QL kênh / System Manager — NV nghỉ việc vẫn bàn giao nhưng KHÔNG khoá
    tài khoản (tránh NPP khoá nhầm tài khoản nội bộ có hồ sơ NV thuộc NPP)."""
    if not user or user in _INTERNAL_USERS:
        return True
    return bool(set(frappe.get_roles(user)) & _INTERNAL_ROLES)


def _require_transfer_table():
    """Bảng nhật ký bàn giao chỉ có sau `bench migrate` → báo rõ thay vì lỗi SQL giữa chừng."""
    if not frappe.db.table_exists(TRANSFER_DOCTYPE):
        frappe.throw(_("Cần cập nhật app salep (bench migrate) để dùng chức năng này."))


def _enabled_map(users):
    """{user: enabled} cho danh sách user (1 query)."""
    if not users:
        return {}
    return {
        u.name: cint(u.enabled)
        for u in frappe.get_all("User", filters={"name": ("in", list(users))}, fields=["name", "enabled"])
    }


def _program_active(program, today_date):
    """Còn hiệu lực = status != Kết thúc và (end_date rỗng hoặc end_date >= hôm nay)."""
    if program.get("status") == PROGRAM_ENDED:
        return False
    return not program.get("end_date") or getdate(program.get("end_date")) >= today_date


def _program_map():
    """Mọi chương trình (ít bản ghi) → {name: row + is_active}, thứ tự start_date giảm dần."""
    today_date = getdate(today())
    out = {}
    for pg in frappe.get_all(
        "Promotion Program",
        fields=["name", "program_name", "status", "start_date", "end_date"],
        order_by="start_date desc",
    ):
        pg["is_active"] = _program_active(pg, today_date)
        out[pg.name] = pg
    return out


# ---------------------------------------------------------------------------
# NPP, tài khoản NPP, nhãn người phụ trách
# ---------------------------------------------------------------------------
def npp_customer_of(user=None):
    """NPP (Customer) mà `user` là CHỦ, hoặc None.

    `User.custom_customer` (field app `npp` ship — kiểm has_field trước) → else
    `Portal User.parent` (parenttype Customer) → else None. Guest/rỗng → None.
    """
    if user is None:
        user = frappe.session.user
    if not user or user == "Guest":
        return None
    if frappe.get_meta("User").has_field("custom_customer"):
        customer = frappe.db.get_value("User", user, "custom_customer")
        if customer:
            return customer
    try:
        return frappe.db.get_value("Portal User", {"user": user, "parenttype": "Customer"}, "parent") or None
    except Exception:
        # Site thiếu bảng Portal User → coi như không phải chủ NPP.
        return None


def guard_npp_binding(doc, method=None):
    """doc_event validate User — chặn tự gắn/đổi `User.custom_customer` (danh tính chủ NPP).

    Frappe chia sẻ bản ghi User cho chính user đó (quyền ghi) và field là permlevel 0 → không
    chặn thì ai cũng tự gán mình làm chủ NPP bất kỳ (npp_customer_of tin field này trước) rồi
    gán / chuyển điểm, cho NV nghỉ việc + khoá tài khoản của NPP đó. Chỉ System Manager, code
    server (ignore_permissions) và cài đặt/migrate được đặt/đổi field.
    """
    if not doc.meta.has_field("custom_customer"):
        return
    if (
        doc.flags.ignore_permissions
        or frappe.flags.in_install
        or frappe.flags.in_migrate
        or frappe.flags.in_patch
        or "System Manager" in frappe.get_roles()
    ):
        return
    before = doc.get_doc_before_save()  # None khi tạo mới
    old = before.get("custom_customer") if before else None
    # So sánh sau khi quy rỗng/None về một (form gửi "" cho Link trống, DB lưu NULL).
    if (old or None) != (doc.get("custom_customer") or None):
        frappe.throw(
            _("Chỉ quản trị hệ thống mới được gán tài khoản với nhà phân phối."), frappe.PermissionError
        )


def npp_users(distributor):
    """Tài khoản NPP: User.custom_customer == NPP (theo creation) ∪ Portal User của NPP.

    Giữ thứ tự (custom_customer trước), bỏ trùng.
    """
    if not distributor:
        return []
    users = []
    if frappe.get_meta("User").has_field("custom_customer"):
        users += frappe.get_all(
            "User", filters={"custom_customer": distributor}, order_by="creation asc", pluck="name"
        )
    try:
        portal = frappe.db.get_values(
            "Portal User", {"parenttype": "Customer", "parent": distributor}, "user", order_by="idx asc"
        )
    except Exception:
        # Site thiếu bảng Portal User → chỉ dùng custom_customer.
        portal = []
    users += [row[0] for row in portal]
    return list(dict.fromkeys(u for u in users if u))


def npp_owner_user(distributor):
    """Tài khoản NPP nhận bàn giao (đích "__npp__").

    Session user nếu là chủ chính NPP này; else user ENABLED đầu tiên trong
    npp_users(NPP); không có → throw.
    """
    user = frappe.session.user
    if distributor and npp_customer_of(user) == distributor:
        return user
    users = npp_users(distributor)
    enabled = _enabled_map(users)
    for u in users:
        if enabled.get(u):
            return u
    frappe.throw(_("Không xác định được tài khoản NPP để nhận bàn giao"))


def _npp_profiles(distributor):
    """Hồ sơ NV của NPP (kể cả đã nghỉ), theo họ tên."""
    return frappe.get_all(
        "Sales Staff Profile",
        filters={"distributor": distributor},
        fields=_profile_fields("name", "user", "full_name", "phone"),
        order_by="full_name asc",
    )


def _make_resolver(distributor, profiles):
    by_user = {p.user: p for p in profiles if p.get("user")}
    npp_set = set(npp_users(distributor))
    cache = {}

    def resolve(user):
        if user not in cache:
            prof = by_user.get(user)
            if user and user in npp_set:
                # Tài khoản NPP luôn là "NPP giữ" — kể cả khi chủ NPP có hồ sơ NV riêng
                # (đích "__npp__" rơi vào chính tài khoản này).
                info = {"owner_kind": "npp", "staff": None, "staff_name": NPP_LABEL, "staff_left": False}
            elif prof:
                info = {
                    "owner_kind": "staff",
                    "staff": prof.name,
                    "staff_name": prof.full_name or user,
                    "staff_left": _employment_status(prof) == STAFF_LEFT,
                }
            else:
                label = (get_fullname(user) if user else None) or user or ""
                info = {"owner_kind": "other", "staff": None, "staff_name": label, "staff_left": False}
            cache[user] = info
        return dict(cache[user])

    return resolve


def owner_resolver(distributor):
    """Hàm `user → {owner_kind, staff, staff_name, staff_left}` theo NPP (doc/08 §1).

    npp = tài khoản NPP (kể cả khi có hồ sơ NV); staff = hồ sơ NV của NPP này; other = còn lại.
    Nạp sẵn hồ sơ + tài khoản NPP 1 lần → gọi cho nhiều dòng không thêm query
    (trừ get_fullname cho owner "other", có cache).
    """
    return _make_resolver(distributor, _npp_profiles(distributor))


def active_program_names():
    """Tên các chương trình CÒN HIỆU LỰC (status != Kết thúc, end_date rỗng hoặc >= hôm nay)."""
    today_date = getdate(today())
    return {
        pg.name
        for pg in frappe.get_all("Promotion Program", fields=["name", "status", "end_date"])
        if _program_active(pg, today_date)
    }


def _own_profile(distributor, staff, fields):
    """Hồ sơ NV nếu thuộc NPP, else PermissionError."""
    fields = list(dict.fromkeys(list(fields) + ["name", "user", "distributor"]))
    prof = frappe.db.get_value("Sales Staff Profile", staff, fields, as_dict=True) if staff else None
    if not prof or prof.distributor != distributor:
        frappe.throw(_("Không có quyền với nhân viên này."), frappe.PermissionError)
    return prof


# ---------------------------------------------------------------------------
# Đọc (người gọi đã xác định NPP)
# ---------------------------------------------------------------------------
def overview(distributor):
    """Tổng quan quản lý của NPP: chương trình, điểm bán + NV phụ trách, nhân viên (doc/08 §5.3)."""
    profiles = _npp_profiles(distributor)
    resolve = _make_resolver(distributor, profiles)
    progs = _program_map()
    points = frappe.get_all(
        "Display Point",
        filters={"distributor": distributor},
        fields=[
            "name", "point_name", "phone", "address_line", "is_active", "latitude", "longitude",
            "store_photo", "creation", "owner",
        ],
        order_by="point_name asc",
    )
    parts = frappe.get_all(
        "Display Participation",
        filters={"distributor": distributor},
        fields=["name", "display_point", "promotion_program", "workflow_state", "owner"],
    )

    # Gộp lượt theo chương trình / điểm / người phụ trách trong 1 vòng (tránh N+1).
    by_prog, by_point, by_owner = {}, {}, {}
    totals_parts = _counter()
    for p in parts:
        _bump(totals_parts, p.workflow_state)
        _bump(by_point.setdefault(p.display_point, _counter()), p.workflow_state)
        _bump(by_owner.setdefault(p.owner, _counter()), p.workflow_state)
        b = by_prog.setdefault(p.promotion_program, {**_counter(), "pts": set(), "appr_pts": set()})
        _bump(b, p.workflow_state)
        if p.display_point:
            b["pts"].add(p.display_point)
            if p.workflow_state == STATE_APPROVED:
                b["appr_pts"].add(p.display_point)

    active_points = sum(1 for p in points if p.is_active)
    point_rows, points_by_owner = [], {}
    for p in points:
        c = by_point.get(p.name) or _counter()
        points_by_owner[p.owner] = points_by_owner.get(p.owner, 0) + 1
        point_rows.append({
            "name": p.name,
            "point_name": p.point_name,
            "phone": p.phone,
            "address_line": p.address_line,
            "is_active": bool(p.is_active),
            "latitude": p.latitude,
            "longitude": p.longitude,
            "store_photo": p.store_photo,
            "creation": _str(p.creation),
            "owner": p.owner,
            **resolve(p.owner),
            "participations": c["participations"],
            "approved": c["approved"],
            "participated": c["participations"] > 0,
        })

    prog_rows = []
    for pg in progs.values():
        b = by_prog.get(pg.name) or {**_counter(), "pts": set(), "appr_pts": set()}
        prog_rows.append({
            "program": pg.name,
            "program_name": pg.program_name or pg.name,
            "status": pg.status,
            "start_date": _str(pg.start_date),
            "end_date": _str(pg.end_date),
            "is_active": pg.is_active,
            "participations": b["participations"],
            "approved": b["approved"],
            "pending": b["pending"],
            "points": len(b["pts"]),
            "approved_points": len(b["appr_pts"]),
            "coverage_pct": round(len(b["appr_pts"]) / active_points * 100, 1) if active_points else 0,
        })
    # Chương trình đang chạy lên trước, rồi theo số lượt đã duyệt.
    prog_rows.sort(key=lambda x: (x["status"] != PROGRAM_RUNNING, -x["approved"]))

    enabled = _enabled_map([s.user for s in profiles if s.user])
    staff_rows = []
    for s in profiles:
        status = _employment_status(s)
        staff_rows.append({
            "name": s.name,
            "user": s.user,
            "full_name": s.full_name or s.user,
            "phone": s.phone,
            "employment_status": status,
            "resigned": status == STAFF_LEFT,
            "left_on": _str(s.get("left_on")),
            "active": bool(enabled.get(s.user)),
            "is_self": s.user == frappe.session.user,
            "points": points_by_owner.get(s.user, 0),
            **(by_owner.get(s.user) or _counter()),
        })
    # Đang làm trước, rồi theo họ tên.
    staff_rows.sort(key=lambda x: (x["resigned"], (x["full_name"] or "").lower()))

    staff_left = sum(1 for s in staff_rows if s["resigned"])
    return {
        "customer": distributor,
        "customer_name": frappe.db.get_value("Customer", distributor, "customer_name") or distributor,
        "totals": {
            "programs": len(prog_rows),
            "running": sum(1 for x in prog_rows if x["status"] == PROGRAM_RUNNING),
            "points": len(point_rows),
            "active_points": active_points,
            "unassigned_points": sum(1 for x in point_rows if x["owner_kind"] == "npp"),
            "participated_points": sum(1 for x in point_rows if x["participated"]),
            "participations": totals_parts["participations"],
            "approved": totals_parts["approved"],
            "pending": totals_parts["pending"],
            "staff": len(staff_rows),
            "staff_working": len(staff_rows) - staff_left,
            "staff_left": staff_left,
        },
        "programs": prog_rows,
        "points": point_rows,
        "staff": staff_rows,
    }


def participations(distributor, program=None):
    """Lượt tham gia của NPP (mới sửa trước, tối đa 2000) + NV phụ trách lượt & điểm (doc/08 §5.3)."""
    filters = {"distributor": distributor}
    if program:
        filters["promotion_program"] = program
    rows = frappe.get_all(
        "Display Participation",
        filters=filters,
        fields=[
            "name", "display_point", "promotion_program", "workflow_state", "reject_reason",
            "modified", "latitude", "longitude", "owner",
        ],
        order_by="modified desc",
        limit_page_length=2000,
    )
    if not rows:
        return []

    resolve = owner_resolver(distributor)
    progs = _program_map()
    points = {
        p.name: p
        for p in frappe.get_all(
            "Display Point",
            filters={"distributor": distributor},
            fields=["name", "point_name", "phone", "is_active", "owner"],
        )
    }
    out = []
    for r in rows:
        pt = points.get(r.display_point) or {}
        pg = progs.get(r.promotion_program) or {}
        point_owner = pt.get("owner")
        out.append({
            "name": r.name,
            "display_point": r.display_point,
            "point_name": pt.get("point_name") or r.display_point,
            "point_phone": pt.get("phone"),
            "point_active": bool(pt.get("is_active")),
            "promotion_program": r.promotion_program,
            "program_name": pg.get("program_name") or r.promotion_program,
            "program_status": pg.get("status"),
            "program_active": bool(pg.get("is_active")),
            "workflow_state": r.workflow_state,
            "reject_reason": r.reject_reason,
            "modified": _str(r.modified),
            "latitude": r.latitude,
            "longitude": r.longitude,
            "owner": r.owner,
            **resolve(r.owner),
            "point_owner": point_owner,
            "point_staff_name": resolve(point_owner)["staff_name"] if point_owner else None,
        })
    return out


def _point_names(distributor, names):
    """{name: point_name} cho các điểm thuộc NPP (theo lô, tránh N+1)."""
    out = {}
    for chunk in _chunks(names):
        for p in frappe.get_all(
            "Display Point",
            filters={"distributor": distributor, "name": ("in", chunk)},
            fields=["name", "point_name"],
        ):
            out[p.name] = p.point_name
    return out


def _transfers_of(distributor, user, resolve):
    """Nhật ký bàn giao có NV ở 1 trong 2 phía (mới trước, tối đa 300); bảng chưa có → []."""
    if not user or not frappe.db.table_exists(TRANSFER_DOCTYPE):
        return []
    rows = frappe.get_all(
        TRANSFER_DOCTYPE,
        filters={"distributor": distributor},
        or_filters={"from_user": user, "to_user": user},
        fields=[
            "name", "creation", "display_point", "from_user", "to_user", "reason", "note",
            "owner", "participations_moved",
        ],
        order_by="creation desc",
        limit_page_length=300,
    )
    names = _point_names(distributor, {r.display_point for r in rows if r.display_point})
    out = []
    for r in rows:
        incoming = r.to_user == user
        counterpart = r.from_user if incoming else r.to_user
        out.append({
            "name": r.name,
            "creation": _str(r.creation),
            "display_point": r.display_point,
            "point_name": names.get(r.display_point) or r.display_point,
            "direction": "in" if incoming else "out",
            "counterpart_label": resolve(counterpart)["staff_name"] if counterpart else None,
            "reason": r.reason,
            "note": r.note,
            "by_label": (get_fullname(r.owner) if r.owner else None) or r.owner,
            "participations_moved": cint(r.participations_moved),
        })
    return out


def staff_history(distributor, staff):
    """Lịch sử hoạt động 1 NV của NPP: điểm đang phụ trách, lượt, nhật ký bàn giao (doc/08 §5.3).

    PermissionError nếu hồ sơ không thuộc NPP.
    """
    fields = _profile_fields("name", "user", "full_name", "phone", "cccd", "distributor", "creation")
    prof = _own_profile(distributor, staff, fields)
    user = prof.user
    resolve = owner_resolver(distributor)
    progs = _program_map()
    account = {}
    if user:
        account = frappe.db.get_value("User", user, ["enabled", "last_login"], as_dict=True) or {}
    status = _employment_status(prof)
    handover_to = prof.get("handover_to")

    points = frappe.get_all(
        "Display Point",
        filters={"distributor": distributor, "owner": user},
        fields=["name", "point_name", "phone", "address_line", "is_active", "latitude", "longitude"],
        order_by="point_name asc",
    )
    # Số lượt của từng điểm (mọi người phụ trách) — 1 query theo lô.
    point_counts = {}
    for chunk in _chunks([p.name for p in points]):
        for p in frappe.get_all(
            "Display Participation",
            filters={"distributor": distributor, "display_point": ("in", chunk)},
            fields=["display_point", "workflow_state"],
        ):
            _bump(point_counts.setdefault(p.display_point, _counter()), p.workflow_state)

    # Lượt NV phụ trách (mọi chương trình): thống kê trên toàn bộ, danh sách tối đa 1000.
    parts = frappe.get_all(
        "Display Participation",
        filters={"distributor": distributor, "owner": user},
        fields=["name", "display_point", "promotion_program", "workflow_state", "modified"],
        order_by="modified desc",
    )
    part_stats = _counter()
    active_parts = 0
    for p in parts:
        _bump(part_stats, p.workflow_state)
        if (progs.get(p.promotion_program) or {}).get("is_active"):
            active_parts += 1
    shown = parts[:1000]
    point_names = {p.name: p.point_name for p in points}
    point_names.update(
        _point_names(distributor, {p.display_point for p in shown if p.display_point} - set(point_names))
    )

    point_rows = []
    for p in points:
        c = point_counts.get(p.name) or _counter()
        point_rows.append({
            "name": p.name,
            "point_name": p.point_name,
            "phone": p.phone,
            "address_line": p.address_line,
            "is_active": bool(p.is_active),
            "latitude": p.latitude,
            "longitude": p.longitude,
            "participations": c["participations"],
            "approved": c["approved"],
        })
    part_rows = []
    for p in shown:
        pg = progs.get(p.promotion_program) or {}
        part_rows.append({
            "name": p.name,
            "display_point": p.display_point,
            "point_name": point_names.get(p.display_point) or p.display_point,
            "promotion_program": p.promotion_program,
            "program_name": pg.get("program_name") or p.promotion_program,
            "program_status": pg.get("status"),
            "program_active": bool(pg.get("is_active")),
            "workflow_state": p.workflow_state,
            "modified": _str(p.modified),
        })

    return {
        "staff": {
            "name": prof.name,
            "user": user,
            "full_name": prof.full_name or user,
            "phone": prof.phone,
            "cccd": prof.cccd,
            "employment_status": status,
            "resigned": status == STAFF_LEFT,
            "left_on": _str(prof.get("left_on")),
            "handover_to": handover_to,
            "handover_label": resolve(handover_to)["staff_name"] if handover_to else None,
            "active": bool(cint(account.get("enabled"))),
            "is_self": user == frappe.session.user,
            "creation": _str(prof.creation),
            "last_login": _str(account.get("last_login")),
        },
        "stats": {
            "points": len(points),
            "active_points": sum(1 for p in points if p.is_active),
            "participations": part_stats["participations"],
            "approved": part_stats["approved"],
            "pending": part_stats["pending"],
            "active_participations": active_parts,
        },
        "points": point_rows,
        "participations": part_rows,
        "transfers": _transfers_of(distributor, user, resolve),
    }


# ---------------------------------------------------------------------------
# Ghi (người gọi đã xác định NPP) — kiểm tra TRƯỚC, ghi SAU (doc/08 §2.5)
# Lỗi khi ghi: rollback + log_error(defer_insert=True) rồi throw. Ghi hoãn vì sau throw
# Frappe rollback cả request → Error Log insert ngay sẽ mất theo.
# ---------------------------------------------------------------------------
def _resolve_target(distributor, target, resolve):
    """Đích bàn giao hợp lệ (doc/08 §2.6) → {"user", "staff", "label", "kind"}."""
    # str(): body JSON có thể gửi số/dict → báo lỗi nghiệp vụ thay vì AttributeError.
    target = str(target or "").strip()
    if not target:
        frappe.throw(_("Chưa chọn người nhận bàn giao."))
    if target == TARGET_NPP:
        user = npp_owner_user(distributor)
    else:
        fields = _profile_fields("name", "user", "full_name", "distributor")
        prof = frappe.db.get_value("Sales Staff Profile", target, fields, as_dict=True)
        if not prof or prof.distributor != distributor:
            frappe.throw(_("Nhân viên nhận bàn giao không thuộc NPP này."), frappe.PermissionError)
        label = prof.full_name or prof.name
        if _employment_status(prof) == STAFF_LEFT:
            frappe.throw(_("Nhân viên {0} đã nghỉ việc — không nhận bàn giao được.").format(label))
        if not prof.user or not cint(frappe.db.get_value("User", prof.user, "enabled")):
            frappe.throw(
                _("Tài khoản của nhân viên {0} đang tạm dừng — kích hoạt lại trước khi giao điểm.").format(
                    label
                )
            )
        user = prof.user
    info = resolve(user)
    return {"user": user, "staff": info["staff"], "label": info["staff_name"], "kind": info["owner_kind"]}


def _load_points(distributor, names):
    """Nạp điểm theo tên (giữ thứ tự). Mọi điểm phải tồn tại & thuộc NPP, else throw."""
    found = {}
    for chunk in _chunks(names):
        for p in frappe.get_all(
            "Display Point",
            filters={"name": ("in", chunk)},
            fields=["name", "point_name", "owner", "distributor", "is_active"],
        ):
            found[p.name] = p
    missing = [n for n in names if n not in found]
    if missing:
        frappe.throw(_("Không tìm thấy điểm bán: {0}").format(_preview(missing)))
    foreign = [n for n in names if found[n].distributor != distributor]
    if foreign:
        frappe.throw(
            _("Điểm bán không thuộc NPP của bạn: {0}").format(_preview(foreign)), frappe.PermissionError
        )
    return [found[n] for n in names]


def _plan_moves(distributor, rows, user, active):
    """(Chỉ đọc) Mỗi điểm → (row, đổi owner?, [lượt còn hiệu lực có owner != user]) — luật §2.1–2.3.

    Lượt của chương trình đã kết thúc giữ nguyên người thực hiện (KPI/lịch sử cũ không dời).
    """
    moves = {}
    for chunk in _chunks([r.name for r in rows]):
        for p in frappe.get_all(
            "Display Participation",
            filters={"distributor": distributor, "display_point": ("in", chunk), "owner": ("!=", user)},
            fields=["name", "display_point", "promotion_program"],
        ):
            if p.promotion_program in active:
                moves.setdefault(p.display_point, []).append(p.name)
    return [(r, r.owner != user, moves.get(r.name, [])) for r in rows]


def _log_transfer(distributor, point, from_user, tgt, resolve, reason, moved_parts, note):
    """1 dòng Display Point Transfer (người thao tác = owner, thời điểm = creation)."""
    log = frappe.get_doc({
        "doctype": TRANSFER_DOCTYPE,
        "display_point": point,
        "distributor": distributor,
        "from_user": from_user,
        "to_user": tgt["user"],
        "from_staff": resolve(from_user)["staff"] if from_user else None,
        "to_staff": tgt["staff"],
        "reason": reason,
        "participations_moved": moved_parts,
        "note": note,
    })
    # Nhật ký ghi nguyên giá trị lúc chuyển: owner cũ có thể là User đã xoá → bỏ kiểm Link.
    log.flags.ignore_links = True
    log.insert(ignore_permissions=True)


def _apply_moves(distributor, plan, tgt, resolve, note, reason, step):
    """(Ghi) Thực thi kế hoạch của _plan_moves + ghi nhật ký cho điểm có thay đổi.

    `step["label"]` = bước đang chạy để báo lỗi; người gọi bọc try/except + rollback.
    Trả (moved, skipped, participations).
    """
    user = tgt["user"]
    moved = skipped = n_parts = 0
    for row, owner_changed, part_names in plan:
        if not owner_changed and not part_names:
            skipped += 1
            continue
        step["label"] = _("chuyển điểm {0}").format(row.name)
        if owner_changed:
            frappe.db.set_value("Display Point", row.name, "owner", user, update_modified=False)
        if part_names:
            frappe.db.set_value(
                "Display Participation", {"name": ("in", part_names)}, "owner", user, update_modified=False
            )
        step["label"] = _("ghi lịch sử bàn giao điểm {0}").format(row.name)
        _log_transfer(distributor, row.name, row.owner, tgt, resolve, reason, len(part_names), note)
        moved += 1
        n_parts += len(part_names)
    return moved, skipped, n_parts


def _validate_batch(names):
    if not names:
        frappe.throw(_("Chưa chọn điểm bán nào."))
    if len(names) > BULK_MAX:
        frappe.throw(_("Tối đa {0} điểm bán mỗi lần — hãy chia nhỏ lô.").format(BULK_MAX))


def assign_points(distributor, points, target, note=None, reason=REASON_ASSIGN):
    """Gán NV phụ trách cho lô điểm bán của NPP (doc/08 §2) — nguồn duy nhất của luật chuyển.

    Đổi owner điểm + mọi lượt còn hiệu lực của điểm sang đích; ghi Display Point Transfer
    cho điểm có thay đổi. Kiểm tra trước (điểm thuộc NPP, đích hợp lệ), ghi sau; lỗi khi
    ghi → rollback toàn bộ.
    """
    names = _parse_names(points)
    _validate_batch(names)
    if reason not in (REASON_ASSIGN, REASON_OFFBOARD):
        frappe.throw(_("Lý do bàn giao không hợp lệ: {0}").format(reason))
    resolve = owner_resolver(distributor)
    tgt = _resolve_target(distributor, target, resolve)
    rows = _load_points(distributor, names)
    _require_transfer_table()
    plan = _plan_moves(distributor, rows, tgt["user"], active_program_names())
    note = _clean_note(note)

    step = {"label": _("chuẩn bị")}
    try:
        moved, skipped, n_parts = _apply_moves(distributor, plan, tgt, resolve, note, reason, step)
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="salep: gán NV phụ trách điểm bán thất bại", defer_insert=True)
        frappe.throw(_("Lỗi khi {0} — đã huỷ toàn bộ thay đổi, vui lòng thử lại.").format(step["label"]))
    return {"moved": moved, "skipped": skipped, "participations": n_parts, "target": tgt}


def set_points_active(distributor, points, active):
    """Bật/tắt hoạt động lô điểm bán của NPP. Kiểm tra trước (mọi điểm thuộc NPP), ghi sau.

    `active` nhận 0/1/"0"/"1"/bool. Trả {"updated": số điểm thực sự đổi trạng thái}.
    """
    names = _parse_names(points)
    _validate_batch(names)
    active = 1 if cint(active) else 0
    rows = _load_points(distributor, names)
    changed = [r.name for r in rows if cint(r.is_active) != active]

    try:
        for chunk in _chunks(changed):
            frappe.db.set_value("Display Point", {"name": ("in", chunk)}, "is_active", active)
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="salep: bật/tắt điểm bán thất bại", defer_insert=True)
        frappe.throw(_("Lỗi khi cập nhật trạng thái điểm bán — đã huỷ toàn bộ thay đổi, vui lòng thử lại."))
    return {"updated": len(changed)}


def offboard_staff(distributor, staff, target=TARGET_NPP, note=None):
    """Cho NV nghỉ việc (doc/08 §3): bàn giao mọi điểm + lượt còn hiệu lực, đánh dấu hồ sơ,
    khoá tài khoản (trừ tài khoản NPP / nội bộ). Chạy lại trên NV đã nghỉ = quét phần còn sót.
    """
    prof = _own_profile(distributor, staff, ["name", "user", "full_name", "distributor"])
    if prof.user == frappe.session.user:
        frappe.throw(_("Không thể tự cho mình nghỉ việc."))
    target = target or TARGET_NPP
    if target == prof.name:
        frappe.throw(_("Không thể bàn giao cho chính nhân viên nghỉ việc."))
    resolve = owner_resolver(distributor)
    tgt = _resolve_target(distributor, target, resolve)
    if tgt["user"] == prof.user:
        frappe.throw(_("Người nhận bàn giao trùng với nhân viên nghỉ việc — hãy chọn người khác."))
    _require_transfer_table()
    note = _clean_note(note)

    active = active_program_names()
    rows = frappe.get_all(
        "Display Point",
        filters={"distributor": distributor, "owner": prof.user},
        fields=["name", "point_name", "owner", "distributor", "is_active"],
        order_by="point_name asc",
    )
    plan = _plan_moves(distributor, rows, tgt["user"], active)
    # Lượt còn hiệu lực NV còn giữ trên điểm của NGƯỜI KHÁC (không ghi log điểm).
    own_points = {r.name for r in rows}
    leftover = [
        p.name
        for p in frappe.get_all(
            "Display Participation",
            filters={"distributor": distributor, "owner": prof.user},
            fields=["name", "display_point", "promotion_program"],
        )
        if p.promotion_program in active and p.display_point not in own_points
    ]
    # Không khoá tài khoản NPP — của NPP này (npp_users: NPP tự thêm mình làm NV) hay NPP KHÁC (vd.
    # hồ sơ NV cũ còn treo ở NPP này); npp_customer_of phủ cả hai — và tài khoản nội bộ.
    lock = not npp_customer_of(prof.user) and not _is_internal_user(prof.user)

    step = {"label": _("chuẩn bị")}
    try:
        moved, _skipped, n_parts = _apply_moves(distributor, plan, tgt, resolve, note, REASON_OFFBOARD, step)

        step["label"] = _("chuyển lượt tham gia còn hiệu lực")
        for chunk in _chunks(leftover):
            frappe.db.set_value(
                "Display Participation", {"name": ("in", chunk)}, "owner", tgt["user"], update_modified=False
            )
        n_parts += len(leftover)

        step["label"] = _("cập nhật hồ sơ nhân viên")
        doc = frappe.get_doc("Sales Staff Profile", prof.name)
        already_left = _employment_status(doc) == STAFF_LEFT
        values = {
            "employment_status": STAFF_LEFT,
            # Chạy lại trên NV đã nghỉ: giữ ngày nghỉ cũ; chỉ đổi người nhận nếu có bàn giao mới.
            "left_on": (already_left and doc.get("left_on")) or today(),
        }
        if not (already_left and doc.get("handover_to")) or moved or leftover:
            values["handover_to"] = tgt["user"]
        for field, value in values.items():
            if doc.meta.has_field(field):
                doc.set(field, value)
        # Chỉ đổi trạng thái nghỉ việc → không chặn vì hồ sơ cũ thiếu field bắt buộc.
        doc.flags.ignore_mandatory = True
        doc.save(ignore_permissions=True)

        if lock:
            step["label"] = _("khoá tài khoản nhân viên")
            frappe.db.set_value("User", prof.user, "enabled", 0)
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="salep: cho nhân viên nghỉ việc thất bại", defer_insert=True)
        frappe.throw(_("Lỗi khi {0} — đã huỷ toàn bộ thay đổi, vui lòng thử lại.").format(step["label"]))

    if lock:
        # Đăng xuất mọi phiên của NV (set_value không chạy User.validate). Lỗi ở đây
        # không huỷ bàn giao đã ghi.
        try:
            from frappe.sessions import clear_sessions

            clear_sessions(user=prof.user, force=True)
        except Exception:
            frappe.log_error(title="salep: xoá phiên đăng nhập NV nghỉ việc thất bại")

    return {
        "staff": prof.name,
        "points": moved,
        "participations": n_parts,
        "target": tgt,
        "disabled": lock,
    }


# ---------------------------------------------------------------------------
# Whitelisted API cho /dp (chủ NPP) — gate _require_npp()
# ---------------------------------------------------------------------------
def _require_npp():
    """Chỉ tài khoản chủ NPP (npp_customer_of). Trả distributor của CHÍNH họ."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Vui lòng đăng nhập."), frappe.PermissionError)
    distributor = npp_customer_of()
    if not distributor:
        frappe.throw(_("Chỉ tài khoản nhà phân phối mới dùng được chức năng này."), frappe.PermissionError)
    return distributor


@frappe.whitelist()
def npp_overview():
    """Chủ NPP: tổng quan chương trình / điểm bán / nhân viên của NPP mình. Quyền: _require_npp."""
    distributor = _require_npp()
    return overview(distributor)


@frappe.whitelist()
def npp_participations(program=None):
    """Chủ NPP: lượt tham gia của NPP mình (lọc chương trình nếu có). Quyền: _require_npp."""
    distributor = _require_npp()
    return participations(distributor, program)


@frappe.whitelist()
def npp_staff_history(staff):
    """Chủ NPP: lịch sử hoạt động 1 NV thuộc NPP mình. Quyền: _require_npp + hồ sơ thuộc NPP."""
    distributor = _require_npp()
    return staff_history(distributor, staff)


@frappe.whitelist(methods=["POST"])
def npp_assign_points(points, target, note=None):
    """Chủ NPP: gán NV phụ trách (hoặc NPP giữ lại "__npp__") cho lô điểm bán của NPP mình.

    Quyền: _require_npp + mọi điểm/đích thuộc NPP (kiểm trong assign_points).
    """
    distributor = _require_npp()
    return assign_points(distributor, points, target, note)


@frappe.whitelist(methods=["POST"])
def npp_set_points_active(points, active):
    """Chủ NPP: bật/tắt hoạt động lô điểm bán của NPP mình. Quyền: _require_npp + điểm thuộc NPP."""
    distributor = _require_npp()
    return set_points_active(distributor, points, active)


@frappe.whitelist(methods=["POST"])
def npp_offboard_staff(staff, target=None, note=None):
    """Chủ NPP: cho NV nghỉ việc + bàn giao (mặc định về NPP). Quyền: _require_npp + hồ sơ thuộc NPP."""
    distributor = _require_npp()
    return offboard_staff(distributor, staff, target or TARGET_NPP, note)
