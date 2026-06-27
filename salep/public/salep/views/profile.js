import { html, icon, on } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

function field(label, name, value, opts = {}) {
  const attrs = `name="${name}" ${opts.readonly ? "readonly" : ""} ${opts.type ? `type="${opts.type}"` : ""} ${
    opts.cls || ""
  }`;
  return `<label class="dp-field">
    <span class="dp-field__label">${esc(label)}</span>
    <input class="dp-input ${opts.readonly ? "dp-input--readonly" : ""} ${opts.upper ? "dp-uppercase" : ""}" ${attrs} value="${esc(
    value || ""
  )}" placeholder="${esc(opts.placeholder || "")}" />
  </label>`;
}

export async function render({ container }) {
  let p = null;
  try {
    p = await call("salep.api.profile.get_my_profile");
  } catch (e) {
    toastError(e.message);
  }
  const isNew = !p;
  const initial = (ctx.fullName || "?").trim().slice(0, 1).toUpperCase();

  container.innerHTML = html`
    <header class="dp-topbar dp-topbar--list"><h1 class="dp-topbar__name">Hồ sơ của tôi</h1></header>
    <form class="dp-page dp-form" id="dp-profile">
      <section class="dp-profilehead">
        <div class="dp-avatar dp-avatar--lg">${esc(initial)}</div>
        <h2 class="dp-profilehead__name">${esc((p && p.full_name) || ctx.fullName)}</h2>
        <p class="dp-profilehead__id">${esc((p && p.name) || ctx.user)}</p>
      </section>

      ${
        isNew
          ? `<div class="dp-note">${icon("info")} Bạn chưa có hồ sơ NVBH. Nhập thông tin và chọn NPP để tạo.</div>`
          : ""
      }

      <section class="dp-fieldset">
        <h3 class="dp-fieldset__title dp-fieldset__title--primary">Thông tin cá nhân</h3>
        <div class="dp-card dp-card--form">
          ${field("Họ tên", "full_name", (p && p.full_name) || ctx.fullName)}
          ${field("Số điện thoại", "phone", p && p.phone, { type: "tel" })}
          ${field("CCCD", "cccd", p && p.cccd)}
          ${
            isNew
              ? field("NPP trực thuộc (mã Customer)", "distributor", ctx.distributor, {
                  placeholder: "VD: CUST-0001",
                })
              : field("NPP trực thuộc", "distributor", p.distributor, { readonly: true })
          }
        </div>
      </section>

      <section class="dp-fieldset">
        <h3 class="dp-fieldset__title dp-fieldset__title--primary">Tài khoản ngân hàng</h3>
        <div class="dp-card dp-card--form">
          ${field("Tên chủ TK", "bank_account_name", p && p.bank_account_name, { upper: true })}
          ${field("Số tài khoản", "bank_account_no", p && p.bank_account_no)}
          <label class="dp-field">
            <span class="dp-field__label">Ngân hàng</span>
            <select class="dp-input dp-select" name="bank_name">
              <option value="">Chọn ngân hàng</option>
              ${BANKS.map(
                (b) => `<option value="${esc(b)}"${p && p.bank_name === b ? " selected" : ""}>${esc(b)}</option>`
              ).join("")}
            </select>
          </label>
        </div>
      </section>

      <div class="dp-form__actions">
        <button class="dp-btn dp-btn--primary dp-btn--block" data-save>${isNew ? "Tạo hồ sơ" : "Lưu thay đổi"}</button>
        <button type="button" class="dp-btn dp-btn--ghost-danger dp-btn--block" data-logout>Đăng xuất</button>
      </div>
    </form>
  `;

  const form = container.querySelector("#dp-profile");

  on(container, "click", "[data-save]", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const args = {
      full_name: fd.get("full_name"),
      phone: fd.get("phone"),
      cccd: fd.get("cccd"),
      bank_account_name: fd.get("bank_account_name"),
      bank_account_no: fd.get("bank_account_no"),
      bank_name: fd.get("bank_name"),
    };
    if (isNew) args.distributor = fd.get("distributor");
    if (isNew && !args.distributor) return toastError("Cần nhập NPP trực thuộc");

    const btn = e.target.closest("[data-save]");
    btn.disabled = true;
    try {
      await call("salep.api.profile.upsert_my_profile", args);
      toastSuccess("Đã lưu hồ sơ");
      render({ container });
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
    }
  });

  on(container, "click", "[data-logout]", async () => {
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
  });
}
