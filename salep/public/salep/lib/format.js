// Format + escape tập trung.

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
export const esc = escapeHtml;

function pad(n) {
  return String(n).padStart(2, "0");
}

// "dd/mm/yyyy"
export function formatDate(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (isNaN(d)) return String(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// "hh:mm dd/mm"
export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (isNaN(d)) return String(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatNumber(n) {
  return Math.round(Number(n) || 0).toLocaleString("vi-VN");
}

export function formatVND(n) {
  return formatNumber(n) + "₫";
}

// Trạng thái workflow → nhãn + class badge + icon. Khớp doc/04.
export const STATES = {
  "Nháp": { cls: "dp-badge--draft", icon: "edit_note" },
  "Chờ duyệt": { cls: "dp-badge--pending", icon: "pending" },
  "Đã duyệt": { cls: "dp-badge--approved", icon: "check_circle" },
  "Từ chối": { cls: "dp-badge--rejected", icon: "cancel" },
};

export function statusBadge(state) {
  const s = STATES[state] || { cls: "dp-badge--draft", icon: "help" };
  return `<span class="dp-badge ${s.cls}">${esc(state || "—")}</span>`;
}

export function statusMeta(state) {
  return STATES[state] || { cls: "dp-badge--draft", icon: "help" };
}
