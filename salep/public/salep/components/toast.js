import { esc } from "../lib/format.js";

let host;
function ensureHost() {
  if (!host) {
    host = document.createElement("div");
    host.className = "dp-toast-host";
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message, type = "info", ms = 3200) {
  const h = ensureHost();
  const el = document.createElement("div");
  el.className = `dp-toast dp-toast--${type}`;
  const ic = type === "error" ? "error" : type === "success" ? "check_circle" : "info";
  el.innerHTML = `<span class="material-symbols-outlined">${ic}</span><span>${esc(message)}</span>`;
  h.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-show"));
  setTimeout(() => {
    el.classList.remove("is-show");
    setTimeout(() => el.remove(), 250);
  }, ms);
}

export const toastError = (m) => toast(m, "error", 4800);
export const toastSuccess = (m) => toast(m, "success");
