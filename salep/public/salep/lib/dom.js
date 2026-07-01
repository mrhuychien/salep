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

// Đổ thanh tiến trình vào ô chụp ảnh (dp-uploader); trả hàm onProgress(pct 0..100).
export function uploaderProgress(uploaderEl) {
  uploaderEl.innerHTML = `<span class="dp-uploader-icon">${icon("cloud-arrow-up")}</span>
    <div class="dp-up-progress"><div class="dp-up-bar"></div></div>
    <span class="dp-uploader-text" data-uptext>Đang xử lý ảnh...</span>`;
  const bar = uploaderEl.querySelector(".dp-up-bar");
  const txt = uploaderEl.querySelector("[data-uptext]");
  return (pct) => {
    if (bar) bar.style.width = pct + "%";
    if (txt) txt.textContent = pct < 100 ? `Đang tải ảnh... ${pct}%` : "Đang lưu...";
  };
}

// Luồng chụp ảnh BẮT BUỘC GPS, xử lý được iOS (prompt định vị chỉ hiện khi có
// user gesture, và camera mở toàn màn hình sẽ che prompt nếu mở cùng cử chỉ).
// KHÔNG gọi định vị khi mở màn (ngoài gesture iOS treo, không prompt).
//   - Chạm lần 1 (chưa có quyền/fix): XIN QUYỀN + lấy toạ độ (không mở camera).
//   - Chạm lần 2 (đã có fix): mở camera chụp.
// onCapture(file, gps) được gọi khi đã có ảnh + toạ độ hợp lệ.
export function setupPhotoCapture({ uploader, fileInput, gps, onCapture, onError, setLabel, readyLabel }) {
  gps = gps || { latitude: null, longitude: null, accuracy: null };
  readyLabel = readyLabel || "Định vị sẵn sàng — chạm để chụp ảnh";
  let hasFix = false;
  let capturePending = null;

  const setText =
    setLabel ||
    ((t) => {
      const el = uploader.querySelector(".dp-uploader-text");
      if (el) el.textContent = t;
    });

  // KHÔNG prime khi mở: getCurrentPosition ngoài user-gesture trên iOS bị treo
  // (không hiện prompt) và chặn luôn lần gọi trong gesture. Chỉ gọi khi CHẠM.
  uploader.addEventListener("click", async () => {
    if (uploader.classList.contains("is-loading")) return;
    if (!hasFix) {
      // Bước xin quyền (chỉ lần đầu khi chưa cấp) — nằm trong chính cử chỉ chạm.
      uploader.classList.add("is-loading");
      setText("Đang xin quyền định vị...");
      try {
        Object.assign(gps, await getGeolocation());
        hasFix = true;
        setText(readyLabel);
      } catch (err) {
        setText("Chạm để bật định vị & chụp ảnh");
        onError(
          new Error(
            "Không lấy được định vị. Hãy bật Vị trí cho trình duyệt (iOS: Cài đặt › Quyền riêng tư › Dịch vụ định vị › Chrome/Safari › Khi dùng app) rồi chạm lại." +
              (err && err.message ? ` [${err.message}]` : "")
          )
        );
      } finally {
        uploader.classList.remove("is-loading");
      }
      return;
    }
    // Đã có quyền → mở camera (cử chỉ mới) + lấy lại vị trí mới nhất song song.
    capturePending = getGeolocation().catch(() => null);
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const pos = (await capturePending) || (gps.latitude != null ? { ...gps } : null);
    if (!pos || pos.latitude == null) {
      fileInput.value = "";
      onError(new Error("Không lấy được GPS. Hãy bật định vị rồi chụp lại."));
      return;
    }
    Object.assign(gps, pos);
    onCapture(file, gps);
  });

  return { gps };
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
      // timeout dài hơn + cho dùng fix gần đây (maximumAge) → sau khi cấp quyền,
      // toạ độ trả về nhanh, đỡ treo/timeout khi ở trong nhà (GPS yếu).
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000, ...opts }
    );
  });
}
