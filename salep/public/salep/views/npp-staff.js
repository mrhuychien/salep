// Lịch sử hoạt động 1 nhân viên của NPP (chủ NPP — doc/08 §8): #/npp/staff/:name?t=points|parts|transfers.
// Thẻ thông tin + KPI, Chuyển điểm bán (chọn nhiều → sheet Gán NV), Nghỉ việc (sheet bàn giao).
import { icon, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatDateTime, formatNumber, statusBadge } from "../lib/format.js";
import { call } from "../lib/api.js";
import { isNppOwner } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { setHeaderTitle } from "../components/nav.js";
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

  // Danh sách NV (chọn người nhận) chỉ nạp khi mở sheet Gán NV / Nghỉ việc.
  let staffList = null;
  async function loadStaff() {
    if (!staffList) staffList = ((await call("salep.api.npp_manage.npp_overview")) || {}).staff || [];
    return staffList;
  }
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
    el("toolbar").innerHTML = `<span class="dp-npp-count">${text}</span>${
      S.tab === "points" && canTransfer
        ? `<button type="button" class="dp-tool-btn${S.multi ? " dp-active" : ""}" data-multi aria-pressed="${
            S.multi
          }">${icon("list-check")} Chọn nhiều</button>`
        : ""
    }`;
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
