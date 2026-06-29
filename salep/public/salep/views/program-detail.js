import { html, icon, subHeader, emptyState } from "../lib/dom.js";
import { esc, statusBadge, formatDate } from "../lib/format.js";
import { call } from "../lib/api.js";
import { toastError } from "../components/toast.js";

function row(p) {
  const photo = p.point_photo
    ? `<img class="dp-row__thumb" src="${esc(p.point_photo)}" alt="">`
    : `<div class="dp-row__thumb dp-row__thumb--ph">${icon("storefront")}</div>`;
  return `<div class="dp-row" data-go="/participations/${encodeURIComponent(p.name)}">
    ${photo}
    <div class="dp-row__body">
      <h3 class="dp-row__title">${esc(p.point_name || p.display_point || "—")}</h3>
      <p class="dp-row__sub">${esc(p.distributor || "")}</p>
      <p class="dp-row__sub">${esc(p.point_phone || "")}</p>
    </div>
    ${statusBadge(p.workflow_state)}
  </div>`;
}

export async function render({ container, params }) {
  const program = params.name;
  let data;
  try {
    data = await call("salep.api.portal.list_program_participations", { program });
  } catch (e) {
    container.innerHTML = subHeader("Chương trình") + emptyState("Không tải được", "error", e.message);
    return;
  }

  const pr = data.program || {};
  const list = data.participations || [];

  container.innerHTML = html`
    ${subHeader(pr.program_name || "Chương trình")}
    <div class="dp-page">
      <div class="dp-card dp-card--info">
        <div class="dp-card__row">
          <h2 class="dp-card__heading">${esc(pr.program_name || program)}</h2>
          <span class="dp-badge dp-badge--info">${esc(pr.status || "")}</span>
        </div>
        ${
          pr.start_date
            ? `<div class="dp-card__meta">${icon("calendar_today", "dp-i14")} ${esc(formatDate(pr.start_date))} – ${esc(
                formatDate(pr.end_date)
              )}</div>`
            : ""
        }
        <div class="dp-card__meta">${icon("inventory_2", "dp-i14")} ${list.length} điểm tham gia</div>
      </div>

      <button class="dp-btn dp-btn--primary dp-btn--block" data-go="/participations/new?program=${encodeURIComponent(
        program
      )}">${icon("add")} Đăng ký điểm tham gia</button>

      <div class="dp-cardlist">
        ${list.length ? list.map(row).join("") : emptyState("Chưa có điểm tham gia", "inventory_2")}
      </div>
    </div>
  `;
}
