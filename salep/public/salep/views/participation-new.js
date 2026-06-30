import { html, icon, getGeolocation } from "../lib/dom.js";
import { esc, formatDate } from "../lib/format.js";
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

  container.innerHTML = html`
    <div class="dp-form-pad">
      <div class="dp-field">
        <label class="dp-field-label">Chọn điểm bán <em>*</em></label>
        <div class="dp-search-wrap" style="margin-bottom:.5rem">
          ${icon("magnifying-glass")}
          <input class="dp-search" id="dp-point-search" type="search" placeholder="Tìm điểm theo tên hoặc SĐT" />
        </div>
        <div class="dp-pick dp-pick-scroll" id="dp-point-pick"></div>
        <button type="button" class="dp-btn-outline dp-mt" data-go="/points/new">${icon("plus")} Tạo điểm mới</button>
      </div>

      <div class="dp-field">
        <label class="dp-field-label">Chọn chương trình <em>*</em></label>
        ${
          programs.length
            ? `<div class="dp-pick" id="dp-program-pick">${programs
                .map(
                  (p) =>
                    `<button type="button" class="dp-pick-btn${
                      p.name === preProgram ? " is-active" : ""
                    }" data-prog="${esc(p.name)}">
                      <span class="dp-pick-dot"></span>
                      <span class="dp-pick-info">
                        <span class="dp-pick-name">${esc(p.program_name)}</span>
                        <span class="dp-pick-sub">${esc(formatDate(p.start_date))} – ${esc(
                      formatDate(p.end_date)
                    )}</span>
                      </span>
                    </button>`
                )
                .join("")}</div>`
            : `<div class="dp-text-sm dp-text-muted">Chưa có chương trình đang chạy.</div>`
        }
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

  // Chọn điểm bán bằng ô tìm + danh sách nút (lọc theo tên/SĐT).
  let selectedPoint = prePoint || "";
  const pointPick = container.querySelector("#dp-point-pick");
  const pointSearch = container.querySelector("#dp-point-search");
  const pointBtn = (p) =>
    `<button type="button" class="dp-pick-btn${p.name === selectedPoint ? " is-active" : ""}" data-point="${esc(
      p.name
    )}"><span class="dp-pick-dot"></span><span class="dp-pick-info"><span class="dp-pick-name">${esc(
      p.point_name || p.name
    )}</span><span class="dp-pick-sub">${esc(p.phone || "")}</span></span></button>`;
  function renderPoints(filter = "") {
    const f = filter.toLowerCase();
    const list = points.filter(
      (p) =>
        !f || (p.point_name || "").toLowerCase().includes(f) || (p.phone || "").toLowerCase().includes(f)
    );
    pointPick.innerHTML = list.length
      ? list.map(pointBtn).join("")
      : `<div class="dp-text-sm dp-text-muted">Không tìm thấy điểm phù hợp.</div>`;
  }
  renderPoints();
  pointPick.addEventListener("click", (e) => {
    const b = e.target.closest("[data-point]");
    if (!b) return;
    selectedPoint = b.dataset.point;
    pointPick.querySelectorAll("[data-point]").forEach((x) => x.classList.toggle("is-active", x === b));
  });
  let pst;
  pointSearch.addEventListener("input", () => {
    clearTimeout(pst);
    pst = setTimeout(() => renderPoints(pointSearch.value.trim()), 200);
  });

  // Chọn chương trình bằng nút (radio-card) thay vì dropdown.
  let selectedProgram = preProgram || "";
  const pick = container.querySelector("#dp-program-pick");
  if (pick) {
    pick.addEventListener("click", (e) => {
      const b = e.target.closest("[data-prog]");
      if (!b) return;
      selectedProgram = b.dataset.prog;
      pick.querySelectorAll("[data-prog]").forEach((x) => x.classList.toggle("is-active", x === b));
    });
  }

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
    if (!selectedPoint) return toast("Chọn điểm bán", "error");
    if (!selectedProgram) return toast("Chọn chương trình", "error");
    if (!photoUrl) return toast("Cần chụp ảnh trưng bày", "error");

    container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = true));
    try {
      const created = await call("salep.api.participation.create_participation", {
        display_point: selectedPoint,
        promotion_program: selectedProgram,
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
