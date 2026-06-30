import { html, icon, emptyState } from "../lib/dom.js";
import { esc, formatDate } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { toastError } from "../components/toast.js";

function kpi(label, value, cls = "") {
  return `<div class="dp-kpi-card">
    <div class="dp-kpi-label">${esc(label)}</div>
    <div class="dp-kpi-value ${cls}">${esc(value)}</div>
  </div>`;
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

export async function render({ container }) {
  let summary = { by_state: [], by_program: [], total_points: 0 };
  let programs = [];
  let toVisit = [];
  // 3 API chạy song song; lỗi 1 cái không chặn cái khác.
  const [rSummary, rPrograms, rVisit] = await Promise.allSettled([
    call("salep.api.dashboard.staff_summary"),
    call("salep.api.portal.list_programs", { running_only: 1 }),
    call("salep.api.portal.list_points_to_visit"),
  ]);
  if (rSummary.status === "fulfilled") summary = rSummary.value;
  else toastError(rSummary.reason && rSummary.reason.message);
  if (rPrograms.status === "fulfilled") programs = rPrograms.value || [];
  if (rVisit.status === "fulfilled") toVisit = rVisit.value || [];

  const sc = (s) => (summary.by_state.find((x) => x.state === s) || {}).cnt || 0;
  const mine = {};
  (summary.by_program || []).forEach((p) => (mine[p.program] = p.approved || 0));

  container.innerHTML = html`
    <div class="dp-view-banner">
      <div>
        <div class="dp-view-banner-subtitle">Xin chào,</div>
        <div class="dp-view-banner-title">${esc(ctx.fullName)}</div>
      </div>
      <div class="dp-view-banner-badge">${esc(ctx.distributor || "NVBH")}</div>
    </div>

    <div class="dp-kpi-grid">
      ${kpi("Điểm của tôi", summary.total_points || 0)}
      ${kpi("Chờ duyệt", sc("Chờ duyệt"), "warning")}
      ${kpi("Đã duyệt", sc("Đã duyệt"), "success")}
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
