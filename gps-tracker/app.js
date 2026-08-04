(() => {
  "use strict";

  const map = L.map("map", { zoomControl: false }).setView([42.78, -0.327], 14);
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  let trackPoints = [];      // [{lat, lon, ele, time}]
  let trackLine = null;
  let startMarker = null;
  let endMarker = null;
  let userMarker = null;
  let accuracyCircle = null;
  let watchId = null;
  let following = false;

  const el = (id) => document.getElementById(id);
  const trackNameEl = el("track-name");
  const statDistance = el("stat-distance");
  const statGain = el("stat-gain");
  const statTime = el("stat-time");
  const statProgress = el("stat-progress");
  const locStatus = el("loc-status");
  const locOffroute = el("loc-offroute");
  const toast = el("toast");

  function showToast(msg, ms = 2800) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add("hidden"), ms);
  }

  // ---------- GPX parsing ----------
  function parseGPX(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("GPX inválido");

    const nameNode = xml.querySelector("trk > name") || xml.querySelector("metadata > name");
    const name = nameNode ? nameNode.textContent.trim() : "Ruta sin nombre";

    const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
    let points = trkpts.map((pt) => {
      const eleNode = pt.getElementsByTagName("ele")[0];
      const timeNode = pt.getElementsByTagName("time")[0];
      return {
        lat: parseFloat(pt.getAttribute("lat")),
        lon: parseFloat(pt.getAttribute("lon")),
        ele: eleNode ? parseFloat(eleNode.textContent) : null,
        time: timeNode ? new Date(timeNode.textContent) : null,
      };
    });

    if (!points.length) {
      // fall back to route waypoints (rtept) if no track segment present
      const rtepts = Array.from(xml.getElementsByTagName("rtept"));
      points = rtepts.map((pt) => ({
        lat: parseFloat(pt.getAttribute("lat")),
        lon: parseFloat(pt.getAttribute("lon")),
        ele: null,
        time: null,
      }));
    }

    if (!points.length) throw new Error("El GPX no contiene puntos de track");
    return { name, points };
  }

  function haversine(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function computeStats(points) {
    let distance = 0;
    let gain = 0;
    for (let i = 1; i < points.length; i++) {
      distance += haversine(points[i - 1], points[i]);
      if (points[i].ele != null && points[i - 1].ele != null) {
        const diff = points[i].ele - points[i - 1].ele;
        if (diff > 0) gain += diff;
      }
    }
    let duration = null;
    const first = points[0].time;
    const last = points[points.length - 1].time;
    if (first && last) duration = (last - first) / 1000;
    return { distance, gain, duration };
  }

  function formatDistance(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
  }

  function formatDuration(sec) {
    if (sec == null || isNaN(sec) || sec <= 0) return "–";
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  }

  // ---------- Rendering ----------
  function loadTrack(name, points) {
    trackPoints = points;

    if (trackLine) map.removeLayer(trackLine);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);

    const latlngs = points.map((p) => [p.lat, p.lon]);
    trackLine = L.polyline(latlngs, { color: "#e8542a", weight: 4, opacity: 0.9 }).addTo(map);

    const startIcon = L.divIcon({ className: "", html: '<div style="background:#1b6b4a;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>', iconSize: [14, 14] });
    const endIcon = L.divIcon({ className: "", html: '<div style="background:#c0392b;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>', iconSize: [14, 14] });

    startMarker = L.marker(latlngs[0], { icon: startIcon, title: "Inicio" }).addTo(map).bindPopup("Inicio de la ruta");
    endMarker = L.marker(latlngs[latlngs.length - 1], { icon: endIcon, title: "Fin" }).addTo(map).bindPopup("Fin de la ruta");

    map.fitBounds(trackLine.getBounds(), { padding: [40, 60] });

    trackNameEl.textContent = name;
    const stats = computeStats(points);
    statDistance.textContent = formatDistance(stats.distance);
    statGain.textContent = stats.gain > 0 ? `${Math.round(stats.gain)} m` : "–";
    statTime.textContent = formatDuration(stats.duration);
    statProgress.textContent = "–";
  }

  async function loadDefaultTrack() {
    try {
      const res = await fetch("sample.gpx");
      const text = await res.text();
      const { name, points } = parseGPX(text);
      loadTrack(name, points);
    } catch (e) {
      trackNameEl.textContent = "Sin ruta cargada";
      showToast("No se pudo cargar la ruta de ejemplo. Sube tu propio GPX.");
    }
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { name, points } = parseGPX(reader.result);
        loadTrack(file.name.replace(/\.gpx$/i, "") || name, points);
        showToast(`Ruta cargada: ${name}`);
      } catch (e) {
        showToast("No se pudo leer el archivo GPX: " + e.message);
      }
    };
    reader.onerror = () => showToast("Error leyendo el archivo");
    reader.readAsText(file);
  }

  // ---------- Geolocation ----------
  function nearestTrackInfo(lat, lon) {
    if (!trackPoints.length) return null;
    let minDist = Infinity;
    let minIndex = 0;
    for (let i = 0; i < trackPoints.length; i++) {
      const d = haversine({ lat, lon }, trackPoints[i]);
      if (d < minDist) {
        minDist = d;
        minIndex = i;
      }
    }
    const progress = (minIndex / (trackPoints.length - 1)) * 100;
    return { distance: minDist, progress };
  }

  function onPosition(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    const latlng = [latitude, longitude];

    if (!userMarker) {
      userMarker = L.marker(latlng, {
        icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18] }),
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
    }

    if (!accuracyCircle) {
      accuracyCircle = L.circle(latlng, { radius: accuracy, color: "#1a73e8", weight: 1, fillOpacity: 0.12 }).addTo(map);
    } else {
      accuracyCircle.setLatLng(latlng).setRadius(accuracy);
    }

    locStatus.textContent = `Ubicación activa (±${Math.round(accuracy)} m)`;

    if (following) map.panTo(latlng, { animate: true });

    const info = nearestTrackInfo(latitude, longitude);
    if (info) {
      statProgress.textContent = `${Math.round(info.progress)}%`;
      if (info.distance > 60) {
        locOffroute.classList.remove("hidden");
      } else {
        locOffroute.classList.add("hidden");
      }
    }
  }

  function onPositionError(err) {
    showToast("No se pudo obtener tu ubicación: " + err.message);
    stopWatching();
  }

  function startWatching() {
    if (!navigator.geolocation) {
      showToast("Tu navegador no soporta geolocalización");
      return;
    }
    following = true;
    el("btn-locate").classList.add("active");
    locStatus.textContent = "Buscando señal GPS…";
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000,
    });
  }

  function stopWatching() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    following = false;
    el("btn-locate").classList.remove("active");
    locStatus.textContent = "Ubicación desactivada";
    locOffroute.classList.add("hidden");
  }

  // ---------- UI wiring ----------
  el("btn-locate").addEventListener("click", () => {
    if (watchId != null) stopWatching();
    else startWatching();
  });

  el("btn-fit").addEventListener("click", () => {
    if (trackLine) map.fitBounds(trackLine.getBounds(), { padding: [40, 60] });
  });

  el("file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    e.target.value = "";
  });

  el("panel-toggle").addEventListener("click", () => {
    el("panel").classList.toggle("collapsed");
  });

  // stop auto-follow if the user drags the map manually
  map.on("dragstart", () => {
    if (following) {
      following = false;
    }
  });

  loadDefaultTrack();
})();
