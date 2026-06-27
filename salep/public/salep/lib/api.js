// Wrap frappe whitelisted method calls + file upload. Luôn gửi CSRF token.
import { ctx } from "./store.js";

function serverMessage(data) {
  try {
    if (data && data._server_messages) {
      const arr = JSON.parse(data._server_messages);
      return arr
        .map((m) => {
          try {
            return JSON.parse(m).message;
          } catch {
            return m;
          }
        })
        .join("\n");
    }
  } catch {
    /* ignore */
  }
  if (data && data.exception) return String(data.exception).replace(/^\w+Error:\s*/, "");
  return null;
}

export async function call(method, args = {}) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": ctx.csrfToken || "",
      "X-Requested-With": "XMLHttpRequest",
    },
    credentials: "same-origin",
    body: JSON.stringify(args),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    throw new Error(serverMessage(data) || `Lỗi máy chủ (${res.status})`);
  }
  return data.message;
}

// Upload ảnh (chụp từ camera). Trả {file_url, ...}. is_private=0 để portal hiển thị.
export async function uploadFile(file, { doctype, docname, fieldname } = {}) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");
  fd.append("is_private", "0");
  fd.append("folder", "Home");
  if (doctype) fd.append("doctype", doctype);
  if (docname) fd.append("docname", docname);
  if (fieldname) fd.append("fieldname", fieldname);

  const res = await fetch("/api/method/upload_file", {
    method: "POST",
    headers: { "X-Frappe-CSRF-Token": ctx.csrfToken || "" },
    credentials: "same-origin",
    body: fd,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error(serverMessage(data) || "Tải ảnh thất bại");
  return data.message;
}
