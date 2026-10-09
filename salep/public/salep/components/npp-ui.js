// Tiện ích dùng chung cho màn Quản lý NPP trên /dp (chủ NPP — doc/08 §8): tìm không dấu,
// danh sách người nhận bàn giao, sheet Gán NV / Nghỉ việc / chi tiết điểm, thanh chọn nhiều,
// danh sách "Xem thêm". Mọi quyền kiểm ở server (salep.api.npp_manage.npp_*).
import { esc, formatNumber } from "../lib/format.js";
import { icon } from "../lib/dom.js";
import { call } from "../lib/api.js";
import { openSheet, closeSheet } from "./sheet.js";
import { toast, toastError, toastSuccess } from "./toast.js";

export const TARGET_NPP = "__npp__";
export const BULK_MAX = 1000; // khớp BULK_MAX ở salep/api/npp_manage.py

// Luật chuyển lượt khi gán (doc/08 §2.2–2.3) — ghi rõ trong sheet để chủ NPP biết hệ quả.
export const RULE_TEXT =
  "Lượt tham gia của chương trình còn hiệu lực trên các điểm này chuyển theo người phụ trách mới " +
  "(kể cả lượt đang lệch người). Lượt của chương trình đã kết thúc giữ nguyên người thực hiện — " +
  "KPI và lịch sử cũ không đổi.";

// ── Tìm kiếm ──

// Chuẩn hoá để so khớp không dấu: NFD, bỏ dấu, đ→d, chữ thường, gộp khoảng trắng.
export function fold(text) {
  return String(text == null ? "" : text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Mọi từ trong query đều phải có mặt (thứ tự bất kỳ, không dấu). SĐT/mã khớp cả khi gõ
// kèm dấu chấm/gạch/khoảng trắng hoặc bỏ số 0 đầu.
export function matchesAll(haystackFields, query) {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = fold((haystackFields || []).filter((f) => f != null && f !== "").join(" "));
  const compact = hay.replace(/[^0-9a-z]/g, "");
  return words.every((w) => {
    if (hay.includes(w)) return true;
    const cw = w.replace(/[^0-9a-z]/g, "").replace(/^0+(?=\d)/, "");
    return !!cw && compact.includes(cw);
  });
}

// ── Hiển thị ──

// Chữ cái đầu của TÊN (từ cuối — họ tên Việt) cho avatar tròn.
export function initials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length ? words[words.length - 1].charAt(0).toUpperCase() : "?";
}

// Chip "người phụ trách" theo owner_kind (staff / npp / other); NV đã nghỉ tô đỏ.
export function ownerChip(row) {
  const kind = ["staff", "npp"].includes(row.owner_kind) ? row.owner_kind : "other";
  const ic = kind === "npp" ? "warehouse" : kind === "staff" ? "user" : "user-slash";
  return `<span class="dp-owner-chip dp-owner-${kind}${row.staff_left ? " is-left" : ""}">${icon(ic)} ${esc(
    row.staff_name || "—"
  )}${row.staff_left ? " · đã nghỉ" : ""}</span>`;
}

// ── Nút async: khoá + spinner khi chạy; lỗi → mở lại nút + toast. Trả kết quả task (lỗi → null). ──
export async function busy(btn, task, label = "Đang xử lý...") {
  if (!btn || btn.disabled) return null;
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${icon("spinner", "dp-spin")} ${esc(label)}`;
  const restore = () => {
    if (!btn.isConnected) return;
    btn.disabled = false;
    btn.innerHTML = old;
  };
  try {
    const out = await task();
    restore();
    return out;
  } catch (err) {
    restore();
    toastError((err && err.message) || "Có lỗi xảy ra, vui lòng thử lại");
    return null;
  }
}

// ── Người nhận bàn giao ──

// Đích hợp lệ (doc/08 §2.6): "NPP giữ" đứng đầu, rồi NV ĐANG LÀM và tài khoản ĐANG BẬT.
// exclude = tên hồ sơ cần loại (NV đang nghỉ việc).
export function staffTargets(staffRows, exclude = null) {
  const opts = [{ value: TARGET_NPP, label: "NPP giữ lại (chưa giao)", sub: "Chia cho nhân viên sau" }];
  (staffRows || [])
    .filter((s) => !s.resigned && s.active && s.name !== exclude)
    .forEach((s) =>
      opts.push({
        value: s.name,
        label: (s.full_name || s.user || s.name) + (s.is_self ? " (bạn)" : ""),
        sub: [s.phone, `${formatNumber(s.points || 0)} điểm`].filter(Boolean).join(" · "),
      })
    );
  return opts;
}

// Danh sách chọn 1 (radio-card .dp-pick-btn); ≥5 nhân viên → có ô tìm không dấu (doc/08 §8).
function pickerHtml(options, selected) {
  const search =
    options.filter((o) => o.value !== TARGET_NPP).length >= 5
      ? `<div class="dp-search-wrap dp-sheet-search">${icon("magnifying-glass")}
          <input class="dp-search" type="search" data-pick-q placeholder="Tìm nhân viên theo tên, SĐT"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            inputmode="search" enterkeyhint="search" aria-label="Tìm nhân viên" />
        </div>`
      : "";
  const items = options
    .map((o) => {
      const on = o.value === selected;
      return `<button type="button" class="dp-pick-btn${on ? " is-active" : ""}" role="radio" aria-checked="${on}"
        data-pick="${esc(o.value)}" data-fold="${esc(fold(`${o.label} ${o.sub || ""}`))}">
        <span class="dp-pick-dot"></span>
        <span class="dp-pick-info"><span class="dp-pick-name">${esc(o.label)}</span>${
          o.sub ? `<span class="dp-pick-sub">${esc(o.sub)}</span>` : ""
        }</span>
      </button>`;
    })
    .join("");
  return `${search}<div class="dp-pick dp-pick-scroll dp-sheet-pick" role="radiogroup">${items}</div>
    <div class="dp-text-sm dp-text-muted dp-pick-none" data-pick-none hidden>Không có nhân viên phù hợp</div>`;
}

function bindPicker(root, onPick) {
  const btns = Array.from(root.querySelectorAll("[data-pick]"));
  btns.forEach((b) =>
    b.addEventListener("click", () => {
      btns.forEach((x) => {
        x.classList.toggle("is-active", x === b);
        x.setAttribute("aria-checked", x === b ? "true" : "false");
      });
      onPick(b.dataset.pick);
    })
  );
  const q = root.querySelector("[data-pick-q]");
  const none = root.querySelector("[data-pick-none]");
  if (!q) return;
  q.addEventListener("input", () => {
    const words = fold(q.value).split(" ").filter(Boolean);
    let shown = 0;
    btns.forEach((b) => {
      const ok = b.dataset.pick === TARGET_NPP || words.every((w) => b.dataset.fold.includes(w));
      b.hidden = !ok;
      if (ok && b.dataset.pick !== TARGET_NPP) shown += 1;
    });
    if (none) none.hidden = shown > 0 || !words.length;
  });
}

function noteField(id, placeholder) {
  return `<div class="dp-field">
    <label class="dp-field-label" for="${id}">Ghi chú</label>
    <textarea class="dp-textarea" id="${id}" data-note maxlength="500" rows="2" placeholder="${esc(placeholder)}"></textarea>
  </div>`;
}

function ruleBox(text) {
  return `<div class="dp-sheet-rule">${icon("circle-info")}<span>${esc(text)}</span></div>`;
}

// ── Sheet Gán NV phụ trách ──
// points: [{ name, point_name, staff_name }]; staff: overview.staff; onDone(res) sau khi thành công.
export function openAssignSheet({ points, staff, onDone }) {
  const list = (points || []).filter((p) => p && p.name);
  if (!list.length) {
    toastError("Chưa chọn điểm bán nào");
    return;
  }
  if (list.length > BULK_MAX) {
    toastError(`Tối đa ${formatNumber(BULK_MAX)} điểm mỗi lần — hãy lọc bớt rồi chọn lại`);
    return;
  }
  let target = null;
  const preview =
    list
      .slice(0, 5)
      .map(
        (p) =>
          `<li><b>${esc(p.point_name || p.name)}</b>${p.staff_name ? `<span>${esc(p.staff_name)}</span>` : ""}</li>`
      )
      .join("") +
    (list.length > 5 ? `<li class="dp-sheet-more">… và ${formatNumber(list.length - 5)} điểm khác</li>` : "");

  openSheet({
    title: "Gán NV phụ trách",
    body: `
      <div class="dp-fieldset">
        <div class="dp-fieldset-title">${formatNumber(list.length)} điểm đã chọn</div>
        <ul class="dp-sheet-list">${preview}</ul>
      </div>
      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Giao cho</div>
        ${pickerHtml(staffTargets(staff), null)}
      </div>
      ${noteField("dp-assign-note", "VD: chia lại tuyến tháng này")}
      ${ruleBox(RULE_TEXT)}`,
    footer: `<button type="button" class="dp-btn-outline" data-sheet-close>Huỷ</button>
      <button type="button" class="dp-btn-primary" data-ok disabled>${icon("right-left")} Chuyển ${formatNumber(
        list.length
      )} điểm</button>`,
    onMount: (sheet, close) => {
      const ok = sheet.querySelector("[data-ok]");
      bindPicker(sheet, (value) => {
        target = value;
        ok.disabled = false;
      });
      ok.addEventListener("click", async () => {
        if (!target) return;
        const res = await busy(ok, () =>
          call("salep.api.npp_manage.npp_assign_points", {
            points: JSON.stringify(list.map((p) => p.name)),
            target,
            note: sheet.querySelector("[data-note]").value.trim(),
          })
        );
        if (!res) return;
        const skipped = res.skipped ? ` · ${formatNumber(res.skipped)} điểm không đổi` : "";
        toastSuccess(
          `Đã chuyển ${formatNumber(res.moved)} điểm · ${formatNumber(res.participations)} lượt tham gia${skipped}`
        );
        close();
        if (onDone) onDone(res);
      });
    },
  });
}

// ── Sheet Nghỉ việc ──
// staff: dòng NV (overview.staff hoặc staff_history.staff); staffList: overview.staff (chọn người nhận);
// stats?: staff_history.stats (số lượt còn hiệu lực chính xác). onDone(res, target).
export function openOffboardSheet({ staff, staffList, stats, onDone }) {
  if (!staff) return;
  if (staff.is_self) {
    toastError("Không thể tự cho mình nghỉ việc");
    return;
  }
  const name = staff.full_name || staff.user || staff.name;
  const targets = staffTargets(staffList, staff.name);
  targets[0] = { ...targets[0], label: "Về NPP (mặc định)", sub: "NPP giữ, chia lại cho NV sau" };
  let target = TARGET_NPP;
  const nPoints = stats ? stats.points : staff.points;
  const nParts = stats ? stats.active_participations : null;
  const num = (n) => (n == null ? "—" : formatNumber(n));

  openSheet({
    title: "Cho nhân viên nghỉ việc",
    body: `
      <p class="dp-sheet-text">Bàn giao toàn bộ điểm bán và lượt tham gia còn hiệu lực của <b>${esc(
        name
      )}</b>, rồi chuyển hồ sơ sang <b>Nghỉ việc</b>.</p>
      <div class="dp-sheet-sum">
        <div><b>${num(nPoints)}</b><span>điểm bán sẽ bàn giao</span></div>
        <div><b>${num(nParts)}</b><span>lượt còn hiệu lực</span></div>
      </div>
      <div class="dp-fieldset">
        <div class="dp-fieldset-title">Bàn giao cho</div>
        ${pickerHtml(targets, TARGET_NPP)}
      </div>
      ${noteField("dp-offboard-note", "VD: nghỉ từ đầu tháng")}
      <div class="dp-reason-bar">${icon("triangle-exclamation")}<div><strong>Lưu ý</strong><p>
        Tài khoản đăng nhập của nhân viên sẽ bị khoá (trừ tài khoản chủ NPP). Lượt của chương trình
        đã kết thúc giữ nguyên người thực hiện.</p></div></div>`,
    footer: `<button type="button" class="dp-btn-outline" data-sheet-close>Huỷ</button>
      <button type="button" class="dp-btn-danger" data-ok>${icon("door-open")} Cho nghỉ việc</button>`,
    onMount: (sheet, close) => {
      const ok = sheet.querySelector("[data-ok]");
      bindPicker(sheet, (value) => (target = value));
      ok.addEventListener("click", async () => {
        const res = await busy(ok, () =>
          call("salep.api.npp_manage.npp_offboard_staff", {
            staff: staff.name,
            target,
            note: sheet.querySelector("[data-note]").value.trim(),
          })
        );
        if (!res) return;
        toastSuccess(
          `Đã cho ${name} nghỉ việc · bàn giao ${formatNumber(res.points)} điểm · ${formatNumber(
            res.participations
          )} lượt tham gia${res.disabled ? " · đã khoá tài khoản" : ""}`
        );
        close();
        if (onDone) onDone(res, target);
      });
    },
  });
}

// ── Bật/tắt hoạt động điểm ──
export async function setPointsActive(names, active) {
  const res = await call("salep.api.npp_manage.npp_set_points_active", {
    points: JSON.stringify(names),
    active: active ? 1 : 0,
  });
  const n = formatNumber(res.updated);
  if (res.updated) toastSuccess(active ? `Đã kích hoạt ${n} điểm` : `Đã ngừng hoạt động ${n} điểm`);
  else toast("Không có điểm nào cần đổi trạng thái");
  return res;
}

// Sheet xác nhận cho thao tác async: nút OK chạy run() có spinner; xong → đóng + onDone(kết quả).
export function confirmAction({ title, message, okLabel = "Đồng ý", okIcon = "check", danger = false, run, onDone }) {
  openSheet({
    title,
    body: `<p class="dp-sheet-text">${esc(message)}</p>`,
    footer: `<button type="button" class="dp-btn-outline" data-sheet-close>Huỷ</button>
      <button type="button" class="${danger ? "dp-btn-danger" : "dp-btn-primary"}" data-ok>${icon(okIcon)} ${esc(
        okLabel
      )}</button>`,
    onMount: (sheet, close) => {
      const ok = sheet.querySelector("[data-ok]");
      ok.addEventListener("click", async () => {
        const res = await busy(ok, run);
        if (!res) return;
        close();
        if (onDone) onDone(res);
      });
    },
  });
}

// ── Sheet chi tiết điểm bán (ngoài chế độ chọn nhiều) ──
// point: dòng điểm (overview.points / staff_history.points + staff_name, owner_kind...).
// staff: mảng overview.staff HOẶC hàm async trả mảng đó (nạp khi cần). onParticipations(point) tuỳ chọn.
export function openPointSheet({ point, staff, onDone, onParticipations }) {
  const p = point || {};
  const active = !!p.is_active;
  const info = [
    p.phone
      ? `<div class="dp-info-row">${icon("phone")}<div><a class="dp-info-main dp-tel" href="tel:${esc(
          String(p.phone).replace(/[^0-9+]/g, "")
        )}">${esc(p.phone)}</a></div></div>`
      : "",
    p.address_line
      ? `<div class="dp-info-row">${icon("location-dot")}<div class="dp-info-main">${esc(p.address_line)}</div></div>`
      : "",
    `<div class="dp-info-row">${icon("user-tie")}<div><div class="dp-info-sub">NV phụ trách</div>${ownerChip(p)}</div></div>`,
    `<div class="dp-info-row">${icon("bullhorn")}<div><div class="dp-info-main">${formatNumber(
      p.participations || 0
    )} lượt tham gia · ${formatNumber(p.approved || 0)} đã duyệt</div></div></div>`,
    `<div class="dp-info-row">${icon(active ? "circle-check" : "circle-pause")}<div class="dp-info-main">${
      active ? "Đang hoạt động" : "Ngừng hoạt động"
    }</div></div>`,
  ].join("");
  const photo = p.store_photo
    ? `<div class="dp-detail-photo" data-zoom="${esc(p.store_photo)}" data-caption="${esc(p.point_name || "")}"><img src="${esc(
        p.store_photo
      )}" alt=""></div>`
    : "";

  openSheet({
    title: p.point_name || p.name || "Điểm bán",
    body: `${photo}<div class="dp-card">${info}</div>
      <div class="dp-sheet-stack">
        <button type="button" class="dp-btn-primary" data-pt-act="assign">${icon("user-pen")} Gán NV phụ trách</button>
        <button type="button" class="dp-btn-outline" data-pt-act="toggle">${icon(active ? "circle-pause" : "circle-play")} ${
          active ? "Ngừng hoạt động" : "Kích hoạt"
        }</button>
        ${
          onParticipations
            ? `<button type="button" class="dp-btn-outline" data-pt-act="parts">${icon("list-check")} Xem lượt tham gia</button>`
            : ""
        }
      </div>`,
    onMount: (sheet) => {
      sheet.querySelectorAll("[data-pt-act]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const act = btn.dataset.ptAct;
          if (act === "assign") {
            const list = await busy(
              btn,
              async () => (typeof staff === "function" ? await staff() : staff) || [],
              "Đang tải..."
            );
            if (!list) return;
            openAssignSheet({
              points: [{ name: p.name, point_name: p.point_name, staff_name: p.staff_name }],
              staff: list,
              onDone,
            });
          } else if (act === "toggle") {
            const res = await busy(btn, () => setPointsActive([p.name], !active));
            if (!res) return;
            closeSheet();
            if (onDone) onDone(res);
          } else if (act === "parts") {
            closeSheet();
            onParticipations(p);
          }
        })
      );
    },
  });
}

// ── Thanh thao tác hàng loạt (cố định ngay trên bottom nav, như .dp-actionbar) ──
// actions: [{ act, label, icon, cls }] (update() có thể đổi theo tab). Gắn vào host (container
// view → tự gỡ khi đổi màn). Trả { el, update({ count, total, allOn, actions? }), hide() }.
export function bulkBar(host, { actions = [], onAction, onSelectAll, onCancel }) {
  const el = document.createElement("div");
  el.className = "dp-bulkbar";
  el.hidden = true;
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", "Thao tác với các mục đã chọn");
  host.appendChild(el);
  let state = { count: 0, total: 0, allOn: false, actions };

  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-bulk-all")) onSelectAll(!state.allOn);
    else if (b.hasAttribute("data-bulk-cancel")) onCancel();
    else if (b.dataset.bulkAct) onAction(b.dataset.bulkAct, b);
  });

  function update(next) {
    state = { count: 0, total: 0, allOn: false, actions, ...next };
    const { count, total, allOn } = state;
    el.innerHTML = `
      <div class="dp-bulkbar-top">
        <span class="dp-bulkbar-count">Đã chọn <b>${formatNumber(count)}</b></span>
        <button type="button" class="dp-bulkbar-link" data-bulk-all${total ? "" : " disabled"}>${
          allOn ? "Bỏ chọn tất cả" : `Chọn tất cả (${formatNumber(total)})`
        }</button>
        <button type="button" class="dp-bulkbar-link" data-bulk-cancel>Huỷ</button>
      </div>
      <div class="dp-bulkbar-actions">
        ${state.actions
          .map(
            (a) =>
              `<button type="button" class="${a.cls || "dp-btn-primary"}" data-bulk-act="${esc(a.act)}"${
                count ? "" : " disabled"
              }>${a.icon ? icon(a.icon) : ""} ${esc(a.label)}</button>`
          )
          .join("")}
      </div>`;
    el.hidden = false;
  }

  return {
    el,
    update,
    hide() {
      el.hidden = true;
    },
  };
}

// Ô tick hiển thị trên thẻ ở chế độ chọn nhiều (thẻ là vùng chạm, ô tick chỉ là dấu).
export function checkMark(on) {
  return `<span class="dp-check${on ? " is-on" : ""}" aria-hidden="true">${icon("check")}</span>`;
}

// ── Danh sách dài: render `step` dòng đầu + nút "Xem thêm (còn N)" nối thêm từng đợt ──
// render(rowsSlice, startIndex) → chuỗi HTML các dòng. Trả chuỗi HTML để nhúng vào template.
const MORE = new Map();
let moreSeq = 0;

function moreButton(id) {
  const st = MORE.get(id);
  const left = st ? st.rows.length - st.shown : 0;
  return left > 0
    ? `<button type="button" class="dp-more-btn" data-more="${id}">Xem thêm (còn ${formatNumber(left)})</button>`
    : "";
}

export function moreList({ rows, render, step = 30, listClass = "dp-list" }) {
  const id = `more${++moreSeq}`;
  if (MORE.size > 50) MORE.delete(MORE.keys().next().value); // giới hạn bộ nhớ
  const all = rows || [];
  MORE.set(id, { rows: all, render, step, shown: Math.min(step, all.length) });
  return `<div class="${listClass}" data-more-list="${id}">${render(all.slice(0, step), 0)}</div>${moreButton(id)}`;
}

// Delegation 1 lần khi module nạp — nút "Xem thêm" sống dù danh sách nằm sâu trong innerHTML.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-more]");
  if (!btn) return;
  const id = btn.dataset.more;
  const st = MORE.get(id);
  const list = document.querySelector(`[data-more-list="${id}"]`);
  if (!st || !list) return;
  const start = st.shown;
  st.shown = Math.min(st.rows.length, start + st.step);
  list.insertAdjacentHTML("beforeend", st.render(st.rows.slice(start, st.shown), start));
  const left = st.rows.length - st.shown;
  if (left > 0) btn.textContent = `Xem thêm (còn ${formatNumber(left)})`;
  else btn.remove();
});
