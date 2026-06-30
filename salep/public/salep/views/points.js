import { html, icon, emptyState } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { renderMap } from "../lib/map.js";
import { toastError } from "../components/toast.js";

function row(p) {
  const thumb = p.store_photo
    ? `<img class="dp-list-thumb" src="${esc(p.store_photo)}" alt="">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  return `<a class="dp-list-item" data-go="/points/${encodeURIComponent(p.name)}">
    ${thumb}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(p.point_name || "—")}</div>
      <div class="dp-list-sub">${esc(p.distributor || "")}</div>
      <div class="dp-list-sub">${esc(p.phone || "")}</div>
    </div>
    <span class="dp-list-chev">${icon("chevron-right")}</span>
  </a>`;
}

export async function render({ container }) {
  let all = [];
  try {
    all = await call("salep.api.point.list_my_points", { limit: 500 });
  } catch (e) {
    toastError(e.message);
  }

  container.innerHTML = html`
    <div class="dp-map" id="dp-map"></div>
    <div class="dp-search-wrap">
      ${icon("magnifying-glass")}
      <input class="dp-search" type="search" placeholder="Tìm điểm theo tên hoặc SĐT" />
    </div>
    <div id="dp-list"></div>
    <button class="dp-fab" data-go="/points/new" aria-label="Tạo điểm">${icon("plus")}</button>
  `;

  const listEl = container.querySelector("#dp-list");
  function renderList(filter = "") {
    const f = filter.toLowerCase();
    const items = all.filter(
      (p) => !f || (p.point_name || "").toLowerCase().includes(f) || (p.phone || "").toLowerCase().includes(f)
    );
    listEl.innerHTML = items.length
      ? `<div class="dp-list">${items.map(row).join("")}</div>`
      : emptyState("Chưa có điểm bán nào", "🏪", "Nhấn + để tạo điểm trưng bày");
  }
  renderList();

  const input = container.querySelector(".dp-search");
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => renderList(input.value.trim()), 200);
  });

  // Bản đồ toàn bộ điểm có toạ độ (không phụ thuộc ô tìm).
  renderMap(
    container.querySelector("#dp-map"),
    all.map((p) => ({ lat: p.latitude, lng: p.longitude, title: p.point_name, sub: p.phone }))
  );
}
