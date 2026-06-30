// Toast góc trên-phải, viền trái màu trạng thái (design-system 8.12).
const TYPE_CLASS = { success: "dp-success", error: "dp-error", warning: "dp-warning" };

export function toast(message, type = "info", ms = 3500) {
  const host = document.getElementById("dp-toast-mount");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "dp-toast" + (TYPE_CLASS[type] ? " " + TYPE_CLASS[type] : "");
  el.textContent = message; // textContent → an toàn, không cần escape
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 250);
  }, ms);
}

export const toastError = (m) => toast(m, "error", 4800);
export const toastSuccess = (m) => toast(m, "success");
