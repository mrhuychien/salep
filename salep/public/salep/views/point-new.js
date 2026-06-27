import { html, icon, on, subHeader, getGeolocation } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { navigate, back } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

export async function render({ container, query }) {
  const next = query && query.next; // 'participation' → đăng ký luôn sau khi tạo
  const gps = { latitude: null, longitude: null, accuracy: null };
  let photoUrl = null;

  container.innerHTML = html`
    ${subHeader("Tạo điểm trưng bày")}
    <form class="dp-page dp-form" id="dp-pointform">
      <section class="dp-fieldset">
        <h2 class="dp-fieldset__title">Thông tin điểm</h2>
        <div class="dp-card dp-card--form">
          <label class="dp-field">
            <span class="dp-field__label">Tên điểm <em>*</em></span>
            <input class="dp-input" name="point_name" required placeholder="Tên cửa hàng/đại lý" />
          </label>
          <label class="dp-field">
            <span class="dp-field__label">Nhà phân phối</span>
            <input class="dp-input dp-input--readonly" value="${esc(ctx.distributor || "(theo hồ sơ NVBH)")}" readonly />
          </label>
          <label class="dp-field">
            <span class="dp-field__label">Số điện thoại <em>*</em></span>
            <input class="dp-input" name="phone" type="tel" required placeholder="09xxxxxxxx" />
            <span class="dp-field__hint">${icon("info", "dp-i14")} Dùng để chống trùng điểm</span>
          </label>
          <label class="dp-field">
            <span class="dp-field__label">Địa chỉ <em>*</em></span>
            <textarea class="dp-input dp-textarea" name="address_line" rows="3" required placeholder="Số nhà, đường, phường/xã..."></textarea>
          </label>
        </div>
      </section>

      <section class="dp-fieldset">
        <h2 class="dp-fieldset__title">Định vị</h2>
        <div class="dp-card dp-card--form">
          <button type="button" class="dp-btn dp-btn--tonal dp-btn--block" data-gps>${icon("my_location")} Lấy vị trí GPS hiện tại</button>
          <div class="dp-gpschip" data-gpschip hidden></div>
        </div>
      </section>

      <section class="dp-fieldset">
        <h2 class="dp-fieldset__title">Ảnh cửa hàng <em class="dp-req">*</em></h2>
        <div class="dp-card dp-card--form">
          <button type="button" class="dp-uploader" data-shot>
            <span class="dp-uploader__icon">${icon("photo_camera")}</span>
            <span class="dp-uploader__text">Chụp ảnh mặt tiền cửa hàng</span>
          </button>
          <input type="file" accept="image/*" capture="environment" hidden data-file />
        </div>
      </section>

      <section class="dp-fieldset">
        <h2 class="dp-fieldset__title">Tài khoản nhận thưởng</h2>
        <div class="dp-card dp-card--form">
          <label class="dp-field">
            <span class="dp-field__label">Tên chủ tài khoản</span>
            <input class="dp-input dp-uppercase" name="bank_account_name" placeholder="NGUYEN VAN A" />
          </label>
          <label class="dp-field">
            <span class="dp-field__label">Số tài khoản</span>
            <input class="dp-input" name="bank_account_no" inputmode="numeric" placeholder="Nhập số tài khoản" />
          </label>
          <label class="dp-field">
            <span class="dp-field__label">Ngân hàng</span>
            <select class="dp-input dp-select" name="bank_name">
              <option value="">Chọn ngân hàng</option>
              ${BANKS.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join("")}
            </select>
          </label>
        </div>
      </section>
    </form>

    <div class="dp-actionbar">
      <button class="dp-btn dp-btn--primary dp-btn--block" data-submit>Lưu điểm bán</button>
    </div>
  `;

  const form = container.querySelector("#dp-pointform");
  const gpsChip = container.querySelector("[data-gpschip]");
  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");

  on(container, "click", "[data-back]", () => back());

  container.querySelector("[data-gps]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const pos = await getGeolocation();
      Object.assign(gps, pos);
      gpsChip.hidden = false;
      const warn = pos.accuracy > 100 ? ` · ⚠ sai số ${Math.round(pos.accuracy)}m` : "";
      gpsChip.innerHTML = `${icon("pin_drop", "dp-i18")}<span>${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(
        6
      )}${warn}</span>${icon("check_circle", "dp-i18 dp-ok")}`;
    } catch (err) {
      toastError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  uploader.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploader.classList.add("is-loading");
    try {
      const res = await uploadFile(file, { fieldname: "store_photo" });
      photoUrl = res.file_url;
      uploader.innerHTML = `<img class="dp-uploader__preview" src="${esc(photoUrl)}" alt=""><span class="dp-uploader__text">${icon(
        "check_circle",
        "dp-ok"
      )} Đã chọn ảnh — chạm để đổi</span>`;
    } catch (err) {
      toastError(err.message);
    } finally {
      uploader.classList.remove("is-loading");
    }
  });

  container.querySelector("[data-submit]").addEventListener("click", async (e) => {
    if (!form.reportValidity()) return;
    if (!photoUrl) return toast("Cần chụp ảnh cửa hàng", "error");
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Đang lưu...";
    const fd = new FormData(form);
    try {
      const created = await call("salep.api.point.create_point", {
        point_name: fd.get("point_name"),
        phone: fd.get("phone"),
        address_line: fd.get("address_line"),
        store_photo: photoUrl,
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy: gps.accuracy,
        bank_account_name: fd.get("bank_account_name"),
        bank_account_no: fd.get("bank_account_no"),
        bank_name: fd.get("bank_name"),
      });
      toastSuccess("Đã tạo điểm bán");
      if (next === "participation") {
        navigate(`/participations/new?point=${encodeURIComponent(created.name)}`);
      } else {
        navigate("/points");
      }
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
      btn.textContent = "Lưu điểm bán";
    }
  });
}
