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
  // Xin quyền định vị NGAY khi mở form — prompt hiện rõ trên form, không bị
  // camera (mở toàn màn hình lúc chụp) che mất khiến người dùng không thấy hỏi.
  const gpsReady = getGeolocation()
    .then((p) => {
      Object.assign(gps, p);
      return p;
    })
    .catch(() => null);

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
            <label class="dp-field-label">Mã số thuế</label>
            <input class="dp-input" name="tax_code" inputmode="numeric" placeholder="Mã số thuế (nếu có)" />
          </div>
          <div class="dp-field">
            <label class="dp-field-label">Địa chỉ <em>*</em></label>
            <textarea class="dp-textarea" name="address_line" required placeholder="Số nhà, đường, phường/xã..."></textarea>
          </div>
        </div>
      </div>

      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Ảnh cửa hàng <em class="dp-req">*</em></div>
        <span class="dp-field-hint">${icon(
          "circle-info"
        )} Bắt buộc bật định vị GPS: chụp là tự động lấy GPS + thời gian và nén ảnh tối ưu.</span>
        <button type="button" class="dp-uploader" data-shot>
          <span class="dp-uploader-icon">${icon("camera")}</span>
          <span class="dp-uploader-text">Chụp ảnh mặt tiền cửa hàng</span>
        </button>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <div class="dp-gps-chip" data-photostamp hidden></div>
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
  const photoStamp = container.querySelector("[data-photostamp]");
  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");

  // Tem thông tin dưới ảnh: đã nén + thời gian + GPS (hiển thị thụ động).
  // GPS là BẮT BUỘC nên ảnh đã nhận luôn có toạ độ.
  let capturedAt = null;
  function refreshStamp() {
    if (!capturedAt) {
      photoStamp.hidden = true;
      return;
    }
    photoStamp.hidden = false;
    photoStamp.classList.add("is-ok");
    const warn = gps.accuracy > 100 ? ` ⚠${Math.round(gps.accuracy)}m` : "";
    const parts = [
      "Đã tối ưu ảnh",
      formatDateTime(capturedAt),
      `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}${warn}`,
    ];
    photoStamp.innerHTML = `${icon("location-dot")}<span>${esc(parts.join(" · "))}</span>${icon(
      "circle-check",
      "dp-ok"
    )}`;
  }

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
      // BẮT BUỘC GPS: dùng vị trí lấy lúc chụp, hoặc vị trí đã xin quyền khi mở form.
      const pos = (await gpsPromise) || (await gpsReady);
      if (!pos || pos.latitude == null) {
        throw new Error("Cần bật định vị GPS để chụp ảnh. Hãy cho phép quyền vị trí rồi chụp lại.");
      }
      Object.assign(gps, pos);
      capturedAt = new Date();
      const res = await uploadFile(file, { fieldname: "store_photo" }); // resizeImage chạy bên trong
      photoUrl = res.file_url;
      refreshStamp();
      uploader.innerHTML = `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt=""><span class="dp-uploader-text">${icon(
        "circle-check",
        "dp-ok"
      )} Đã chọn ảnh — chạm để đổi</span>`;
    } catch (err) {
      fileInput.value = ""; // reset để chụp lại
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
        tax_code: fd.get("tax_code"),
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
