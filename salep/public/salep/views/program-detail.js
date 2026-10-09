import { html, icon, emptyState } from "../lib/dom.js";
import { esc, statusBadge, formatDate } from "../lib/format.js";
import { call } from "../lib/api.js";
import { isNppOwner } from "../lib/store.js";
import { renderMap } from "../lib/map.js";
import { setHeaderTitle } from "../components/nav.js";
import { toastError } from "../components/toast.js";

function row(p) {
  const thumb = p.point_photo
    ? `<img class="dp-list-thumb" src="${esc(p.point_photo)}" alt="">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  return `<a class="dp-list-item" data-go="/participations/${encodeURIComponent(p.name)}">
    ${thumb}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(p.point_name || p.display_point || "—")}</div>
      <div class="dp-list-sub">${esc(p.distributor || "")}</div>
      <div class="dp-list-sub">${esc(p.point_phone || "")}</div>
      ${p.staff_name ? `<div class="dp-list-sub">NV: ${esc(p.staff_name)}</div>` : ""}
    </div>
    ${statusBadge(p.workflow_state)}
  </a>`;
}

export async function render({ container, params }) {
  const program = params.name;
  let data;
  try {
    data = await call("salep.api.portal.list_program_participations", { program });
  } catch (e) {
    container.innerHTML = emptyState("Không tải được", "⚠️", e.message);
    return;
  }
  // Đã rời màn hình trong lúc tải → không đè tiêu đề / dựng DOM cho màn mới.
  if (!container.isConnected) return;

  const pr = data.program || {};
  const list = data.participations || [];
  if (pr.program_name) setHeaderTitle(pr.program_name);
  // Chủ NPP: sang màn Quản lý (tab Chương trình lọc sẵn). Shell cũ chưa có route /npp → tải lại cả trang.
  let manageLink = "";
  if (isNppOwner()) {
    const url = `/npp?t=programs&program=${encodeURIComponent(program)}`;
    const attr = window.DP_APP?.build ? `data-go="${esc(url)}"` : `href="${esc(`/dp?r=${Date.now()}#${url}`)}"`;
    manageLink = `<a class="dp-link" ${attr}>Quản lý &amp; gán NV →</a>`;
  }

  container.innerHTML = html`
    <div class="dp-view-banner">
      <div>
        <div class="dp-view-banner-title">${esc(pr.program_name || program)}</div>
        <div class="dp-view-banner-subtitle">${
          pr.start_date ? esc(formatDate(pr.start_date)) + " – " + esc(formatDate(pr.end_date)) : ""
        }</div>
      </div>
      <div class="dp-view-banner-badge">${list.length} điểm</div>
    </div>

    <button class="dp-btn-primary" data-go="/participations/new?program=${encodeURIComponent(program)}">${icon(
      "circle-plus"
    )} Đăng ký điểm tham gia</button>

    <div class="dp-section-head"><h2>Bản đồ điểm tham gia</h2></div>
    <div class="dp-map" id="dp-map"></div>

    <div class="dp-section-head"><h2>Danh sách điểm</h2>${manageLink}</div>
    <div class="dp-list">
      ${list.length ? list.map(row).join("") : emptyState("Chưa có điểm tham gia", "📦")}
    </div>
  `;

  renderMap(
    container.querySelector("#dp-map"),
    list.map((o) => ({
      lat: o.point_latitude,
      lng: o.point_longitude,
      title: o.point_name || o.display_point,
      sub: o.workflow_state,
    }))
  );
}
