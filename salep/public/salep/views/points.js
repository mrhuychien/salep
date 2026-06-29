import { html, icon, emptyState } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { toastError } from "../components/toast.js";

function row(p) {
  const photo = p.store_photo
    ? `<img class="dp-row__thumb" src="${esc(p.store_photo)}" alt="">`
    : `<div class="dp-row__thumb dp-row__thumb--ph">${icon("storefront")}</div>`;
  return `<div class="dp-row" data-go="/participations/new?point=${encodeURIComponent(p.name)}">
    ${photo}
    <div class="dp-row__body">
      <h3 class="dp-row__title">${esc(p.point_name || "—")}</h3>
      <p class="dp-row__sub">${esc(p.distributor || "")}</p>
      <p class="dp-row__sub">${esc(p.phone || "")}</p>
    </div>
    ${icon("chevron_right", "dp-row__chev")}
  </div>`;
}

export async function render({ container }) {
  let search = "";
  let items = [];

  container.innerHTML = html`
    <header class="dp-topbar dp-topbar--list">
      <h1 class="dp-topbar__name">Điểm bán của tôi</h1>
      <div class="dp-search">
        ${icon("search", "dp-search__icon")}
        <input class="dp-search__input" type="search" placeholder="Tìm theo tên hoặc SĐT" />
      </div>
    </header>
    <div class="dp-page" id="dp-list"></div>
    <button class="dp-fab" data-go="/points/new" aria-label="Tạo điểm">${icon("add")}</button>
  `;

  const listEl = container.querySelector("#dp-list");

  async function refresh() {
    listEl.innerHTML =
      '<div class="dp-loading"><span class="material-symbols-outlined dp-spin">progress_activity</span></div>';
    try {
      items = await call("salep.api.point.list_my_points", { search: search || null, limit: 200 });
      listEl.innerHTML = items.length
        ? `<div class="dp-cardlist">${items.map(row).join("")}</div>`
        : emptyState("Chưa có điểm bán nào", "storefront", "Nhấn + để tạo điểm trưng bày");
    } catch (e) {
      toastError(e.message);
      listEl.innerHTML = emptyState("Không tải được danh sách", "error");
    }
  }

  let t;
  const input = container.querySelector(".dp-search__input");
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      search = input.value.trim();
      refresh();
    }, 300);
  });

  await refresh();
}
