// Điểm vào SPA: render khung, đăng ký route, code-split view theo route.
import { ctx } from "./lib/store.js";
import { route, setNotFound, onChange, start, navigate } from "./lib/router.js";
import { renderChrome, setActiveTab, setChrome, setHeader, viewEl } from "./components/nav.js";
import { skeleton } from "./lib/dom.js";
import { toastError } from "./components/toast.js";

// Cache-bust view động: mỗi full load đổi ?v= → không kẹt bản cũ.
const withV = (p) => `${p}?v=${ctx.assetVersion}`;

const VIEWS = {
  home: () => import(withV("./views/home.js")),
  points: () => import(withV("./views/points.js")),
  pointNew: () => import(withV("./views/point-new.js")),
  programs: () => import(withV("./views/programs.js")),
  programDetail: () => import(withV("./views/program-detail.js")),
  participationNew: () => import(withV("./views/participation-new.js")),
  participationDetail: () => import(withV("./views/participation-detail.js")),
  participationEdit: () => import(withV("./views/participation-edit.js")),
  profile: () => import(withV("./views/profile.js")),
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
    container.innerHTML = `<div class="dp-empty"><div class="dp-empty-icon">⚠️</div><div class="dp-empty-title">Không tải được màn hình</div><div class="dp-empty-sub">${
      (err && err.message) || ""
    }</div></div>`;
    toastError((err && err.message) || "Lỗi tải màn hình");
  }
}

function defineRoutes() {
  route("/", (p) => load("home", p), { tab: "home", chrome: "tabs", title: "Điểm Trưng Bày" });
  route("/points", (p) => load("points", p), { tab: "points", chrome: "tabs", title: "Điểm bán" });
  route("/points/new", (p) => load("pointNew", p), { tab: "points", chrome: "subpage", title: "Tạo điểm" });
  route("/programs", (p) => load("programs", p), { tab: "programs", chrome: "tabs", title: "Chương trình" });
  route("/programs/:name", (p) => load("programDetail", p), { tab: "programs", chrome: "subpage", title: "Chương trình" });
  route("/participations/new", (p) => load("participationNew", p), { tab: "points", chrome: "subpage", title: "Đăng ký" });
  route("/participations/:name", (p) => load("participationDetail", p), { tab: "points", chrome: "subpage", title: "Lượt tham gia" });
  route("/participations/:name/edit", (p) => load("participationEdit", p), { tab: "points", chrome: "subpage", title: "Chỉnh sửa" });
  route("/profile", (p) => load("profile", p), { tab: "profile", chrome: "tabs", title: "Hồ sơ" });
  setNotFound(() => navigate("/"));
}

function main() {
  const root = document.getElementById("dp-app");
  renderChrome(root);
  onChange(({ meta }) => {
    setActiveTab(meta.tab || "home");
    setChrome(meta.chrome || "tabs");
    setHeader(meta.title || "Điểm Trưng Bày", meta.chrome === "subpage");
    window.scrollTo(0, 0);
  });
  defineRoutes();
  start();
}

main();
