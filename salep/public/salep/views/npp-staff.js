// Lịch sử hoạt động 1 nhân viên của NPP (chủ NPP — doc/08 §8): #/npp/staff/:name?t=points|parts|transfers.
// Thẻ thông tin + KPI, Chuyển điểm bán (chọn nhiều → sheet Gán NV), Nghỉ việc (sheet bàn giao).
// Xuất Excel (doc/10): 1 file 3 sheet Điểm bán · Tham gia · Bàn giao (toàn bộ, không chỉ phần đã vẽ).
import { icon, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatDateTime, formatNumber, statusBadge } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isNppOwner } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { setHeaderTitle } from "../components/nav.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";
import { downloadXlsx, fileStamp } from "../components/xlsx.js";
import {
  TARGET_NPP,
  initials,
  checkMark,
  moreList,
  bulkBar,
  busy,
  openAssignSheet,
  openOffboardSheet,
  openPointSheet,
} from "../components/npp-ui.js";

const TABS = [
  { key: "points", label: "Điểm bán" },
  { key: "parts", label: "Tham gia" },
  { key: "transfers", label: "Bàn giao" },
];
const REASON_BADGE = { "Gán lại": "dp-badge-primary", "Nghỉ việc": "dp-badge-warning" };
const TRANSFER_ACTIONS = [{ act: "assign", label: "Chuyển điểm đã chọn", icon: "right-left" }];
const XL_COOLDOWN = 800; // ms khoá thêm sau khi xuất: file nhỏ dựng xong nhanh hơn 1 lần chạm đúp

// ── Xuất Excel (doc/10 §3): cột Điểm bán / Tham gia giống tab #/npp (views/npp-manage.js) ──
const xc = (header, value, type = "text", width) => ({ header, value, type, width });
const XL_STT = xc("STT", (_, i) => i + 1, "int", 6);
const geo = (v) => (Number(v) ? Number(v) : null); // 0 = chưa có toạ độ → ô trống
const ownerLabel = (r) => (r.staff_name ? `${r.staff_name}${r.staff_left ? " (đã nghỉ)" : ""}` : "");
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
const XL_TRANSFERS = [
  XL_STT,
  xc("Mã bàn giao", (x) => x.name),
  xc("Thời gian", (x) => x.creation, "datetime"),
  xc("Loại", (x) => (x.direction === "in" ? "Nhận điểm" : "Chuyển đi")),
  xc("Mã điểm", (x) => x.display_point),
  xc("Điểm bán", (x) => x.point_name || x.display_point),
  xc("Nhận từ / Chuyển cho", (x) => x.counterpart_label),
  xc("Lý do", (x) => x.reason || "Gán lại"),
  xc("Lượt chuyển kèm", (x) => x.participations_moved, "int"),
  xc("Ghi chú", (x) => x.note),
  xc("Thực hiện bởi", (x) => x.by_label),
];

// Nút Xuất Excel trên thanh công cụ; is-icon = thanh chật (có Chọn nhiều) → điện thoại chỉ hiện icon.
// running = đang dựng file (spinner); blocked = vừa xuất xong (nhịp chống chạm đúp).
function exportBtn(compact, running, blocked = false) {
  return `<button type="button" class="dp-tool-btn dp-xl-btn${compact ? " is-icon" : ""}" data-export
    aria-label="Xuất Excel" title="Xuất Excel"${running ? ` disabled aria-busy="true"` : blocked ? " disabled" : ""}>${
      running ? icon("spinner", "dp-spin") : icon("file-excel")
    }<span class="dp-xl-label">Xuất Excel</span></button>`;
}

function infoRow(ic, content) {
  return `<div class="dp-info-row">${icon(ic)}<div class="dp-info-main">${content}</div></div>`;
}

function headCard(st) {
  let status = `<span class="dp-badge dp-badge-success">Đang làm</span>`;
  if (st.resigned) status = `<span class="dp-badge dp-badge-danger">Đã nghỉ</span>`;
  else if (!st.active) status = `<span class="dp-badge dp-badge-warning">Tạm dừng</span>`;
  const self = st.is_self ? `<span class="dp-badge dp-badge-primary">Bạn</span>` : "";
  const phone = st.phone
    ? infoRow(
        "phone",
        `<a class="dp-tel" href="tel:${esc(String(st.phone).replace(/[^0-9+]/g, ""))}">${esc(st.phone)}</a>`
      )
    : "";
  const left = st.resigned
    ? infoRow(
        "door-open",
        `Nghỉ từ ${esc(formatDate(st.left_on) || "—")}${
          st.handover_label ? ` · bàn giao cho <b>${esc(st.handover_label)}</b>` : ""
        }`
      )
    : "";
  return `<div class="dp-card dp-staff-card">
    <div class="dp-staff-head">
      <div class="dp-avatar-sm dp-avatar-md${st.resigned ? " is-left" : ""}">${esc(initials(st.full_name || st.user))}</div>
      <div class="dp-list-body">
        <div class="dp-staff-name">${esc(st.full_name || st.user)}</div>
        <div class="dp-list-sub">${esc(st.user || "")}</div>
        <div class="dp-staff-badges">${status}${self}</div>
      </div>
    </div>
    ${phone}
    ${st.cccd ? infoRow("id-card", `CCCD ${esc(st.cccd)}`) : ""}
    ${st.creation ? infoRow("calendar-plus", `Tạo hồ sơ ${esc(formatDate(st.creation))}`) : ""}
    ${st.last_login ? infoRow("clock", `Đăng nhập gần nhất ${esc(formatDateTime(st.last_login))}`) : ""}
    ${left}
  </div>`;
}

function kpiTiles(s) {
  const tile = (label, value, sub, cls = "") => `<div class="dp-kpi-card">
    <div class="dp-kpi-value ${cls}">${formatNumber(value)}</div>
    <div class="dp-kpi-label">${esc(label)}</div>
    <div class="dp-kpi-sub">${esc(sub)}</div>
  </div>`;
  return `<div class="dp-kpi-grid">
    ${tile("Điểm bán", s.points, `${formatNumber(s.active_points)} đang HĐ`)}
    ${tile("Lượt tham gia", s.participations, `${formatNumber(s.active_participations)} còn hiệu lực`)}
    ${tile("Đã duyệt", s.approved, `${formatNumber(s.pending)} chờ duyệt`, "success")}
  </div>`;
}

function pointRow(p, multi, on) {
  return `<div class="dp-list-item dp-npp-item${on ? " is-selected" : ""}" data-row="${esc(p.name)}" tabindex="0" ${
    multi ? `role="checkbox" aria-checked="${on}"` : `role="button"`
  }>
    ${multi ? checkMark(on) : `<div class="dp-list-thumb">${icon("store")}</div>`}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(p.point_name || p.name)}</div>
      <div class="dp-list-sub">${esc([p.phone, p.address_line].filter(Boolean).join(" · ") || "—")}</div>
      <div class="dp-npp-meta"><span>${formatNumber(p.participations)} lượt · ${formatNumber(p.approved)} duyệt</span>${
        p.is_active ? "" : `<span class="dp-badge dp-badge-muted">Ngừng HĐ</span>`
      }</div>
    </div>
  </div>`;
}

function partRow(r) {
  return `<div class="dp-list-item" data-go="/participations/${encodeURIComponent(r.name)}">
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(r.point_name || r.display_point)}</div>
      <div class="dp-list-sub">${esc(r.program_name || r.promotion_program)}${
        r.program_active ? "" : " · đã kết thúc"
      }</div>
      <div class="dp-list-sub">Cập nhật ${esc(formatDate(r.modified))}</div>
    </div>
    <div class="dp-npp-side">${statusBadge(r.workflow_state)}</div>
  </div>`;
}

function transferRow(x) {
  const inbound = x.direction === "in";
  // formatDateTime = "hh:mm dd/mm" → lấy giờ, ghép ngày đủ năm (lịch sử có thể qua nhiều năm).
  const when = x.creation ? `${formatDate(x.creation)} ${formatDateTime(x.creation).slice(0, 5)}` : "";
  const meta = [when, x.by_label && `bởi ${x.by_label}`].filter(Boolean).join(" · ");
  return `<div class="dp-list-item dp-transfer">
    <span class="dp-transfer-dir ${inbound ? "is-in" : "is-out"}" aria-hidden="true">${icon(
      inbound ? "arrow-down" : "arrow-up"
    )}</span>
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(x.point_name || x.display_point)}</div>
      <div class="dp-list-sub dp-wrap">${inbound ? "Nhận từ" : "Chuyển cho"} <b>${esc(x.counterpart_label || "—")}</b>${
        x.participations_moved ? ` · kèm ${formatNumber(x.participations_moved)} lượt` : ""
      }</div>
      ${x.note ? `<div class="dp-list-sub dp-wrap dp-transfer-note">“${esc(x.note)}”</div>` : ""}
      <div class="dp-list-sub">${esc(meta)}</div>
    </div>
    <div class="dp-npp-side"><span class="dp-badge ${REASON_BADGE[x.reason] || "dp-badge-muted"}">${esc(
      x.reason || "Gán lại"
    )}</span></div>
  </div>`;
}

export async function render({ container, params, query }) {
  if (!isNppOwner()) {
    container.innerHTML = emptyState("Chỉ tài khoản nhà phân phối mới dùng được chức năng này.", "🔒");
    return;
  }
  const name = params.name;
  let data;
  try {
    data = await call("salep.api.npp_manage.npp_staff_history", { staff: name });
  } catch (e) {
    container.innerHTML = emptyState("Không tải được lịch sử nhân viên", "⚠️", e.message);
    return;
  }
  // Đã rời màn hình trong lúc tải (shell thay #dp-view mỗi lần điều hướng) → không đè tiêu đề màn mới.
  if (!container.isConnected) return;

  const st = data.staff || {};
  const stats = data.stats || {};
  const parts = data.participations || [];
  const transfers = data.transfers || [];
  // Điểm của NV + thông tin phụ trách → dùng chung sheet chi tiết điểm / Gán NV.
  const points = (data.points || []).map((p) => ({
    ...p,
    owner: st.user,
    owner_kind: "staff",
    staff: st.name,
    staff_name: st.full_name || st.user,
    staff_left: !!st.resigned,
  }));
  const pointsByName = new Map(points.map((p) => [p.name, p]));
  setHeaderTitle(st.full_name || "Nhân viên");

  const S = { tab: TABS.some((t) => t.key === query.t) ? query.t : "points", multi: false, sel: new Set() };
  const counts = { points: points.length, parts: parts.length, transfers: transfers.length };
  const canTransfer = points.length > 0;
  const canOffboard = !st.resigned && !st.is_self;

  // Tổng quan NPP chỉ nạp khi cần (1 lần): danh sách NV cho sheet Gán NV / Nghỉ việc; MST + tài khoản
  // nhận thưởng + ngày tạo của điểm và tên NPP cho file Excel.
  let overview = null;
  async function loadOverview() {
    if (!overview) overview = (await call("salep.api.npp_manage.npp_overview")) || {};
    return overview;
  }
  const loadStaff = async () => (await loadOverview()).staff || [];
  const reload = () => navigate(location.hash.slice(1) || "/");

  container.innerHTML = `
    <div class="dp-npp">
      ${headCard(st)}
      ${kpiTiles(stats)}
      ${
        st.resigned && points.length
          ? `<div class="dp-alert-link">${icon("triangle-exclamation")} <span><b>Còn ${formatNumber(
              points.length
            )} điểm chưa bàn giao</b> — chọn điểm rồi chuyển cho người khác</span></div>`
          : ""
      }
      ${
        canTransfer || canOffboard
          ? `<div class="dp-btn-row dp-npp-actions">
              ${
                canTransfer
                  ? `<button type="button" class="dp-btn-outline" data-act="transfer">${icon("right-left")} Chuyển điểm bán</button>`
                  : ""
              }
              ${
                canOffboard
                  ? `<button type="button" class="dp-btn-danger" data-act="offboard">${icon("door-open")} Nghỉ việc</button>`
                  : ""
              }
            </div>`
          : ""
      }
      <div class="dp-pill-nav dp-npp-tabs" role="tablist" data-tabs></div>
      <div class="dp-npp-toolbar" data-toolbar></div>
      <div data-list></div>
    </div>`;
  const root = container.firstElementChild;
  const el = (k) => root.querySelector(`[data-${k}]`);

  const bar = bulkBar(container, {
    actions: TRANSFER_ACTIONS,
    onAction: async (act, btn) => {
      const list = await busy(btn, loadStaff, "Đang tải...");
      if (!list) return;
      openAssignSheet({
        points: [...S.sel].map((n) => pointsByName.get(n)).filter(Boolean),
        staff: list,
        onDone: reload,
      });
    },
    onSelectAll: (on) => {
      points.forEach((p) => (on ? S.sel.add(p.name) : S.sel.delete(p.name)));
      root.querySelectorAll("[data-row]").forEach((row) => paintRow(row, S.sel.has(row.dataset.row)));
      updateBar();
    },
    onCancel: () => setMulti(false),
  });

  function syncUrl() {
    history.replaceState(history.state, "", `#/npp/staff/${encodeURIComponent(name)}?t=${S.tab}`);
  }

  function drawTabs() {
    el("tabs").innerHTML = TABS.map(
      (x) =>
        `<button type="button" class="dp-pill${x.key === S.tab ? " dp-active" : ""}" role="tab" aria-selected="${
          x.key === S.tab
        }" data-tab-key="${x.key}">${esc(x.label)} <span class="dp-pill-count">${formatNumber(
          counts[x.key]
        )}</span></button>`
    ).join("");
  }

  function drawToolbar() {
    let text = `${formatNumber(points.length)} điểm đang phụ trách`;
    if (S.tab === "parts") {
      text =
        stats.participations > parts.length
          ? `${formatNumber(parts.length)} lượt gần nhất / ${formatNumber(stats.participations)}`
          : `${formatNumber(parts.length)} lượt tham gia`;
    } else if (S.tab === "transfers") {
      text = `${formatNumber(transfers.length)} lần nhận / chuyển điểm`;
    }
    const multiBtn = S.tab === "points" && canTransfer;
    el("toolbar").innerHTML = `<span class="dp-npp-count">${text}</span>${
      multiBtn
        ? `<button type="button" class="dp-tool-btn${S.multi ? " dp-active" : ""}" data-multi aria-pressed="${
            S.multi
          }">${icon("list-check")} Chọn nhiều</button>`
        : ""
    }${exportBtn(multiBtn, exporting, cooling)}`;
  }

  // ── Xuất Excel: 1 file, 3 sheet (mọi dòng đã tải, không phụ thuộc tab / "Xem thêm") ──

  let exporting = false;
  let cooling = false; // vừa xuất xong — nhịp khoá chống chạm đúp
  function paintExport() {
    root.querySelectorAll("[data-export]").forEach((b) => {
      b.outerHTML = exportBtn(b.classList.contains("is-icon"), exporting, cooling);
    });
  }

  async function runExport() {
    if (exporting || cooling) return;
    const total = points.length + parts.length + transfers.length;
    if (!total) {
      toast("Không có dòng nào để xuất", "warning");
      return;
    }
    exporting = true;
    paintExport();
    try {
      // Lịch sử NV không có MST / tài khoản nhận thưởng / ngày tạo điểm → bổ sung từ tổng quan NPP
      // (cùng phạm vi server); không tải được thì vẫn xuất với dữ liệu đang có.
      // Sheet Tham gia lấy thẳng staff_history().participations (doc/10 §4): lý do từ chối, toạ độ CỦA LƯỢT,
      // SĐT điểm (None = điểm ngoài NPP / đã xoá → ô trống). Chỉ backend cũ chưa có point_phone mới tra SĐT
      // theo điểm đã tải.
      let ov = {};
      let enrichFailed = false; // báo cảnh báo thay vì "thành công" — cột MST / TK nhận thưởng sẽ trống
      try {
        ov = await loadOverview();
      } catch {
        ov = {};
        enrichFailed = true;
      }
      const byName = new Map((ov.points || []).map((p) => [p.name, p]));
      const phoneOf = (dp) => (pointsByName.get(dp) || byName.get(dp) || {}).phone;
      const pointRows = points.map((p) => ({ ...byName.get(p.name), ...p }));
      const partRows = parts.map((r) => ({
        ...r,
        point_phone: "point_phone" in r ? r.point_phone : phoneOf(r.display_point),
        staff_name: st.full_name || st.user,
        staff_left: !!st.resigned,
      }));
      await downloadXlsx(fileStamp(ov.customer_name || ctx.nppCustomer || "", "LichSuNhanVien"), [
        { name: "Điểm bán", columns: XL_POINTS, rows: pointRows },
        { name: "Tham gia", columns: XL_PARTS, rows: partRows },
        { name: "Bàn giao", columns: XL_TRANSFERS, rows: transfers },
      ]);
      if (enrichFailed && points.length) {
        toast(
          `Đã xuất ${formatNumber(total)} dòng — chưa tải được MST / tài khoản nhận thưởng, thử xuất lại`,
          "warning"
        );
      } else {
        toastSuccess(`Đã xuất ${formatNumber(total)} dòng`);
      }
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

  function drawList() {
    drawToolbar();
    let rows = points;
    let renderRow = (p) => pointRow(p, S.multi, S.sel.has(p.name));
    let empty = emptyState("Không còn phụ trách điểm bán nào", "🏪");
    if (S.tab === "parts") {
      rows = parts;
      renderRow = partRow;
      empty = emptyState("Chưa có lượt tham gia", "📦");
    } else if (S.tab === "transfers") {
      rows = transfers;
      renderRow = transferRow;
      empty = emptyState("Chưa có lịch sử bàn giao", "🔁", "Mỗi lần gán / chuyển điểm sẽ được ghi lại ở đây");
    }
    el("list").innerHTML = rows.length ? moreList({ rows, render: (slice) => slice.map(renderRow).join("") }) : empty;
    updateBar();
  }

  function updateBar() {
    const on = S.multi && S.tab === "points";
    root.classList.toggle("dp-bulk-pad", on);
    if (!on) {
      bar.hide();
      return;
    }
    bar.update({
      count: S.sel.size,
      total: points.length,
      allOn: points.length > 0 && points.every((p) => S.sel.has(p.name)),
    });
  }

  function paintRow(row, on) {
    row.classList.toggle("is-selected", on);
    row.setAttribute("aria-checked", on ? "true" : "false");
    const mark = row.querySelector(".dp-check");
    if (mark) mark.classList.toggle("is-on", on);
  }

  function setTab(key) {
    S.tab = key;
    syncUrl();
    drawTabs();
    drawList();
  }

  function setMulti(on) {
    S.multi = on;
    S.sel.clear();
    drawList();
  }

  function scrollToTabs() {
    const top = el("tabs").getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  async function offboard(btn) {
    const list = await busy(btn, loadStaff, "Đang tải...");
    if (!list) return;
    openOffboardSheet({
      staff: st,
      staffList: list,
      stats,
      onDone: (res, target) => {
        // Về NPP → sang danh sách điểm NPP đang giữ để chia lại (doc/08 §8). Lọc theo đích server
        // trả về: tài khoản nhận bàn giao có hồ sơ NV (chủ NPP kiêm NV) → lọc theo hồ sơ đó.
        if (target === TARGET_NPP && res && res.points) {
          const tgt = res.target || {};
          const owner = tgt.kind === "staff" && tgt.staff ? tgt.staff : TARGET_NPP;
          navigate(`/npp?t=points&owner=${encodeURIComponent(owner)}`);
        } else reload();
      },
    });
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    const tabBtn = t.closest("[data-tab-key]");
    if (tabBtn) {
      if (tabBtn.dataset.tabKey !== S.tab) setTab(tabBtn.dataset.tabKey);
      return;
    }
    const act = t.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "transfer") {
        S.tab = "points";
        syncUrl();
        drawTabs();
        setMulti(true);
        scrollToTabs();
      } else if (act.dataset.act === "offboard") {
        offboard(act);
      }
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
    const row = t.closest("[data-row]");
    if (!row) return;
    const key = row.dataset.row;
    if (S.multi) {
      if (S.sel.has(key)) S.sel.delete(key);
      else S.sel.add(key);
      paintRow(row, S.sel.has(key));
      updateBar();
    } else if (pointsByName.has(key)) {
      openPointSheet({
        point: pointsByName.get(key),
        staff: loadStaff,
        onDone: reload,
        onParticipations: (p) => navigate(`/npp?t=programs&point=${encodeURIComponent(p.name)}`),
      });
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("[data-row]");
    if (!row || row !== e.target) return;
    e.preventDefault();
    row.click();
  });

  drawTabs();
  drawList();
}
