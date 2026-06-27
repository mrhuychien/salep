import { html, icon, on, subHeader, emptyState } from "../lib/dom.js";
import { esc, formatDate, formatDateTime, statusMeta } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isManager } from "../lib/store.js";
import { back, navigate } from "../lib/router.js";
import { toastError, toastSuccess } from "../components/toast.js";

function banner(state, updatedOn) {
  const m = statusMeta(state);
  return `<div class="dp-banner ${m.cls}">
    <div class="dp-banner__l">${icon(m.icon)}<span>${esc(state || "—")}</span></div>
    <span class="dp-banner__time">Cập nhật: ${esc(formatDateTime(updatedOn))}</span>
  </div>`;
}

function infoCard(title, rows) {
  return `<section class="dp-card dp-card--info">
    <h2 class="dp-card__heading">${esc(title)}</h2>
    ${rows
      .filter((r) => r.value)
      .map(
        (r) =>
          `<div class="dp-inforow">${icon(r.icon, "dp-i20 dp-muted")}<div><p class="dp-inforow__main">${esc(
            r.value
          )}</p>${r.sub ? `<p class="dp-inforow__sub">${esc(r.sub)}</p>` : ""}</div></div>`
      )
      .join("")}
  </section>`;
}

function timeline(events) {
  return `<section class="dp-card dp-card--info">
    <h2 class="dp-card__heading">Lịch sử</h2>
    <div class="dp-timeline">
      ${events
        .map(
          (ev, i) =>
            `<div class="dp-timeline__item${i === 0 ? " is-head" : ""}">
              <span class="dp-timeline__dot"></span>
              <p class="dp-timeline__label">${esc(ev.label)}</p>
              <p class="dp-timeline__time">${esc(formatDateTime(ev.on))}</p>
              ${ev.note ? `<p class="dp-timeline__note">${esc(ev.note)}</p>` : ""}
            </div>`
        )
        .join("")}
    </div>
  </section>`;
}

export async function render({ container, params }) {
  const name = params.name;
  let data;
  try {
    data = await call("salep.api.portal.get_participation", { name });
  } catch (e) {
    container.innerHTML = subHeader("Chi tiết") + emptyState("Không tải được lượt tham gia", "error", e.message);
    on(container, "click", "[data-back]", () => back());
    return;
  }

  const doc = data.doc;
  const pt = data.point || {};
  const pr = data.program || {};
  const state = doc.workflow_state;
  const isOwner = doc.owner === ctx.user;
  const mgr = isManager();

  const rejectBlock =
    state === "Từ chối" && doc.reject_reason
      ? `<div class="dp-banner dp-badge--rejected dp-banner--reason">${icon("error")}
          <div><strong>Lý do từ chối</strong><p>${esc(doc.reject_reason)}</p></div></div>`
      : "";

  // Hành động theo role + state.
  let actions = "";
  if (mgr && state === "Chờ duyệt") {
    actions = `<button class="dp-btn dp-btn--primary dp-btn--block" data-act="approve">${icon("check")} Duyệt</button>
      <button class="dp-btn dp-btn--outline dp-btn--block" data-act="reject">${icon("close")} Từ chối</button>`;
  } else if (isOwner && (state === "Nháp" || state === "Từ chối")) {
    actions = `<button class="dp-btn dp-btn--primary dp-btn--block" data-act="submit">${icon("send")} Gửi duyệt</button>`;
  }

  container.innerHTML = html`
    ${subHeader("Chi tiết lượt tham gia")}
    <main class="dp-detail">
      ${banner(state, doc.modified)}
      ${rejectBlock}
      ${doc.display_photo ? `<div class="dp-detail__photo"><img src="${esc(doc.display_photo)}" alt=""></div>` : ""}
      <div class="dp-page">
        ${infoCard("Thông tin điểm bán", [
          { icon: "storefront", value: pt.point_name, sub: pt.distributor ? "NPP: " + pt.distributor : "" },
          { icon: "phone", value: pt.phone },
          { icon: "location_on", value: pt.address_line },
        ])}
        ${infoCard("Thông tin chương trình", [
          { icon: "campaign", value: pr.program_name, sub: pr.status },
          {
            icon: "calendar_month",
            value: pr.start_date ? `${formatDate(pr.start_date)} – ${formatDate(pr.end_date)}` : "",
          },
        ])}
        ${timeline(data.timeline || [])}
      </div>
    </main>
    ${actions ? `<div class="dp-actionbar dp-actionbar--stack">${actions}</div>` : ""}
  `;

  on(container, "click", "[data-back]", () => back());

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
      render({ container, params }); // reload
    } catch (err) {
      toastError(err.message);
      container.querySelectorAll("[data-act]").forEach((b) => (b.disabled = false));
    }
  }

  on(container, "click", "[data-act]", (e, el) => act(el.dataset.act));
}
