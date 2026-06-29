import { html, icon, on, emptyState } from "../lib/dom.js";
import { esc, formatDate } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { toastError } from "../components/toast.js";

function statCard(label, value, cls) {
  return `<div class="dp-stat ${cls}">
    <span class="dp-stat__label">${esc(label)}</span>
    <span class="dp-stat__value">${esc(value)}</span>
  </div>`;
}

function programCard(p, mine) {
  const target = p.target_points || 0;
  const pct = target ? Math.min(100, Math.round((mine / target) * 100)) : 0;
  return `<div class="dp-card dp-card--program" data-go="/participations/new?program=${encodeURIComponent(p.name)}">
    <div class="dp-card__accent"></div>
    <h3 class="dp-card__title">${esc(p.program_name)}</h3>
    <div class="dp-card__meta">${icon("calendar_today", "dp-i14")} ${esc(formatDate(p.start_date))} – ${esc(
    formatDate(p.end_date)
  )}</div>
    ${
      target
        ? `<div class="dp-progress">
             <div class="dp-progress__row"><span>Tiến độ của tôi</span><span class="dp-progress__num">${esc(
               mine
             )}/${esc(target)} điểm</span></div>
             <div class="dp-progress__track"><div class="dp-progress__bar" style="width:${pct}%"></div></div>
           </div>`
        : `<div class="dp-card__meta">${icon("flag", "dp-i14")} Thưởng/điểm: ${esc(
            (p.reward_per_point || 0).toLocaleString("vi-VN")
          )}₫</div>`
    }
  </div>`;
}

export async function render({ container }) {
  let summary = { by_state: [], by_program: [], total_points: 0 };
  let programs = [];
  try {
    [summary, programs] = await Promise.all([
      call("salep.api.dashboard.staff_summary"),
      call("salep.api.portal.list_programs", { running_only: 1 }),
    ]);
  } catch (e) {
    toastError(e.message);
  }

  const stateCount = (s) => (summary.by_state.find((x) => x.state === s) || {}).cnt || 0;
  const mineByProgram = {};
  (summary.by_program || []).forEach((p) => (mineByProgram[p.program] = p.approved || 0));

  container.innerHTML = html`
    <header class="dp-topbar dp-topbar--home">
      <div>
        <p class="dp-topbar__hello">Xin chào,</p>
        <h1 class="dp-topbar__name">${esc(ctx.fullName)}</h1>
      </div>
      <button class="dp-iconbtn" data-go="/profile" aria-label="Hồ sơ">${icon("account_circle")}</button>
    </header>
    <div class="dp-page">
      <section class="dp-stats">
        ${statCard("Điểm của tôi", summary.total_points || 0, "dp-stat--primary")}
        ${statCard("Chờ duyệt", stateCount("Chờ duyệt"), "dp-stat--pending")}
        ${statCard("Đã duyệt", stateCount("Đã duyệt"), "dp-stat--approved")}
      </section>

      <button class="dp-btn dp-btn--primary dp-btn--block" data-go="/points/new">
        ${icon("add")} Tạo điểm trưng bày
      </button>

      <section class="dp-section">
        <div class="dp-section__head">
          <h2>Chương trình đang chạy</h2>
          <a class="dp-link" data-go="/programs">Xem tất cả</a>
        </div>
        <div class="dp-cardlist">
          ${
            programs.length
              ? programs.map((p) => programCard(p, mineByProgram[p.name] || 0)).join("")
              : emptyState("Chưa có chương trình đang chạy", "campaign")
          }
        </div>
      </section>
    </div>
  `;

}
