import { html, icon, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatVND } from "../lib/format.js";
import { call } from "../lib/api.js";
import { toastError } from "../components/toast.js";

function card(p) {
  const prog = encodeURIComponent(p.name);
  // Thẻ → danh sách điểm tham gia; nút (data-go gần hơn) → form đăng ký.
  return `<div class="dp-prog-card" data-go="/programs/${prog}">
    <div class="dp-prog-top">
      <h3 class="dp-prog-title">${esc(p.program_name)}</h3>
      <span class="dp-badge dp-badge-primary">${esc(p.status || "")}</span>
    </div>
    <div class="dp-prog-meta">
      <span>${icon("calendar")} ${esc(formatDate(p.start_date))} – ${esc(formatDate(p.end_date))}</span>
      ${p.target_points ? `<span>${icon("flag")} Mục tiêu ${esc(p.target_points)} điểm</span>` : ""}
      ${p.reward_per_point ? `<span>${icon("coins")} ${esc(formatVND(p.reward_per_point))}/điểm</span>` : ""}
    </div>
    <button class="dp-btn-outline dp-mt" data-go="/participations/new?program=${prog}">${icon(
      "circle-plus"
    )} Đăng ký điểm tham gia</button>
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
    <div class="dp-list">
      ${programs.length ? programs.map(card).join("") : emptyState("Chưa có chương trình đang chạy", "📣")}
    </div>
  `;
}
