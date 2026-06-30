// Hướng dẫn sử dụng trực quan: slideshow nhiều bước, mỗi bước có hình minh hoạ
// (SVG mô phỏng màn hình thật — tự đổi màu theo mùa giao diện đang chọn).
// - Tự mở lần đăng nhập đầu (cờ localStorage dp_guide_seen).
// - Mở lại bất cứ lúc nào qua nút ❓ trên header (data-help).
import { esc } from "../lib/format.js";

const SEEN_KEY = "dp_guide_seen";

// Khung điện thoại + thanh điều hướng đáy (tab `active` được tô màu mùa).
function frame(i, active, inner) {
  const tabs = [0, 1, 2, 3]
    .map((t) => {
      const cx = [93, 118, 143, 168][t];
      const on = t === active;
      return `<circle cx="${cx}" cy="164" r="${on ? 3.6 : 3}" fill="${
        on ? `url(#dpg${i})` : "var(--dp-text-3)"
      }"/>`;
    })
    .join("");
  return `<svg class="dp-guide-illus" viewBox="60 0 140 180" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dpg${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--dp-season-1)"/><stop offset="1" stop-color="var(--dp-season-2)"/>
    </linearGradient></defs>
    <rect x="80" y="6" width="100" height="168" rx="16" fill="var(--dp-surface)" stroke="var(--dp-border)" stroke-width="2"/>
    <rect x="116" y="11" width="28" height="3" rx="1.5" fill="var(--dp-border)"/>
    ${inner}
    <line x1="82" y1="153" x2="178" y2="153" stroke="var(--dp-border)" stroke-width="1"/>
    ${tabs}
  </svg>`;
}

function plus(cx, cy, r, i) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#dpg${i})"/>
    <rect x="${cx - 5}" y="${cy - 1.2}" width="10" height="2.4" rx="1.2" fill="#fff"/>
    <rect x="${cx - 1.2}" y="${cy - 5}" width="2.4" height="10" rx="1.2" fill="#fff"/>`;
}

function camera(cx, cy, i) {
  return `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="var(--dp-season-1)" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="2.4" fill="var(--dp-season-1)"/>`;
}

function statCard(x, y, c) {
  return `<rect x="${x}" y="${y}" width="41" height="27" rx="5" fill="var(--dp-surface)" stroke="var(--dp-border)"/>
    <rect x="${x + 6}" y="${y + 6}" width="15" height="9" rx="2" fill="${c}"/>
    <rect x="${x + 6}" y="${y + 18}" width="29" height="3.5" rx="1.75" fill="var(--dp-text-3)"/>`;
}

function pin(cx, cy, i) {
  return `<circle cx="${cx}" cy="${cy}" r="5" fill="url(#dpg${i})"/><circle cx="${cx}" cy="${cy}" r="2" fill="#fff"/>`;
}

const ILLUS = [
  // 0 — Chào mừng: banner + danh sách.
  frame(
    0,
    0,
    `<rect x="87" y="20" width="86" height="36" rx="8" fill="url(#dpg0)"/>
     <rect x="94" y="29" width="26" height="4" rx="2" fill="#fff" opacity="0.75"/>
     <rect x="94" y="38" width="48" height="7" rx="3.5" fill="#fff"/>
     <rect x="87" y="62" width="86" height="18" rx="5" fill="var(--dp-surface-2)"/>
     <rect x="87" y="84" width="86" height="18" rx="5" fill="var(--dp-surface-2)"/>
     <rect x="87" y="106" width="86" height="18" rx="5" fill="var(--dp-surface-2)"/>`
  ),
  // 1 — Trang chủ 4 thống kê.
  frame(
    1,
    0,
    `${statCard(87, 22, "var(--dp-season-1)")}${statCard(131, 22, "var(--dp-text)")}
     ${statCard(87, 53, "var(--dp-warning)")}${statCard(131, 53, "var(--dp-success)")}
     <rect x="87" y="86" width="86" height="16" rx="5" fill="#fef3c7" stroke="#fde68a"/>
     <rect x="87" y="108" width="86" height="16" rx="6" fill="url(#dpg1)"/>`
  ),
  // 2 — Tạo điểm bán: form + camera + FAB.
  frame(
    2,
    1,
    `<rect x="87" y="22" width="38" height="6" rx="3" fill="var(--dp-text)"/>
     <rect x="87" y="34" width="86" height="12" rx="3" fill="var(--dp-surface-2)"/>
     <rect x="87" y="50" width="86" height="12" rx="3" fill="var(--dp-surface-2)"/>
     <rect x="87" y="67" width="86" height="30" rx="5" fill="var(--dp-surface-2)" stroke="var(--dp-border)" stroke-width="1.5" stroke-dasharray="4 3"/>
     ${camera(130, 82, 2)}
     ${plus(164, 138, 12, 2)}`
  ),
  // 3 — Đăng ký chương trình: điểm đã chọn + 2 chương trình (1 active) + camera.
  frame(
    3,
    1,
    `<rect x="87" y="22" width="86" height="22" rx="6" fill="var(--dp-surface)" stroke="var(--dp-season-1)" stroke-width="2"/>
     <circle cx="98" cy="33" r="5" fill="url(#dpg3)"/>
     <rect x="108" y="28" width="40" height="4.5" rx="2.25" fill="var(--dp-text)"/>
     <rect x="108" y="36" width="26" height="3.5" rx="1.75" fill="var(--dp-text-3)"/>
     <rect x="87" y="50" width="86" height="16" rx="5" fill="var(--dp-surface)" stroke="var(--dp-border)"/>
     <circle cx="96" cy="58" r="4" fill="none" stroke="var(--dp-text-3)" stroke-width="1.5"/>
     <rect x="106" y="56" width="44" height="4" rx="2" fill="var(--dp-text-3)"/>
     <rect x="87" y="70" width="86" height="16" rx="5" fill="var(--dp-surface)" stroke="var(--dp-season-1)" stroke-width="2"/>
     <circle cx="96" cy="78" r="4" fill="url(#dpg3)"/>
     <rect x="106" y="76" width="50" height="4" rx="2" fill="var(--dp-text)"/>
     <rect x="87" y="92" width="86" height="26" rx="5" fill="var(--dp-surface-2)" stroke="var(--dp-border)" stroke-dasharray="4 3"/>
     ${camera(130, 105, 3)}`
  ),
  // 4 — Báo cáo tháng: cảnh báo cần ghé thăm + lưới ảnh.
  frame(
    4,
    0,
    `<rect x="87" y="22" width="86" height="18" rx="5" fill="#fef3c7" stroke="#fde68a"/>
     <path d="M97 27 l4 7 h-8 z" fill="#f59e0b"/>
     <rect x="108" y="27" width="56" height="3.5" rx="1.75" fill="#92400e"/>
     <rect x="108" y="33" width="40" height="3" rx="1.5" fill="#b45309" opacity="0.7"/>
     <rect x="87" y="46" width="27" height="27" rx="4" fill="url(#dpg4)" opacity="0.3"/>
     <rect x="116" y="46" width="27" height="27" rx="4" fill="url(#dpg4)" opacity="0.3"/>
     <rect x="145" y="46" width="27" height="27" rx="4" fill="var(--dp-surface-2)" stroke="var(--dp-border)" stroke-dasharray="3 2"/>
     ${camera(158.5, 59.5, 4)}
     <rect x="87" y="80" width="86" height="16" rx="5" fill="var(--dp-surface)" stroke="var(--dp-border)"/>
     <rect x="87" y="102" width="86" height="16" rx="5" fill="var(--dp-surface)" stroke="var(--dp-border)"/>`
  ),
  // 5 — Bản đồ điểm bán.
  frame(
    5,
    1,
    `<rect x="87" y="22" width="86" height="64" rx="6" fill="var(--dp-surface-2)"/>
     <path d="M87 52 H173" stroke="var(--dp-border)" stroke-width="2"/>
     <path d="M124 22 V86" stroke="var(--dp-border)" stroke-width="2"/>
     ${pin(108, 42, 5)}${pin(152, 62, 5)}${pin(132, 74, 5)}
     <rect x="87" y="92" width="86" height="14" rx="4" fill="var(--dp-surface)" stroke="var(--dp-border)"/>
     <rect x="87" y="110" width="86" height="14" rx="4" fill="var(--dp-surface)" stroke="var(--dp-border)"/>`
  ),
];

const STEPS = [
  {
    title: "Chào mừng đến Điểm Trưng Bày",
    body: "Ứng dụng giúp bạn quản lý điểm bán và đăng ký các chương trình trưng bày ngay trên điện thoại.",
  },
  {
    title: "Trang chủ — 4 thống kê",
    body: "Xem nhanh số điểm bán của bạn, điểm tham gia chương trình, đang chờ duyệt và đã duyệt. Chạm vào từng ô để mở danh sách tương ứng.",
  },
  {
    title: "Tạo điểm bán",
    body: "Nhấn nút + để thêm điểm trưng bày: nhập số điện thoại (chống trùng), lấy GPS và chụp ảnh cửa hàng. SĐT đã có sẽ tự chuyển sang đăng ký chương trình.",
  },
  {
    title: "Đăng ký chương trình",
    body: "Chọn điểm bán, chọn chương trình đang chạy rồi chụp ảnh trưng bày. Ảnh tự động gắn GPS + thời gian và được nén tối ưu trước khi tải lên.",
  },
  {
    title: "Báo cáo hàng tháng",
    body: "Mỗi tháng hãy quay lại điểm đã duyệt để chụp ảnh báo cáo. Mục “Điểm cần ghé thăm” ở trang chủ nhắc bạn nơi còn thiếu ảnh.",
  },
  {
    title: "Bản đồ & cá nhân hoá",
    body: "Tab Điểm bán có bản đồ toàn bộ điểm. Dùng nút mùa 🌸 để đổi giao diện, và nút ❓ này bất cứ lúc nào để xem lại hướng dẫn.",
  },
];

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function openGuide() {
  // Đang mở rồi thì thôi.
  if (document.getElementById("dp-guide")) return;
  const root = document.getElementById("dp-app") || document.body;

  const wrap = document.createElement("div");
  wrap.className = "dp-guide";
  wrap.id = "dp-guide";
  wrap.innerHTML = `
    <div class="dp-guide-card" role="dialog" aria-label="Hướng dẫn sử dụng">
      <button class="dp-guide-close" data-guide-skip aria-label="Đóng"><i class="fas fa-xmark"></i></button>
      <div class="dp-guide-viewport">
        <div class="dp-guide-track">
          ${STEPS.map(
            (s, i) => `<div class="dp-guide-slide">
              <div class="dp-guide-figure">${ILLUS[i]}</div>
              <h3 class="dp-guide-title">${esc(s.title)}</h3>
              <p class="dp-guide-body">${esc(s.body)}</p>
            </div>`
          ).join("")}
        </div>
      </div>
      <div class="dp-guide-dots">
        ${STEPS.map((_, i) => `<span class="dp-guide-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}
      </div>
      <div class="dp-guide-actions">
        <button type="button" class="dp-btn-outline" data-guide-prev hidden>Trước</button>
        <button type="button" class="dp-btn-primary" data-guide-next>Tiếp</button>
      </div>
    </div>`;
  root.appendChild(wrap);

  const track = wrap.querySelector(".dp-guide-track");
  const dots = Array.from(wrap.querySelectorAll(".dp-guide-dot"));
  const prevBtn = wrap.querySelector("[data-guide-prev]");
  const nextBtn = wrap.querySelector("[data-guide-next]");
  let idx = 0;

  function update() {
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    prevBtn.hidden = idx === 0;
    nextBtn.textContent = idx === STEPS.length - 1 ? "Bắt đầu" : "Tiếp";
  }

  function close() {
    markSeen();
    wrap.remove();
  }

  prevBtn.addEventListener("click", () => {
    if (idx > 0) idx--;
    update();
  });
  nextBtn.addEventListener("click", () => {
    if (idx < STEPS.length - 1) {
      idx++;
      update();
    } else {
      close();
    }
  });
  wrap.querySelector("[data-guide-skip]").addEventListener("click", close);
  // Chạm nền tối (ngoài thẻ) để đóng.
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });

  update();
}

// Tự mở lần đầu (chưa từng xem).
export function maybeShowFirstRun() {
  let seen = "0";
  try {
    seen = localStorage.getItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
  if (!seen) openGuide();
}
