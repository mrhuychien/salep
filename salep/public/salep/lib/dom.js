// Tiện ích DOM tối giản (không framework).
import { esc } from "./format.js";

// Tagged template: nối chuỗi, mảng tự join, null→''. KHÔNG auto-escape —
// dữ liệu người dùng phải bọc esc() (xem format.js) trước khi nội suy.
export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      out += Array.isArray(v) ? v.join("") : v == null || v === false ? "" : String(v);
    }
  });
  return out;
}

export function setHTML(container, markup) {
  container.innerHTML = markup;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

// Event delegation: gắn 1 listener ở root, khớp theo selector.
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function icon(name, cls = "") {
  return `<span class="material-symbols-outlined${cls ? " " + cls : ""}">${name}</span>`;
}

// Header có nút back cho các trang con (form/chi tiết).
export function subHeader(title) {
  return `<header class="dp-topbar dp-topbar--sub">
    <button class="dp-iconbtn" data-back aria-label="Quay lại">${icon("arrow_back")}</button>
    <h1 class="dp-topbar__title">${esc(title)}</h1>
    <span class="dp-topbar__spacer"></span>
  </header>`;
}

export function emptyState(text, ic = "inbox", sub = "") {
  return `<div class="dp-empty">${icon(ic)}<p>${esc(text)}</p>${
    sub ? `<p class="dp-empty__sub">${esc(sub)}</p>` : ""
  }</div>`;
}

// Lấy GPS hiện tại; resolve {latitude, longitude, accuracy} hoặc reject.
export function getGeolocation(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Trình duyệt không hỗ trợ định vị"));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(err.message || "Không lấy được vị trí")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...opts }
    );
  });
}
