import { html, icon, on, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatVND } from "../lib/format.js";
import { call } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import { toastError } from "../components/toast.js";

function card(p) {
  return `<div class="dp-card dp-card--program" data-go="/participations/new?program=${encodeURIComponent(p.name)}">
    <div class="dp-card__accent"></div>
    <div class="dp-card__row">
      <h3 class="dp-card__title">${esc(p.program_name)}</h3>
      <span class="dp-badge dp-badge--info">${esc(p.status || "")}</span>
    </div>
    <div class="dp-card__meta">${icon("calendar_today", "dp-i14")} ${esc(formatDate(p.start_date))} – ${esc(
    formatDate(p.end_date)
  )}</div>
    <div class="dp-card__metarow">
      ${p.target_points ? `<span>${icon("flag", "dp-i14")} Mục tiêu ${esc(p.target_points)} điểm</span>` : ""}
      ${p.reward_per_point ? `<span>${icon("payments", "dp-i14")} ${esc(formatVND(p.reward_per_point))}/điểm</span>` : ""}
    </div>
    <div class="dp-card__cta">${icon("add_circle", "dp-i18")} Đăng ký điểm tham gia</div>
  </div>`;
}

export async function render({ container }) {
  let programs = [];
  try {
    programs = await call("salep.api.portal.list_programs", { running_only: 1 });
  } catch (e) {
    toastError(e.message);
  }

  container.innerHTML = html`
    <header class="dp-topbar dp-topbar--list">
      <h1 class="dp-topbar__name">Chương trình</h1>
    </header>
    <div class="dp-page">
      <div class="dp-cardlist">
        ${
          programs.length
            ? programs.map(card).join("")
            : emptyState("Chưa có chương trình đang chạy", "campaign")
        }
      </div>
    </div>
  `;

}
