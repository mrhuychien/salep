// Quản lý NPP (chủ NPP — doc/08 §8): #/npp?t=staff|points|programs|payouts + bộ lọc trên URL.
// Thẻ danh sách + lọc (đổi tab/lọc chỉ replaceState, không render lại cả màn), chế độ
// Chọn nhiều + thanh thao tác, sheet Gán NV / chi tiết điểm. Tab Trả thưởng (doc/09 §5):
// tiến độ Lần 1 / Lần 2 theo chương trình, bấm thẻ → chi tiết lượt để ghi. Quyền kiểm ở server.
// Nút Xuất Excel (doc/10): mọi dòng khớp bộ lọc hiện tại của tab, dựng .xlsx ngay trên trình duyệt.
import { icon, emptyState, skeleton } from "../lib/dom.js";
import { esc, formatDate, formatNumber, formatVND, statusBadge, STATES } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isNppOwner } from "../lib/store.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";
import { downloadXlsx, fileStamp } from "../components/xlsx.js";
import {
  TARGET_NPP,
  matchesAll,
  initials,
  ownerChip,
  checkMark,
  moreList,
  bulkBar,
  busy,
  openAssignSheet,
  openPointSheet,
  confirmAction,
  setPointsActive,
} from "../components/npp-ui.js";

const OTHER = "__other__"; // lọc Phụ trách = Khác (Administrator, NV đã xoá hồ sơ, NV NPP khác…)
const MULTI_KEY = "dp_npp_multi";
const PARTS_LIMIT = 2000; // npp_participations trả tối đa 2000 lượt
const PAY_LIMIT = 5000; // npp_payout_progress trả tối đa 5000 dòng (ROWS_LIMIT ở salep/api/payout.py)
const PROGRAM_RUNNING = "Đang chạy";
const XL_COOLDOWN = 800; // ms khoá thêm sau khi xuất: file nhỏ dựng xong nhanh hơn 1 lần chạm đúp

const TABS = [
  { key: "staff", label: "Nhân viên" },
  { key: "points", label: "Điểm bán" },
  { key: "programs", label: "Chương trình" },
  { key: "payouts", label: "Trả thưởng" },
];
// Khoá lọc theo tab; "" = mặc định (không ghi lên URL).
const FILTERS = {
  staff: ["q", "st"],
  points: ["q", "owner", "st", "joined"],
  programs: ["q", "program", "owner", "state", "point"],
  payouts: ["q", "program", "st", "owner"],
};
const UNITS = { staff: "nhân viên", points: "điểm bán", programs: "lượt tham gia", payouts: "lượt đã duyệt" };
// Trạng thái trả thưởng của 1 lượt (progress().rows[].status — doc/09 §3.3).
const PAY_STATUS = [
  { value: "none", label: "Chưa trả" },
  { value: "r1", label: "Đã trả lần 1" },
  { value: "done", label: "Đủ 2 lần" },
];
const EMPTY_PAY = { totals: { eligible: 0, paid_1: 0, paid_2: 0 }, programs: [], rows: [] };
const POINT_ACTIONS = [
  { act: "assign", label: "Gán NV", icon: "user-pen" },
  { act: "off", label: "Ngừng HĐ", icon: "circle-pause", cls: "dp-btn-outline" },
  { act: "on", label: "Kích hoạt", icon: "circle-play", cls: "dp-btn-outline" },
];
const PART_ACTIONS = [{ act: "assign", label: "Gán NV phụ trách điểm bán", icon: "user-pen" }];

const isTab = (key) => TABS.some((x) => x.key === key);
const blank = (tab) => Object.fromEntries(FILTERS[tab].map((k) => [k, ""]));
// Tab không có chế độ Chọn nhiều / thanh thao tác hàng loạt.
const noMulti = (tab) => tab === "staff" || tab === "payouts";

// Khoá "người phụ trách" của 1 điểm/lượt cho bộ lọc Phụ trách.
function ownerKey(r) {
  if (r.owner_kind === "npp") return TARGET_NPP;
  if (r.owner_kind === "staff" && r.staff) return r.staff;
  return OTHER;
}

function readMulti() {
  try {
    return localStorage.getItem(MULTI_KEY) === "1";
  } catch {
    return false;
  }
}
function saveMulti(on) {
  try {
    localStorage.setItem(MULTI_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
}

function searchBox(value, placeholder) {
  return `<div class="dp-search-wrap dp-npp-search">${icon("magnifying-glass")}
    <input class="dp-search" type="search" data-f="q" value="${esc(value)}" placeholder="${esc(placeholder)}"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
      inputmode="search" enterkeyhint="search" aria-label="${esc(placeholder)}" />
  </div>`;
}

function selectBox(key, label, options, wide = false) {
  return `<select class="dp-select${wide ? " dp-filter-wide" : ""}" data-f="${key}" aria-label="${esc(
    label
  )}">${options}</select>`;
}

const rowRole = (multi, on) => (multi ? `role="checkbox" aria-checked="${on}"` : `role="button"`);

// ── Xuất Excel (doc/10 §2–3): cột + nhãn tiếng Việt như trên màn hình ──

const XL_BASE = { staff: "NhanVien", points: "DiemBan", programs: "ThamGiaTrungBay", payouts: "TraThuong" };
const PAY_LABEL = Object.fromEntries(PAY_STATUS.map((x) => [x.value, x.label]));
const xc = (header, value, type = "text", width) => ({ header, value, type, width });
const XL_STT = xc("STT", (_, i) => i + 1, "int", 6);
const geo = (v) => (Number(v) ? Number(v) : null); // 0 = chưa có toạ độ → ô trống
const pct = (part, total) => (Number(total) ? (Number(part) / Number(total)) * 100 : null);
// Nhãn Phụ trách đang hiển thị (staff_name server đã dựng: tên NV / "NPP (chưa giao)" / tài khoản khác).
const ownerLabel = (r) => (r.staff_name ? `${r.staff_name}${r.staff_left ? " (đã nghỉ)" : ""}` : "");
const staffStatus = (s) => (s.resigned ? "Đã nghỉ" : s.active ? "Hoạt động" : "Tạm dừng");

const XL_STAFF = [
  XL_STT,
  xc("Mã NV", (s) => s.name),
  xc("Họ tên", (s) => s.full_name || s.user),
  xc("SĐT (đăng nhập)", (s) => s.phone || s.user),
  xc("CCCD", (s) => s.cccd),
  xc("Trạng thái", staffStatus),
  xc("Ngày nghỉ", (s) => (s.resigned ? s.left_on : null), "date"),
  xc("Số điểm phụ trách", (s) => s.points, "int"),
  xc("Lượt tham gia", (s) => s.participations, "int"),
  xc("Đã duyệt", (s) => s.approved, "int"),
  xc("Tỷ lệ duyệt %", (s) => pct(s.approved, s.participations), "percent"),
];
const XL_POINTS = [
  XL_STT,
  xc("Mã điểm", (p) => p.name),
  xc("Tên điểm bán", (p) => p.point_name),
  xc("SĐT", (p) => p.phone),
  xc("Địa chỉ", (p) => p.address_line),
  xc("Mã số thuế", (p) => p.tax_code),
  xc("NV phụ trách", ownerLabel),
  xc("Trạng thái", (p) => (p.is_active ? "Hoạt động" : "Ngừng")),
  xc("Số lượt tham gia", (p) => p.participations, "int"),
  xc("Lượt đã duyệt", (p) => p.approved, "int"),
  xc("Chủ TK nhận thưởng", (p) => p.bank_account_name),
  xc("Số TK", (p) => p.bank_account_no),
  xc("Ngân hàng", (p) => p.bank_name),
  xc("Vĩ độ", (p) => geo(p.latitude), "number"),
  xc("Kinh độ", (p) => geo(p.longitude), "number"),
  xc("Ngày tạo", (p) => p.creation, "date"),
];
const XL_PARTS = [
  XL_STT,
  xc("Mã lượt", (r) => r.name),
  xc("Mã điểm", (r) => r.display_point),
  xc("Điểm bán", (r) => r.point_name || r.display_point),
  xc("SĐT điểm", (r) => r.point_phone),
  xc("Chương trình", (r) => r.program_name || r.promotion_program),
  xc("NV phụ trách", ownerLabel),
  xc("Trạng thái duyệt", (r) => r.workflow_state),
  // Chỉ lượt đang "Từ chối" (như màn hình, /npp, /ql-km): duyệt lại / gửi lại không xoá reject_reason cũ.
  xc("Lý do từ chối", (r) => (r.workflow_state === "Từ chối" ? r.reject_reason : null)),
  xc("Cập nhật", (r) => r.modified, "datetime"),
  xc("Vĩ độ", (r) => geo(r.latitude), "number"),
  xc("Kinh độ", (r) => geo(r.longitude), "number"),
];
const XL_PAY_SUM = [
  xc("Chương trình", (p) => p.program_name || p.program),
  xc("Trạng thái CT", (p) => p.status),
  xc("Đủ điều kiện", (p) => p.eligible, "int"),
  xc("Đã trả lần 1", (p) => p.paid_1, "int"),
  xc("% lần 1", (p) => p.pct_1 ?? pct(p.paid_1, p.eligible), "percent"),
  xc("Đã trả lần 2", (p) => p.paid_2, "int"),
  xc("% lần 2", (p) => p.pct_2 ?? pct(p.paid_2, p.eligible), "percent"),
];

// Nút Xuất Excel trên thanh công cụ. mode: "is-icon" = thanh chật (Xoá lọc + Chọn nhiều) → điện thoại chỉ hiện
// icon; "is-icon-xs" = có Chọn nhiều → chỉ hiện icon khi màn < 360px; "" = luôn có nhãn. Giữ mode trên data-export
// để vẽ lại. running = đang dựng file (spinner); blocked = danh sách đang nạp lại / vừa xuất xong (chống chạm đúp).
function exportBtn(mode, running, blocked = false) {
  return `<button type="button" class="dp-tool-btn dp-xl-btn${mode ? ` ${mode}` : ""}" data-export="${mode}"
    aria-label="Xuất Excel" title="Xuất Excel"${running ? ` disabled aria-busy="true"` : blocked ? " disabled" : ""}>${
      running ? icon("spinner", "dp-spin") : icon("file-excel")
    }<span class="dp-xl-label">Xuất Excel</span></button>`;
}

// ── Thẻ danh sách ──

function staffRow(s) {
  const badges = [];
  if (s.resigned) badges.push(`<span class="dp-badge dp-badge-danger">Đã nghỉ</span>`);
  else if (!s.active) badges.push(`<span class="dp-badge dp-badge-muted">Tạm dừng</span>`);
  if (s.is_self) badges.push(`<span class="dp-badge dp-badge-primary">Bạn</span>`);
  const work = [`${formatNumber(s.points)} điểm`, `${formatNumber(s.participations)} lượt`];
  if (s.pending) work.push(`${formatNumber(s.pending)} chờ duyệt`);
  return `<div class="dp-list-item" data-go="/npp/staff/${encodeURIComponent(s.name)}">
    <div class="dp-avatar-sm${s.resigned ? " is-left" : ""}">${esc(initials(s.full_name || s.user))}</div>
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(s.full_name || s.user)}</div>
      <div class="dp-list-sub">${esc(s.phone || s.user || "")}</div>
      <div class="dp-list-sub">${esc(work.join(" · "))}${
        s.resigned && s.left_on ? ` · nghỉ từ ${esc(formatDate(s.left_on))}` : ""
      }</div>
    </div>
    ${badges.length ? `<div class="dp-npp-side">${badges.join("")}</div>` : ""}
    <span class="dp-list-chev">${icon("chevron-right")}</span>
  </div>`;
}

function pointRow(p, multi, on) {
  const thumb = p.store_photo
    ? `<img class="dp-list-thumb" src="${esc(p.store_photo)}" alt="" loading="lazy">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  return `<div class="dp-list-item dp-npp-item${on ? " is-selected" : ""}" data-row="${esc(p.name)}" tabindex="0" ${rowRole(
    multi,
    on
  )}>
    ${multi ? checkMark(on) : ""}
    ${thumb}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(p.point_name || p.name)}</div>
      <div class="dp-list-sub">${esc([p.phone, p.address_line].filter(Boolean).join(" · ") || "—")}</div>
      <div class="dp-npp-meta">${ownerChip(p)}<span>${formatNumber(p.participations)} lượt · ${formatNumber(
        p.approved
      )} duyệt</span>${p.is_active ? "" : `<span class="dp-badge dp-badge-muted">Ngừng HĐ</span>`}</div>
    </div>
  </div>`;
}

function partRow(r, multi, on) {
  const attrs = multi
    ? `data-row="${esc(r.name)}" tabindex="0" ${rowRole(true, on)}`
    : `data-go="/participations/${encodeURIComponent(r.name)}"`;
  // Lượt (chương trình còn hiệu lực) đang do người khác NV phụ trách điểm giữ → gán lại điểm sẽ sửa.
  const drift = r.program_active && r.point_owner && r.owner !== r.point_owner;
  return `<div class="dp-list-item dp-npp-item${on ? " is-selected" : ""}" ${attrs}>
    ${multi ? checkMark(on) : ""}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(r.point_name || r.display_point)}</div>
      <div class="dp-list-sub">${esc(r.program_name || r.promotion_program)}${
        r.program_active ? "" : " · đã kết thúc"
      }</div>
      <div class="dp-npp-meta">${ownerChip(r)}${
        drift
          ? `<span class="dp-npp-drift">${icon("triangle-exclamation")} Điểm: ${esc(r.point_staff_name || "—")}</span>`
          : ""
      }</div>
    </div>
    <div class="dp-npp-side">${statusBadge(r.workflow_state)}</div>
  </div>`;
}

// Chip Lần 1 / Lần 2 trên thẻ tiến độ: đã trả → ✓ + ngày, chưa → "Chưa trả".
function payChip(n, b) {
  return b
    ? `<span class="dp-pay-lchip is-paid">${icon("circle-check")} L${n} · ${esc(formatDate(b.payout_date))}</span>`
    : `<span class="dp-pay-lchip">L${n} · Chưa trả</span>`;
}

// r = progress().rows[]; owner = { owner_kind, staff_name, staff_left } cho ownerChip; showProgram khi
// đang xem mọi chương trình. Bấm thẻ → chi tiết lượt (ghi / sửa trả thưởng ở đó).
function payRow(r, owner, showProgram) {
  const sub = [showProgram ? r.program_name || r.promotion_program : "", r.point_phone].filter(Boolean).join(" · ");
  return `<div class="dp-list-item dp-npp-item dp-pay-item" data-go="/participations/${encodeURIComponent(
    r.participation
  )}">
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(r.point_name || r.display_point)}</div>
      <div class="dp-list-sub">${esc(sub || "—")}</div>
      <div class="dp-npp-meta">${ownerChip(owner)}</div>
    </div>
    <div class="dp-npp-side dp-pay-side">${payChip(1, r.round_1)}${payChip(2, r.round_2)}</div>
  </div>`;
}

export async function render({ container, query }) {
  if (!isNppOwner()) {
    container.innerHTML = emptyState("Chỉ tài khoản nhà phân phối mới dùng được chức năng này.", "🔒");
    return;
  }

  const S = {
    tab: isTab(query.t) ? query.t : "staff",
    f: Object.fromEntries(TABS.map((x) => [x.key, blank(x.key)])),
    data: null,
    parts: new Map(), // chương trình ("" = mọi chương trình) → lượt
    pay: new Map(), // chương trình ("" = mọi chương trình) → tiến độ trả thưởng
    multi: readMulti(),
    sel: new Set(), // tên điểm (tab Điểm bán) hoặc tên lượt (tab Chương trình)
    visible: [], // tập đang lọc → "Chọn tất cả"
  };
  FILTERS[S.tab].forEach((k) => {
    if (query[k]) S.f[S.tab][k] = query[k];
  });
  let pointsByName = new Map();
  let staffByUser = new Map();
  let ownerByUser = new Map(); // user → dòng điểm (owner_kind server đã phân loại) — chip Phụ trách tab Trả thưởng
  const partsByName = new Map();

  async function loadData() {
    S.data = await call("salep.api.npp_manage.npp_overview");
    pointsByName = new Map((S.data.points || []).map((p) => [p.name, p]));
    staffByUser = new Map((S.data.staff || []).filter((s) => s.user).map((s) => [s.user, s]));
    ownerByUser = new Map((S.data.points || []).filter((p) => p.owner).map((p) => [p.owner, p]));
    if (S.tab === "programs") await ensureParts();
    if (S.tab === "payouts") await ensurePay();
  }

  // Lượt của chương trình đang lọc; đã có bản "mọi chương trình" đủ (< giới hạn) → lọc tại chỗ.
  async function ensureParts() {
    const key = S.f.programs.program || "";
    if (!S.parts.has(key)) {
      const all = S.parts.get("");
      const rows =
        key && all && all.length < PARTS_LIMIT
          ? all.filter((r) => r.promotion_program === key)
          : await call("salep.api.npp_manage.npp_participations", key ? { program: key } : {});
      S.parts.set(key, rows || []);
      (rows || []).forEach((r) => partsByName.set(r.name, r));
    }
    return S.parts.get(key);
  }
  const currentParts = () => S.parts.get(S.f.programs.program || "") || [];

  // Tiến độ trả thưởng của chương trình đang lọc; đã có bản "mọi chương trình" đủ (< giới hạn)
  // → lọc tại chỗ, tổng lấy từ dòng chương trình (cùng số liệu server tính).
  async function ensurePay() {
    const key = S.f.payouts.program || "";
    if (!S.pay.has(key)) {
      const all = S.pay.get("");
      let res;
      if (key && all && (all.rows || []).length < PAY_LIMIT) {
        const prog = (all.programs || []).find((p) => p.program === key);
        res = {
          totals: prog ? { eligible: prog.eligible, paid_1: prog.paid_1, paid_2: prog.paid_2 } : EMPTY_PAY.totals,
          programs: all.programs || [],
          rows: (all.rows || []).filter((r) => r.promotion_program === key),
        };
      } else {
        res = await call("salep.api.payout.npp_payout_progress", key ? { program: key } : {});
      }
      S.pay.set(key, res || EMPTY_PAY);
    }
    return S.pay.get(key);
  }
  const currentPay = () => S.pay.get(S.f.payouts.program || "") || EMPTY_PAY;

  // Người phụ trách của 1 dòng trả thưởng → dạng ownerChip (chủ NPP / NV của NPP / khác).
  // Dòng tiến độ không có owner_kind → tài khoản NPP khác (kế toán…) nhận ra qua owner_kind của điểm
  // họ đang giữ (server phân loại như doc/08: tài khoản NPP luôn là "npp").
  function payOwner(r) {
    if (r.owner && r.owner === ctx.user) return { owner_kind: "npp", staff_name: r.staff_name || "Bạn" };
    const known = ownerByUser.get(r.owner);
    if (known && known.owner_kind === "npp") return { owner_kind: "npp", staff_name: r.staff_name || r.owner };
    const s = staffByUser.get(r.owner);
    return s
      ? { owner_kind: "staff", staff_name: r.staff_name || s.full_name, staff_left: s.resigned }
      : { owner_kind: "other", staff_name: r.staff_name || r.owner };
  }

  try {
    await loadData();
  } catch (e) {
    container.innerHTML = emptyState("Không tải được dữ liệu quản lý NPP", "⚠️", e.message);
    return;
  }

  container.innerHTML = `
    <div class="dp-npp">
      <div data-head></div>
      <div class="dp-pill-nav dp-npp-tabs dp-npp-tabs-4" role="tablist" data-tabs></div>
      <div data-filters></div>
      <div class="dp-npp-toolbar" data-toolbar></div>
      <div data-list></div>
    </div>`;
  const root = container.firstElementChild;
  const el = (k) => root.querySelector(`[data-${k}]`);

  const bar = bulkBar(container, {
    actions: POINT_ACTIONS,
    onAction: runBulk,
    onSelectAll: (on) => {
      S.visible.forEach((r) => (on ? S.sel.add(r.name) : S.sel.delete(r.name)));
      root.querySelectorAll("[data-row]").forEach((row) => paintRow(row, S.sel.has(row.dataset.row)));
      updateBar();
    },
    onCancel: () => setMulti(false),
  });

  // ── Lọc ──

  function rowsFor(tab) {
    const f = S.f[tab];
    if (tab === "staff") {
      return (S.data.staff || []).filter(
        (s) =>
          (f.st === "all" || (f.st === "left" ? s.resigned : !s.resigned)) &&
          matchesAll([s.full_name, s.phone, s.user], f.q)
      );
    }
    if (tab === "points") {
      return (S.data.points || []).filter(
        (p) =>
          (!f.owner || ownerKey(p) === f.owner) &&
          (!f.st || (f.st === "active") === !!p.is_active) &&
          (!f.joined || (f.joined === "yes") === !!p.participated) &&
          matchesAll([p.point_name, p.phone, p.address_line, p.staff_name, p.name], f.q)
      );
    }
    if (tab === "payouts") {
      return (currentPay().rows || []).filter(
        (r) =>
          (!f.st || r.status === f.st) &&
          (!f.owner || r.owner === f.owner) &&
          matchesAll([r.point_name, r.point_phone, r.program_name, r.staff_name, r.display_point], f.q)
      );
    }
    return currentParts().filter(
      (r) =>
        (!f.owner || ownerKey(r) === f.owner) &&
        (!f.state || (r.workflow_state || "") === f.state) &&
        (!f.point || r.display_point === f.point) &&
        matchesAll([r.point_name, r.point_phone, r.program_name, r.staff_name, r.display_point], f.q)
    );
  }

  // Phụ trách: NPP giữ / từng NV (NV đã nghỉ chỉ hiện khi còn giữ dữ liệu) / Khác — kèm số lượng.
  function ownerOptions(rows, sel) {
    const count = new Map();
    rows.forEach((r) => count.set(ownerKey(r), (count.get(ownerKey(r)) || 0) + 1));
    const n = (k) => formatNumber(count.get(k) || 0);
    let out = option("", "Phụ trách: tất cả", sel) + option(TARGET_NPP, `NPP giữ (chưa giao) (${n(TARGET_NPP)})`, sel);
    (S.data.staff || []).forEach((s) => {
      if (s.resigned && !count.get(s.name) && sel !== s.name) return;
      out += option(s.name, `${s.full_name || s.user}${s.resigned ? " (đã nghỉ)" : ""} (${n(s.name)})`, sel);
    });
    if (count.get(OTHER) || sel === OTHER) out += option(OTHER, `Khác (${n(OTHER)})`, sel);
    return out;
  }

  function programOptions(sel) {
    return (
      option("", "Chương trình: tất cả", sel) +
      (S.data.programs || [])
        .map((p) =>
          option(
            p.program,
            `${p.program_name}${p.is_active ? "" : " (đã kết thúc)"} · ${formatNumber(p.participations)} lượt`,
            sel
          )
        )
        .join("")
    );
  }

  function stateOptions(rows, sel) {
    const count = {};
    rows.forEach((r) => (count[r.workflow_state || ""] = (count[r.workflow_state || ""] || 0) + 1));
    return (
      option("", "Mọi trạng thái", sel) +
      Object.keys(STATES)
        .map((s) => option(s, `${s} (${formatNumber(count[s] || 0)})`, sel))
        .join("")
    );
  }

  function programSummary(name) {
    const p = (S.data.programs || []).find((x) => x.program === name);
    if (!p) return "";
    const pct = Math.min(100, Number(p.coverage_pct) || 0);
    return `<div class="dp-prog-card dp-npp-prog" data-go="/programs/${encodeURIComponent(p.program)}">
      <div class="dp-prog-top">
        <h3 class="dp-prog-title">${esc(p.program_name)}</h3>
        <span class="dp-badge ${p.is_active ? "dp-badge-primary" : "dp-badge-muted"}">${esc(p.status || "")}</span>
      </div>
      <div class="dp-prog-meta"><span>${icon("calendar")} ${esc(formatDate(p.start_date))} – ${esc(
        formatDate(p.end_date)
      )}</span></div>
      <div class="dp-progress-row"><span>${formatNumber(p.participations)} lượt · ${formatNumber(
        p.approved
      )} duyệt · ${formatNumber(p.pending)} chờ</span><b>Phủ ${esc(p.coverage_pct)}%</b></div>
      <div class="dp-progress-track"><div class="dp-progress-bar" style="width:${pct}%"></div></div>
    </div>`;
  }

  // ── Tab Trả thưởng ──

  function payProgramOptions(sel) {
    const progs = currentPay().programs || [];
    let out = option("", "Chương trình: tất cả", sel);
    progs.forEach((p) => {
      const st =
        p.status && p.status !== PROGRAM_RUNNING ? ` (${p.status === "Kết thúc" ? "đã kết thúc" : p.status})` : "";
      out += option(p.program, `${p.program_name || p.program}${st} · ${formatNumber(p.eligible)} lượt`, sel);
    });
    if (sel && !progs.some((p) => p.program === sel)) out += option(sel, sel, sel); // giữ lựa chọn từ URL
    return out;
  }

  function payStatusOptions(rows, sel) {
    const count = {};
    rows.forEach((r) => (count[r.status] = (count[r.status] || 0) + 1));
    return (
      option("", `Tất cả (${formatNumber(rows.length)})`, sel) +
      PAY_STATUS.map((x) => option(x.value, `${x.label} (${formatNumber(count[x.value] || 0)})`, sel)).join("")
    );
  }

  // Phụ trách = owner của lượt (NV thực hiện), kèm số lượt; sắp theo tên.
  function payOwnerOptions(rows, sel) {
    const owners = new Map();
    rows.forEach((r) => {
      const o = owners.get(r.owner) || { label: r.staff_name || r.owner || "—", n: 0 };
      o.n += 1;
      owners.set(r.owner, o);
    });
    let out = option("", "Phụ trách: tất cả", sel);
    [...owners.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label, "vi"))
      .forEach(([user, o]) => {
        out += option(user, `${o.label}${user === ctx.user ? " (bạn)" : ""} (${formatNumber(o.n)})`, sel);
      });
    if (sel && !owners.has(sel)) out += option(sel, `${sel} (0)`, sel);
    return out;
  }

  // Thẻ tiến độ: Lần 1 x/N, Lần 2 y/N + thanh % (N = số lượt đã duyệt trong lọc chương trình).
  function payProgress() {
    const d = currentPay();
    const t = d.totals || {};
    const total = Number(t.eligible) || 0;
    const sel = S.f.payouts.program;
    const prog = sel ? (d.programs || []).find((p) => p.program === sel) : null;
    const stat = (n, paid) => {
      const pct = total ? Math.round((paid / total) * 1000) / 10 : 0;
      return `<div class="dp-pay-stat">
        <div class="dp-pay-stat-top"><span class="dp-pay-stat-label">Lần ${n}</span><b>${esc(
          pct.toLocaleString("vi-VN")
        )}%</b></div>
        <div class="dp-pay-stat-val"><b>${formatNumber(paid)}</b>/${formatNumber(total)}</div>
        <div class="dp-progress-track"><div class="dp-progress-bar" style="width:${Math.min(100, pct)}%"></div></div>
      </div>`;
    };
    const reward = prog ? Number(prog.reward_per_point) || 0 : 0;
    const sub = prog
      ? [
          prog.start_date ? `${formatDate(prog.start_date)} – ${formatDate(prog.end_date)}` : "",
          reward ? `${formatVND(reward)}/điểm` : "",
        ].filter(Boolean)
      : [];
    return `<div class="dp-pay-progress">
      <div class="dp-pay-progress-head">
        <span class="dp-pay-progress-title">${icon("coins")} ${esc(prog ? prog.program_name || prog.program : "Mọi chương trình")}</span>
        <span class="dp-pay-progress-n">${formatNumber(total)} lượt đã duyệt</span>
      </div>
      ${sub.length ? `<div class="dp-pay-progress-sub">${icon("calendar")} ${esc(sub.join(" · "))}</div>` : ""}
      <div class="dp-pay-stats">${stat(1, Number(t.paid_1) || 0)}${stat(2, Number(t.paid_2) || 0)}</div>
    </div>`;
  }

  // ── Xuất Excel (doc/10): TOÀN BỘ dòng khớp lọc của tab (rowsFor — không chỉ phần "Xem thêm" đã vẽ) ──

  const scopeLabel = () => S.data.customer_name || ctx.nppCustomer || "";

  // Thưởng/điểm lấy thẳng overview().programs[i].reward_per_point (doc/10 §4, rỗng → 0) — không cần mở tab
  // Trả thưởng. Chỉ backend cũ chưa có key mới rơi về đây: tiến độ trả thưởng đã nạp (nếu có), không có → ô trống.
  function rewardOf(program) {
    for (const d of S.pay.values()) {
      const p = (d.programs || []).find((x) => x.program === program);
      if (p) return p.reward_per_point;
    }
    return null;
  }

  function exportSheets(tab) {
    const rows = rowsFor(tab);
    if (tab === "staff") return { rows, sheets: [{ name: "Nhân viên", columns: XL_STAFF, rows }] };
    if (tab === "points") return { rows, sheets: [{ name: "Điểm bán", columns: XL_POINTS, rows }] };
    if (tab === "programs") {
      const sel = S.f.programs.program;
      const progs = (S.data.programs || []).filter((p) => !sel || p.program === sel);
      const progCols = [
        xc("Chương trình", (p) => p.program_name || p.program),
        xc("Trạng thái", (p) => p.status),
        xc("Bắt đầu", (p) => p.start_date, "date"),
        xc("Kết thúc", (p) => p.end_date, "date"),
        xc("Thưởng/điểm", (p) => p.reward_per_point ?? rewardOf(p.program), "int"),
        xc("Lượt tham gia", (p) => p.participations, "int"),
        xc("Đã duyệt", (p) => p.approved, "int"),
        xc("Điểm đã duyệt", (p) => p.approved_points, "int"),
        xc("Độ phủ %", (p) => p.coverage_pct, "percent"),
      ];
      return {
        rows,
        sheets: [
          { name: "Tham gia trưng bày", columns: XL_PARTS, rows },
          { name: "Chương trình", columns: progCols, rows: progs },
        ],
      };
    }
    const d = currentPay();
    const sel = S.f.payouts.program;
    const reward = (r) =>
      r.reward_per_point ?? ((d.programs || []).find((p) => p.program === r.promotion_program) || {}).reward_per_point;
    const round = (r, n, key) => (r[`round_${n}`] ? r[`round_${n}`][key] : null);
    const detail = [
      XL_STT,
      xc("Chương trình", (r) => r.program_name || r.promotion_program),
      xc("Mã lượt", (r) => r.participation),
      xc("Mã điểm", (r) => r.display_point),
      xc("Điểm bán", (r) => r.point_name || r.display_point),
      xc("SĐT", (r) => r.point_phone),
      xc("NV phụ trách", (r) => ownerLabel(payOwner(r))),
      xc("Lần 1 – ngày", (r) => round(r, 1, "payout_date"), "date"),
      xc("Lần 1 – số ảnh", (r) => round(r, 1, "photos"), "int"),
      xc("Lần 2 – ngày", (r) => round(r, 2, "payout_date"), "date"),
      xc("Lần 2 – số ảnh", (r) => round(r, 2, "photos"), "int"),
      xc("Trạng thái", (r) => PAY_LABEL[r.status] || r.status),
      xc("Thưởng/điểm", reward, "int"),
      xc("Chủ TK nhận thưởng", (r) => r.point_bank_account_name),
      xc("Số TK", (r) => r.point_bank_account_no),
      xc("Ngân hàng", (r) => r.point_bank_name),
    ];
    return {
      rows,
      sheets: [
        { name: "Chi tiết", columns: detail, rows },
        { name: "Tổng hợp", columns: XL_PAY_SUM, rows: (d.programs || []).filter((p) => !sel || p.program === sel) },
      ],
    };
  }

  // Chống bấm 2 lần: cờ + nút disabled (thanh công cụ có thể vẽ lại giữa chừng → vẽ theo cờ).
  let exporting = false;
  // Số lần nạp lại đang chạy (đổi chương trình, sau thao tác ghi): dữ liệu tab chưa về → khoá nút xuất,
  // tránh báo nhầm "Không có dòng nào để xuất" / xuất danh sách cũ.
  let loadingList = 0;
  let cooling = false; // vừa xuất xong — nhịp khoá chống chạm đúp
  const xlBlocked = () => loadingList > 0 || cooling;
  function paintExport() {
    root.querySelectorAll("[data-export]").forEach((b) => {
      b.outerHTML = exportBtn(b.dataset.export || "", exporting, xlBlocked());
    });
  }
  async function whileLoading(task) {
    loadingList += 1;
    paintExport();
    try {
      return await task();
    } finally {
      loadingList -= 1;
      if (!loadingList) paintExport(); // lỗi nạp → danh sách cũ vẫn hiện, mở lại nút
    }
  }

  async function runExport() {
    if (exporting || xlBlocked()) return;
    const tab = S.tab;
    const { rows, sheets } = exportSheets(tab);
    if (!rows.length) {
      toast("Không có dòng nào để xuất", "warning");
      return;
    }
    exporting = true;
    paintExport();
    try {
      await downloadXlsx(fileStamp(scopeLabel(), XL_BASE[tab]), sheets);
      toastSuccess(`Đã xuất ${formatNumber(rows.length)} dòng`);
    } catch (err) {
      toastError(`Không xuất được file Excel${err && err.message ? `: ${err.message}` : ""}`);
    } finally {
      exporting = false;
      cooling = true;
      paintExport();
      setTimeout(() => {
        cooling = false;
        paintExport();
      }, XL_COOLDOWN);
    }
  }

  // ── Vẽ ──

  function drawHead() {
    const t = S.data.totals || {};
    el("head").innerHTML = `
      <div class="dp-view-banner">
        <div>
          <div class="dp-view-banner-subtitle">Quản lý nhà phân phối</div>
          <div class="dp-view-banner-title">${esc(S.data.customer_name || ctx.nppCustomer || "")}</div>
          <div class="dp-view-banner-subtitle">${formatNumber(t.points)} điểm · ${formatNumber(
            t.participations
          )} lượt · ${formatNumber(t.pending)} chờ duyệt</div>
        </div>
        <div class="dp-view-banner-badge">${formatNumber(t.staff_working)} NV đang làm</div>
      </div>
      ${
        t.unassigned_points
          ? `<a class="dp-alert-link dp-npp-callout" data-unassigned role="button" tabindex="0">${icon(
              "triangle-exclamation"
            )} <span><b>${formatNumber(t.unassigned_points)} điểm NPP đang giữ</b> — chia cho nhân viên</span> ${icon(
              "chevron-right",
              "dp-chev"
            )}</a>`
          : ""
      }`;
  }

  function drawTabs() {
    const t = S.data.totals || {};
    const count = { staff: t.staff, points: t.points, programs: t.programs, payouts: t.approved };
    el("tabs").innerHTML = TABS.map(
      (x) =>
        `<button type="button" class="dp-pill${x.key === S.tab ? " dp-active" : ""}" role="tab" aria-selected="${
          x.key === S.tab
        }" data-tab-key="${x.key}">${esc(x.label)} <span class="dp-pill-count">${formatNumber(
          count[x.key] || 0
        )}</span></button>`
    ).join("");
  }

  function drawFilters() {
    const f = S.f[S.tab];
    if (S.tab === "staff") {
      const staff = S.data.staff || [];
      const left = staff.filter((s) => s.resigned).length;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm tên, SĐT nhân viên")}
        <div class="dp-filter-row">${selectBox(
          "st",
          "Trạng thái",
          option("", `Đang làm (${formatNumber(staff.length - left)})`, f.st) +
            option("left", `Đã nghỉ (${formatNumber(left)})`, f.st) +
            option("all", `Tất cả (${formatNumber(staff.length)})`, f.st),
          true
        )}</div>`;
    } else if (S.tab === "points") {
      const pts = S.data.points || [];
      const active = pts.filter((p) => p.is_active).length;
      const joined = pts.filter((p) => p.participated).length;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm tên điểm, SĐT, địa chỉ, NV")}
        <div class="dp-filter-row">
          ${selectBox("owner", "Phụ trách", ownerOptions(pts, f.owner), true)}
          ${selectBox(
            "st",
            "Trạng thái",
            option("", "Mọi trạng thái", f.st) +
              option("active", `Đang hoạt động (${formatNumber(active)})`, f.st) +
              option("inactive", `Ngừng HĐ (${formatNumber(pts.length - active)})`, f.st)
          )}
          ${selectBox(
            "joined",
            "Tham gia",
            option("", "Tham gia: tất cả", f.joined) +
              option("yes", `Đã tham gia (${formatNumber(joined)})`, f.joined) +
              option("no", `Chưa tham gia (${formatNumber(pts.length - joined)})`, f.joined)
          )}
        </div>`;
    } else if (S.tab === "payouts") {
      const rows = currentPay().rows || [];
      el("filters").innerHTML = `
        <div class="dp-filter-row dp-filter-one">${selectBox("program", "Chương trình", payProgramOptions(f.program), true)}</div>
        ${payProgress()}
        ${searchBox(f.q, "Tìm điểm, SĐT, nhân viên")}
        <div class="dp-filter-row dp-filter-two">
          ${selectBox("st", "Trạng thái trả thưởng", payStatusOptions(rows, f.st))}
          ${selectBox("owner", "Phụ trách", payOwnerOptions(rows, f.owner))}
        </div>
        ${
          rows.length >= PAY_LIMIT
            ? `<div class="dp-field-hint dp-npp-hint">${icon(
                "circle-info"
              )} Đang hiện ${formatNumber(PAY_LIMIT)} lượt đầu — chọn chương trình để xem đủ.</div>`
            : ""
        }`;
    } else {
      const rows = currentParts();
      const pt = f.point ? pointsByName.get(f.point) : null;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm điểm, SĐT, nhân viên")}
        <div class="dp-filter-row">
          ${selectBox("program", "Chương trình", programOptions(f.program), true)}
          ${selectBox("owner", "Phụ trách", ownerOptions(rows, f.owner))}
          ${selectBox("state", "Trạng thái", stateOptions(rows, f.state))}
        </div>
        ${
          f.point
            ? `<button type="button" class="dp-filter-chip" data-clear-point aria-label="Bỏ lọc điểm bán">${icon(
                "store"
              )} Điểm: ${esc((pt && pt.point_name) || f.point)} ${icon("xmark")}</button>`
            : ""
        }
        ${
          rows.length >= PARTS_LIMIT
            ? `<div class="dp-field-hint dp-npp-hint">${icon(
                "circle-info"
              )} Đang hiện ${formatNumber(PARTS_LIMIT)} lượt mới nhất — chọn chương trình để xem đủ.</div>`
            : ""
        }
        ${f.program ? programSummary(f.program) : ""}`;
    }
  }

  function drawToolbar(n) {
    const filtered = FILTERS[S.tab].some((k) => S.f[S.tab][k]);
    const crowded = filtered && !noMulti(S.tab); // Xoá lọc + Chọn nhiều + Xuất Excel
    el("toolbar").classList.toggle("is-crowded", crowded);
    el("toolbar").innerHTML = `
      <span class="dp-npp-count">${formatNumber(n)} ${UNITS[S.tab]}</span>
      ${
        filtered
          ? `<button type="button" class="dp-tool-btn" data-clear>${icon("filter-circle-xmark")} Xoá lọc</button>`
          : ""
      }
      ${
        noMulti(S.tab)
          ? ""
          : `<button type="button" class="dp-tool-btn${S.multi ? " dp-active" : ""}" data-multi aria-pressed="${
              S.multi
            }">${icon("list-check")} Chọn nhiều</button>`
      }
      ${exportBtn(crowded ? "is-icon" : noMulti(S.tab) ? "" : "is-icon-xs", exporting, xlBlocked())}`;
  }

  function emptyFor(tab) {
    if (tab === "staff") {
      return (S.data.staff || []).length
        ? emptyState("Không có nhân viên phù hợp", "🔍", "Thử đổi bộ lọc hoặc từ khoá")
        : emptyState("Chưa có nhân viên", "👥", "Thêm nhân viên ở portal NPP › Khuyến mại");
    }
    if (tab === "points") {
      return (S.data.points || []).length
        ? emptyState("Không có điểm bán phù hợp", "🔍", "Thử đổi bộ lọc hoặc bấm Xoá lọc")
        : emptyState("NPP chưa có điểm bán", "🏪", "Nhân viên tạo điểm trưng bày trên ứng dụng này");
    }
    if (tab === "payouts") {
      return (currentPay().rows || []).length
        ? emptyState("Không có lượt phù hợp", "🔍", "Thử đổi bộ lọc hoặc bấm Xoá lọc")
        : emptyState("Chưa có lượt đã duyệt", "💰", "Lượt tham gia được duyệt sẽ hiện ở đây để theo dõi trả thưởng");
    }
    return currentParts().length
      ? emptyState("Không có lượt tham gia phù hợp", "🔍", "Thử đổi chương trình hoặc bộ lọc")
      : emptyState("Chưa có lượt tham gia", "📦", "Nhân viên đăng ký điểm tham gia chương trình");
  }

  function drawList() {
    const rows = rowsFor(S.tab);
    S.visible = noMulti(S.tab) ? [] : rows;
    drawToolbar(rows.length);
    let renderRow = staffRow;
    if (S.tab === "points") renderRow = (p) => pointRow(p, S.multi, S.sel.has(p.name));
    else if (S.tab === "programs") renderRow = (r) => partRow(r, S.multi, S.sel.has(r.name));
    else if (S.tab === "payouts") renderRow = (r) => payRow(r, payOwner(r), !S.f.payouts.program);
    el("list").innerHTML = rows.length
      ? moreList({ rows, render: (slice) => slice.map(renderRow).join("") })
      : emptyFor(S.tab);
    updateBar();
  }

  function drawAll() {
    drawHead();
    drawTabs();
    drawFilters();
    drawList();
  }

  function updateBar() {
    const on = S.multi && !noMulti(S.tab);
    root.classList.toggle("dp-bulk-pad", on);
    if (!on) {
      bar.hide();
      return;
    }
    bar.update({
      count: S.sel.size,
      total: S.visible.length,
      allOn: S.visible.length > 0 && S.visible.every((r) => S.sel.has(r.name)),
      actions: S.tab === "points" ? POINT_ACTIONS : PART_ACTIONS,
    });
  }

  function paintRow(row, on) {
    row.classList.toggle("is-selected", on);
    row.setAttribute("aria-checked", on ? "true" : "false");
    const mark = row.querySelector(".dp-check");
    if (mark) mark.classList.toggle("is-on", on);
  }

  // ── Trạng thái màn (URL giữ tab + lọc; replaceState không bắn hashchange → không render lại) ──

  function syncUrl() {
    const qs = new URLSearchParams({ t: S.tab });
    FILTERS[S.tab].forEach((k) => {
      if (S.f[S.tab][k]) qs.set(k, S.f[S.tab][k]);
    });
    history.replaceState(history.state, "", `#/npp?${qs.toString()}`);
  }

  function scrollToTabs() {
    const top = el("tabs").getBoundingClientRect().top + window.scrollY - 64;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  // Chuyển tab (kèm bộ lọc mới nếu có); tab Chương trình / Trả thưởng nạp dữ liệu khi cần.
  async function goTab(key, filters) {
    if (!isTab(key)) return;
    if (filters) S.f[key] = { ...blank(key), ...filters };
    if (key !== S.tab) S.sel.clear();
    S.tab = key;
    syncUrl();
    drawTabs();
    const needLoad =
      (key === "programs" && !S.parts.has(S.f.programs.program || "")) ||
      (key === "payouts" && !S.pay.has(S.f.payouts.program || ""));
    if (needLoad) {
      el("filters").innerHTML = "";
      el("toolbar").innerHTML = "";
      el("list").innerHTML = skeleton(72, 4);
      bar.hide();
      try {
        await (key === "programs" ? ensureParts() : ensurePay());
      } catch (err) {
        toastError(err.message);
      }
      if (S.tab !== key) return; // đã đổi tab tiếp trong lúc chờ
    }
    drawFilters();
    drawList();
  }

  function setMulti(on) {
    S.multi = on;
    S.sel.clear();
    saveMulti(on);
    drawList();
  }

  function activateRow(row) {
    const key = row.dataset.row;
    if (S.multi) {
      if (S.sel.has(key)) S.sel.delete(key);
      else S.sel.add(key);
      paintRow(row, S.sel.has(key));
      updateBar();
      return;
    }
    const p = S.tab === "points" ? pointsByName.get(key) : null;
    if (p) {
      openPointSheet({
        point: p,
        staff: S.data.staff,
        onDone: afterMutation,
        onParticipations: (pt) => goTab("programs", { point: pt.name }).then(scrollToTabs),
      });
    }
  }

  // Sau mỗi thao tác ghi: nạp lại dữ liệu, GIỮ tab + bộ lọc, bỏ chọn.
  // Nạp lại lỗi → danh sách cũ vẫn hiện (không drawAll) → trả lại bản cũ cho các khoá chưa nạp được,
  // để "Xuất Excel" (mở lại sau whileLoading) xuất đúng danh sách đang thấy, không báo "Không có dòng nào".
  async function afterMutation() {
    S.sel.clear();
    const old = { parts: new Map(S.parts), pay: new Map(S.pay), byName: new Map(partsByName) };
    S.parts.clear();
    S.pay.clear();
    partsByName.clear();
    try {
      await whileLoading(loadData);
    } catch (err) {
      const refill = (m, snap) =>
        snap.forEach((v, k) => {
          if (!m.has(k)) m.set(k, v); // khoá đã nạp mới trong lúc chờ (đổi chương trình) → giữ bản mới
        });
      refill(S.parts, old.parts);
      refill(S.pay, old.pay);
      refill(partsByName, old.byName);
      toastError(err.message);
      return;
    }
    drawAll();
  }

  function runBulk(act, btn) {
    const names = [...S.sel];
    if (S.tab === "programs") {
      // Gán theo ĐIỂM của các lượt đã chọn — gộp điểm trùng.
      const pts = new Map();
      names.forEach((n) => {
        const r = partsByName.get(n);
        if (r && r.display_point && !pts.has(r.display_point)) {
          pts.set(r.display_point, { name: r.display_point, point_name: r.point_name, staff_name: r.point_staff_name });
        }
      });
      openAssignSheet({ points: [...pts.values()], staff: S.data.staff, onDone: afterMutation });
    } else if (act === "assign") {
      openAssignSheet({
        points: names.map((n) => pointsByName.get(n)).filter(Boolean),
        staff: S.data.staff,
        onDone: afterMutation,
      });
    } else if (act === "off") {
      confirmAction({
        title: "Ngừng hoạt động điểm bán",
        message: `Ngừng hoạt động ${formatNumber(names.length)} điểm bán đã chọn? Có thể kích hoạt lại bất cứ lúc nào.`,
        okLabel: "Ngừng hoạt động",
        okIcon: "circle-pause",
        danger: true,
        run: () => setPointsActive(names, false),
        onDone: afterMutation,
      });
    } else if (act === "on") {
      busy(btn, () => setPointsActive(names, true)).then((res) => res && afterMutation());
    }
  }

  // ── Sự kiện (delegation trên gốc view; thanh hàng loạt có listener riêng) ──

  root.addEventListener("click", (e) => {
    const t = e.target;
    const tabBtn = t.closest("[data-tab-key]");
    if (tabBtn) {
      if (tabBtn.dataset.tabKey !== S.tab) goTab(tabBtn.dataset.tabKey);
      return;
    }
    if (t.closest("[data-unassigned]")) {
      goTab("points", { owner: TARGET_NPP }).then(scrollToTabs);
      return;
    }
    if (t.closest("[data-clear]")) {
      goTab(S.tab, {});
      return;
    }
    if (t.closest("[data-multi]")) {
      setMulti(!S.multi);
      return;
    }
    if (t.closest("[data-export]")) {
      runExport();
      return;
    }
    if (t.closest("[data-clear-point]")) {
      S.f.programs.point = "";
      syncUrl();
      drawFilters();
      drawList();
      return;
    }
    const row = t.closest("[data-row]");
    if (row) activateRow(row);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest("[data-row], [data-unassigned]");
    if (!target || target !== e.target) return;
    e.preventDefault();
    target.click();
  });

  let searchTimer;
  root.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-f]");
    if (!input) return;
    S.f[S.tab][input.dataset.f] = input.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      syncUrl();
      drawList(); // chỉ vẽ lại danh sách → ô tìm giữ focus
    }, 200);
  });

  root.addEventListener("change", async (e) => {
    const select = e.target.closest("select[data-f]");
    if (!select) return;
    const key = select.dataset.f;
    S.f[S.tab][key] = select.value;
    syncUrl();
    if ((S.tab === "programs" || S.tab === "payouts") && key === "program") {
      const tab = S.tab;
      const program = select.value;
      el("list").innerHTML = skeleton(72, 4);
      try {
        await whileLoading(() => (tab === "programs" ? ensureParts() : ensurePay()));
      } catch (err) {
        toastError(err.message);
      }
      if (S.tab !== tab || S.f[tab].program !== program) return; // đã đổi tiếp
      drawFilters(); // số đếm Phụ trách / Trạng thái (+ thẻ tiến độ) theo chương trình mới
    }
    drawList();
  });

  drawAll();
}
