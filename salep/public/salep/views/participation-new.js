import { html, icon, getGeolocation } from "../lib/dom.js";
import { esc, formatDate, formatDateTime } from "../lib/format.js";
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
        <div id="dp-point-selected"></div>
        <div class="dp-combo">
          <div class="dp-search-wrap" style="margin-bottom:0">
            ${icon("magnifying-glass")}
            <input class="dp-search" id="dp-point-search" type="search" autocomplete="off" placeholder="Tìm & chọn điểm (tên/SĐT)" />
          </div>
          <div class="dp-combo-results" id="dp-point-results" hidden></div>
        </div>
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
        <span class="dp-field-hint">Chụp ảnh cách trưng bày tại cửa hàng — tự động lấy GPS + thời gian, ảnh được nén tối ưu trước khi tải lên.</span>
        <button type="button" class="dp-uploader" data-shot>
          <span class="dp-uploader-icon">${icon("camera")}</span>
          <span class="dp-uploader-text">Chụp ảnh</span>
        </button>
        <input type="file" accept="image/*" capture="environment" hidden data-file />
        <button type="button" class="dp-gps-chip" data-gps>${icon("location-dot")}<span data-gpstext>Tự động lấy GPS + thời gian khi chụp</span></button>
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

  // Chọn điểm bán: combobox gọn — gõ để lọc, chọn xong thu lại còn 1 thẻ.
  let selectedPoint = prePoint || "";
  const pointSearch = container.querySelector("#dp-point-search");
  const pointResults = container.querySelector("#dp-point-results");
  const selectedBox = container.querySelector("#dp-point-selected");
  const pointById = (id) => points.find((p) => p.name === id);

  function renderSelected() {
    const p = pointById(selectedPoint);
    selectedBox.innerHTML = p
      ? `<div class="dp-selected-card">${icon("store")}
          <div class="dp-sc-info"><div class="dp-sc-name">${esc(p.point_name || p.name)}</div><div class="dp-sc-sub">${esc(
          p.phone || ""
        )}</div></div>
          <button type="button" class="dp-sc-clear" data-clear>Đổi</button>
        </div>`
      : "";
  }
  function renderResults(filter) {
    const f = (filter || "").trim().toLowerCase();
    // Không có từ khoá → hiện luôn toàn bộ điểm (chỉ cần bấm vào là ra list).
    const list = (f
      ? points.filter(
          (p) => (p.point_name || "").toLowerCase().includes(f) || (p.phone || "").toLowerCase().includes(f)
        )
      : points
    ).slice(0, 30);
    if (!points.length) {
      pointResults.innerHTML = `<div class="dp-combo-item dp-text-muted">Chưa có điểm bán — bấm “Tạo điểm mới”.</div>`;
    } else {
      pointResults.innerHTML = list.length
        ? list
            .map(
              (p) =>
                `<div class="dp-combo-item" data-point="${esc(p.name)}"><span class="dp-combo-name">${esc(
                  p.point_name || p.name
                )}</span><span class="dp-combo-sub">${esc(p.phone || "")}</span></div>`
            )
            .join("")
        : `<div class="dp-combo-item dp-text-muted">Không tìm thấy điểm phù hợp.</div>`;
    }
    pointResults.hidden = false;
  }
  renderSelected();

  pointSearch.addEventListener("input", () => renderResults(pointSearch.value));
  // Chạm/focus vào ô là bung danh sách ngay (không cần gõ).
  pointSearch.addEventListener("focus", () => renderResults(pointSearch.value));
  pointSearch.addEventListener("click", () => renderResults(pointSearch.value));
  pointResults.addEventListener("click", (e) => {
    const it = e.target.closest("[data-point]");
    if (!it) return;
    selectedPoint = it.dataset.point;
    pointSearch.value = "";
    pointResults.hidden = true;
    renderSelected();
  });
  selectedBox.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) {
      selectedPoint = "";
      renderSelected();
      pointSearch.focus();
    }
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

  // Tem GPS + thời gian gắn vào ảnh; tự cập nhật khi chụp xong.
  let capturedAt = null;
  const gpsChip = container.querySelector("[data-gps]");
  function refreshStamp() {
    const parts = [];
    if (capturedAt) parts.push(formatDateTime(capturedAt));
    if (gps.latitude != null) {
      const warn = gps.accuracy > 100 ? ` ⚠${Math.round(gps.accuracy)}m` : "";
      parts.push(`${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}${warn}`);
    }
    gpsText.textContent = parts.join(" · ") || "Tự động lấy GPS + thời gian khi chụp";
    gpsChip.classList.toggle("is-ok", gps.latitude != null);
  }

  // Bấm chụp: khởi động GPS NGAY trong cử chỉ bấm (prompt quyền dễ hiện trên mobile).
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
      const res = await uploadFile(file, { fieldname: "display_photo" }); // resizeImage chạy bên trong
      photoUrl = res.file_url;
      const pos = (await gpsPromise) || {};
      if (pos.latitude != null) Object.assign(gps, pos);
      capturedAt = new Date();
      if (gps.latitude == null)
        toast("Không lấy được GPS — ảnh vẫn lưu (cần HTTPS + cho phép định vị)", "warning");
      uploader.innerHTML = `<img class="dp-uploader-preview" src="${esc(photoUrl)}" alt="">`;
      refreshStamp();
    } catch (err) {
      toastError(err.message);
    } finally {
      uploader.classList.remove("is-loading");
    }
  });

  // Bấm chip = lấy lại GPS thủ công (phòng khi lần chụp đầu bị từ chối quyền).
  gpsChip.addEventListener("click", async () => {
    try {
      Object.assign(gps, await getGeolocation());
      if (!capturedAt) capturedAt = new Date();
      refreshStamp();
    } catch (err) {
      toastError(err.message);
    }
  });

  let createdName = null; // tạo MỘT lần — tránh trùng khi bấm lại sau lỗi submit
  let alreadyExisted = false;
  async function persist(submit) {
    if (!selectedPoint) return toast("Chọn điểm bán", "error");
    if (!selectedProgram) return toast("Chọn chương trình", "error");
    if (!photoUrl) return toast("Cần chụp ảnh trưng bày", "error");

    const btns = container.querySelectorAll("[data-act]");
    btns.forEach((b) => (b.disabled = true));

    // 1) Tạo lượt (chỉ 1 lần). Nếu điểm đã đăng ký chương trình này → mở lượt cũ.
    if (!createdName) {
      try {
        const created = await call("salep.api.participation.create_participation", {
          display_point: selectedPoint,
          promotion_program: selectedProgram,
          display_photo: photoUrl,
          latitude: gps.latitude,
          longitude: gps.longitude,
          gps_accuracy: gps.accuracy,
        });
        createdName = created.name;
        alreadyExisted = !!created.existed;
      } catch (err) {
        toastError(err.message);
        btns.forEach((b) => (b.disabled = false));
        return;
      }
    }

    // 2) Đã tồn tại → mở lượt cũ (không tạo/gửi lại). Nếu mới → Gửi duyệt (tuỳ chọn).
    if (alreadyExisted) {
      toast("Điểm đã đăng ký chương trình này — mở lượt hiện có", "warning");
    } else if (submit) {
      try {
        await call("salep.api.participation.submit_for_approval", { name: createdName });
        toastSuccess("Đã gửi duyệt");
      } catch (err) {
        toastError(err.message);
      }
    } else {
      toastSuccess("Đã lưu nháp");
    }
    navigate(`/participations/${encodeURIComponent(createdName)}`);
  }

  container.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => persist(b.dataset.act === "submit"))
  );
}
