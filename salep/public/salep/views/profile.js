import { html, icon } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

function field(label, nameAttr, value, opts = {}) {
  return `<div class="dp-field">
    <label class="dp-field-label">${esc(label)}</label>
    <input class="dp-input ${opts.readonly ? "dp-input--readonly" : ""} ${opts.upper ? "dp-uppercase" : ""}"
      name="${nameAttr}" ${opts.readonly ? "readonly" : ""} ${opts.type ? `type="${opts.type}"` : ""}
      value="${esc(value || "")}" placeholder="${esc(opts.placeholder || "")}" />
  </div>`;
}

export async function render({ container }) {
  let p = null;
  try {
    p = await call("salep.api.profile.get_my_profile");
  } catch (e) {
    toastError(e.message);
  }
  const isNew = !p;
  const initial = (ctx.fullName || "?").trim().charAt(0).toUpperCase();

  container.innerHTML = html`
    <div class="dp-profile-head">
      <div class="dp-avatar">${esc(initial)}</div>
      <div class="dp-profile-name">${esc((p && p.full_name) || ctx.fullName)}</div>
      <div class="dp-profile-id">${esc((p && p.name) || ctx.user)}</div>
    </div>

    ${isNew ? `<div class="dp-note">${icon("circle-info")} Bạn chưa có hồ sơ NVBH. Nhập thông tin và chọn NPP để tạo.</div>` : ""}

    <form id="dp-profile">
      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Thông tin cá nhân</div>
        <div class="dp-card">
          ${field("Họ tên", "full_name", (p && p.full_name) || ctx.fullName)}
          ${field("Số điện thoại", "phone", p && p.phone, { type: "tel" })}
          ${field("CCCD", "cccd", p && p.cccd)}
          ${
            isNew
              ? field("NPP trực thuộc (mã Customer)", "distributor", ctx.distributor, { placeholder: "VD: CUST-0001" })
              : field("NPP trực thuộc", "distributor", p.distributor, { readonly: true })
          }
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Tài khoản ngân hàng</div>
        <div class="dp-card">
          ${field("Tên chủ TK", "bank_account_name", p && p.bank_account_name, { upper: true })}
          ${field("Số tài khoản", "bank_account_no", p && p.bank_account_no)}
          <div class="dp-field">
            <label class="dp-field-label">Ngân hàng</label>
            <select class="dp-select" name="bank_name">
              <option value="">Chọn ngân hàng</option>
              ${BANKS.map(
                (b) => `<option value="${esc(b)}"${p && p.bank_name === b ? " selected" : ""}>${esc(b)}</option>`
              ).join("")}
            </select>
          </div>
        </div>
      </div>

      <button class="dp-btn-primary" data-save>${icon("floppy-disk")} ${isNew ? "Tạo hồ sơ" : "Lưu thay đổi"}</button>
      <button type="button" class="dp-btn-outline dp-mt" data-logout>${icon("right-from-bracket")} Đăng xuất</button>
    </form>
  `;

  const form = container.querySelector("#dp-profile");

  container.querySelector("[data-save]").addEventListener("click", async (e) => {
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
    if (!args.full_name || !args.phone) return toastError("Cần nhập họ tên và SĐT");
    if (isNew && !args.distributor) return toastError("Cần nhập NPP trực thuộc");

    const btn = e.currentTarget;
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
}
