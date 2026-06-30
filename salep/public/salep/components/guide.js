// Hướng dẫn sử dụng trực quan: slideshow nhiều bước.
// - Tự mở lần đăng nhập đầu (cờ localStorage dp_guide_seen).
// - Mở lại bất cứ lúc nào qua nút ❓ trên header (data-help).
import { esc } from "../lib/format.js";

const SEEN_KEY = "dp_guide_seen";

const STEPS = [
  {
    emoji: "👋",
    title: "Chào mừng đến Điểm Trưng Bày",
    body: "Ứng dụng giúp bạn quản lý điểm bán và đăng ký các chương trình trưng bày ngay trên điện thoại.",
  },
  {
    emoji: "📊",
    title: "Trang chủ — 4 thống kê",
    body: "Xem nhanh số điểm bán của bạn, điểm tham gia chương trình, đang chờ duyệt và đã duyệt. Chạm vào từng ô để mở danh sách tương ứng.",
  },
  {
    emoji: "🏪",
    title: "Tạo điểm bán",
    body: "Nhấn nút + để thêm điểm trưng bày: nhập số điện thoại (chống trùng), lấy GPS và chụp ảnh cửa hàng. SĐT đã có sẽ tự chuyển sang đăng ký chương trình.",
  },
  {
    emoji: "📣",
    title: "Đăng ký chương trình",
    body: "Chọn điểm bán, chọn chương trình đang chạy rồi chụp ảnh trưng bày. Ảnh tự động gắn GPS + thời gian và được nén tối ưu trước khi tải lên.",
  },
  {
    emoji: "📷",
    title: "Báo cáo hàng tháng",
    body: "Mỗi tháng hãy quay lại điểm đã duyệt để chụp ảnh báo cáo. Mục “Điểm cần ghé thăm” ở trang chủ nhắc bạn nơi còn thiếu ảnh.",
  },
  {
    emoji: "🗺️",
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
            (s) => `<div class="dp-guide-slide">
              <div class="dp-guide-emoji">${s.emoji}</div>
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
