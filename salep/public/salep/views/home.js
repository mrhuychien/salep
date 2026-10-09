import { html, icon, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatNumber } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isNppOwner } from "../lib/store.js";
import { toastError } from "../components/toast.js";

function kpi(label, value, go, cls = "") {
  return `<a class="dp-kpi-card" data-go="${esc(go)}">
    <div class="dp-kpi-value ${cls}">${esc(value)}</div>
    <div class="dp-kpi-label">${esc(label)}</div>
  </a>`;
}

function progCard(p, mine) {
  const target = p.target_points || 0;
  const pct = target ? Math.min(100, Math.round((mine / target) * 100)) : 0;
  return `<div class="dp-prog-card" data-go="/programs/${encodeURIComponent(p.name)}">
    <div class="dp-prog-top">
      <h3 class="dp-prog-title">${esc(p.program_name)}</h3>
      <span class="dp-badge dp-badge-primary">${esc(p.status || "")}</span>
    </div>
    <div class="dp-prog-meta"><span>${icon("calendar")} ${esc(formatDate(p.start_date))} – ${esc(
    formatDate(p.end_date)
  )}</span></div>
    ${
      target
        ? `<div class="dp-progress-row"><span>Tiến độ của tôi</span><b>${esc(mine)}/${esc(target)} điểm</b></div>
           <div class="dp-progress-track"><div class="dp-progress-bar" style="width:${pct}%"></div></div>`
        : ""
    }
  </div>`;
}

// Thẻ "Quản lý NPP" cho chủ NPP (doc/08 §8). Số chưa tải được → "—" (không hiện 0 giả).
// Shell cũ (không có window.DP_APP.build) chưa biết route /npp → dùng link tải lại cả trang.
function nppCard(overview) {
  const t = overview && overview.totals;
  const val = (k) => (t ? formatNumber(t[k] || 0) : "—");
  const link = window.DP_APP?.build ? `data-go="/npp"` : `href="/dp?r=${Date.now()}#/npp"`;
  return `<a class="dp-npp-home" ${link}>
    <div class="dp-npp-home-head">
      <span>${icon("users-gear")} Quản lý NPP</span>
      ${icon("chevron-right", "dp-list-chev")}
    </div>
    <div class="dp-npp-home-stats">
      <div><b>${val("staff_working")}</b><span>NV đang làm</span></div>
      <div><b>${val("points")}</b><span>Điểm bán</span></div>
      <div><b class="${t && t.unassigned_points ? "is-warn" : ""}">${val("unassigned_points")}</b><span>Chưa giao NV</span></div>
      <div><b>${val("pending")}</b><span>Chờ duyệt</span></div>
    </div>
  </a>`;
}

export async function render({ container }) {
  let summary = { by_state: [], by_program: [], total_points: 0 };
  let programs = [];
  let toVisit = [];
  const nppOwner = isNppOwner();
  // Các API chạy song song; lỗi 1 cái không chặn cái khác.
  const [rSummary, rPrograms, rVisit, rNpp] = await Promise.allSettled([
    call("salep.api.dashboard.staff_summary"),
    call("salep.api.portal.list_programs", { running_only: 1 }),
    call("salep.api.portal.list_points_to_visit"),
    nppOwner ? call("salep.api.npp_manage.npp_overview") : Promise.resolve(null),
  ]);
  if (rSummary.status === "fulfilled") summary = rSummary.value;
  else toastError(rSummary.reason && rSummary.reason.message);
  if (rPrograms.status === "fulfilled") programs = rPrograms.value || [];
  if (rVisit.status === "fulfilled") toVisit = rVisit.value || [];
  const npp = rNpp.status === "fulfilled" ? rNpp.value : null;
  if (rNpp.status === "rejected") console.error(rNpp.reason);

  const pts = summary.points || {};
  const mine = {};
  (summary.by_program || []).forEach((p) => (mine[p.program] = p.approved || 0));
  const partLink = (state) =>
    state ? `/participations?state=${encodeURIComponent(state)}` : "/participations";

  container.innerHTML = html`
    <div class="dp-view-banner">
      <div>
        <div class="dp-view-banner-subtitle">Xin chào,</div>
        <div class="dp-view-banner-title">${esc(ctx.fullName)}</div>
      </div>
      <div class="dp-view-banner-badge">${esc(ctx.distributor || ctx.nppCustomer || "NVBH")}</div>
    </div>

    ${nppOwner ? nppCard(npp) : ""}

    <div class="dp-kpi-grid dp-kpi-grid--2">
      ${kpi("Điểm bán của tôi", pts.total || 0, "/points")}
      ${kpi("Tham gia chương trình", pts.participating || 0, partLink(""))}
      ${kpi("Chờ duyệt", pts.pending || 0, partLink("Chờ duyệt"), "warning")}
      ${kpi("Đã duyệt", pts.approved || 0, partLink("Đã duyệt"), "success")}
    </div>

    ${
      toVisit.length
        ? `<a class="dp-alert-link" data-go="/visits">${icon("triangle-exclamation")} <b>${
            toVisit.length
          } điểm cần ghé thăm</b> — chưa đủ ảnh báo cáo ${icon("chevron-right", "dp-chev")}</a>`
        : ""
    }

    <button class="dp-btn-primary" data-go="/points/new">${icon("plus")} Tạo điểm trưng bày</button>

    <div class="dp-section-head">
      <h2>Chương trình đang chạy</h2>
      <a class="dp-link" data-go="/programs">Xem tất cả</a>
    </div>
    <div class="dp-list">
      ${
        programs.length
          ? programs.map((p) => progCard(p, mine[p.name] || 0)).join("")
          : emptyState("Chưa có chương trình đang chạy", "📣")
      }
    </div>
  `;
}
