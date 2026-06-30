// Bản đồ Leaflet + OpenStreetMap (lazy-load, không cần API key).
import { esc } from "./format.js";

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById("dp-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "dp-leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error("Không tải được bản đồ"));
    document.head.appendChild(js);
  });
  return leafletPromise;
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
  const map = L.map(el).setView([Number(pts[0].lat), Number(pts[0].lng)], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  const coords = [];
  pts.forEach((m) => {
    const c = [Number(m.lat), Number(m.lng)];
    const marker = L.marker(c).addTo(map);
    if (m.title) marker.bindPopup(`<b>${esc(m.title)}</b>${m.sub ? "<br>" + esc(m.sub) : ""}`);
    coords.push(c);
  });
  if (coords.length > 1) map.fitBounds(coords, { padding: [30, 30] });
  setTimeout(() => map.invalidateSize(), 150);
}
