// Điểm vào SPA: render khung, đăng ký route, code-split view theo route.
import { ctx } from "./lib/store.js";
import { route, setNotFound, onChange, start, navigate } from "./lib/router.js";
import { renderChrome, setActiveTab, setChrome, viewEl } from "./components/nav.js";
import { toastError } from "./components/toast.js";

// Cache-bust view động: mỗi full load đổi ?v= → không kẹt bản cũ.
const withV = (p) => `${p}?v=${ctx.assetVersion}`;

const VIEWS = {
  home: () => import(withV("./views/home.js")),
  points: () => import(withV("./views/points.js")),
  pointNew: () => import(withV("./views/point-new.js")),
  programs: () => import(withV("./views/programs.js")),
  participationNew: () => import(withV("./views/participation-new.js")),
  participationDetail: () => import(withV("./views/participation-detail.js")),
  participationEdit: () => import(withV("./views/participation-edit.js")),
  profile: () => import(withV("./views/profile.js")),
};

async function load(key, props = {}) {
  const container = viewEl();
  container.innerHTML =
    '<div class="dp-loading"><span class="material-symbols-outlined dp-spin">progress_activity</span></div>';
  try {
    const mod = await VIEWS[key]();
    await mod.render({ container, ...props });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="dp-empty"><span class="material-symbols-outlined">error</span><p>Không tải được màn hình.</p><p class="dp-empty__sub">${
      (err && err.message) || ""
    }</p></div>`;
    toastError((err && err.message) || "Lỗi tải màn hình");
  }
}

function defineRoutes() {
  route("/", (p) => load("home", p), { tab: "home", chrome: "tabs" });
  route("/points", (p) => load("points", p), { tab: "points", chrome: "tabs" });
  route("/points/new", (p) => load("pointNew", p), { tab: "points", chrome: "subpage" });
  route("/programs", (p) => load("programs", p), { tab: "programs", chrome: "tabs" });
  route("/participations/new", (p) => load("participationNew", p), { tab: "points", chrome: "subpage" });
  route("/participations/:name", (p) => load("participationDetail", p), { tab: "points", chrome: "subpage" });
  route("/participations/:name/edit", (p) => load("participationEdit", p), { tab: "points", chrome: "subpage" });
  route("/profile", (p) => load("profile", p), { tab: "profile", chrome: "tabs" });
  setNotFound(() => navigate("/"));
}

function main() {
  const root = document.getElementById("dp-app");
  renderChrome(root);
  onChange(({ meta }) => {
    setActiveTab(meta.tab || "home");
    setChrome(meta.chrome || "tabs");
    window.scrollTo(0, 0);
  });
  defineRoutes();
  start();
}

main();
