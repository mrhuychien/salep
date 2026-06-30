import { html, icon, getGeolocation, emptyState } from "../lib/dom.js";
import { esc, statusBadge } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const LOCKED_STATES = ["Chờ duyệt", "Đã duyệt"];

export async function render({ container, params }) {
  const name = params.name;
  let data, points, programs;
  try {
    [data, points, programs] = await Promise.all([
      call("salep.api.portal.get_participation", { name }),
      call("salep.api.point.list_my_points", { limit: 200 }),
      call("salep.api.portal.list_programs", { running_only: 1 }),
    ]);
  } catch (e) {
    container.innerHTML = emptyState("Không tải được lượt tham gia", "⚠️", e.message);
    return;
  }

  const doc = data.doc;
  const state = doc.workflow_state;
  const lockLinks = LOCKED_STATES.includes(state);
  const initial = {
    display_point: doc.display_point,
    promotion_program: doc.promotion_program,
    display_photo: doc.display_photo,
    latitude: doc.latitude,
    longitude: doc.longitude,
    gps_accuracy: doc.gps_accuracy,
  };
  let photoUrl = doc.display_photo;
  const gps = { latitude: doc.latitude, longitude: doc.longitude, accuracy: doc.gps_accuracy };

  const ensure = (list, val, label) =>
    val && !list.some((x) => x.name === val) ? [{ name: val, [label]: val }, ...list] : list;
  const optionTags = (list, value, labelKey) =>
    list
      .map(
        (x) =>
          `<option value="${esc(x.name)}"${x.name === value ? " selected" : ""}>${esc(x[labelKey] || x.name)}</option>`
      )
      .join("");

  const hasGps = gps.latitude != null && gps.longitude != null;
  const gpsLabel = hasGps
    ? `${Number(gps.latitude).toFixed(6)}, ${Number(gps.longitude).toFixed(6)}`
    : "Chưa có GPS — chạm để lấy";

  container.innerHTML = html`
    <div class="dp-form-pad">
      <div class="dp-flex dp-items-center dp-gap-2 dp-text-sm dp-text-muted" style="margin-bottom:.85rem">
        Trạng thái: ${statusBadge(state)}
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Điểm bán</label>
        <select class="dp-select" id="dp-point" ${lockLinks ? "disabled" : ""}>
          ${optionTags(ensure(points, doc.display_point, "point_name"), doc.display_point, "point_name")}
        </select>
        ${lockLinks ? `<span class="dp-field-hint">${icon("lock")} Khoá đổi điểm khi đã gửi/duyệt</span>` : ""}
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Chương trình</label>
        <select class="dp-select" id="dp-program" ${lockLinks ? "disabled" : ""}>
          ${optionTags(ensure(programs, doc.promotion_program, "program_name"), doc.promotion_program, "program_name")}
        </select>
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Ảnh trưng bày</label>
        <button type="button" class="dp-uploader" data-shot>
          ${
            photoUrl
              ? `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt="">`
              : `<span class="dp-uploader-icon">${icon("camera")}</span><span class="dp-uploader-text">Chụp ảnh</span>`
          }
        </button>
        <span class="dp-field-hint">${icon("camera")} Chạm ảnh để chụp lại</span>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <button type="button" class="dp-gps-chip${hasGps ? " is-ok" : ""}" data-gps>${icon(
          "location-dot"
        )}<span data-gpstext>${esc(gpsLabel)}</span></button>
      </div>
    </div>

    <div class="dp-actionbar">
      <button class="dp-btn-primary" data-save>${icon("floppy-disk")} Lưu thay đổi</button>
      <button class="dp-btn-outline" data-go="/participations/${encodeURIComponent(name)}">Huỷ</button>
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

  container.querySelector("[data-save]").addEventListener("click", async (e) => {
    const payload = { name };
    if (!lockLinks) {
      if (pointSel.value && pointSel.value !== initial.display_point) payload.display_point = pointSel.value;
      if (programSel.value && programSel.value !== initial.promotion_program)
        payload.promotion_program = programSel.value;
    }
    if (photoUrl && photoUrl !== initial.display_photo) payload.display_photo = photoUrl;
    if (gps.latitude !== initial.latitude) payload.latitude = gps.latitude;
    if (gps.longitude !== initial.longitude) payload.longitude = gps.longitude;
    if (gps.accuracy !== initial.gps_accuracy) payload.gps_accuracy = gps.accuracy;

    if (Object.keys(payload).length <= 1) return toast("Chưa có thay đổi nào", "info");

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = "Đang lưu...";
    try {
      await call("salep.api.participation.update_participation", payload);
      toastSuccess("Đã lưu thay đổi");
      navigate(`/participations/${encodeURIComponent(name)}`);
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
      btn.innerHTML = "Lưu thay đổi";
    }
  });
}
