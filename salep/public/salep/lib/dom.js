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

// Font Awesome 6 icon. Truyền tên không kèm "fa-" (vd icon("house")).
export function icon(name, cls = "") {
  return `<i class="fas fa-${name}${cls ? " " + cls : ""}"></i>`;
}

export function emptyState(text, emoji = "📭", sub = "") {
  return `<div class="dp-empty"><div class="dp-empty-icon">${emoji}</div>
    <div class="dp-empty-title">${esc(text)}</div>${
      sub ? `<div class="dp-empty-sub">${esc(sub)}</div>` : ""
    }</div>`;
}

export function skeleton(height = 90, count = 3) {
  return Array.from(
    { length: count },
    () => `<div class="dp-skeleton" style="height:${height}px;margin-bottom:.6rem"></div>`
  ).join("");
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
