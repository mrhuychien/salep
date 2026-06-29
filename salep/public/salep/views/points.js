import { html, icon, on, emptyState } from "../lib/dom.js";
import { esc, statusBadge } from "../lib/format.js";
import { call } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import { toastError } from "../components/toast.js";

const FILTERS = ["Tất cả", "Nháp", "Chờ duyệt", "Đã duyệt", "Từ chối"];

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

export async function render({ container, query }) {
  let state = query && query.state ? query.state : "";
  let search = "";
  let items = [];

  container.innerHTML = html`
    <header class="dp-topbar dp-topbar--list">
      <h1 class="dp-topbar__name">Lượt tham gia của tôi</h1>
      <div class="dp-search">
        ${icon("search", "dp-search__icon")}
        <input class="dp-search__input" type="search" placeholder="Tìm theo tên hoặc SĐT" />
      </div>
      <div class="dp-chips">
        ${FILTERS.map(
          (f) =>
            `<button class="dp-chip${(state || "Tất cả") === f ? " is-active" : ""}" data-filter="${esc(
              f
            )}">${esc(f)}</button>`
        ).join("")}
      </div>
    </header>
    <div class="dp-page" id="dp-list"></div>
    <button class="dp-fab" data-go="/participations/new" aria-label="Đăng ký mới">${icon("add")}</button>
  `;

  const listEl = container.querySelector("#dp-list");

  async function refresh() {
    listEl.innerHTML =
      '<div class="dp-loading"><span class="material-symbols-outlined dp-spin">progress_activity</span></div>';
    try {
      items = await call("salep.api.portal.list_my_participations", {
        search: search || null,
        state: state || null,
      });
      listEl.innerHTML = items.length
        ? `<div class="dp-cardlist">${items.map(row).join("")}</div>`
        : emptyState("Chưa có lượt tham gia nào", "inventory_2", "Nhấn + để đăng ký điểm vào chương trình");
    } catch (e) {
      toastError(e.message);
      listEl.innerHTML = emptyState("Không tải được danh sách", "error");
    }
  }

  on(container, "click", "[data-filter]", (e, el) => {
    state = el.dataset.filter === "Tất cả" ? "" : el.dataset.filter;
    container.querySelectorAll("[data-filter]").forEach((c) => c.classList.toggle("is-active", c === el));
    refresh();
  });

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
