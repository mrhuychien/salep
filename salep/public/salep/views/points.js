import { html, icon, emptyState, skeleton } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { toastError } from "../components/toast.js";

function row(p) {
  const thumb = p.store_photo
    ? `<img class="dp-list-thumb" src="${esc(p.store_photo)}" alt="">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  return `<a class="dp-list-item" data-go="/participations/new?point=${encodeURIComponent(p.name)}">
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
  let search = "";

  container.innerHTML = html`
    <div class="dp-search-wrap">
      ${icon("magnifying-glass")}
      <input class="dp-search" type="search" placeholder="Tìm điểm theo tên hoặc SĐT" />
    </div>
    <div id="dp-list"></div>
    <button class="dp-fab" data-go="/points/new" aria-label="Tạo điểm">${icon("plus")}</button>
  `;

  const listEl = container.querySelector("#dp-list");

  async function refresh() {
    listEl.innerHTML = skeleton(72, 4);
    try {
      const items = await call("salep.api.point.list_my_points", { search: search || null, limit: 200 });
      listEl.innerHTML = items.length
        ? `<div class="dp-list">${items.map(row).join("")}</div>`
        : emptyState("Chưa có điểm bán nào", "🏪", "Nhấn + để tạo điểm trưng bày");
    } catch (e) {
      toastError(e.message);
      listEl.innerHTML = emptyState("Không tải được danh sách", "⚠️");
    }
  }

  let t;
  const input = container.querySelector(".dp-search");
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      search = input.value.trim();
      refresh();
    }, 300);
  });

  await refresh();
}
