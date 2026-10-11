// Trả thưởng điểm bán (doc/09 §5): thẻ Lần 1 / Lần 2 trên chi tiết lượt + sheet ghi / sửa / xoá.
// Ảnh trả thưởng CHỌN TỪ THƯ VIỆN (ảnh chuyển khoản, biên nhận…): input KHÔNG capture, KHÔNG xin
// GPS. Ảnh upload qua lib/api.js uploadFile (nén như sẵn có, không gắn doctype). Mọi quyền và
// luật (R1–R7) kiểm ở server — salep.api.payout.record / remove.
import { esc, formatDate, formatDateTime, formatNumber, formatVND } from "../lib/format.js";
import { icon } from "../lib/dom.js";
import { call, uploadFile } from "../lib/api.js";
import { openSheet } from "./sheet.js";
import { toast, toastError, toastSuccess } from "./toast.js";
import { busy, confirmAction } from "./npp-ui.js";

export const ROUNDS = [1, 2];
export const MAX_PHOTOS = 10; // khớp MAX_PHOTOS ở salep/api/payout.py

const pad = (n) => String(n).padStart(2, "0");

// Hôm nay theo giờ máy (YYYY-MM-DD) — KHÔNG dùng toISOString (UTC lệch ngày lúc sáng sớm).
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");

// Lần `n` trong participation_payouts.rounds (luôn trả object, chưa trả → paid=false).
export function roundOf(payouts, n) {
  const list = (payouts && payouts.rounds) || [];
  return list.find((r) => Number(r.round) === n) || { round: n, paid: false, photos: [] };
}

// Số lần đã trả (0/1/2).
export function paidCount(payouts) {
  return ROUNDS.filter((n) => roundOf(payouts, n).paid).length;
}

// Chip "Trả thưởng N/2" (danh sách lượt) — 0 vàng, 1 xanh dương, 2 xanh lá.
export function payoutChip(done) {
  const n = Math.max(0, Math.min(2, Number(done) || 0));
  return `<span class="dp-pay-chip is-${n}">${icon(n === 2 ? "circle-check" : "coins")} Trả thưởng ${n}/2</span>`;
}

// ── Thẻ Trả thưởng trên chi tiết lượt ──

function thumbsHtml(r) {
  const photos = (r.photos || []).filter((p) => p && p.url);
  if (!photos.length) return "";
  const cap = `Trả thưởng lần ${r.round}${r.payout_date ? " · " + formatDate(r.payout_date) : ""}`;
  return `<div class="dp-pay-thumbs">${photos
    .map(
      (p, i) =>
        `<button type="button" class="dp-pay-thumb" data-zoom="${esc(p.url)}" data-caption="${esc(cap)}" aria-label="${esc(
          `Xem ảnh ${i + 1} — ${cap}`
        )}"><img src="${esc(p.url)}" alt="" loading="lazy"></button>`
    )
    .join("")}</div>`;
}

function roundRowHtml(r, { canRecord, canDelete, prevPaid, nextPaid }) {
  const n = r.round;
  const acts = [];
  if (!r.paid) {
    if (canRecord) {
      acts.push(
        `<button type="button" class="dp-btn-primary dp-pay-btn" data-pay-act="record" data-round="${n}"${
          prevPaid ? "" : " disabled"
        }>${icon("coins")} Ghi nhận lần ${n}</button>`
      );
    }
  } else {
    if (canRecord) {
      acts.push(
        `<button type="button" class="dp-btn-outline dp-pay-btn" data-pay-act="edit" data-round="${n}">${icon(
          "pen"
        )} Sửa</button>`
      );
    }
    if (canDelete) {
      // R7: không xoá Lần 1 khi đã có Lần 2.
      acts.push(
        `<button type="button" class="dp-pay-del dp-pay-btn" data-pay-act="delete" data-round="${n}"${
          nextPaid ? ` disabled title="Xoá Lần 2 trước"` : ""
        }>${icon("trash-can")} Xoá</button>`
      );
    }
  }
  let hint = "";
  if (!r.paid && canRecord && !prevPaid) hint = `Ghi nhận Lần ${n - 1} trước`;
  else if (r.paid && canDelete && nextPaid) hint = `Muốn xoá Lần ${n}: xoá Lần ${n + 1} trước`;
  const status = r.paid
    ? `<span class="dp-pay-ok">${icon("circle-check")} ${esc(formatDate(r.payout_date))}</span>`
    : `<span class="dp-pay-none">Chưa trả</span>`;
  const meta = r.paid
    ? `<div class="dp-pay-meta">${icon("user-pen")} ${esc(r.recorded_by_label || r.recorded_by || "—")}${
        r.recorded_on ? ` · ${esc(formatDateTime(r.recorded_on))}` : ""
      }</div>`
    : "";
  const note = r.paid && r.note ? `<div class="dp-pay-note">${esc(r.note)}</div>` : "";
  return `<div class="dp-pay-row${r.paid ? " is-paid" : ""}">
    <div class="dp-pay-row-head"><span class="dp-pay-round">Lần ${n}</span>${status}</div>
    ${meta}${note}${r.paid ? thumbsHtml(r) : ""}
    ${acts.length ? `<div class="dp-pay-acts">${acts.join("")}</div>` : ""}
    ${hint ? `<div class="dp-field-hint dp-pay-hint">${icon("circle-info")} ${esc(hint)}</div>` : ""}
  </div>`;
}

// payouts = salep.api.portal.get_participation().payouts (participation_payouts — doc/09 §3.3).
export function payoutCardHtml(payouts, { canRecord = false, canDelete = false } = {}) {
  if (!payouts) return "";
  const done = paidCount(payouts);
  const r1 = roundOf(payouts, 1);
  const r2 = roundOf(payouts, 2);
  const reward = Number(payouts.reward_per_point) || 0;
  return `<div class="dp-card dp-pay-card" data-pay-card>
    <div class="dp-pay-card-head">
      <div class="dp-card-heading">💰 Trả thưởng</div>
      ${payoutChip(done)}
    </div>
    ${reward ? `<div class="dp-pay-reward">${icon("coins")} Thưởng: ${esc(formatVND(reward))}/điểm</div>` : ""}
    ${roundRowHtml(r1, { canRecord, canDelete, prevPaid: true, nextPaid: r2.paid })}
    ${roundRowHtml(r2, { canRecord, canDelete, prevPaid: r1.paid, nextPaid: false })}
  </div>`;
}

// Gắn nút của thẻ (gọi lại sau mỗi lần vẽ thẻ). onDone(res) nhận participation_payouts mới.
export function bindPayoutCard(cardEl, { participation, pointName, payouts, onDone }) {
  if (!cardEl) return;
  cardEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pay-act]");
    if (!btn || btn.disabled || !cardEl.contains(btn)) return;
    const n = Number(btn.dataset.round);
    const act = btn.dataset.payAct;
    if (act === "delete") {
      confirmDelete({ participation, round: n, existing: roundOf(payouts, n), onDone });
      return;
    }
    // R3: ngày Lần 2 ≥ ngày Lần 1; sửa Lần 1 khi đã có Lần 2 → không sau ngày Lần 2.
    const r1 = roundOf(payouts, 1);
    const r2 = roundOf(payouts, 2);
    openPayoutSheet({
      participation,
      round: n,
      pointName,
      existing: act === "edit" ? roundOf(payouts, n) : null,
      minDate: n === 2 && r1.paid ? dateOnly(r1.payout_date) : "",
      maxDate: n === 1 && r2.paid ? dateOnly(r2.payout_date) : "",
      onDone,
    });
  });
}

// ── Sheet ghi / sửa trả thưởng ──
// existing = 1 phần tử rounds (đã trả) để sửa; null = ghi mới. minDate/maxDate (YYYY-MM-DD) tuỳ chọn
// — chỉ là gợi ý cho bộ chọn ngày, server vẫn kiểm R3/R4. onDone(res) sau khi lưu thành công.
export function openPayoutSheet({ participation, round, pointName, existing, minDate = "", maxDate = "", onDone }) {
  const n = Number(round);
  if (!participation || ![1, 2].includes(n)) return;
  const today = todayStr();
  const max = maxDate && maxDate < today ? maxDate : today;
  const editing = !!(existing && existing.paid);
  const photos = editing ? (existing.photos || []).map((p) => p && p.url).filter(Boolean) : [];
  let uploading = false;
  let saving = false;
  let pct = null; // % ảnh đang tải; null = không có ô đang tải
  let queue = { done: 0, total: 0 };
  const startDate = editing ? dateOnly(existing.payout_date) : today;

  openSheet({
    title: `💰 Trả thưởng lần ${n} — ${pointName || participation}`,
    body: `
      <div class="dp-field">
        <label class="dp-field-label" for="dp-pay-date">Ngày trả thưởng <span class="dp-req">*</span></label>
        <input class="dp-input dp-pay-date" type="date" id="dp-pay-date" data-pay-date required
          value="${esc(startDate)}" max="${esc(max)}"${minDate ? ` min="${esc(minDate)}"` : ""} />
        ${
          minDate
            ? `<div class="dp-field-hint">${icon("circle-info")} Từ ngày trả Lần 1 (${esc(formatDate(minDate))}) trở đi</div>`
            : ""
        }
      </div>
      <div class="dp-field">
        <div class="dp-field-label dp-pay-photo-label">
          <span>Ảnh trả thưởng <span class="dp-req">*</span></span>
          <span class="dp-pay-count" data-pay-count></span>
        </div>
        <input type="file" accept="image/*" multiple hidden data-pay-file />
        <div class="dp-photo-grid dp-pay-grid" data-pay-grid></div>
        <div class="dp-field-hint">${icon("images")} Chọn từ thư viện: ảnh chuyển khoản, biên nhận… (1–${MAX_PHOTOS} ảnh)</div>
      </div>
      <div class="dp-field">
        <label class="dp-field-label" for="dp-pay-note">Ghi chú</label>
        <textarea class="dp-textarea" id="dp-pay-note" data-pay-note maxlength="500" rows="2"
          placeholder="VD: chuyển khoản ngày 10, người nhận chủ cửa hàng">${esc(editing ? existing.note || "" : "")}</textarea>
      </div>`,
    footer: `<button type="button" class="dp-btn-outline" data-sheet-close>Huỷ</button>
      <button type="button" class="dp-btn-primary" data-ok>${icon("floppy-disk")} Lưu trả thưởng</button>`,
    onMount: (sheet, close) => {
      sheet.classList.add("dp-pay-sheet"); // tiêu đề 2 dòng (tên điểm dài) — shell.css
      const grid = sheet.querySelector("[data-pay-grid]");
      const input = sheet.querySelector("[data-pay-file]");
      const count = sheet.querySelector("[data-pay-count]");
      const dateEl = sheet.querySelector("[data-pay-date]");
      const noteEl = sheet.querySelector("[data-pay-note]");
      const ok = sheet.querySelector("[data-ok]");

      function render() {
        let h = photos
          .map(
            (url, i) => `<div class="dp-photo-cell">
              <img src="${esc(url)}" alt="">
              <button type="button" class="dp-photo-rm dp-pay-rm" data-rm="${i}" aria-label="Xoá ảnh ${i + 1}"${
                uploading ? " disabled" : ""
              }>${icon("xmark")}</button>
            </div>`
          )
          .join("");
        if (pct !== null) {
          h += `<div class="dp-photo-cell is-loading"><div class="dp-photo-pct">${pct}%</div></div>`;
        }
        if (photos.length < MAX_PHOTOS && !uploading) {
          h += `<button type="button" class="dp-photo-add dp-pay-add" data-add${saving ? " disabled" : ""}>
            <span class="dp-photo-add-ic">${icon("images")}</span>
            <span class="dp-photo-add-tx">${photos.length ? "Thêm ảnh" : "Chọn ảnh"}</span>
          </button>`;
        }
        grid.innerHTML = h;
        count.textContent = uploading
          ? `Đang tải ${formatNumber(Math.min(queue.done + 1, queue.total))}/${formatNumber(queue.total)}…`
          : `${formatNumber(photos.length)}/${MAX_PHOTOS}`;
        // Lúc đang lưu, busy() tự khoá/mở nút Lưu (nó bỏ qua nút đã disabled → KHÔNG đụng ở đây).
        if (!saving) ok.disabled = uploading;
      }
      render();

      grid.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-rm]");
        if (rm) {
          if (uploading || saving) return;
          photos.splice(Number(rm.dataset.rm), 1);
          render();
          return;
        }
        if (e.target.closest("[data-add]") && !uploading && !saving) input.click();
      });

      input.addEventListener("change", async () => {
        const picked = Array.from(input.files || []);
        input.value = "";
        if (!picked.length) return;
        const images = picked.filter((f) => !f.type || f.type.startsWith("image/"));
        if (images.length < picked.length) toastError("Chỉ nhận tệp ảnh — đã bỏ qua tệp khác");
        const room = MAX_PHOTOS - photos.length;
        const files = images.slice(0, Math.max(0, room));
        if (images.length > files.length) {
          toast(`Tối đa ${MAX_PHOTOS} ảnh — đã bỏ qua ${formatNumber(images.length - files.length)} ảnh`, "warning");
        }
        if (!files.length) return;
        uploading = true;
        queue = { done: 0, total: files.length };
        for (const file of files) {
          if (!sheet.isConnected) break; // sheet đã đóng giữa chừng → dừng tải tiếp
          pct = 0;
          render();
          try {
            const res = await uploadFile(file, {
              onProgress: (p) => {
                pct = p;
                const cell = grid.querySelector(".dp-photo-pct");
                if (cell) cell.textContent = `${p}%`;
              },
            });
            if (res && res.file_url && !photos.includes(res.file_url)) photos.push(res.file_url);
          } catch (err) {
            toastError((err && err.message) || "Tải ảnh thất bại");
          }
          queue.done += 1;
        }
        uploading = false;
        pct = null;
        if (sheet.isConnected) render();
      });

      ok.addEventListener("click", async () => {
        if (uploading) {
          toast("Đang tải ảnh, vui lòng chờ xong rồi lưu", "warning");
          return;
        }
        const date = dateEl.value;
        if (!date) {
          toastError("Chưa chọn ngày trả thưởng");
          dateEl.focus();
          return;
        }
        if (date > today) {
          toastError("Ngày trả thưởng không được ở tương lai");
          return;
        }
        if (minDate && date < minDate) {
          toastError(`Ngày trả Lần 2 phải từ ${formatDate(minDate)} (ngày trả Lần 1) trở đi`);
          return;
        }
        if (maxDate && date > maxDate) {
          toastError(`Ngày trả Lần 1 không được sau ${formatDate(maxDate)} (ngày trả Lần 2)`);
          return;
        }
        if (!photos.length) {
          toastError("Cần ít nhất 1 ảnh trả thưởng");
          return;
        }
        saving = true;
        render();
        const res = await busy(
          ok,
          () =>
            call("salep.api.payout.record", {
              participation,
              payout_round: n,
              payout_date: date,
              photos: JSON.stringify(photos),
              note: noteEl.value.trim(),
            }),
          "Đang lưu..."
        );
        saving = false;
        if (!res) {
          if (sheet.isConnected) render();
          return;
        }
        toastSuccess(editing ? `Đã cập nhật trả thưởng lần ${n}` : `Đã ghi nhận trả thưởng lần ${n}`);
        if (sheet.isConnected) close(); // người dùng có thể đã bấm Huỷ lúc đang lưu — đừng đóng sheet khác
        if (onDone) onDone(res); // đã lưu → vẫn làm mới màn
      });
    },
  });
}

// ── Xoá 1 lần trả thưởng (chủ NPP / quản lý — server kiểm can_delete + R7) ──
export function confirmDelete({ participation, round, existing, onDone }) {
  const n = Number(round);
  const when = existing && existing.payout_date ? ` (ngày ${formatDate(existing.payout_date)})` : "";
  confirmAction({
    title: `Xoá trả thưởng lần ${n}`,
    message: `Xoá bản ghi trả thưởng Lần ${n}${when}? Ngày trả, ảnh và ghi chú của lần này sẽ bị xoá.`,
    okLabel: "Xoá",
    okIcon: "trash-can",
    danger: true,
    run: () => call("salep.api.payout.remove", { participation, payout_round: n }),
    onDone: (res) => {
      toastSuccess(`Đã xoá trả thưởng lần ${n}`);
      if (onDone) onDone(res);
    },
  });
}
