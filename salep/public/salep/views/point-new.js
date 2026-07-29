import { html, icon } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx } from "../lib/store.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";
import { createPhotoGrid } from "../components/photo-grid.js";

const BANKS = ["Vietcombank", "Techcombank", "MB Bank", "ACB", "BIDV", "VietinBank", "Agribank", "VPBank"];

export async function render({ container }) {

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
        )} Bắt buộc bật định vị GPS. Có thể chụp/chọn NHIỀU ảnh — mỗi ảnh tự gắn GPS + thời gian và nén tối ưu.</span>
        <div id="dp-store-photos"></div>
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

  // Lưới ảnh nhiều tấm (BẮT BUỘC GPS, nén + tiến trình).
  const photoGrid = createPhotoGrid({
    mount: container.querySelector("#dp-store-photos"),
    fieldname: "store_photo",
    onError: (err) => toastError(err.message),
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

    // 2) Tạo điểm mới (cần đủ thông tin + ít nhất 1 ảnh có GPS).
    if (!form.reportValidity()) return reset(btn);
    const photos = photoGrid.getPhotos();
    if (!photos.length) {
      toast("Cần chụp/chọn ít nhất 1 ảnh cửa hàng", "error");
      return reset(btn);
    }
    const fix = photoGrid.firstFix() || {};

    btn.innerHTML = "Đang lưu...";
    const fd = new FormData(form);
    try {
      const created = await call("salep.api.point.create_point", {
        point_name: fd.get("point_name"),
        phone: fd.get("phone"),
        tax_code: fd.get("tax_code"),
        address_line: fd.get("address_line"),
        store_photo: photos[0].image,
        photos: JSON.stringify(photos),
        latitude: fix.latitude,
        longitude: fix.longitude,
        gps_accuracy: fix.accuracy,
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
