import { html, icon, on, subHeader, emptyState, getGeolocation } from "../lib/dom.js";
import { esc, statusBadge } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { back, navigate } from "../lib/router.js";
import { toast, toastError, toastSuccess } from "../components/toast.js";

const LOCKED_STATES = ["Chờ duyệt", "Đã duyệt"]; // không cho đổi điểm/chương trình

export async function render({ container, params }) {
  const name = params.name;
  let data, points, programs;
  try {
    [data, points, programs] = await Promise.all([
      call("salep.api.portal.get_participation", { name }),
      call("salep.api.point.list_my_points", { limit: 100 }),
      call("salep.api.portal.list_programs", { running_only: 1 }),
    ]);
  } catch (e) {
    container.innerHTML = subHeader("Chỉnh sửa") + emptyState("Không tải được lượt tham gia", "error", e.message);
    on(container, "click", "[data-back]", () => back());
    return;
  }

  const doc = data.doc;
  const state = doc.workflow_state;
  const lockLinks = LOCKED_STATES.includes(state);

  // Snapshot ban đầu để chỉ gửi field thực sự đổi.
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

  // Đảm bảo điểm/CT hiện tại luôn có trong dropdown (kể cả khi đã kết thúc).
  const ensure = (list, val, label) =>
    val && !list.some((x) => x.name === val) ? [{ name: val, [label]: val }, ...list] : list;
  const pointOpts = ensure(points, doc.display_point, "point_name");
  const programOpts = ensure(programs, doc.promotion_program, "program_name");
  const optionTags = (list, value, labelKey) =>
    list
      .map(
        (x) =>
          `<option value="${esc(x.name)}"${x.name === value ? " selected" : ""}>${esc(
            x[labelKey] || x.name
          )}</option>`
      )
      .join("");

  const hasGps = gps.latitude != null && gps.longitude != null;
  const gpsLabel = hasGps
    ? `${Number(gps.latitude).toFixed(6)}, ${Number(gps.longitude).toFixed(6)}`
    : "Chưa có GPS — chạm để lấy";

  container.innerHTML = html`
    ${subHeader("Chỉnh sửa lượt tham gia")}
    <main class="dp-page dp-form">
      <div class="dp-editstate">Trạng thái hiện tại: ${statusBadge(state)}</div>

      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Điểm bán</span>
        <select class="dp-input dp-select" id="dp-point" ${lockLinks ? "disabled" : ""}>
          ${optionTags(pointOpts, doc.display_point, "point_name")}
        </select>
        ${lockLinks ? `<span class="dp-field__hint">${icon("lock", "dp-i14")} Khoá đổi điểm khi đã gửi/duyệt</span>` : ""}
      </section>

      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Chương trình</span>
        <select class="dp-input dp-select" id="dp-program" ${lockLinks ? "disabled" : ""}>
          ${optionTags(programOpts, doc.promotion_program, "program_name")}
        </select>
      </section>

      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Ảnh trưng bày</span>
        <button type="button" class="dp-uploader dp-uploader--lg" data-shot>
          ${
            photoUrl
              ? `<img class="dp-uploader__preview" src="${esc(photoUrl)}" alt="">`
              : `<span class="dp-uploader__icon">${icon("photo_camera")}</span><span class="dp-uploader__text">Chụp ảnh</span>`
          }
        </button>
        <span class="dp-field__hint">${icon("photo_camera", "dp-i14")} Chạm ảnh để chụp lại</span>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <button type="button" class="dp-gpschip dp-gpschip--btn${hasGps ? " is-ok" : ""}" data-gps>
          ${icon("location_on", "dp-i18")}<span data-gpstext>${esc(gpsLabel)}</span>
        </button>
      </section>
    </main>

    <div class="dp-actionbar dp-actionbar--stack">
      <button class="dp-btn dp-btn--primary dp-btn--block" data-save>Lưu thay đổi</button>
      <button class="dp-btn dp-btn--outline dp-btn--block" data-cancel>Huỷ</button>
    </div>
  `;

  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");
  const gpsText = container.querySelector("[data-gpstext]");
  const pointSel = container.querySelector("#dp-point");
  const programSel = container.querySelector("#dp-program");

  on(container, "click", "[data-back]", () => back());
  on(container, "click", "[data-cancel]", () => navigate(`/participations/${encodeURIComponent(name)}`));

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
      uploader.innerHTML = `<img class="dp-uploader__preview" src="${esc(photoUrl)}" alt="">`;
    } catch (err) {
      toastError(err.message);
    } finally {
      uploader.classList.remove("is-loading");
    }
  });

  on(container, "click", "[data-save]", async (e) => {
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

    const btn = e.target.closest("[data-save]");
    btn.disabled = true;
    btn.textContent = "Đang lưu...";
    try {
      await call("salep.api.participation.update_participation", payload);
      toastSuccess("Đã lưu thay đổi");
      navigate(`/participations/${encodeURIComponent(name)}`);
    } catch (err) {
      toastError(err.message);
      btn.disabled = false;
      btn.textContent = "Lưu thay đổi";
    }
  });
}
