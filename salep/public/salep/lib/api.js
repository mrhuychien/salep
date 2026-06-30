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

// Resize + nén ảnh phía client trước khi upload (tiết kiệm dung lượng/băng thông).
// Ảnh > maxDim sẽ thu nhỏ; mọi ảnh tái mã hoá JPEG quality ~0.8. Lỗi → giữ file gốc.
async function resizeImage(file, maxDim = 1280, quality = 0.8) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // không nhỏ hơn thì giữ gốc
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], base + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Upload ảnh (chụp từ camera). Trả {file_url, ...}. is_private=0 để portal hiển thị.
export async function uploadFile(file, { doctype, docname, fieldname } = {}) {
  file = await resizeImage(file);
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
