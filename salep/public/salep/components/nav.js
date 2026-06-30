// Khung điều hướng + chrome: header glass, bottom-nav, season picker, account menu.
import { esc } from "../lib/format.js";
import { ctx } from "../lib/store.js";
import { navigate, back } from "../lib/router.js";
import { openGuide, maybeShowFirstRun } from "./guide.js";

const TABS = [
  { key: "home", label: "Trang chủ", icon: "house", path: "/" },
  { key: "points", label: "Điểm bán", icon: "store", path: "/points" },
  { key: "programs", label: "Chương trình", icon: "bullhorn", path: "/programs" },
  { key: "profile", label: "Hồ sơ", icon: "circle-user", path: "/profile" },
];

const SEASONS = [
  { key: "spring", label: "Xuân", emoji: "🌸" },
  { key: "summer", label: "Hạ", emoji: "☀️" },
  { key: "autumn", label: "Thu", emoji: "🍂" },
  { key: "winter", label: "Đông", emoji: "❄️" },
];

function autoSeason() {
  const m = new Date().getMonth() + 1; // lịch VN
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}
function currentSeason() {
  try {
    return localStorage.getItem("dp_season") || autoSeason();
  } catch {
    return autoSeason();
  }
}
export function applySeason(season) {
  const app = document.getElementById("dp-app");
  SEASONS.forEach((s) => app.classList.toggle(`dp-${s.key}`, s.key === season));
  try {
    localStorage.setItem("dp_season", season);
  } catch {
    /* ignore */
  }
  const emoji = document.getElementById("dp-season-emoji");
  if (emoji) emoji.textContent = (SEASONS.find((s) => s.key === season) || SEASONS[0]).emoji;
}

export function renderChrome(root) {
  root.innerHTML = `
    <header class="dp-header">
      <div class="dp-header-inner">
        <button class="dp-icon-btn" data-back hidden aria-label="Quay lại"><i class="fas fa-arrow-left"></i></button>
        <h1 class="dp-header-title" id="dp-header-title">Điểm Trưng Bày</h1>
        <div class="dp-header-actions">
          <button class="dp-icon-btn" data-help aria-label="Hướng dẫn"><i class="fas fa-circle-question"></i></button>
          <button class="dp-icon-btn" data-refresh aria-label="Làm mới"><i class="fas fa-rotate-right"></i></button>
          <button class="dp-icon-btn" data-season aria-label="Đổi mùa"><span class="dp-season-icon" id="dp-season-emoji">🌸</span></button>
          <button class="dp-icon-btn" data-acct aria-label="Tài khoản"><i class="fas fa-circle-user"></i></button>
        </div>
      </div>
    </header>

    <main class="dp-main" id="dp-view"></main>

    <nav class="dp-bottom-nav">
      ${TABS.map(
        (t) =>
          `<button class="dp-nav-item" data-tab="${t.key}" data-go="${t.path}"><span class="dp-nav-icon"><i class="fas fa-${t.icon}"></i></span><span class="dp-nav-label">${esc(
            t.label
          )}</span></button>`
      ).join("")}
    </nav>

    <div class="dp-acct-menu" id="dp-acct-menu" hidden>
      <div class="dp-acct-name">${esc(ctx.fullName)}</div>
      <div class="dp-acct-sub">${esc(ctx.distributor || ctx.user)}</div>
      <button class="dp-acct-logout" data-logout><i class="fas fa-right-from-bracket"></i> Đăng xuất</button>
    </div>

    <div class="dp-lightbox" id="dp-lightbox" hidden>
      <img id="dp-lightbox-img" alt="">
      <div class="dp-lightbox-cap" id="dp-lightbox-cap"></div>
    </div>
    <div class="dp-modal-mount" id="dp-modal-mount"></div>
    <div class="dp-toast-mount" id="dp-toast-mount"></div>
  `;

  applySeason(currentSeason());
  root.addEventListener("click", onClick);
  // SPA xử lý form bằng JS — chặn mọi native submit (tránh reload mất hash).
  root.addEventListener("submit", (e) => e.preventDefault());
  // Lần đăng nhập đầu → mở hướng dẫn trực quan.
  maybeShowFirstRun();
}

function onClick(e) {
  if (e.target.closest("input, textarea, select, label")) return;
  const t = e.target;
  if (t.closest("#dp-lightbox")) {
    closeLightbox();
    return;
  }
  const zoom = t.closest("[data-zoom]");
  if (zoom) {
    e.preventDefault();
    openLightbox(zoom.dataset.zoom, zoom.dataset.caption || "");
    return;
  }
  if (t.closest("[data-back]")) {
    e.preventDefault();
    back();
    return;
  }
  if (t.closest("[data-help]")) {
    e.preventDefault();
    openGuide();
    return;
  }
  if (t.closest("[data-refresh]")) {
    e.preventDefault();
    navigate(location.hash.slice(1) || "/");
    return;
  }
  if (t.closest("[data-season]")) {
    e.preventDefault();
    openSeasonModal();
    return;
  }
  if (t.closest("[data-acct]")) {
    e.preventDefault();
    const m = document.getElementById("dp-acct-menu");
    m.hidden = !m.hidden;
    return;
  }
  if (t.closest("[data-logout]")) {
    e.preventDefault();
    logout();
    return;
  }
  const go = t.closest("[data-go]");
  if (go) {
    e.preventDefault();
    closeAcct();
    navigate(go.dataset.go);
    return;
  }
  if (!t.closest("#dp-acct-menu")) closeAcct();
}

function closeAcct() {
  const m = document.getElementById("dp-acct-menu");
  if (m) m.hidden = true;
}

async function logout() {
  try {
    await fetch("/api/method/logout", {
      method: "POST",
      headers: { "X-Frappe-CSRF-Token": ctx.csrfToken || "" },
      credentials: "same-origin",
    });
  } catch {
    /* ignore */
  }
  window.location.href = "/login";
}

function openSeasonModal() {
  const mount = document.getElementById("dp-modal-mount");
  const cur = currentSeason();
  mount.innerHTML = `
    <div class="dp-modal-content">
      <h3 class="dp-modal-title">Chọn mùa giao diện</h3>
      <div class="dp-season-grid">
        ${SEASONS.map(
          (s) =>
            `<button class="dp-season-opt${s.key === cur ? " is-active" : ""}" data-season-pick="${s.key}"><span>${
              s.emoji
            }</span>${s.label}</button>`
        ).join("")}
      </div>
    </div>`;
  mount.classList.add("dp-show");
  mount.onclick = (e) => {
    const pick = e.target.closest("[data-season-pick]");
    if (pick) {
      applySeason(pick.dataset.seasonPick);
      closeModal();
    } else if (e.target === mount) {
      closeModal();
    }
  };
}
function closeModal() {
  const mount = document.getElementById("dp-modal-mount");
  if (!mount) return;
  mount.classList.remove("dp-show");
  mount.innerHTML = "";
}

function openLightbox(url, caption) {
  if (!url) return;
  document.getElementById("dp-lightbox-img").src = url;
  document.getElementById("dp-lightbox-cap").textContent = caption || "";
  document.getElementById("dp-lightbox").hidden = false;
}
function closeLightbox() {
  const l = document.getElementById("dp-lightbox");
  if (l) l.hidden = true;
}

export function setHeader(title, showBack) {
  const t = document.getElementById("dp-header-title");
  const b = document.querySelector("[data-back]");
  if (t && title != null) t.textContent = title;
  if (b) b.hidden = !showBack;
}
export function setHeaderTitle(title) {
  const t = document.getElementById("dp-header-title");
  if (t) t.textContent = title;
}

export function setActiveTab(key) {
  document.querySelectorAll("[data-tab]").forEach((el) => {
    el.classList.toggle("dp-active", el.dataset.tab === key);
  });
}

export function setChrome(mode) {
  document.body.classList.toggle("dp-subpage", mode === "subpage");
}

export function viewEl() {
  return document.getElementById("dp-view");
}
