// Quản lý NPP (chủ NPP — doc/08 §8): #/npp?t=staff|points|programs + bộ lọc trên URL.
// Thẻ danh sách + lọc (đổi tab/lọc chỉ replaceState, không render lại cả màn), chế độ
// Chọn nhiều + thanh thao tác, sheet Gán NV / chi tiết điểm. Quyền kiểm ở server.
import { icon, emptyState, skeleton } from "../lib/dom.js";
import { esc, formatDate, formatNumber, statusBadge, STATES } from "../lib/format.js";
import { call } from "../lib/api.js";
import { ctx, isNppOwner } from "../lib/store.js";
import { toastError } from "../components/toast.js";
import {
  TARGET_NPP,
  matchesAll,
  initials,
  ownerChip,
  checkMark,
  moreList,
  bulkBar,
  busy,
  openAssignSheet,
  openPointSheet,
  confirmAction,
  setPointsActive,
} from "../components/npp-ui.js";

const OTHER = "__other__"; // lọc Phụ trách = Khác (Administrator, NV đã xoá hồ sơ, NV NPP khác…)
const MULTI_KEY = "dp_npp_multi";
const PARTS_LIMIT = 2000; // npp_participations trả tối đa 2000 lượt

const TABS = [
  { key: "staff", label: "Nhân viên" },
  { key: "points", label: "Điểm bán" },
  { key: "programs", label: "Chương trình" },
];
// Khoá lọc theo tab; "" = mặc định (không ghi lên URL).
const FILTERS = {
  staff: ["q", "st"],
  points: ["q", "owner", "st", "joined"],
  programs: ["q", "program", "owner", "state", "point"],
};
const UNITS = { staff: "nhân viên", points: "điểm bán", programs: "lượt tham gia" };
const POINT_ACTIONS = [
  { act: "assign", label: "Gán NV", icon: "user-pen" },
  { act: "off", label: "Ngừng HĐ", icon: "circle-pause", cls: "dp-btn-outline" },
  { act: "on", label: "Kích hoạt", icon: "circle-play", cls: "dp-btn-outline" },
];
const PART_ACTIONS = [{ act: "assign", label: "Gán NV phụ trách điểm bán", icon: "user-pen" }];

const isTab = (key) => TABS.some((x) => x.key === key);
const blank = (tab) => Object.fromEntries(FILTERS[tab].map((k) => [k, ""]));

// Khoá "người phụ trách" của 1 điểm/lượt cho bộ lọc Phụ trách.
function ownerKey(r) {
  if (r.owner_kind === "npp") return TARGET_NPP;
  if (r.owner_kind === "staff" && r.staff) return r.staff;
  return OTHER;
}

function readMulti() {
  try {
    return localStorage.getItem(MULTI_KEY) === "1";
  } catch {
    return false;
  }
}
function saveMulti(on) {
  try {
    localStorage.setItem(MULTI_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
}

function searchBox(value, placeholder) {
  return `<div class="dp-search-wrap dp-npp-search">${icon("magnifying-glass")}
    <input class="dp-search" type="search" data-f="q" value="${esc(value)}" placeholder="${esc(placeholder)}"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
      inputmode="search" enterkeyhint="search" aria-label="${esc(placeholder)}" />
  </div>`;
}

function selectBox(key, label, options, wide = false) {
  return `<select class="dp-select${wide ? " dp-filter-wide" : ""}" data-f="${key}" aria-label="${esc(
    label
  )}">${options}</select>`;
}

const rowRole = (multi, on) => (multi ? `role="checkbox" aria-checked="${on}"` : `role="button"`);

// ── Thẻ danh sách ──

function staffRow(s) {
  const badges = [];
  if (s.resigned) badges.push(`<span class="dp-badge dp-badge-danger">Đã nghỉ</span>`);
  else if (!s.active) badges.push(`<span class="dp-badge dp-badge-muted">Tạm dừng</span>`);
  if (s.is_self) badges.push(`<span class="dp-badge dp-badge-primary">Bạn</span>`);
  const work = [`${formatNumber(s.points)} điểm`, `${formatNumber(s.participations)} lượt`];
  if (s.pending) work.push(`${formatNumber(s.pending)} chờ duyệt`);
  return `<div class="dp-list-item" data-go="/npp/staff/${encodeURIComponent(s.name)}">
    <div class="dp-avatar-sm${s.resigned ? " is-left" : ""}">${esc(initials(s.full_name || s.user))}</div>
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(s.full_name || s.user)}</div>
      <div class="dp-list-sub">${esc(s.phone || s.user || "")}</div>
      <div class="dp-list-sub">${esc(work.join(" · "))}${
        s.resigned && s.left_on ? ` · nghỉ từ ${esc(formatDate(s.left_on))}` : ""
      }</div>
    </div>
    ${badges.length ? `<div class="dp-npp-side">${badges.join("")}</div>` : ""}
    <span class="dp-list-chev">${icon("chevron-right")}</span>
  </div>`;
}

function pointRow(p, multi, on) {
  const thumb = p.store_photo
    ? `<img class="dp-list-thumb" src="${esc(p.store_photo)}" alt="" loading="lazy">`
    : `<div class="dp-list-thumb">${icon("store")}</div>`;
  return `<div class="dp-list-item dp-npp-item${on ? " is-selected" : ""}" data-row="${esc(p.name)}" tabindex="0" ${rowRole(
    multi,
    on
  )}>
    ${multi ? checkMark(on) : ""}
    ${thumb}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(p.point_name || p.name)}</div>
      <div class="dp-list-sub">${esc([p.phone, p.address_line].filter(Boolean).join(" · ") || "—")}</div>
      <div class="dp-npp-meta">${ownerChip(p)}<span>${formatNumber(p.participations)} lượt · ${formatNumber(
        p.approved
      )} duyệt</span>${p.is_active ? "" : `<span class="dp-badge dp-badge-muted">Ngừng HĐ</span>`}</div>
    </div>
  </div>`;
}

function partRow(r, multi, on) {
  const attrs = multi
    ? `data-row="${esc(r.name)}" tabindex="0" ${rowRole(true, on)}`
    : `data-go="/participations/${encodeURIComponent(r.name)}"`;
  // Lượt (chương trình còn hiệu lực) đang do người khác NV phụ trách điểm giữ → gán lại điểm sẽ sửa.
  const drift = r.program_active && r.point_owner && r.owner !== r.point_owner;
  return `<div class="dp-list-item dp-npp-item${on ? " is-selected" : ""}" ${attrs}>
    ${multi ? checkMark(on) : ""}
    <div class="dp-list-body">
      <div class="dp-list-title">${esc(r.point_name || r.display_point)}</div>
      <div class="dp-list-sub">${esc(r.program_name || r.promotion_program)}${
        r.program_active ? "" : " · đã kết thúc"
      }</div>
      <div class="dp-npp-meta">${ownerChip(r)}${
        drift
          ? `<span class="dp-npp-drift">${icon("triangle-exclamation")} Điểm: ${esc(r.point_staff_name || "—")}</span>`
          : ""
      }</div>
    </div>
    <div class="dp-npp-side">${statusBadge(r.workflow_state)}</div>
  </div>`;
}

export async function render({ container, query }) {
  if (!isNppOwner()) {
    container.innerHTML = emptyState("Chỉ tài khoản nhà phân phối mới dùng được chức năng này.", "🔒");
    return;
  }

  const S = {
    tab: isTab(query.t) ? query.t : "staff",
    f: { staff: blank("staff"), points: blank("points"), programs: blank("programs") },
    data: null,
    parts: new Map(), // chương trình ("" = mọi chương trình) → lượt
    multi: readMulti(),
    sel: new Set(), // tên điểm (tab Điểm bán) hoặc tên lượt (tab Chương trình)
    visible: [], // tập đang lọc → "Chọn tất cả"
  };
  FILTERS[S.tab].forEach((k) => {
    if (query[k]) S.f[S.tab][k] = query[k];
  });
  let pointsByName = new Map();
  const partsByName = new Map();

  async function loadData() {
    S.data = await call("salep.api.npp_manage.npp_overview");
    pointsByName = new Map((S.data.points || []).map((p) => [p.name, p]));
    if (S.tab === "programs") await ensureParts();
  }

  // Lượt của chương trình đang lọc; đã có bản "mọi chương trình" đủ (< giới hạn) → lọc tại chỗ.
  async function ensureParts() {
    const key = S.f.programs.program || "";
    if (!S.parts.has(key)) {
      const all = S.parts.get("");
      const rows =
        key && all && all.length < PARTS_LIMIT
          ? all.filter((r) => r.promotion_program === key)
          : await call("salep.api.npp_manage.npp_participations", key ? { program: key } : {});
      S.parts.set(key, rows || []);
      (rows || []).forEach((r) => partsByName.set(r.name, r));
    }
    return S.parts.get(key);
  }
  const currentParts = () => S.parts.get(S.f.programs.program || "") || [];

  try {
    await loadData();
  } catch (e) {
    container.innerHTML = emptyState("Không tải được dữ liệu quản lý NPP", "⚠️", e.message);
    return;
  }

  container.innerHTML = `
    <div class="dp-npp">
      <div data-head></div>
      <div class="dp-pill-nav dp-npp-tabs" role="tablist" data-tabs></div>
      <div data-filters></div>
      <div class="dp-npp-toolbar" data-toolbar></div>
      <div data-list></div>
    </div>`;
  const root = container.firstElementChild;
  const el = (k) => root.querySelector(`[data-${k}]`);

  const bar = bulkBar(container, {
    actions: POINT_ACTIONS,
    onAction: runBulk,
    onSelectAll: (on) => {
      S.visible.forEach((r) => (on ? S.sel.add(r.name) : S.sel.delete(r.name)));
      root.querySelectorAll("[data-row]").forEach((row) => paintRow(row, S.sel.has(row.dataset.row)));
      updateBar();
    },
    onCancel: () => setMulti(false),
  });

  // ── Lọc ──

  function rowsFor(tab) {
    const f = S.f[tab];
    if (tab === "staff") {
      return (S.data.staff || []).filter(
        (s) =>
          (f.st === "all" || (f.st === "left" ? s.resigned : !s.resigned)) &&
          matchesAll([s.full_name, s.phone, s.user], f.q)
      );
    }
    if (tab === "points") {
      return (S.data.points || []).filter(
        (p) =>
          (!f.owner || ownerKey(p) === f.owner) &&
          (!f.st || (f.st === "active") === !!p.is_active) &&
          (!f.joined || (f.joined === "yes") === !!p.participated) &&
          matchesAll([p.point_name, p.phone, p.address_line, p.staff_name, p.name], f.q)
      );
    }
    return currentParts().filter(
      (r) =>
        (!f.owner || ownerKey(r) === f.owner) &&
        (!f.state || (r.workflow_state || "") === f.state) &&
        (!f.point || r.display_point === f.point) &&
        matchesAll([r.point_name, r.point_phone, r.program_name, r.staff_name, r.display_point], f.q)
    );
  }

  // Phụ trách: NPP giữ / từng NV (NV đã nghỉ chỉ hiện khi còn giữ dữ liệu) / Khác — kèm số lượng.
  function ownerOptions(rows, sel) {
    const count = new Map();
    rows.forEach((r) => count.set(ownerKey(r), (count.get(ownerKey(r)) || 0) + 1));
    const n = (k) => formatNumber(count.get(k) || 0);
    let out = option("", "Phụ trách: tất cả", sel) + option(TARGET_NPP, `NPP giữ (chưa giao) (${n(TARGET_NPP)})`, sel);
    (S.data.staff || []).forEach((s) => {
      if (s.resigned && !count.get(s.name) && sel !== s.name) return;
      out += option(s.name, `${s.full_name || s.user}${s.resigned ? " (đã nghỉ)" : ""} (${n(s.name)})`, sel);
    });
    if (count.get(OTHER) || sel === OTHER) out += option(OTHER, `Khác (${n(OTHER)})`, sel);
    return out;
  }

  function programOptions(sel) {
    return (
      option("", "Chương trình: tất cả", sel) +
      (S.data.programs || [])
        .map((p) =>
          option(
            p.program,
            `${p.program_name}${p.is_active ? "" : " (đã kết thúc)"} · ${formatNumber(p.participations)} lượt`,
            sel
          )
        )
        .join("")
    );
  }

  function stateOptions(rows, sel) {
    const count = {};
    rows.forEach((r) => (count[r.workflow_state || ""] = (count[r.workflow_state || ""] || 0) + 1));
    return (
      option("", "Mọi trạng thái", sel) +
      Object.keys(STATES)
        .map((s) => option(s, `${s} (${formatNumber(count[s] || 0)})`, sel))
        .join("")
    );
  }

  function programSummary(name) {
    const p = (S.data.programs || []).find((x) => x.program === name);
    if (!p) return "";
    const pct = Math.min(100, Number(p.coverage_pct) || 0);
    return `<div class="dp-prog-card dp-npp-prog" data-go="/programs/${encodeURIComponent(p.program)}">
      <div class="dp-prog-top">
        <h3 class="dp-prog-title">${esc(p.program_name)}</h3>
        <span class="dp-badge ${p.is_active ? "dp-badge-primary" : "dp-badge-muted"}">${esc(p.status || "")}</span>
      </div>
      <div class="dp-prog-meta"><span>${icon("calendar")} ${esc(formatDate(p.start_date))} – ${esc(
        formatDate(p.end_date)
      )}</span></div>
      <div class="dp-progress-row"><span>${formatNumber(p.participations)} lượt · ${formatNumber(
        p.approved
      )} duyệt · ${formatNumber(p.pending)} chờ</span><b>Phủ ${esc(p.coverage_pct)}%</b></div>
      <div class="dp-progress-track"><div class="dp-progress-bar" style="width:${pct}%"></div></div>
    </div>`;
  }

  // ── Vẽ ──

  function drawHead() {
    const t = S.data.totals || {};
    el("head").innerHTML = `
      <div class="dp-view-banner">
        <div>
          <div class="dp-view-banner-subtitle">Quản lý nhà phân phối</div>
          <div class="dp-view-banner-title">${esc(S.data.customer_name || ctx.nppCustomer || "")}</div>
          <div class="dp-view-banner-subtitle">${formatNumber(t.points)} điểm · ${formatNumber(
            t.participations
          )} lượt · ${formatNumber(t.pending)} chờ duyệt</div>
        </div>
        <div class="dp-view-banner-badge">${formatNumber(t.staff_working)} NV đang làm</div>
      </div>
      ${
        t.unassigned_points
          ? `<a class="dp-alert-link dp-npp-callout" data-unassigned role="button" tabindex="0">${icon(
              "triangle-exclamation"
            )} <span><b>${formatNumber(t.unassigned_points)} điểm NPP đang giữ</b> — chia cho nhân viên</span> ${icon(
              "chevron-right",
              "dp-chev"
            )}</a>`
          : ""
      }`;
  }

  function drawTabs() {
    const t = S.data.totals || {};
    const count = { staff: t.staff, points: t.points, programs: t.programs };
    el("tabs").innerHTML = TABS.map(
      (x) =>
        `<button type="button" class="dp-pill${x.key === S.tab ? " dp-active" : ""}" role="tab" aria-selected="${
          x.key === S.tab
        }" data-tab-key="${x.key}">${esc(x.label)} <span class="dp-pill-count">${formatNumber(
          count[x.key] || 0
        )}</span></button>`
    ).join("");
  }

  function drawFilters() {
    const f = S.f[S.tab];
    if (S.tab === "staff") {
      const staff = S.data.staff || [];
      const left = staff.filter((s) => s.resigned).length;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm tên, SĐT nhân viên")}
        <div class="dp-filter-row">${selectBox(
          "st",
          "Trạng thái",
          option("", `Đang làm (${formatNumber(staff.length - left)})`, f.st) +
            option("left", `Đã nghỉ (${formatNumber(left)})`, f.st) +
            option("all", `Tất cả (${formatNumber(staff.length)})`, f.st),
          true
        )}</div>`;
    } else if (S.tab === "points") {
      const pts = S.data.points || [];
      const active = pts.filter((p) => p.is_active).length;
      const joined = pts.filter((p) => p.participated).length;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm tên điểm, SĐT, địa chỉ, NV")}
        <div class="dp-filter-row">
          ${selectBox("owner", "Phụ trách", ownerOptions(pts, f.owner), true)}
          ${selectBox(
            "st",
            "Trạng thái",
            option("", "Mọi trạng thái", f.st) +
              option("active", `Đang hoạt động (${formatNumber(active)})`, f.st) +
              option("inactive", `Ngừng HĐ (${formatNumber(pts.length - active)})`, f.st)
          )}
          ${selectBox(
            "joined",
            "Tham gia",
            option("", "Tham gia: tất cả", f.joined) +
              option("yes", `Đã tham gia (${formatNumber(joined)})`, f.joined) +
              option("no", `Chưa tham gia (${formatNumber(pts.length - joined)})`, f.joined)
          )}
        </div>`;
    } else {
      const rows = currentParts();
      const pt = f.point ? pointsByName.get(f.point) : null;
      el("filters").innerHTML = `${searchBox(f.q, "Tìm điểm, SĐT, nhân viên")}
        <div class="dp-filter-row">
          ${selectBox("program", "Chương trình", programOptions(f.program), true)}
          ${selectBox("owner", "Phụ trách", ownerOptions(rows, f.owner))}
          ${selectBox("state", "Trạng thái", stateOptions(rows, f.state))}
        </div>
        ${
          f.point
            ? `<button type="button" class="dp-filter-chip" data-clear-point aria-label="Bỏ lọc điểm bán">${icon(
                "store"
              )} Điểm: ${esc((pt && pt.point_name) || f.point)} ${icon("xmark")}</button>`
            : ""
        }
        ${
          rows.length >= PARTS_LIMIT
            ? `<div class="dp-field-hint dp-npp-hint">${icon(
                "circle-info"
              )} Đang hiện ${formatNumber(PARTS_LIMIT)} lượt mới nhất — chọn chương trình để xem đủ.</div>`
            : ""
        }
        ${f.program ? programSummary(f.program) : ""}`;
    }
  }

  function drawToolbar(n) {
    const filtered = FILTERS[S.tab].some((k) => S.f[S.tab][k]);
    el("toolbar").innerHTML = `
      <span class="dp-npp-count">${formatNumber(n)} ${UNITS[S.tab]}</span>
      ${
        filtered
          ? `<button type="button" class="dp-tool-btn" data-clear>${icon("filter-circle-xmark")} Xoá lọc</button>`
          : ""
      }
      ${
        S.tab === "staff"
          ? ""
          : `<button type="button" class="dp-tool-btn${S.multi ? " dp-active" : ""}" data-multi aria-pressed="${
              S.multi
            }">${icon("list-check")} Chọn nhiều</button>`
      }`;
  }

  function emptyFor(tab) {
    if (tab === "staff") {
      return (S.data.staff || []).length
        ? emptyState("Không có nhân viên phù hợp", "🔍", "Thử đổi bộ lọc hoặc từ khoá")
        : emptyState("Chưa có nhân viên", "👥", "Thêm nhân viên ở portal NPP › Khuyến mại");
    }
    if (tab === "points") {
      return (S.data.points || []).length
        ? emptyState("Không có điểm bán phù hợp", "🔍", "Thử đổi bộ lọc hoặc bấm Xoá lọc")
        : emptyState("NPP chưa có điểm bán", "🏪", "Nhân viên tạo điểm trưng bày trên ứng dụng này");
    }
    return currentParts().length
      ? emptyState("Không có lượt tham gia phù hợp", "🔍", "Thử đổi chương trình hoặc bộ lọc")
      : emptyState("Chưa có lượt tham gia", "📦", "Nhân viên đăng ký điểm tham gia chương trình");
  }

  function drawList() {
    const rows = rowsFor(S.tab);
    S.visible = S.tab === "staff" ? [] : rows;
    drawToolbar(rows.length);
    let renderRow = staffRow;
    if (S.tab === "points") renderRow = (p) => pointRow(p, S.multi, S.sel.has(p.name));
    else if (S.tab === "programs") renderRow = (r) => partRow(r, S.multi, S.sel.has(r.name));
    el("list").innerHTML = rows.length
      ? moreList({ rows, render: (slice) => slice.map(renderRow).join("") })
      : emptyFor(S.tab);
    updateBar();
  }

  function drawAll() {
    drawHead();
    drawTabs();
    drawFilters();
    drawList();
  }

  function updateBar() {
    const on = S.multi && S.tab !== "staff";
    root.classList.toggle("dp-bulk-pad", on);
    if (!on) {
      bar.hide();
      return;
    }
    bar.update({
      count: S.sel.size,
      total: S.visible.length,
      allOn: S.visible.length > 0 && S.visible.every((r) => S.sel.has(r.name)),
      actions: S.tab === "points" ? POINT_ACTIONS : PART_ACTIONS,
    });
  }

  function paintRow(row, on) {
    row.classList.toggle("is-selected", on);
    row.setAttribute("aria-checked", on ? "true" : "false");
    const mark = row.querySelector(".dp-check");
    if (mark) mark.classList.toggle("is-on", on);
  }

  // ── Trạng thái màn (URL giữ tab + lọc; replaceState không bắn hashchange → không render lại) ──

  function syncUrl() {
    const qs = new URLSearchParams({ t: S.tab });
    FILTERS[S.tab].forEach((k) => {
      if (S.f[S.tab][k]) qs.set(k, S.f[S.tab][k]);
    });
    history.replaceState(history.state, "", `#/npp?${qs.toString()}`);
  }

  function scrollToTabs() {
    const top = el("tabs").getBoundingClientRect().top + window.scrollY - 64;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  // Chuyển tab (kèm bộ lọc mới nếu có); tab Chương trình nạp lượt khi cần.
  async function goTab(key, filters) {
    if (!isTab(key)) return;
    if (filters) S.f[key] = { ...blank(key), ...filters };
    if (key !== S.tab) S.sel.clear();
    S.tab = key;
    syncUrl();
    drawTabs();
    if (key === "programs" && !S.parts.has(S.f.programs.program || "")) {
      el("filters").innerHTML = "";
      el("toolbar").innerHTML = "";
      el("list").innerHTML = skeleton(72, 4);
      bar.hide();
      try {
        await ensureParts();
      } catch (err) {
        toastError(err.message);
      }
      if (S.tab !== key) return; // đã đổi tab tiếp trong lúc chờ
    }
    drawFilters();
    drawList();
  }

  function setMulti(on) {
    S.multi = on;
    S.sel.clear();
    saveMulti(on);
    drawList();
  }

  function activateRow(row) {
    const key = row.dataset.row;
    if (S.multi) {
      if (S.sel.has(key)) S.sel.delete(key);
      else S.sel.add(key);
      paintRow(row, S.sel.has(key));
      updateBar();
      return;
    }
    const p = S.tab === "points" ? pointsByName.get(key) : null;
    if (p) {
      openPointSheet({
        point: p,
        staff: S.data.staff,
        onDone: afterMutation,
        onParticipations: (pt) => goTab("programs", { point: pt.name }).then(scrollToTabs),
      });
    }
  }

  // Sau mỗi thao tác ghi: nạp lại dữ liệu, GIỮ tab + bộ lọc, bỏ chọn.
  async function afterMutation() {
    S.sel.clear();
    S.parts.clear();
    partsByName.clear();
    try {
      await loadData();
    } catch (err) {
      toastError(err.message);
      return;
    }
    drawAll();
  }

  function runBulk(act, btn) {
    const names = [...S.sel];
    if (S.tab === "programs") {
      // Gán theo ĐIỂM của các lượt đã chọn — gộp điểm trùng.
      const pts = new Map();
      names.forEach((n) => {
        const r = partsByName.get(n);
        if (r && r.display_point && !pts.has(r.display_point)) {
          pts.set(r.display_point, { name: r.display_point, point_name: r.point_name, staff_name: r.point_staff_name });
        }
      });
      openAssignSheet({ points: [...pts.values()], staff: S.data.staff, onDone: afterMutation });
    } else if (act === "assign") {
      openAssignSheet({
        points: names.map((n) => pointsByName.get(n)).filter(Boolean),
        staff: S.data.staff,
        onDone: afterMutation,
      });
    } else if (act === "off") {
      confirmAction({
        title: "Ngừng hoạt động điểm bán",
        message: `Ngừng hoạt động ${formatNumber(names.length)} điểm bán đã chọn? Có thể kích hoạt lại bất cứ lúc nào.`,
        okLabel: "Ngừng hoạt động",
        okIcon: "circle-pause",
        danger: true,
        run: () => setPointsActive(names, false),
        onDone: afterMutation,
      });
    } else if (act === "on") {
      busy(btn, () => setPointsActive(names, true)).then((res) => res && afterMutation());
    }
  }

  // ── Sự kiện (delegation trên gốc view; thanh hàng loạt có listener riêng) ──

  root.addEventListener("click", (e) => {
    const t = e.target;
    const tabBtn = t.closest("[data-tab-key]");
    if (tabBtn) {
      if (tabBtn.dataset.tabKey !== S.tab) goTab(tabBtn.dataset.tabKey);
      return;
    }
    if (t.closest("[data-unassigned]")) {
      goTab("points", { owner: TARGET_NPP }).then(scrollToTabs);
      return;
    }
    if (t.closest("[data-clear]")) {
      goTab(S.tab, {});
      return;
    }
    if (t.closest("[data-multi]")) {
      setMulti(!S.multi);
      return;
    }
    if (t.closest("[data-clear-point]")) {
      S.f.programs.point = "";
      syncUrl();
      drawFilters();
      drawList();
      return;
    }
    const row = t.closest("[data-row]");
    if (row) activateRow(row);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest("[data-row], [data-unassigned]");
    if (!target || target !== e.target) return;
    e.preventDefault();
    target.click();
  });

  let searchTimer;
  root.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-f]");
    if (!input) return;
    S.f[S.tab][input.dataset.f] = input.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      syncUrl();
      drawList(); // chỉ vẽ lại danh sách → ô tìm giữ focus
    }, 200);
  });

  root.addEventListener("change", async (e) => {
    const select = e.target.closest("select[data-f]");
    if (!select) return;
    const key = select.dataset.f;
    S.f[S.tab][key] = select.value;
    syncUrl();
    if (S.tab === "programs" && key === "program") {
      const program = select.value;
      el("list").innerHTML = skeleton(72, 4);
      try {
        await ensureParts();
      } catch (err) {
        toastError(err.message);
      }
      if (S.tab !== "programs" || S.f.programs.program !== program) return; // đã đổi tiếp
      drawFilters(); // số đếm Phụ trách / Trạng thái theo chương trình mới
    }
    drawList();
  });

  drawAll();
}
