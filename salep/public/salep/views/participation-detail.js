import { html, icon, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatDateTime, statusMeta } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isManager } from "../lib/store.js";
import { toastError, toastSuccess } from "../components/toast.js";

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
    ${timeline(data.timeline || [])}

    ${btns.length ? `<div class="dp-actionbar">${btns.join("")}</div>` : ""}
  `;

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
