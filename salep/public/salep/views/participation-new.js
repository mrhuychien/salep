import { html, icon, getGeolocation } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

export async function render({ container, query }) {
  const prePoint = query && query.point;
  const preProgram = query && query.program;
  const gps = { latitude: null, longitude: null, accuracy: null };
  let photoUrl = null;

  let points = [];
  let programs = [];
  try {
    [points, programs] = await Promise.all([
      call("salep.api.point.list_my_points", { limit: 200 }),
      call("salep.api.portal.list_programs", { running_only: 1 }),
    ]);
  } catch (e) {
    toastError(e.message);
  }

  const opt = (list, value, labelKey) =>
    list
      .map(
        (x) =>
          `<option value="${esc(x.name)}"${x.name === value ? " selected" : ""}>${esc(x[labelKey])}${
            labelKey === "point_name" && x.phone ? " · " + esc(x.phone) : ""
          }</option>`
      )
      .join("");

  container.innerHTML = html`
    <div class="dp-form-pad">
      <div class="dp-field">
        <label class="dp-field-label">Chọn điểm bán <em>*</em></label>
        <select class="dp-select" id="dp-point">
          <option value="">— Chọn điểm có sẵn —</option>
          ${opt(points, prePoint, "point_name")}
        </select>
        <button type="button" class="dp-btn-outline dp-mt" data-go="/points/new?next=participation">${icon(
          "plus"
        )} Tạo điểm mới</button>
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Chọn chương trình <em>*</em></label>
        <select class="dp-select" id="dp-program">
          <option value="">— Chọn chương trình đang chạy —</option>
          ${opt(programs, preProgram, "program_name")}
        </select>
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Ảnh trưng bày đợt này <em>*</em></label>
        <span class="dp-field-hint">Chụp ảnh cách trưng bày sản phẩm tại cửa hàng.</span>
        <button type="button" class="dp-uploader" data-shot>
          <span class="dp-uploader-icon">${icon("camera")}</span>
          <span class="dp-uploader-text">Chụp ảnh</span>
        </button>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <button type="button" class="dp-gps-chip" data-gps>${icon("location-dot")}<span data-gpstext>Lấy GPS lúc chấm</span></button>
      </div>
    </div>

    <div class="dp-actionbar">
      <button class="dp-btn-primary" data-act="submit">${icon("paper-plane")} Gửi duyệt</button>
      <button class="dp-btn-outline" data-act="draft">Lưu nháp</button>
    </div>
  `;

  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");
  const gpsText = container.querySelector("[data-gpstext]");
  const pointSel = container.querySelector("#dp-point");
  const programSel = container.querySelector("#dp-program");

  container.querySelector("[data-gps]").addEventListener("click", async () => {
    try {
      const pos = await getGeolocation();
      Object.assign(gps, pos);
      const warn = pos.accuracy > 100 ? ` ⚠${Math.round(pos.accuracy)}m` : "";
      gpsText.textContent = `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}${warn}`;
      container.querySelector("[data-gps]").classList.add("is-ok");
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
      const res = await uploadFile(file, { fieldname: "display_photo" });
      photoUrl = res.file_url;
      uploader.innerHTML = `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt="">`;
    } catch (err) {
      toastError(err.message);
    } finally {
      uploader.classList.remove("is-loading");
    }
  });

  async function persist(submit) {
    if (!pointSel.value) return toast("Chọn điểm bán", "error");
    if (!programSel.value) return toast("Chọn chương trình", "error");
    if (!photoUrl) return toast("Cần chụp ảnh trưng bày", "error");

    container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = true));
    try {
      const created = await call("salep.api.participation.create_participation", {
        display_point: pointSel.value,
        promotion_program: programSel.value,
        display_photo: photoUrl,
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy: gps.accuracy,
      });
      if (submit) {
        await call("salep.api.participation.submit_for_approval", { name: created.name });
        toastSuccess("Đã gửi duyệt");
      } else {
        toastSuccess("Đã lưu nháp");
      }
      navigate(`/participations/${encodeURIComponent(created.name)}`);
    } catch (err) {
      toastError(err.message);
      container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = false));
    }
  }

  container.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => persist(b.dataset.act === "submit"))
  );
}
