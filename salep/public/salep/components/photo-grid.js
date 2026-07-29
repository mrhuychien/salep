// Lưới ảnh NHIỀU TẤM: chụp/chọn nhiều ảnh, BẮT BUỘC GPS, nén + tiến trình, xoá.
// Xử lý iOS: định vị chỉ gọi trong cử chỉ chạm; lần đầu chưa có quyền thì chạm 1
// để xin quyền (chưa mở picker), chạm lại để chọn/chụp ảnh.
import { getGeolocation, icon } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { uploadFile } from "../lib/api.js";

export function createPhotoGrid({ mount, fieldname, initial = [], max = 8, onError }) {
  const report = (e) => onError && onError(e instanceof Error ? e : new Error(String(e)));
  const photos = (initial || [])
    .filter((p) => p && (p.image || p.file_url))
    .map((p) => ({
      image: p.image || p.file_url,
      latitude: p.latitude == null ? null : p.latitude,
      longitude: p.longitude == null ? null : p.longitude,
      gps_accuracy: p.gps_accuracy == null ? null : p.gps_accuracy,
    }));

  let lastFix =
    photos.length && photos[0].latitude != null
      ? { latitude: photos[0].latitude, longitude: photos[0].longitude, accuracy: photos[0].gps_accuracy }
      : null;
  let busy = false;
  let active = null; // % ảnh đang tải; null = không có ô loading

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  // CHỈ chụp trực tiếp bằng camera (không cho chọn ảnh có sẵn) — bảo đảm ảnh mới
  // + GPS thật tại điểm. capture=environment → mở thẳng camera sau; mỗi lần 1 tấm.
  input.setAttribute("capture", "environment");
  input.hidden = true;
  const grid = document.createElement("div");
  grid.className = "dp-photo-grid";
  mount.appendChild(input);
  mount.appendChild(grid);

  function cellPhoto(p, i) {
    const warn = p.gps_accuracy != null && p.gps_accuracy > 100;
    return `<div class="dp-photo-cell">
      <img src="${esc(p.image)}" alt="">
      <button type="button" class="dp-photo-rm" data-rm="${i}" aria-label="Xoá ảnh">${icon("xmark")}</button>
      ${p.latitude != null ? `<span class="dp-photo-badge">${icon("location-dot")}${warn ? " ⚠" : ""}</span>` : ""}
    </div>`;
  }
  function cellLoading(pct) {
    return `<div class="dp-photo-cell is-loading"><div class="dp-photo-pct">${
      pct == null ? "…" : pct + "%"
    }</div></div>`;
  }
  function addTile() {
    if (photos.length >= max) return "";
    const label = lastFix ? "Chụp thêm ảnh" : "Bật định vị & chụp ảnh";
    return `<button type="button" class="dp-photo-add" data-add ${busy ? "disabled" : ""}>
      <span class="dp-photo-add-ic">${icon("camera")}</span>
      <span class="dp-photo-add-tx">${esc(busy && !active ? "Đang lấy vị trí GPS..." : label)}</span>
    </button>`;
  }
  function render() {
    let h = photos.map(cellPhoto).join("");
    if (active !== null) h += cellLoading(active);
    h += addTile();
    grid.innerHTML = h;
  }
  render();

  grid.addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      if (busy) return;
      photos.splice(Number(rm.dataset.rm), 1);
      render();
      return;
    }
    const add = e.target.closest("[data-add]");
    if (!add || busy) return;
    if (!lastFix) {
      // Xin quyền + lấy GPS trong CHÍNH cử chỉ chạm (iOS cần gesture). Chưa mở picker.
      busy = true;
      render();
      try {
        lastFix = await getGeolocation();
      } catch (err) {
        report(err);
      } finally {
        busy = false;
        render();
      }
      return;
    }
    input.click();
  });

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    busy = true;
    // Lấy fix mới cho cả lô (quyền đã cấp → nhanh); fallback fix cũ.
    let fix = null;
    try {
      fix = await getGeolocation();
    } catch {
      fix = lastFix;
    }
    if (!fix || fix.latitude == null) fix = lastFix;
    if (!fix || fix.latitude == null) {
      busy = false;
      render();
      report(new Error("Cần bật định vị GPS để thêm ảnh. Hãy cho phép quyền vị trí rồi thử lại."));
      return;
    }
    lastFix = fix;
    for (const file of files) {
      if (photos.length >= max) break;
      active = 0;
      render();
      try {
        const res = await uploadFile(file, {
          fieldname,
          onProgress: (pct) => {
            active = pct;
            render();
          },
        });
        photos.push({
          image: res.file_url,
          latitude: fix.latitude,
          longitude: fix.longitude,
          gps_accuracy: fix.accuracy,
        });
      } catch (err) {
        report(err);
      }
      active = null;
    }
    busy = false;
    render();
  });

  return {
    getPhotos: () => photos.slice(),
    count: () => photos.length,
    firstFix: () =>
      photos[0]
        ? { latitude: photos[0].latitude, longitude: photos[0].longitude, accuracy: photos[0].gps_accuracy }
        : null,
  };
}
