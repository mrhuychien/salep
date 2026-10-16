# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Trả thưởng điểm bán trong chương trình — 2 lần cho mỗi lượt đã duyệt (doc/09).

- Mỗi lượt `Display Participation` ĐÃ DUYỆT được trả thưởng 2 lần (`payout_round` 1, 2); mỗi
  lần 1 bản ghi `Display Reward Payout` (unique participation + payout_round): ngày trả, ảnh
  trả thưởng (chọn từ thư viện, KHÔNG GPS), ghi chú.
- Logic nằm MỘT chỗ ở đây (app sở hữu dữ liệu). App `npp` chỉ xác định phạm vi (chủ NPP qua
  `require_customer` / quản lý kênh) rồi gọi hàm lõi; /dp gọi các method whitelisted bên dưới.
- Hàm lõi KHÔNG whitelist: người gọi PHẢI tự kiểm phạm vi trước. Đọc bằng frappe.get_all
  (bỏ qua DocPerm), ghi bằng insert/save(ignore_permissions=True) sau khi đã kiểm phạm vi.
"""

import datetime

import frappe
from frappe import _
from frappe.utils import (
    cint,
    cstr,
    flt,
    format_date,
    get_fullname,
    getdate,
    now_datetime,
    today,
)

from salep.api.npp_manage import (
    PROGRAM_RUNNING,
    STATE_APPROVED,
    _chunks,
    _clean_note,
    _preview,
    _require_npp,
    _str,
    npp_customer_of,
)

PAYOUT_DOCTYPE = "Display Reward Payout"
ROUNDS = (1, 2)
MAX_PHOTOS = 10

PARTICIPATION_DOCTYPE = "Display Participation"
PHOTO_DOCTYPE = "Display Photo"
PHOTO_FIELD = "photos"
MANAGER_ROLES = {"Channel Manager", "System Manager"}
ROWS_LIMIT = 5000
# Ảnh hợp lệ = file đã upload lên site (R5) — chặn URL ngoài / `javascript:` / data URI.
_FILE_PREFIXES = ("/files/", "/private/files/")
_PART_FIELDS = ["name", "owner", "distributor", "display_point", "promotion_program", "workflow_state"]
_PAYOUT_FIELDS = [
    "name", "participation", "payout_round", "payout_date", "note",
    "owner", "creation", "modified_by", "modified",
]
# Sắp danh sách tiến độ: chưa trả trước, rồi đã trả lần 1, rồi đủ 2 lần.
_STATUS_ORDER = {"none": 0, "r1": 1, "done": 2}
# Điểm bán trên dòng tiến độ: tên/SĐT + MST + tài khoản nhận thưởng (cột Excel, doc/10 §4).
_POINT_FIELDS = [
    "name", "point_name", "phone", "tax_code", "bank_account_name", "bank_account_no", "bank_name",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _table_ready():
    """Bảng trả thưởng chỉ có sau `bench migrate` (đọc → coi như chưa trả lần nào)."""
    return frappe.db.table_exists(PAYOUT_DOCTYPE)


def _require_table():
    """Ghi/xoá khi chưa migrate → báo rõ thay vì lỗi SQL giữa chừng."""
    if not _table_ready():
        frappe.throw(_("Cần cập nhật app salep (bench migrate) để dùng chức năng này."))


def _load_part(participation):
    """Lượt tham gia (field cần cho trả thưởng) hoặc DoesNotExistError.

    str(): body JSON có thể gửi số/dict → báo "không tìm thấy" thay vì lỗi lạ.
    """
    name = "" if isinstance(participation, (dict, list, tuple)) else str(participation or "").strip()
    if not name:
        frappe.throw(_("Chưa chọn lượt tham gia."))
    part = frappe.db.get_value(PARTICIPATION_DOCTYPE, name, _PART_FIELDS, as_dict=True)
    if not part:
        frappe.throw(_("Không tìm thấy lượt tham gia {0}.").format(name), frappe.DoesNotExistError)
    return part


def _as_part(part):
    """Tên lượt hoặc Document đã nạp (portal.get_participation truyền doc → khỏi query lại).

    dict (kể cả _dict) luôn nạp lại từ DB theo `name` — không tin owner/distributor từ ngoài.
    """
    if not isinstance(part, dict) and getattr(part, "doctype", None) == PARTICIPATION_DOCTYPE:
        return part
    if isinstance(part, dict):
        part = part.get("name")
    return _load_part(part)


def _is_manager(user):
    return bool(set(frappe.get_roles(user)) & MANAGER_ROLES)


def _is_npp_of(part, user):
    """`user` là chủ NPP của lượt (npp_manage.npp_customer_of == participation.distributor)."""
    distributor = part.get("distributor")
    return bool(distributor) and npp_customer_of(user) == distributor


def _staff_labels(users):
    """{user: nhãn} — họ tên Sales Staff Profile của user, else fullname, else user.

    1 query theo lô cho hồ sơ NV; get_fullname (có cache) chỉ cho user không có hồ sơ.
    """
    users = [u for u in dict.fromkeys(users) if u]
    names = {}
    for chunk in _chunks(users):
        for s in frappe.get_all(
            "Sales Staff Profile", filters={"user": ("in", chunk)}, fields=["user", "full_name"]
        ):
            if s.full_name:
                names[s.user] = s.full_name
    return {u: names.get(u) or get_fullname(u) or u for u in users}


def _photo_urls(payout_names):
    """{payout: [url, ...]} theo thứ tự idx (1 query theo lô)."""
    out = {}
    for chunk in _chunks(payout_names):
        for p in frappe.get_all(
            PHOTO_DOCTYPE,
            filters={"parenttype": PAYOUT_DOCTYPE, "parentfield": PHOTO_FIELD, "parent": ("in", chunk)},
            fields=["parent", "image"],
            order_by="idx asc",
        ):
            if p.image:
                out.setdefault(p.parent, []).append(p.image)
    return out


def _photo_counts(payout_names):
    """{payout: số ảnh} (1 query theo lô, đếm trong Python)."""
    out = {}
    for chunk in _chunks(payout_names):
        for p in frappe.get_all(
            PHOTO_DOCTYPE,
            filters={"parenttype": PAYOUT_DOCTYPE, "parentfield": PHOTO_FIELD, "parent": ("in", chunk)},
            fields=["parent"],
        ):
            out[p.parent] = out.get(p.parent, 0) + 1
    return out


def _parse_photo_urls(photos):
    """`photos` = list hoặc chuỗi JSON; phần tử = URL hoặc {image|file_url|url} → list URL,
    bỏ rỗng/trùng, giữ thứ tự."""
    if isinstance(photos, str):
        raw = photos.strip()
        try:
            photos = frappe.parse_json(raw) if raw else []
        except ValueError:
            # Không phải JSON → coi là 1 URL.
            photos = [raw]
    if isinstance(photos, (str, dict)):
        photos = [photos]
    if not isinstance(photos, (list, tuple)):
        photos = []
    urls = []
    for p in photos:
        if isinstance(p, dict):
            p = p.get("image") or p.get("file_url") or p.get("url")
        if isinstance(p, str) and p.strip():
            urls.append(p.strip())
    return list(dict.fromkeys(urls))


def _is_site_file(url):
    """URL file trên site: /files/… hoặc /private/files/…, không `..` / `\\` / ký tự điều khiển,
    không dấu nháy / `<` `>` (URL được nhúng vào thuộc tính src của 3 giao diện)."""
    if not isinstance(url, str) or not url.startswith(_FILE_PREFIXES):
        return False
    if ".." in url or any(ch in url for ch in "\\\"'<>`"):
        return False
    return not any(ord(ch) < 32 or ord(ch) == 127 for ch in url)


# ---------------------------------------------------------------------------
# Kiểm tra (dùng chung cho record_payout và validate của DocType)
# ---------------------------------------------------------------------------
def _check_eligible(part):
    """R1: chỉ lượt Đã duyệt mới trả thưởng được."""
    if part.get("workflow_state") != STATE_APPROVED:
        frappe.throw(_("Chỉ lượt tham gia đã duyệt mới trả thưởng được."))


def _check_round(payout_round):
    """R2: lần trả ∈ {1, 2} (nhận "1"/1/1.0)."""
    rnd = cint(payout_round)
    if rnd not in ROUNDS:
        frappe.throw(_("Lần trả thưởng không hợp lệ — chỉ Lần 1 hoặc Lần 2."))
    return rnd


def _parse_date(value):
    """date/datetime hoặc chuỗi ISO `YYYY-MM-DD[...]` → datetime.date, sai → None.

    KHÔNG dùng getdate cho chuỗi: getdate("") = HÔM NAY; chuỗi không ISO đi qua dateutil (đọc
    kiểu tháng/ngày: "01-10-2026" → 10/01/2026) hoặc frappe.throw (thêm thông báo thứ 2 vào
    message_log). <input type="date"> luôn gửi ISO.
    """
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, str):
        try:
            return datetime.date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def _check_date(payout_date):
    """R4: ngày trả bắt buộc, hợp lệ, không ở tương lai. Trả datetime.date."""
    if payout_date is None or (isinstance(payout_date, str) and not payout_date.strip()):
        frappe.throw(_("Chưa nhập ngày trả thưởng."))
    value = _parse_date(payout_date)
    if not value:
        frappe.throw(_("Ngày trả thưởng không hợp lệ."))
    if value > getdate(today()):
        frappe.throw(_("Ngày trả thưởng không được ở tương lai."))
    return value


def _check_photos(urls):
    """R5: 1–10 ảnh; mỗi ảnh là file đã upload lên site VÀ có bản ghi File cùng file_url."""
    if not urls:
        frappe.throw(_("Cần ít nhất 1 ảnh trả thưởng."))
    if len(urls) > MAX_PHOTOS:
        frappe.throw(_("Tối đa {0} ảnh mỗi lần trả thưởng.").format(MAX_PHOTOS))
    bad = [cstr(u) or _("(trống)") for u in urls if not _is_site_file(u)]
    if bad:
        frappe.throw(_("Ảnh không hợp lệ (phải là ảnh đã tải lên hệ thống): {0}").format(_preview(bad, 3)))
    found = set(frappe.get_all("File", filters={"file_url": ("in", list(urls))}, pluck="file_url"))
    missing = [u for u in urls if u not in found]
    if missing:
        frappe.throw(_("Không tìm thấy ảnh trên hệ thống — hãy tải lại: {0}").format(_preview(missing, 3)))


def _check_round_order(rounds, rnd, payout_date, current=None):
    """R2 + R3 với các lần đã ghi `rounds` ({1: row|None, 2: row|None}).

    `current` = tên bản ghi đang sửa (bỏ qua chính nó). Lần 2 cần Lần 1; ngày Lần 2 ≥ ngày Lần 1
    — kiểm cả khi sửa Lần 1 lúc đã có Lần 2.
    """
    others = {r: row for r, row in rounds.items() if row and row.name != current}
    if others.get(rnd):
        frappe.throw(_("Lần {0} của lượt này đã được ghi — hãy sửa bản ghi hiện có.").format(rnd))
    r1, r2 = others.get(1), others.get(2)
    if rnd == 2:
        if not r1:
            frappe.throw(_("Chưa trả thưởng Lần 1 — cần ghi Lần 1 trước."))
        if payout_date < getdate(r1.payout_date):
            frappe.throw(
                _("Ngày trả Lần 2 ({0}) phải từ ngày trả Lần 1 ({1}) trở đi.").format(
                    format_date(payout_date), format_date(r1.payout_date)
                )
            )
    elif r2 and payout_date > getdate(r2.payout_date):
        frappe.throw(
            _("Ngày trả Lần 1 ({0}) không được sau ngày trả Lần 2 ({1}).").format(
                format_date(payout_date), format_date(r2.payout_date)
            )
        )


def validate_payout_doc(doc):
    """validate của DocType Display Reward Payout (form Desk của QL kênh + API).

    Đồng bộ display_point / promotion_program / distributor từ lượt; kiểm R1–R5 (doc/09 §1).
    record_payout đã kiểm cùng luật TRƯỚC khi ghi (báo lỗi rõ) — chạy lại ở đây là chốt chặn.
    Bản ghi đã lưu KHÔNG đổi được lượt (sửa trên Desk): R3/R7 chỉ kiểm lượt MỚI, chuyển Lần 1 sang
    lượt khác sẽ để lại Lần 2 không có Lần 1 ở lượt cũ (đổi Lần 1 ↔ 2 thì _check_round_order đã chặn).
    """
    if not doc.is_new():
        before = doc.get_doc_before_save()
        # So sánh sau khi quy rỗng/None về một (form gửi "" cho Link trống, DB lưu NULL).
        if before and (before.get("participation") or None) != (doc.get("participation") or None):
            frappe.throw(_("Không đổi được lượt tham gia của bản ghi trả thưởng — hãy xoá rồi ghi lại cho đúng lượt."))
    part = _load_part(doc.participation)
    _check_eligible(part)
    doc.payout_round = _check_round(doc.payout_round)
    doc.payout_date = _check_date(doc.payout_date)
    doc.display_point = part.display_point
    doc.promotion_program = part.promotion_program
    doc.distributor = part.distributor
    _check_photos([row.get("image") for row in (doc.get(PHOTO_FIELD) or [])])
    rounds = payout_map([part.name])[part.name]
    _check_round_order(rounds, doc.payout_round, doc.payout_date, current=doc.name)


def guard_payout_delete(doc):
    """on_trash của DocType (cả xoá trên Desk): không xoá Lần 1 khi lượt đã có Lần 2 (R7)."""
    if cint(doc.payout_round) != 1 or not doc.participation:
        return
    if (payout_map([doc.participation]).get(doc.participation) or {}).get(2):
        frappe.throw(_("Không xoá được Lần 1 khi đã có Lần 2 — hãy xoá Lần 2 trước."))


# ---------------------------------------------------------------------------
# Quyền phía salep (doc/09 §1) — nhận tên lượt hoặc Document lượt
# ---------------------------------------------------------------------------
def _can_view(part):
    """(Lượt đã nạp) NV phụ trách lượt (owner), chủ NPP của lượt, Channel/System Manager."""
    user = frappe.session.user
    if not user or user == "Guest":
        return False
    return _is_manager(user) or part.get("owner") == user or _is_npp_of(part, user)


def _can_delete(part):
    """(Lượt đã nạp) chủ NPP của lượt, Channel/System Manager (R7)."""
    user = frappe.session.user
    if not user or user == "Guest":
        return False
    return _is_manager(user) or _is_npp_of(part, user)


def can_view(part):
    """Xem trả thưởng: NV phụ trách lượt (owner), chủ NPP của lượt, Channel/System Manager."""
    return _can_view(_as_part(part))


def can_record(part):
    """Ghi / sửa trả thưởng: cùng nhóm với can_view (NV phụ trách, chủ NPP, quản lý)."""
    return _can_view(_as_part(part))


def can_delete(part):
    """Xoá 1 lần trả thưởng: chỉ chủ NPP của lượt và Channel/System Manager (R7)."""
    return _can_delete(_as_part(part))


# ---------------------------------------------------------------------------
# Hàm lõi (KHÔNG whitelist — người gọi tự kiểm phạm vi)
# ---------------------------------------------------------------------------
def payout_map(participations):
    """{participation: {1: row|None, 2: row|None}} cho danh sách lượt (1 query theo lô 500).

    row = _dict các field trong _PAYOUT_FIELDS. Bảng chưa migrate → mọi lần đều None.
    """
    names = list(dict.fromkeys(p for p in (participations or []) if p))
    out = {n: dict.fromkeys(ROUNDS) for n in names}
    if not names or not _table_ready():
        return out
    for chunk in _chunks(names):
        for row in frappe.get_all(
            PAYOUT_DOCTYPE,
            filters={"participation": ("in", chunk)},
            fields=_PAYOUT_FIELDS,
            order_by="modified asc",
        ):
            rnd = cint(row.payout_round)
            if row.participation in out and rnd in ROUNDS:
                out[row.participation][rnd] = row
    return out


def _round_out(rnd, row, photos, labels):
    """1 phần tử `rounds` của participation_payouts (doc/09 §3.3)."""
    if not row:
        return {
            "round": rnd, "paid": False, "name": None, "payout_date": None, "note": None,
            "photos": [], "recorded_by": None, "recorded_by_label": None, "recorded_on": None,
        }
    # Người ghi = người sửa gần nhất (dữ liệu hiện tại do họ nhập); chưa sửa = người tạo.
    by = row.modified_by or row.owner
    return {
        "round": rnd,
        "paid": True,
        "name": row.name,
        "payout_date": _str(row.payout_date),
        "note": row.note,
        "photos": [{"url": u} for u in photos.get(row.name, [])],
        "recorded_by": by,
        "recorded_by_label": labels.get(by) or by,
        "recorded_on": _str(row.modified or row.creation),
    }


def participation_payouts(participation):
    """Trả thưởng của 1 lượt (doc/09 §3.3): luôn đủ 2 phần tử `rounds` (Lần 1, Lần 2).

    `participation` = tên lượt hoặc Document lượt. Người gọi đã kiểm quyền xem.
    """
    part = _as_part(participation)
    program = part.get("promotion_program")
    reward = frappe.db.get_value("Promotion Program", program, "reward_per_point") if program else None
    rounds = payout_map([part.name])[part.name]
    paid = [row for row in rounds.values() if row]
    photos = _photo_urls([row.name for row in paid])
    labels = _staff_labels([row.modified_by or row.owner for row in paid])
    return {
        "participation": part.name,
        "eligible": part.get("workflow_state") == STATE_APPROVED,
        "reward_per_point": flt(reward),
        "rounds": [_round_out(rnd, rounds.get(rnd), photos, labels) for rnd in ROUNDS],
    }


def record_payout(participation, payout_round, payout_date, photos, note=None):
    """Ghi (hoặc cập nhật — R6) trả thưởng Lần 1/2 cho 1 lượt đã duyệt (doc/09 §1).

    Kiểm tra TRƯỚC (R1–R5), ghi SAU; lỗi khi ghi → rollback + log_error + throw tiếng Việt.
    Trả participation_payouts(...) + "saved": {"round", "name", "created"}.
    """
    _require_table()
    part = _load_part(participation)
    _check_eligible(part)
    rnd = _check_round(payout_round)
    date = _check_date(payout_date)
    urls = _parse_photo_urls(photos)
    _check_photos(urls)
    rounds = payout_map([part.name])[part.name]
    existing = rounds.get(rnd)
    _check_round_order(rounds, rnd, date, current=existing.name if existing else None)
    # cstr: body JSON có thể gửi số → không AttributeError ở .strip().
    note = _clean_note(cstr(note))

    try:
        if existing:
            doc = frappe.get_doc(PAYOUT_DOCTYPE, existing.name)
            # Ảnh giữ lại giữ nguyên thời điểm ghi cũ; ảnh mới = giờ máy chủ.
            kept = {row.get("image"): row.get("captured_on") for row in (doc.get(PHOTO_FIELD) or [])}
        else:
            doc = frappe.new_doc(PAYOUT_DOCTYPE)
            kept = {}
        doc.update({
            "participation": part.name,
            "payout_round": rnd,
            "payout_date": date,
            "note": note,
            # Đặt tường minh từ lượt (validate của DocType cũng đồng bộ lại).
            "display_point": part.display_point,
            "promotion_program": part.promotion_program,
            "distributor": part.distributor,
        })
        now = now_datetime()
        doc.set(PHOTO_FIELD, [])
        for url in urls:
            # Ảnh trả thưởng: KHÔNG GPS (chọn từ thư viện) → để trống toạ độ.
            doc.append(PHOTO_FIELD, {"image": url, "captured_on": kept.get(url) or now})
        if existing:
            doc.save(ignore_permissions=True)  # track_changes → Version ghi lịch sử sửa
        else:
            doc.insert(ignore_permissions=True)
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="salep: ghi trả thưởng thất bại", defer_insert=True)
        frappe.throw(_("Lỗi khi lưu trả thưởng Lần {0} — đã huỷ thay đổi, vui lòng thử lại.").format(rnd))

    out = participation_payouts(part.name)
    out["saved"] = {"round": rnd, "name": doc.name, "created": not existing}
    return out


def delete_payout(participation, payout_round):
    """Xoá 1 lần trả thưởng (R7): không xoá Lần 1 khi đã có Lần 2.

    Quyền xoá (chủ NPP / quản lý) do người gọi kiểm. Trả participation_payouts(...)
    + "deleted": {"round", "name"}.
    """
    _require_table()
    part = _load_part(participation)
    rnd = _check_round(payout_round)
    rounds = payout_map([part.name])[part.name]
    row = rounds.get(rnd)
    if not row:
        frappe.throw(_("Lần {0} của lượt này chưa được ghi trả thưởng.").format(rnd))
    if rnd == 1 and rounds.get(2):
        frappe.throw(_("Không xoá được Lần 1 khi đã có Lần 2 — hãy xoá Lần 2 trước."))

    try:
        frappe.delete_doc(PAYOUT_DOCTYPE, row.name, ignore_permissions=True)
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="salep: xoá trả thưởng thất bại", defer_insert=True)
        frappe.throw(_("Lỗi khi xoá trả thưởng Lần {0} — đã huỷ thay đổi, vui lòng thử lại.").format(rnd))

    out = participation_payouts(part.name)
    out["deleted"] = {"round": rnd, "name": row.name}
    return out


def _pct(paid, eligible):
    return round(paid / eligible * 100, 1) if eligible else 0


def _date_key(value):
    """Khoá sắp start_date giảm dần (rỗng xuống cuối)."""
    return -getdate(value).toordinal() if value else 0


def _status_of(rounds):
    if rounds.get(1) and rounds.get(2):
        return "done"
    return "r1" if rounds.get(1) else "none"


def _brief(row, counts):
    """round_1/round_2 của 1 dòng tiến độ: {name, payout_date, photos (số ảnh)} hoặc None."""
    if not row:
        return None
    return {"name": row.name, "payout_date": _str(row.payout_date), "photos": counts.get(row.name, 0)}


def progress(distributor=None, program=None):
    """Tiến độ trả thưởng (doc/09 §3.3). `distributor` None = mọi NPP (quản lý kênh).

    - `totals` + `rows` lọc theo `program` (nếu có).
    - `programs`: mọi chương trình có ≥1 lượt đã duyệt trong phạm vi NPP (KHÔNG lọc `program`,
      để giao diện dựng bộ chọn chương trình), "Đang chạy" trước rồi start_date giảm dần.
    - `rows`: lượt đã duyệt, chưa trả trước (none → r1 → done) rồi tên điểm; tối đa 5000 dòng.
    Truy vấn theo lô (không N+1).
    """
    program = str(program).strip() if program else None
    filters = {"workflow_state": STATE_APPROVED}
    # CHỈ None = mọi NPP; "" (phạm vi NPP rỗng do lỗi người gọi) → không khớp lượt nào, không lộ dữ liệu.
    if distributor is not None:
        filters["distributor"] = distributor
    parts = frappe.get_all(
        PARTICIPATION_DOCTYPE,
        filters=filters,
        fields=["name", "display_point", "promotion_program", "distributor", "owner"],
        order_by="name asc",
    )
    pmap = payout_map([p.name for p in parts])
    progs = {
        pg.name: pg
        for pg in frappe.get_all(
            "Promotion Program",
            fields=["name", "program_name", "status", "start_date", "end_date", "reward_per_point"],
        )
    }

    # Gộp theo chương trình + tổng (theo lọc chương trình) trong 1 vòng.
    by_prog = {}
    totals = {"eligible": 0, "paid_1": 0, "paid_2": 0}
    selected = []
    for p in parts:
        rounds = pmap.get(p.name) or {}
        b = by_prog.setdefault(p.promotion_program, {"eligible": 0, "paid_1": 0, "paid_2": 0})
        targets = [b]
        if not program or p.promotion_program == program:
            selected.append(p)
            targets.append(totals)
        for t in targets:
            t["eligible"] += 1
            t["paid_1"] += 1 if rounds.get(1) else 0
            t["paid_2"] += 1 if rounds.get(2) else 0

    program_rows = []
    for name, b in by_prog.items():
        pg = progs.get(name) or {}
        program_rows.append({
            "program": name,
            "program_name": pg.get("program_name") or name,
            "status": pg.get("status"),
            "start_date": _str(pg.get("start_date")),
            "end_date": _str(pg.get("end_date")),
            "reward_per_point": flt(pg.get("reward_per_point")),
            "eligible": b["eligible"],
            "paid_1": b["paid_1"],
            "paid_2": b["paid_2"],
            "pct_1": _pct(b["paid_1"], b["eligible"]),
            "pct_2": _pct(b["paid_2"], b["eligible"]),
        })
    program_rows.sort(key=lambda x: (
        x["status"] != PROGRAM_RUNNING, _date_key(x["start_date"]), (x["program_name"] or "").lower()
    ))

    # Tên/SĐT điểm bán của các lượt được chọn (theo lô) — cần tên điểm để sắp xếp trước khi cắt 5000.
    # Cùng truy vấn lấy luôn MST + tài khoản nhận thưởng cho file Excel (doc/10 §4) — không N+1.
    # Phạm vi 1 NPP: chỉ điểm CỦA NPP đó — lượt cũ trỏ điểm đã chuyển sang NPP khác → tên = mã điểm,
    # SĐT / MST / TK = None (như participations() / staff_history()), không lộ dữ liệu NPP khác.
    points = {}
    for chunk in _chunks({p.display_point for p in selected if p.display_point}):
        pt_filters = {"name": ("in", chunk)}
        if distributor is not None:
            pt_filters["distributor"] = distributor
        for pt in frappe.get_all("Display Point", filters=pt_filters, fields=_POINT_FIELDS):
            points[pt.name] = pt
    rows = []
    for p in selected:
        pt = points.get(p.display_point) or {}
        pg = progs.get(p.promotion_program) or {}
        rounds = pmap.get(p.name) or {}
        rows.append({
            "participation": p.name,
            "display_point": p.display_point,
            "point_name": pt.get("point_name") or p.display_point,
            "point_phone": pt.get("phone"),
            "distributor": p.distributor,
            "promotion_program": p.promotion_program,
            "program_name": pg.get("program_name") or p.promotion_program,
            "owner": p.owner,
            "_rounds": rounds,
            "status": _status_of(rounds),
            "reward_per_point": flt(pg.get("reward_per_point")),
            "point_tax_code": pt.get("tax_code"),
            "point_bank_account_name": pt.get("bank_account_name"),
            "point_bank_account_no": pt.get("bank_account_no"),
            "point_bank_name": pt.get("bank_name"),
        })
    rows.sort(key=lambda x: (_STATUS_ORDER[x["status"]], (x["point_name"] or "").lower(), x["participation"]))
    rows = rows[:ROWS_LIMIT]

    # Nhãn NV, tên NPP, số ảnh — chỉ cho các dòng trả về.
    labels = _staff_labels([r["owner"] for r in rows])
    customers = {}
    for chunk in _chunks({r["distributor"] for r in rows if r["distributor"]}):
        for c in frappe.get_all("Customer", filters={"name": ("in", chunk)}, fields=["name", "customer_name"]):
            customers[c.name] = c.customer_name
    counts = _photo_counts([row.name for r in rows for row in r["_rounds"].values() if row])
    for r in rows:
        rounds = r.pop("_rounds")
        r["distributor_name"] = customers.get(r["distributor"]) or r["distributor"]
        r["staff_name"] = labels.get(r["owner"]) or r["owner"]
        r["round_1"] = _brief(rounds.get(1), counts)
        r["round_2"] = _brief(rounds.get(2), counts)

    return {"totals": totals, "programs": program_rows, "rows": rows}


# ---------------------------------------------------------------------------
# Whitelisted API (portal /dp và dùng chung) — kiểm quyền rồi gọi hàm lõi
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_payouts(participation):
    """Trả thưởng 2 lần của 1 lượt. Quyền: can_view (NV phụ trách, chủ NPP, quản lý)."""
    part = _load_part(participation)
    if not _can_view(part):
        frappe.throw(_("Bạn không có quyền xem trả thưởng của lượt này."), frappe.PermissionError)
    return participation_payouts(part.name)


@frappe.whitelist(methods=["POST"])
def record(participation, payout_round, payout_date, photos, note=None):
    """Ghi / sửa trả thưởng Lần 1 hoặc 2 (ngày, ảnh từ thư viện, ghi chú).

    Quyền: can_record (NV phụ trách lượt, chủ NPP của lượt, Channel/System Manager).
    """
    part = _load_part(participation)
    if not can_record(part):
        frappe.throw(_("Bạn không có quyền ghi trả thưởng cho lượt này."), frappe.PermissionError)
    return record_payout(part.name, payout_round, payout_date, photos, note)


@frappe.whitelist(methods=["POST"])
def remove(participation, payout_round):
    """Xoá 1 lần trả thưởng. Quyền: can_delete (chủ NPP của lượt, Channel/System Manager)."""
    part = _load_part(participation)
    if not _can_delete(part):
        frappe.throw(_("Chỉ chủ NPP hoặc quản lý mới được xoá trả thưởng."), frappe.PermissionError)
    return delete_payout(part.name, payout_round)


@frappe.whitelist()
def npp_payout_progress(program=None):
    """Chủ NPP: tiến độ trả thưởng các lượt đã duyệt của NPP mình. Quyền: _require_npp."""
    distributor = _require_npp()
    return progress(distributor=distributor, program=program)
