// Hash router tối giản: hỗ trợ :param và ?query.
const routes = [];
let notFound = null;
let changeHandler = null;

export function route(pattern, loader, meta = {}) {
  routes.push({ pattern, loader, meta, parts: pattern.split("/").filter(Boolean) });
}

export function setNotFound(loader) {
  notFound = loader;
}

export function onChange(fn) {
  changeHandler = fn;
}

export function navigate(path) {
  const target = path.startsWith("#") ? path.slice(1) : path;
  if (location.hash.slice(1) === target) handle();
  else location.hash = target;
}

export function back() {
  history.length > 1 ? history.back() : navigate("/");
}

function parse() {
  const raw = location.hash.slice(1) || "/";
  const qIndex = raw.indexOf("?");
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = {};
  if (qIndex >= 0) {
    new URLSearchParams(raw.slice(qIndex + 1)).forEach((v, k) => (query[k] = v));
  }
  return { path: path || "/", query };
}

function match(path) {
  const segs = path.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { r, params };
  }
  return null;
}

async function handle() {
  const { path, query } = parse();
  const m = match(path);
  const matched = m ? m.r : null;
  const params = m ? m.params : {};
  const loader = matched ? matched.loader : notFound;
  if (changeHandler) changeHandler({ path, query, params, meta: matched ? matched.meta : {} });
  if (loader) await loader({ query, params, meta: matched ? matched.meta : {} });
}

export function start() {
  window.addEventListener("hashchange", handle);
  handle();
}
