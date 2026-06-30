import { html, icon, emptyState, getGeolocation } from "../lib/dom.js";
import { esc, formatDate, formatDateTime, statusMeta } from "../lib/format.js";
import { call, uploadFile } from "../lib/api.js";
import { ctx, isManager } from "../lib/store.js";
import { toastError, toastSuccess } from "../components/toast.js";

function monthlyCard(cov, visits, canReport) {
  const pct = cov.required ? Math.min(100, Math.round((cov.have / cov.required) * 100)) : 0;
  const badge = cov.needs
    ? `<span class="dp-badge dp-badge-warning">Thiếu ${cov.required - cov.have}</span>`
    : `<span class="dp-badge dp-badge-success">Đủ</span>`;
  const cells = visits
    .map(
      (v) =>
        `<div class="dp-visit-cell"><img src="${esc(v.visit_photo)}" alt=""><div class="dp-visit-meta">${esc(
          formatDate(v.captured_on)
        )}</div></div>`
    )
    .join("");
  return `<div class="dp-card" style="margin-bottom:1rem">
    <div class="dp-card-heading">Báo cáo hàng tháng</div>
    <div class="dp-progress-row"><span>Đã chụp ${cov.have}/${cov.required} ảnh theo kỳ</span>${
    cov.required ? badge : ""
  }</div>
    <div class="dp-progress-track"><div class="dp-progress-bar" style="width:${pct}%"></div></div>
    ${
      canReport
        ? `<button class="dp-btn-primary dp-mt" data-report>${icon("camera")} Chụp ảnh báo cáo tháng này</button>
           <input type="file" accept="image/*" capture="environment" hidden data-visitfile />`
        : ""
    }
    ${
      visits.length
        ? `<div class="dp-visit-grid">${cells}</div>`
        : `<div class="dp-text-sm dp-text-muted" style="margin-top:.6rem">Chưa có ảnh báo cáo.</div>`
    }
  </div>`;
}

function infoCard(title, rows) {
  return `<div class="dp-card" style="margin-bottom:1rem">
    <div class="dp-card-heading">${esc(title)}</div>
    ${rows
      .filter((r) => r.value)
      .map(
        (r) =>
          `<div class="dp-info-row">${icon(r.icon)}<div><div class="dp-info-main">${esc(r.value)}</div>${
            r.sub ? `<div class="dp-info-sub">${esc(r.sub)}</div>` : ""
          }</div></div>`
      )
      .join("")}
  </div>`;
}

function timeline(events) {
  return `<div class="dp-card">
    <div class="dp-card-heading">Lịch sử</div>
    <div class="dp-timeline">
      ${events
        .map(
          (ev, i) =>
            `<div class="dp-timeline-item${i === 0 ? " is-head" : ""}">
              <span class="dp-timeline-dot"></span>
              <div class="dp-timeline-label">${esc(ev.label)}</div>
              <div class="dp-timeline-time">${esc(formatDateTime(ev.on))}</div>
              ${ev.note ? `<div class="dp-timeline-note">${esc(ev.note)}</div>` : ""}
            </div>`
        )
        .join("")}
    </div>
  </div>`;
}

export async function render({ container, params }) {
  const name = params.name;
  let data;
  try {
    data = await call("salep.api.portal.get_participation", { name });
  } catch (e) {
    container.innerHTML = emptyState("Không tải được lượt tham gia", "⚠️", e.message);
    return;
  }

  const doc = data.doc;
  const pt = data.point || {};
  const pr = data.program || {};
  const state = doc.workflow_state;
  const meta = statusMeta(state);
  const isOwner = doc.owner === ctx.user;
  const mgr = isManager();

  const canEdit = mgr
    ? ["Nháp", "Chờ duyệt", "Đã duyệt"].includes(state)
    : isOwner && ["Nháp", "Đã duyệt", "Từ chối"].includes(state);
  // Báo cáo ảnh hàng tháng: chủ lượt, sau khi đã duyệt (đang tham gia).
  const canReport = isOwner && state === "Đã duyệt";

  const btns = [];
  if (mgr && state === "Chờ duyệt") {
    btns.push(`<button class="dp-btn-primary" data-act="approve">${icon("check")} Duyệt</button>`);
    btns.push(`<button class="dp-btn-danger" data-act="reject">${icon("xmark")} Từ chối</button>`);
  } else if (isOwner && (state === "Nháp" || state === "Từ chối")) {
    btns.push(`<button class="dp-btn-primary" data-act="submit">${icon("paper-plane")} Gửi duyệt</button>`);
  }
  if (canEdit) {
    const cls = btns.length ? "dp-btn-outline" : "dp-btn-primary";
    btns.push(`<button class="${cls}" data-go="/participations/${encodeURIComponent(name)}/edit">${icon("pen")} Chỉnh sửa</button>`);
  }

  const reject =
    state === "Từ chối" && doc.reject_reason
      ? `<div class="dp-reason-bar">${icon("circle-exclamation")}<div><strong>Lý do từ chối</strong><p>${esc(
          doc.reject_reason
        )}</p></div></div>`
      : "";

  container.innerHTML = html`
    <div class="dp-status-banner dp-badge-${meta.type}">
      <div class="dp-sb-l">${icon(meta.icon)} ${esc(state)}</div>
      <span class="dp-sb-time">Cập nhật: ${esc(formatDateTime(doc.modified))}</span>
    </div>
    ${reject}
    ${doc.display_photo ? `<div class="dp-detail-photo"><img src="${esc(doc.display_photo)}" alt=""></div>` : ""}

    ${infoCard("Thông tin điểm bán", [
      { icon: "store", value: pt.point_name, sub: pt.distributor ? "NPP: " + pt.distributor : "" },
      { icon: "phone", value: pt.phone },
      { icon: "location-dot", value: pt.address_line },
    ])}
    ${infoCard("Thông tin chương trình", [
      { icon: "bullhorn", value: pr.program_name, sub: pr.status },
      { icon: "calendar", value: pr.start_date ? `${formatDate(pr.start_date)} – ${formatDate(pr.end_date)}` : "" },
    ])}
    ${monthlyCard(data.coverage || { required: 0, have: 0, needs: false }, data.visits || [], canReport)}
    ${timeline(data.timeline || [])}

    ${btns.length ? `<div class="dp-actionbar">${btns.join("")}</div>` : ""}
  `;

  const reportBtn = container.querySelector("[data-report]");
  if (reportBtn) {
    const visitFile = container.querySelector("[data-visitfile]");
    reportBtn.addEventListener("click", () => visitFile.click());
    visitFile.addEventListener("change", async () => {
      const file = visitFile.files[0];
      if (!file) return;
      reportBtn.disabled = true;
      reportBtn.innerHTML = "Đang tải ảnh...";
      let gps = {};
      try {
        gps = await getGeolocation();
      } catch {
        /* GPS best-effort */
      }
      try {
        const up = await uploadFile(file, { fieldname: "visit_photo" });
        await call("salep.api.participation.add_visit", {
          participation: name,
          display_photo: up.file_url,
          latitude: gps.latitude,
          longitude: gps.longitude,
          gps_accuracy: gps.accuracy,
        });
        toastSuccess("Đã thêm ảnh báo cáo");
        render({ container, params });
      } catch (err) {
        toastError(err.message);
        reportBtn.disabled = false;
        reportBtn.innerHTML = `${icon("camera")} Chụp ảnh báo cáo tháng này`;
      }
    });
  }

  async function act(kind) {
    container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = true));
    try {
      if (kind === "approve") {
        await call("salep.api.participation.approve", { name });
        toastSuccess("Đã duyệt");
      } else if (kind === "reject") {
        const reason = window.prompt("Lý do từ chối:");
        if (!reason) {
          container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = false));
          return;
        }
        await call("salep.api.participation.reject", { name, reject_reason: reason });
        toastSuccess("Đã từ chối");
      } else if (kind === "submit") {
        await call("salep.api.participation.submit_for_approval", { name });
        toastSuccess("Đã gửi duyệt");
      }
      render({ container, params });
    } catch (err) {
      toastError(err.message);
      container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = false));
    }
  }

  container.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => act(b.dataset.act)));
}
