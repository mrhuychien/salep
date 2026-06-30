import { html, icon, getGeolocation } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

export async function render({ container, query }) {
  const next = query && query.next;
  const gps = { latitude: null, longitude: null, accuracy: null };
  let photoUrl = null;

  container.innerHTML = html`
    <form class="dp-form-pad" id="dp-pointform">
      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Thông tin điểm</div>
        <div class="dp-card">
          <div class="dp-field">
            <label class="dp-field-label">Tên điểm <em>*</em></label>
            <input class="dp-input" name="point_name" required placeholder="Tên cửa hàng / đại lý" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Nhà phân phối</label>
            <input class="dp-input dp-input--readonly" value="${esc(ctx.distributor || "(theo hồ sơ NVBH)")}" readonly />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Số điện thoại <em>*</em></label>
            <input class="dp-input" name="phone" type="tel" required placeholder="09xxxxxxxx" />
            <span class="dp-field-hint">${icon("circle-info")} Dùng để chống trùng điểm</span>
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Địa chỉ <em>*</em></label>
            <textarea class="dp-textarea" name="address_line" required placeholder="Số nhà, đường, phường/xã..."></textarea>
          </div>
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Định vị</div>
        <div class="dp-card">
          <button type="button" class="dp-btn-outline" data-gps>${icon("location-crosshairs")} Lấy vị trí GPS hiện tại</button>
          <div class="dp-gps-chip" data-gpschip hidden></div>
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Ảnh cửa hàng <em class="dp-req">*</em></div>
        <button type="button" class="dp-uploader" data-shot>
          <span class="dp-uploader-icon">${icon("camera")}</span>
          <span class="dp-uploader-text">Chụp ảnh mặt tiền cửa hàng</span>
        </button>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Tài khoản nhận thưởng</div>
        <div class="dp-card">
          <div class="dp-field">
            <label class="dp-field-label">Tên chủ tài khoản</label>
            <input class="dp-input dp-uppercase" name="bank_account_name" placeholder="NGUYEN VAN A" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Số tài khoản</label>
            <input class="dp-input" name="bank_account_no" inputmode="numeric" placeholder="Nhập số tài khoản" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Ngân hàng</label>
            <select class="dp-select" name="bank_name">
              <option value="">Chọn ngân hàng</option>
              ${BANKS.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </form>

    <div class="dp-actionbar">
      <button class="dp-btn-primary" data-submit>${icon("floppy-disk")} Lưu điểm bán</button>
    </div>
  `;

  const form = container.querySelector("#dp-pointform");
  const gpsChip = container.querySelector("[data-gpschip]");
  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");

  container.querySelector("[data-gps]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const pos = await getGeolocation();
      Object.assign(gps, pos);
      gpsChip.hidden = false;
      gpsChip.classList.add("is-ok");
      const warn = pos.accuracy > 100 ? ` · ⚠ ${Math.round(pos.accuracy)}m` : "";
      gpsChip.innerHTML = `${icon("location-dot")}<span>${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}${warn}</span>${icon(
        "circle-check",
        "dp-ok"
      )}`;
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
      uploader.innerHTML = `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt=""><span class="dp-uploader-text">${icon(
        "circle-check",
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
    btn.innerHTML = "Đang lưu...";
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
      navigate(next === "participation" ? `/participations/new?point=${encodeURIComponent(created.name)}` : "/points");
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
      btn.innerHTML = "Lưu điểm bán";
    }
  });
}
