// Điểm vào SPA: render khung, đăng ký route, code-split view theo route.
import { ctx } from "./lib/store.js";
import { route, setNotFound, onChange, start, navigate } from "./lib/router.js";
import { renderChrome, setActiveTab, setChrome, setHeader, viewEl } from "./components/nav.js";
import { skeleton } from "./lib/dom.js";
import { esc } from "./lib/format.js";
import { toastError } from "./components/toast.js";

// Mốc build shell — PHẢI khớp SHELL_BUILD ở www/dp.py. dp.html so 2 giá trị sau khi tải:
// lệch = trình duyệt đang chạy shell cũ do cache → banner tải lại (doc/08 §8).
const BUILD = "dp-pay-r2";
window.DP_APP = { build: BUILD };
console.log(`[DP] shell build=${BUILD}`);

// Cache-bust view động: mỗi full load đổi ?v= → không kẹt bản cũ.
const withV = (p) => `${p}?v=${ctx.assetVersion}`;

const VIEWS = {
  home: () => import(withV("./views/home.js")),
  points: () => import(withV("./views/points.js")),
  pointNew: () => import(withV("./views/point-new.js")),
  pointDetail: () => import(withV("./views/point-detail.js")),
  programs: () => import(withV("./views/programs.js")),
  programDetail: () => import(withV("./views/program-detail.js")),
  participations: () => import(withV("./views/participations.js")),
  participationNew: () => import(withV("./views/participation-new.js")),
  participationDetail: () => import(withV("./views/participation-detail.js")),
  participationEdit: () => import(withV("./views/participation-edit.js")),
  profile: () => import(withV("./views/profile.js")),
  visits: () => import(withV("./views/visits.js")),
  nppManage: () => import(withV("./views/npp-manage.js")),
  nppStaff: () => import(withV("./views/npp-staff.js")),
};

async function load(key, props = {}) {
  // Thay #dp-view bằng node mới → bỏ mọi listener delegated của view trước.
  const old = viewEl();
  const container = old.cloneNode(false);
  old.parentNode.replaceChild(container, old);
  container.innerHTML = skeleton(96, 4);
  try {
    const mod = await VIEWS[key]();
    await mod.render({ container, ...props });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="dp-empty"><div class="dp-empty-icon">⚠️</div><div class="dp-empty-title">Không tải được màn hình</div><div class="dp-empty-sub">${esc(
      (err && err.message) || ""
    )}</div></div>`;
    toastError((err && err.message) || "Lỗi tải màn hình");
  }
}

function defineRoutes() {
  route("/", (p) => load("home", p), { tab: "home", chrome: "tabs", title: "Điểm Trưng Bày" });
  route("/points", (p) => load("points", p), { tab: "points", chrome: "tabs", title: "Điểm bán" });
  route("/points/new", (p) => load("pointNew", p), { tab: "points", chrome: "subpage", title: "Tạo điểm" });
  route("/points/:name", (p) => load("pointDetail", p), { tab: "points", chrome: "subpage", title: "Điểm bán" });
  route("/programs", (p) => load("programs", p), { tab: "programs", chrome: "tabs", title: "Chương trình" });
  route("/programs/:name", (p) => load("programDetail", p), { tab: "programs", chrome: "subpage", title: "Chương trình" });
  route("/participations", (p) => load("participations", p), { tab: "points", chrome: "tabs", title: "Lượt tham gia" });
  route("/participations/new", (p) => load("participationNew", p), { tab: "points", chrome: "subpage", title: "Đăng ký" });
  route("/participations/:name", (p) => load("participationDetail", p), { tab: "points", chrome: "subpage", title: "Lượt tham gia" });
  route("/participations/:name/edit", (p) => load("participationEdit", p), { tab: "points", chrome: "subpage", title: "Chỉnh sửa" });
  route("/visits", (p) => load("visits", p), { tab: "home", chrome: "subpage", title: "Cần ghé thăm" });
  route("/profile", (p) => load("profile", p), { tab: "profile", chrome: "tabs", title: "Hồ sơ" });
  route("/npp", (p) => load("nppManage", p), { tab: "npp", chrome: "tabs", title: "Quản lý NPP" });
  route("/npp/staff/:name", (p) => load("nppStaff", p), { tab: "npp", chrome: "subpage", title: "Nhân viên" });
  setNotFound(selfHeal);
}

const reloadFlag = (path) => `dp_reload:${path}`;

// Route lạ: có thể tab đang chạy shell cũ (cache) chưa biết route mới → tải lại 1 lần
// cho mỗi đường dẫn; tải lại rồi vẫn lạ = route sai thật → xoá cờ, về trang chủ.
function selfHeal() {
  const path = (location.hash.slice(1) || "/").split("?")[0];
  try {
    if (!sessionStorage.getItem(reloadFlag(path))) {
      sessionStorage.setItem(reloadFlag(path), "1");
      location.reload();
      return;
    }
    sessionStorage.removeItem(reloadFlag(path));
  } catch {
    /* sessionStorage bị chặn → không reload (tránh lặp vô hạn) */
  }
  navigate("/");
}

function forgetReload(path) {
  try {
    sessionStorage.removeItem(reloadFlag(path));
  } catch {
    /* ignore */
  }
}

function main() {
  const root = document.getElementById("dp-app");
  renderChrome(root);
  onChange(({ path, meta }) => {
    if (meta.tab) forgetReload(path); // route khớp → bỏ cờ self-heal của đường dẫn này
    setActiveTab(meta.tab || "home");
    setChrome(meta.chrome || "tabs");
    setHeader(meta.title || "Điểm Trưng Bày", meta.chrome === "subpage");
    window.scrollTo(0, 0);
  });
  defineRoutes();
  start();
}

main();
