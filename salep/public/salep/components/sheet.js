// Bottom sheet / hộp thoại dùng chung trên #dp-modal-mount (CSS .dp-modal-content có sẵn):
// mobile trượt từ đáy, desktop hộp giữa màn. Mỗi lúc chỉ 1 sheet; mở sheet mới = đóng sheet cũ.
// Đóng khi: bấm nền mờ, nút ×/[data-sheet-close], phím Escape, đổi hash (điều hướng / Back).
import { esc } from "../lib/format.js";

let active = null; // { onClose, cleanup }

function mountEl() {
  return document.getElementById("dp-modal-mount");
}

// Bàn phím ảo (iOS) không co layout viewport → đẩy sheet lên theo visualViewport.
function fitKeyboard() {
  const mount = mountEl();
  const vv = window.visualViewport;
  if (!mount || !vv) return;
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  mount.style.paddingBottom = inset > 0 ? `${inset}px` : "";
}

// body/footer: chuỗi HTML (người gọi TỰ esc() dữ liệu người dùng). footer = hàng nút cố định đáy sheet.
// onMount(sheetEl, close) chạy sau khi gắn DOM; onClose() chạy 1 lần khi sheet đóng (mọi đường).
export function openSheet({ title = "", body = "", footer = "", onMount, onClose } = {}) {
  const mount = mountEl();
  if (!mount) return null;
  if (active) closeSheet();

  mount.innerHTML = `
    <div class="dp-modal-content dp-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <div class="dp-sheet-grip" aria-hidden="true"></div>
      <div class="dp-sheet-head">
        <h3 class="dp-modal-title">${esc(title)}</h3>
        <button type="button" class="dp-sheet-close" data-sheet-close aria-label="Đóng"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="dp-sheet-body">${body}</div>
      ${footer ? `<div class="dp-sheet-foot">${footer}</div>` : ""}
    </div>`;
  mount.classList.add("dp-show");
  document.body.classList.add("dp-sheet-open");
  const sheet = mount.firstElementChild;

  // Gán onclick (không addEventListener) như season modal ở nav.js → mở nhiều lần không chồng listener.
  mount.onclick = (e) => {
    if (e.target === mount || e.target.closest("[data-sheet-close]")) {
      e.preventDefault();
      closeSheet();
    } else if (e.target.closest("[data-go]")) {
      closeSheet(); // event vẫn nổi lên #dp-app → nav.js điều hướng tiếp
    }
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeSheet();
  };
  const onHash = () => closeSheet();
  const vv = window.visualViewport;
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", onHash);
  if (vv) vv.addEventListener("resize", fitKeyboard);
  active = {
    onClose,
    cleanup() {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      if (vv) vv.removeEventListener("resize", fitKeyboard);
    },
  };

  try {
    sheet.focus({ preventScroll: true }); // không focus input → không bật bàn phím ngay
  } catch {
    /* ignore */
  }
  if (onMount) onMount(sheet, closeSheet);
  return sheet;
}

export function closeSheet() {
  const mount = mountEl();
  const cur = active;
  active = null;
  if (cur) cur.cleanup();
  if (mount) {
    mount.classList.remove("dp-show");
    mount.innerHTML = "";
    mount.onclick = null;
    mount.style.paddingBottom = "";
  }
  document.body.classList.remove("dp-sheet-open");
  if (cur && cur.onClose) {
    try {
      cur.onClose();
    } catch (err) {
      console.error(err);
    }
  }
}
