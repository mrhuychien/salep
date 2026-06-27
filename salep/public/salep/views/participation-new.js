import { html, icon, on, subHeader, getGeolocation } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { navigate, back } from "../lib/router.js";
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
      call("salep.api.point.list_my_points", { limit: 100 }),
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
    ${subHeader("Đăng ký tham gia")}
    <main class="dp-page dp-form">
      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Chọn điểm bán <em>*</em></span>
        <select class="dp-input dp-select" id="dp-point">
          <option value="">— Chọn điểm có sẵn —</option>
          ${opt(points, prePoint, "point_name")}
        </select>
        <button class="dp-btn dp-btn--tonal dp-btn--block dp-mt" data-newpoint>${icon("add")} Tạo điểm mới</button>
      </section>

      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Chọn chương trình <em>*</em></span>
        <select class="dp-input dp-select" id="dp-program">
          <option value="">— Chọn chương trình đang chạy —</option>
          ${opt(programs, preProgram, "program_name")}
        </select>
      </section>

      <section class="dp-field">
        <span class="dp-field__label dp-field__label--lg">Ảnh trưng bày đợt này <em>*</em></span>
        <p class="dp-field__hint">Chụp ảnh cách trưng bày sản phẩm tại cửa hàng.</p>
        <button type="button" class="dp-uploader dp-uploader--lg" data-shot>
          <span class="dp-uploader__icon">${icon("photo_camera")}</span>
          <span class="dp-uploader__text">Chụp ảnh</span>
        </button>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <button type="button" class="dp-gpschip dp-gpschip--btn" data-gps>
          ${icon("location_on", "dp-i18")}<span data-gpstext>Lấy GPS lúc chấm</span>
        </button>
      </section>
    </main>

    <div class="dp-actionbar dp-actionbar--stack">
      <button class="dp-btn dp-btn--primary dp-btn--block" data-act="submit">Gửi duyệt</button>
      <button class="dp-btn dp-btn--outline dp-btn--block" data-act="draft">Lưu nháp</button>
    </div>
  `;

  const fileInput = container.querySelector("[data-file]");
  const uploader = container.querySelector("[data-shot]");
  const gpsText = container.querySelector("[data-gpstext]");
  const pointSel = container.querySelector("#dp-point");
  const programSel = container.querySelector("#dp-program");

  on(container, "click", "[data-back]", () => back());
  container.querySelector("[data-newpoint]").addEventListener("click", () =>
    navigate("/points/new?next=participation")
  );

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

  async function persist(submit) {
    const display_point = pointSel.value;
    const promotion_program = programSel.value;
    if (!display_point) return toast("Chọn điểm bán", "error");
    if (!promotion_program) return toast("Chọn chương trình", "error");
    if (!photoUrl) return toast("Cần chụp ảnh trưng bày", "error");

    container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = true));
    try {
      const created = await call("salep.api.participation.create_participation", {
        display_point,
        promotion_program,
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

  on(container, "click", "[data-act]", (e, el) => persist(el.dataset.act === "submit"));
}
