import { html, icon, getGeolocation } from "../lib/dom.js";
import { esc, formatDateTime } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

export async function render({ container }) {
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
        <span class="dp-field-hint">${icon(
          "circle-info"
        )} Tự động lấy GPS + thời gian khi chụp, ảnh được nén tối ưu trước khi tải lên.</span>
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
      <button class="dp-btn-primary" data-submit>${icon("floppy-disk")} Lưu & đăng ký chương trình</button>
    </div>
  `;

  const form = container.querySelector("#dp-pointform");
  const gpsChip = container.querySelector("[data-gpschip]");
  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");

  // Tem GPS + thời gian; dùng chung cho nút GPS thủ công và lúc chụp ảnh.
  let capturedAt = null;
  function refreshGpsChip() {
    if (gps.latitude == null && !capturedAt) {
      gpsChip.hidden = true;
      return;
    }
    gpsChip.hidden = false;
    gpsChip.classList.toggle("is-ok", gps.latitude != null);
    const parts = [];
    if (capturedAt) parts.push(formatDateTime(capturedAt));
    if (gps.latitude != null) {
      const warn = gps.accuracy > 100 ? ` ⚠${Math.round(gps.accuracy)}m` : "";
      parts.push(`${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}${warn}`);
    } else {
      parts.push("chưa có GPS");
    }
    gpsChip.innerHTML = `${icon("location-dot")}<span>${esc(parts.join(" · "))}</span>${
      gps.latitude != null ? icon("circle-check", "dp-ok") : ""
    }`;
  }

  container.querySelector("[data-gps]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      Object.assign(gps, await getGeolocation()); // gọi = xin quyền nếu chưa cấp
      if (!capturedAt) capturedAt = new Date();
      refreshGpsChip();
    } catch (err) {
      toastError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // Bấm chụp: xin quyền + lấy GPS NGAY trong cử chỉ bấm (prompt dễ hiện trên mobile).
  let gpsPromise = null;
  uploader.addEventListener("click", () => {
    gpsPromise = getGeolocation().catch(() => null);
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploader.classList.add("is-loading");
    try {
      const res = await uploadFile(file, { fieldname: "store_photo" }); // resizeImage chạy bên trong
      photoUrl = res.file_url;
      const pos = (await gpsPromise) || {};
      if (pos.latitude != null) Object.assign(gps, pos);
      capturedAt = new Date();
      if (gps.latitude == null)
        toast("Chưa lấy được GPS — bấm “Lấy vị trí GPS hiện tại” (cần HTTPS + cho phép định vị)", "warning");
      refreshGpsChip();
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

  const submitLabel = `${icon("floppy-disk")} Lưu & đăng ký`;
  const register = (pt) => `/participations/new?point=${encodeURIComponent(pt)}`;
  const reset = (btn) => {
    btn.disabled = false;
    btn.innerHTML = submitLabel;
  };

  container.querySelector("[data-submit]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const phone = (form.querySelector('[name="phone"]').value || "").trim();
    if (!phone) {
      form.reportValidity();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = "Đang kiểm tra...";

    // 1) SĐT đã có điểm? → bỏ qua tạo mới, chuyển sang đăng ký với điểm đó.
    try {
      const existing = await call("salep.api.point.point_by_phone", { phone });
      if (existing) {
        if (existing.owned) {
          toastSuccess("Điểm đã tồn tại — chuyển sang đăng ký chương trình");
          return navigate(register(existing.name));
        }
        toastError("SĐT này đã thuộc điểm của nhân viên khác");
        return reset(btn);
      }
    } catch (err) {
      toastError(err.message);
      return reset(btn);
    }

    // 2) Tạo điểm mới (cần đủ thông tin + ảnh).
    if (!form.reportValidity()) return reset(btn);
    if (!photoUrl) {
      toast("Cần chụp ảnh cửa hàng", "error");
      return reset(btn);
    }

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
      toastSuccess("Đã tạo điểm — chuyển sang đăng ký chương trình");
      navigate(register(created.name));
    } catch (err) {
      toastError(err.message);
      reset(btn);
    }
  });
}
