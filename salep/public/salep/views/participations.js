// Danh sách lượt tham gia của NVBH (drill-down từ 4 ô thống kê trang chủ).
// query.state lọc theo trạng thái: rỗng = tất cả, "Chờ duyệt", "Đã duyệt".
import { html, icon, emptyState } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { setHeaderTitle } from "../components/nav.js";
import { toastError } from "../components/toast.js";

const STATE_BADGE = {
  "Nháp": "muted",
  "Chờ duyệt": "warning",
  "Đã duyệt": "success",
  "Từ chối": "danger",
};

const TITLE = {
  "": "Điểm tham gia chương trình",
  "Chờ duyệt": "Điểm bán chờ duyệt",
  "Đã duyệt": "Điểm bán đã duyệt",
};

function row(r) {
  const thumb = r.point_photo
    ? `<img class="dp-list-thumb" src="${esc(r.point_photo)}" alt="">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  const badge = STATE_BADGE[r.workflow_state] || "muted";
  return `<a class="dp-list-item" data-go="/participations/${encodeURIComponent(r.name)}">
    ${thumb}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(r.point_name || r.display_point || "—")}</div>
      <div class="dp-list-sub">${esc(r.program_name || r.promotion_program || "")}</div>
      <div class="dp-list-sub"><span class="dp-badge dp-badge-${badge}">${esc(
    r.workflow_state || ""
  )}</span></div>
    </div>
    <span class="dp-list-chev">${icon("chevron-right")}</span>
  </a>`;
}

export async function render({ container, query }) {
  const state = (query && query.state) || "";
  setHeaderTitle(TITLE[state] || "Lượt tham gia");

  let rows = [];
  try {
    rows = await call("salep.api.portal.list_my_participations", state ? { state } : {});
  } catch (e) {
    toastError(e.message);
  }

  container.innerHTML = html`
    <div class="dp-search-wrap">
      ${icon("magnifying-glass")}
      <input class="dp-search" type="search" placeholder="Tìm theo tên điểm hoặc SĐT" />
    </div>
    <div id="dp-list"></div>
  `;

  const listEl = container.querySelector("#dp-list");
  function renderList(filter = "") {
    const f = filter.toLowerCase();
    const items = rows.filter(
      (r) =>
        !f ||
        (r.point_name || "").toLowerCase().includes(f) ||
        (r.point_phone || "").toLowerCase().includes(f)
    );
    listEl.innerHTML = items.length
      ? `<div class="dp-list">${items.map(row).join("")}</div>`
      : emptyState("Chưa có lượt tham gia nào", "📋");
  }
  renderList();

  const input = container.querySelector(".dp-search");
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => renderList(input.value.trim()), 200);
  });
}
