// Bản đồ Leaflet VENDOR same-origin (CSP của site chặn <link> CSS từ CDN).
// Luôn đảm bảo leaflet.css được chèn (kể cả khi window.L đã có) rồi mới tạo map.
import { esc } from "./format.js";

const BASE = "/assets/salep/salep/vendor/leaflet";
const CSS_ID = "dp-leaflet-vendor-css";

function ensureCss() {
  if (document.getElementById(CSS_ID)) return Promise.resolve();
  return new Promise((res) => {
    const l = document.createElement("link");
    l.id = CSS_ID;
    l.rel = "stylesheet";
    l.href = `${BASE}/leaflet.css`;
    l.onload = res;
    l.onerror = res;
    document.head.appendChild(l);
    setTimeout(res, 3000); // fallback để không treo nếu onload không bắn
  });
}

let _p = null;
function loadLeaflet() {
  if (window.L) return ensureCss().then(() => window.L);
  if (_p) return _p;
  _p = new Promise((ok, no) => {
    const css = ensureCss();
    const s = document.createElement("script");
    s.src = `${BASE}/leaflet.js`;
    s.onload = () => css.then(() => (window.L ? ok(window.L) : no(new Error("Leaflet n/a"))));
    s.onerror = () => {
      _p = null;
      no(new Error("Không tải được bản đồ"));
    };
    document.head.appendChild(s);
  });
  return _p;
}

function valid(m) {
  return m.lat != null && m.lng != null && !(Number(m.lat) === 0 && Number(m.lng) === 0);
}

// Vẽ marker các điểm có toạ độ vào `el`. markers: [{lat, lng, title, sub}].
export async function renderMap(el, markers) {
  if (!el) return;
  const pts = (markers || []).filter(valid);
  if (!pts.length) {
    el.innerHTML = '<div class="dp-map-empty">Chưa có điểm nào có toạ độ GPS</div>';
    return;
  }
  let L;
  try {
    L = await loadLeaflet();
  } catch {
    el.innerHTML = '<div class="dp-map-empty">Không tải được bản đồ</div>';
    return;
  }
  el.innerHTML = "";
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  const coords = [];
  pts.forEach((m) => {
    const c = [Number(m.lat), Number(m.lng)];
    // circleMarker → không phụ thuộc ảnh marker (né lỗi "marker icon vỡ").
    const marker = L.circleMarker(c, {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: "#d92d20",
      fillOpacity: 1,
    }).addTo(map);
    if (m.title) marker.bindPopup(`<b>${esc(m.title)}</b>${m.sub ? "<br>" + esc(m.sub) : ""}`);
    coords.push(c);
  });
  if (coords.length > 1) map.fitBounds(coords, { padding: [30, 30] });
  else map.setView(coords[0], 15);

  // Lấp đầy tile khi container vừa hiện / layout chưa ổn định.
  [60, 300, 700].forEach((ms) =>
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        /* ignore */
      }
    }, ms)
  );
}
