import { html, icon, getGeolocation, emptyState } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { renderMap } from "../lib/map.js";
import { setHeaderTitle } from "../components/nav.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

export async function render({ container, params }) {
  const name = params.name;
  let doc;
  try {
    doc = await call("salep.api.portal.get_point", { name });
  } catch (e) {
    container.innerHTML = emptyState("Không tải được điểm bán", "⚠️", e.message);
    return;
  }
  if (doc.point_name) setHeaderTitle(doc.point_name);

  const gps = { latitude: doc.latitude, longitude: doc.longitude, accuracy: doc.gps_accuracy };
  let photoUrl = doc.store_photo;
  const hasGps = gps.latitude != null && gps.longitude != null;

  container.innerHTML = html`
    <div class="dp-form-pad">
      <div class="dp-map" id="dp-map"></div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Thông tin điểm</div>
        <div class="dp-card">
          <div class="dp-field">
            <label class="dp-field-label">Tên điểm <em>*</em></label>
            <input class="dp-input" name="point_name" required value="${esc(doc.point_name || "")}" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Nhà phân phối</label>
            <input class="dp-input dp-input--readonly" value="${esc(doc.distributor || "")}" readonly />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Số điện thoại <em>*</em></label>
            <input class="dp-input" name="phone" type="tel" required value="${esc(doc.phone || "")}" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Mã số thuế</label>
            <input class="dp-input" name="tax_code" inputmode="numeric" value="${esc(doc.tax_code || "")}" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Địa chỉ <em>*</em></label>
            <textarea class="dp-textarea" name="address_line" required>${esc(doc.address_line || "")}</textarea>
          </div>
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Định vị</div>
        <div class="dp-card">
          <button type="button" class="dp-btn-outline" data-gps>${icon("location-crosshairs")} Cập nhật vị trí GPS</button>
          <div class="dp-gps-chip${hasGps ? " is-ok" : ""}" data-gpschip>${icon("location-dot")}<span data-gpstext>${
    hasGps ? `${Number(gps.latitude).toFixed(6)}, ${Number(gps.longitude).toFixed(6)}` : "Chưa có GPS"
  }</span></div>
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Ảnh cửa hàng</div>
        <button type="button" class="dp-uploader" data-shot>
          ${
            photoUrl
              ? `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt="">`
              : `<span class="dp-uploader-icon">${icon("camera")}</span><span class="dp-uploader-text">Chụp ảnh</span>`
          }
        </button>
        <span class="dp-field-hint">${icon("camera")} Chạm ảnh để chụp lại</span>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Tài khoản nhận thưởng</div>
        <div class="dp-card">
          <div class="dp-field">
            <label class="dp-field-label">Tên chủ tài khoản</label>
            <input class="dp-input dp-uppercase" name="bank_account_name" value="${esc(doc.bank_account_name || "")}" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Số tài khoản</label>
            <input class="dp-input" name="bank_account_no" inputmode="numeric" value="${esc(doc.bank_account_no || "")}" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Ngân hàng</label>
            <select class="dp-select" name="bank_name">
              <option value="">Chọn ngân hàng</option>
              ${BANKS.map(
                (b) => `<option value="${esc(b)}"${doc.bank_name === b ? " selected" : ""}>${esc(b)}</option>`
              ).join("")}
            </select>
          </div>
        </div>
      </div>

      <button type="button" class="dp-btn-outline" data-go="/participations/new?point=${encodeURIComponent(name)}">${icon(
        "circle-plus"
      )} Đăng ký tham gia chương trình</button>
    </div>

    <div class="dp-actionbar">
      <button class="dp-btn-primary" data-save>${icon("floppy-disk")} Lưu thay đổi</button>
    </div>
  `;

  const form = container;
  const gpsChip = container.querySelector("[data-gpschip]");
  const gpsText = container.querySelector("[data-gpstext]");
  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");

  renderMap(container.querySelector("#dp-map"), [
    { lat: gps.latitude, lng: gps.longitude, title: doc.point_name, sub: doc.phone },
  ]);

  container.querySelector("[data-gps]").addEventListener("click", async () => {
    try {
      const pos = await getGeolocation();
      Object.assign(gps, pos);
      gpsChip.classList.add("is-ok");
      const warn = pos.accuracy > 100 ? ` · ⚠ ${Math.round(pos.accuracy)}m` : "";
      gpsText.textContent = `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}${warn}`;
    } catch (err) {
      toastError(err.message);
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
      uploader.innerHTML = `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt="">`;
    } catch (err) {
      toastError(err.message);
    } finally {
      uploader.classList.remove("is-loading");
    }
  });

  container.querySelector("[data-save]").addEventListener("click", async (e) => {
    const get = (n) => (form.querySelector(`[name="${n}"]`).value || "").trim();
    if (!get("point_name") || !get("phone") || !get("address_line")) {
      return toast("Cần điền tên, SĐT và địa chỉ", "error");
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = "Đang lưu...";
    try {
      await call("salep.api.point.update_point", {
        name,
        point_name: get("point_name"),
        phone: get("phone"),
        tax_code: get("tax_code"),
        address_line: get("address_line"),
        store_photo: photoUrl,
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy: gps.accuracy,
        bank_account_name: get("bank_account_name"),
        bank_account_no: get("bank_account_no"),
        bank_name: get("bank_name"),
      });
      toastSuccess("Đã lưu điểm bán");
      navigate("/points");
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
      btn.innerHTML = `${icon("floppy-disk")} Lưu thay đổi`;
    }
  });
}
