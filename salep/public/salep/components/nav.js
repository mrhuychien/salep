// Khung điều hướng dùng chung: drawer (desktop) + bottom nav (mobile).
import { html, icon } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { ctx } from "../lib/store.js";
import { navigate } from "../lib/router.js";

const TABS = [
  { key: "home", label: "Trang chủ", icon: "home", path: "/" },
  { key: "points", label: "Điểm bán", icon: "storefront", path: "/points" },
  { key: "programs", label: "Chương trình", icon: "campaign", path: "/programs" },
  { key: "profile", label: "Hồ sơ", icon: "person", path: "/profile" },
];

export function renderChrome(root) {
  const initial = (ctx.fullName || "?").trim().slice(0, 1).toUpperCase();
  root.innerHTML = html`
    <aside class="dp-drawer">
      <div class="dp-drawer__brand">RVHG</div>
      <div class="dp-drawer__user">
        <div class="dp-avatar">${esc(initial)}</div>
        <div class="dp-drawer__meta">
          <div class="dp-drawer__name">${esc(ctx.fullName)}</div>
          <div class="dp-drawer__sub">${esc(ctx.distributor || "NVBH")}</div>
        </div>
      </div>
      <nav class="dp-drawer__nav">
        ${TABS.map(
          (t) =>
            `<a class="dp-drawer__item" data-tab="${t.key}" data-path="${t.path}">${icon(t.icon)}<span>${esc(t.label)}</span></a>`
        )}
      </nav>
    </aside>

    <main class="dp-main"><div id="dp-view"></div></main>

    <nav class="dp-bottomnav">
      ${TABS.map(
        (t) =>
          `<button class="dp-bottomnav__item" data-tab="${t.key}" data-path="${t.path}">${icon(
            t.icon
          )}<span class="dp-bottomnav__label">${esc(t.label)}</span></button>`
      )}
    </nav>
  `;

  root.addEventListener("click", (e) => {
    const item = e.target.closest("[data-path]");
    if (item) {
      e.preventDefault();
      navigate(item.dataset.path);
    }
  });
}

export function setActiveTab(key) {
  document.querySelectorAll("[data-tab]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.tab === key);
  });
}

export function setChrome(mode) {
  document.body.classList.toggle("dp-subpage", mode === "subpage");
}

export function viewEl() {
  return document.getElementById("dp-view");
}
