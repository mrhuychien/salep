import { html, icon, emptyState, skeleton } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { toastError } from "../components/toast.js";

function row(o) {
  return `<a class="dp-list-item" data-go="/participations/${encodeURIComponent(o.participation)}">
    <div class="dp-list-thumb">${icon("store")}</div>
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(o.point_name || o.display_point || "—")}</div>
      <div class="dp-list-sub">${icon("bullhorn")} ${esc(o.program_name || "")}</div>
      <div class="dp-list-sub">${esc(o.point_phone || "")}</div>
    </div>
    <span class="dp-badge dp-badge-warning">Thiếu ${o.missing}</span>
  </a>`;
}

export async function render({ container }) {
  container.innerHTML = skeleton(72, 3);
  let items = [];
  try {
    items = await call("salep.api.portal.list_points_to_visit");
  } catch (e) {
    toastError(e.message);
    container.innerHTML = emptyState("Không tải được", "⚠️");
    return;
  }

  container.innerHTML = html`
    <div class="dp-view-banner">
      <div>
        <div class="dp-view-banner-title">Cần ghé thăm</div>
        <div class="dp-view-banner-subtitle">Điểm chưa đủ ảnh báo cáo theo tháng</div>
      </div>
      <div class="dp-view-banner-badge">${items.length}</div>
    </div>
    <div class="dp-list">
      ${items.length ? items.map(row).join("") : emptyState("Tất cả điểm đã đủ ảnh", "✅", "Không có điểm nào cần ghé thăm")}
    </div>
  `;
}
