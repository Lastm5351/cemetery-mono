// frontend/src/views/visitor/pages/SearchForDeceased.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import fetchBurialRecords from "../js/get-burial-records";

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

// shadcn/ui
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "../../../components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../../../components/ui/dialog";

// Mock geo (for debug table only)
import useMockGeolocation from "../js/useMockGeoLocation";
import mockSeries from "../js/mockUserLocationSeries.json";

function formatDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function parseLatLngFromToken(token) {
  if (!token) return null;
  const raw = String(token).trim();
  const tryJson = (text) => {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === "object") {
        const hasDirect = Number.isFinite(Number(obj.lat)) && Number.isFinite(Number(obj.lng));
        if (hasDirect) return { lat: +obj.lat, lng: +obj.lng, data: obj };
        for (const v of Object.values(obj)) {
          if (typeof v === "string" && v.trim().startsWith("{") && v.trim().endsWith("}")) {
            try {
              const nested = JSON.parse(v);
              if (Number.isFinite(+nested.lat) && Number.isFinite(+nested.lng)) {
                return { lat: +nested.lat, lng: +nested.lng, data: obj };
              }
            } catch {}
          } else if (v && typeof v === "object") {
            if (Number.isFinite(+v.lat) && Number.isFinite(+v.lng)) {
              return { lat: +v.lat, lng: +v.lng, data: obj };
            }
          }
        }
        return { lat: null, lng: null, data: obj };
      }
    } catch {}
    return null;
  };
  const jsonAttempt = tryJson(raw);
  if (jsonAttempt) return jsonAttempt;

  const mKVLat = raw.match(/(?:^|[|,;\s])lat\s*:\s*([+-]?\d+(?:\.\d+)?)(?=$|[|,;\s])/i);
  const mKVLng = raw.match(/(?:^|[|,;\s])lng\s*:\s*([+-]?\d+(?:\.\d+)?)(?=$|[|,;\s])/i);
  if (mKVLat && mKVLng) return { lat: +mKVLat[1], lng: +mKVLng[1], data: null };

  const mUrlLat = raw.match(/[?&]lat=([+-]?\d+(?:\.\d+)?)/i);
  const mUrlLng = raw.match(/[?&]lng=([+-]?\d+(?:\.\d+)?)/i);
  if (mUrlLat && mUrlLng) return { lat: +mUrlLat[1], lng: +mUrlLng[1], data: null };

  const mPoint = raw.match(/POINT\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i);
  if (mPoint) return { lat: +mPoint[2], lng: +mPoint[1], data: null };

  return { lat: null, lng: null, data: null };
}

const QR_LABELS = {
  deceased_name: "Deceased Name",
  birth_date: "Birth Date",
  death_date: "Death Date",
  burial_date: "Burial Date",
};
const capitalizeLabelFromKey = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const formatQrValue = (key, value) => {
  if (value == null || value === "") return "—";
  if (key === "lat" || key === "lng") return Number.isFinite(+value) ? (+value).toFixed(6) : String(value);
  if (/(_date$|^created_at$|^updated_at$)/.test(key)) return formatDate(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};
function qrDisplayEntries(data) {
  const omit = new Set([
    "_type","id","uid","plot_id","family_contact","is_active","lat","lng",
    "created_at","updated_at","headstone_type","memorial_text"
  ]);
  return Object.entries(data)
    .filter(([k]) => !omit.has(k))
    .map(([k, v]) => ({ key: k, label: QR_LABELS[k] ?? capitalizeLabelFromKey(k), value: formatQrValue(k, v) }));
}

// name + date helpers (unchanged for brevity)
const normalizeName = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
function levenshtein(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[m][n];
}
const similarity = (a, b) => {
  const A = normalizeName(a), B = normalizeName(b);
  if (!A && !B) return 1;
  const dist = levenshtein(A, B);
  return 1 - dist / Math.max(A.length, B.length);
};
function namesClose(userFirst, userLast, fullName) {
  const [recFirst, ...rest] = normalizeName(fullName).split(" ");
  const recLast = rest.length ? rest[rest.length - 1] : "";
  const sf = similarity(userFirst, recFirst), sl = similarity(userLast, recLast);
  return (sf + sl) / 2 >= 0.65 || sf >= 0.75 || sl >= 0.75;
}
const namesExact = (f, l, full) => {
  const [rf, ...rest] = normalizeName(full).split(" ");
  const rl = rest.length ? rest[rest.length - 1] : "";
  return normalizeName(f) === rf && normalizeName(l) === rl;
};
function sameDate(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime()))
    return String(a).slice(0,10) === String(b).slice(0,10);
  const pad = (n) => String(n).padStart(2,"0");
  const fa = `${da.getFullYear()}-${pad(da.getMonth()+1)}-${pad(da.getDate())}`;
  const fb = `${db.getFullYear()}-${pad(db.getMonth()+1)}-${pad(db.getDate())}`;
  return fa === fb;
}
function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (x) => (x*Math.PI)/180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function SearchForDeceased() {
  // data + search state
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState(""); const [deathDate, setDeathDate] = useState("");
  const [notFoundMsg, setNotFoundMsg] = useState(""); const [exactMatches, setExactMatches] = useState([]); const [closeSuggestions, setCloseSuggestions] = useState([]);

  // selection / scan
  const [selected, setSelected] = useState(null);
  const [scanDataForSelected, setScanDataForSelected] = useState(null);
  const [scanResult, setScanResult] = useState(null); // { token, coords, data }

  // location consent (UI gating only for real GPS)
  const [locationConsent, setLocationConsent] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // user location logs
  const [userLoc, setUserLoc] = useState(null);
  const [realUserLoc, setRealUserLoc] = useState(null);
  const [locSamples, setLocSamples] = useState([]);
  const samplesRef = useRef([]); const sampleIdRef = useRef(1);
  const geoWatchIdRef = useRef(null); const geoLogIntervalRef = useRef(null);

  // mock controls
  const [useMock, setUseMock] = useState(false);
  const [mockId, setMockId] = useState(mockSeries.series?.[0]?.id || "");
  const [mockInterval, setMockInterval] = useState(1000);
  const mockPoints = useMemo(() => mockSeries.series.find((s) => s.id === mockId)?.points ?? [], [mockId]);
  const { location: mockLoc } = useMockGeolocation(useMock ? mockPoints : [], mockInterval);

  // map + routing handles
  const mapRef = useRef(null); const [mapMounted, setMapMounted] = useState(false);
  const setMapNode = useCallback((n) => { mapRef.current = n; setMapMounted(!!n); }, []);
  const leafletRef = useRef({ L: null, map: null, marker: null, originMarker: null, routing: null, routingLoaded: false });

  const [routeCoords, setRouteCoords] = useState(null);
  const CEMETERY = { lat: 15.494177, lng: 120.554702 };
  const ORIGIN_RADIUS_M = 10_000;
  const [outsideNotice, setOutsideNotice] = useState(false);

  // scan modal
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanMode, setScanMode] = useState("choose");
  const [scanErr, setScanErr] = useState("");
  const videoRef = useRef(null); const rafRef = useRef(0); const fileRef = useRef(null);

  // load records
  useEffect(() => {
    let ignore = false;
    setLoading(true); setError("");
    fetchBurialRecords()
      .then((data) => !ignore && setRows(Array.isArray(data) ? data : []))
      .catch((e) => !ignore && setError(e.message || "Failed to load"))
      .finally(() => !ignore && setLoading(false));
    return () => { ignore = true; };
  }, []);

  // open consent modal when needed for map (only for real GPS mode)
  useEffect(() => {
    if (routeCoords && !locationConsent && !useMock) setLocationModalOpen(true);
  }, [routeCoords, locationConsent, useMock]);

  // helpers
  const pushSample = useCallback((sample) => {
    const withId = { ...sample, __id: sampleIdRef.current++ };
    samplesRef.current.push(withId);
    setLocSamples((prev) => {
      const next = prev.concat(withId);
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  // log mock points (no consent needed)
  useEffect(() => {
    if (!useMock || !mockLoc) return;
    const stamp = Date.now();
    const pt = { lat: mockLoc.lat, lng: mockLoc.lng };
    setUserLoc(pt);
    pushSample({ ...pt, accuracy: 5, speed: null, heading: null, timestamp: stamp, iso: new Date(stamp).toISOString(), source: "mock" });
  }, [mockLoc, useMock, pushSample]);

  // real geolocation controls
  const stopRealGeolocation = useCallback(() => {
    if (geoLogIntervalRef.current != null) { clearInterval(geoLogIntervalRef.current); geoLogIntervalRef.current = null; }
    if (geoWatchIdRef.current != null && "geolocation" in navigator) {
      try { navigator.geolocation.clearWatch(geoWatchIdRef.current); } catch {}
      geoWatchIdRef.current = null;
    }
  }, []);

  async function requestUserLocationReal() {
    if (!("geolocation" in navigator)) {
      console.warn("[Geo] API not available.");
      setLocationConsent(true); setLocationModalOpen(false);
      return;
    }
    setLocationConsent(true); setLocationModalOpen(false);

    const onPos = (pos) => {
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const stamp = Date.now();
      const pt = { lat: +latitude, lng: +longitude };
      setUserLoc(pt); setRealUserLoc(pt);
      pushSample({ ...pt, accuracy: accuracy ?? null, speed: speed ?? null, heading: heading ?? null, timestamp: stamp, iso: new Date(stamp).toISOString(), source: "real" });
    };
    const onErr = (err) => console.warn("[Geo] geolocation error:", err);

    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
    if (geoWatchIdRef.current == null) {
      geoWatchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    if (geoLogIntervalRef.current == null) {
      geoLogIntervalRef.current = setInterval(() => {
        const last = samplesRef.current[samplesRef.current.length - 1];
        console.log(last ? `[Geo] Live: ${last.lat}, ${last.lng} ±${last.accuracy ?? "?"} @ ${last.iso}` : "[Geo] Live: waiting…");
      }, 1000);
    }
  }

  // mutual exclusivity between mock and real GPS
  useEffect(() => {
    if (useMock) { // mock ON -> stop real GPS
      stopRealGeolocation();
      setRealUserLoc(null);
    } else if (locationConsent) { // mock OFF and consent -> (re)start real GPS
      requestUserLocationReal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMock, locationConsent]);

  // cleanup
  useEffect(() => () => {
    stopRealGeolocation();
    if (leafletRef.current.map) try { leafletRef.current.map.remove(); } catch {}
  }, [stopRealGeolocation]);

  // leaflet loaders
  async function ensureLeafletLoaded() {
    if (!leafletRef.current.L) {
      const mod = await import("leaflet"); leafletRef.current.L = mod.default || mod;
    }
    if (!leafletRef.current.routingLoaded) {
      await import("leaflet-routing-machine"); leafletRef.current.routingLoaded = true;
    }
    return leafletRef.current.L;
  }
  const destroyMap = () => {
    const { map } = leafletRef.current;
    if (map?.remove) map.remove();
    leafletRef.current.map = null; leafletRef.current.marker = null; leafletRef.current.originMarker = null; leafletRef.current.routing = null;
  };

  // init map when we have a destination and container
  useEffect(() => {
    let cancelled = false;
    if (!mapMounted || !routeCoords) return;
    (async () => {
      const L = await ensureLeafletLoaded(); if (cancelled) return;
      destroyMap();
      const map = L.map(mapRef.current).setView([routeCoords.lat, routeCoords.lng], 18);
      leafletRef.current.map = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "&copy; OpenStreetMap" }).addTo(map);
      leafletRef.current.marker = L.marker([routeCoords.lat, routeCoords.lng]).addTo(map);

      // small circle to visualize origin
      leafletRef.current.originMarker = L.circleMarker([CEMETERY.lat, CEMETERY.lng], { radius: 5, color: "#0ea5e9", weight: 2 }).addTo(map);

      const router = L.Routing.osrmv1({ serviceUrl: "https://router.project-osrm.org/route/v1", profile: "foot" });
      const control = L.Routing.control({
        waypoints: [L.latLng(CEMETERY.lat, CEMETERY.lng), L.latLng(routeCoords.lat, routeCoords.lng)],
        router,
        routeWhileDragging: false, addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: false, show: false,
        lineOptions: { styles: [{ color: "#059669", weight: 6, opacity: 0.9 }] },
        createMarker: () => null,
      })
        .addTo(map)
        .on("routesfound", (e) => {
          const route = e.routes?.[0];
          if (route?.coordinates?.length) {
            const bounds = L.latLngBounds(route.coordinates);
            map.fitBounds(bounds, { padding: [24, 24] });
          }
        });

      leafletRef.current.routing = control;
      setOutsideNotice(true); // until we confirm origin is within radius
    })();
    return () => { cancelled = true; };
  }, [mapMounted, routeCoords]);

  // choose current origin:
  // - MOCK takes precedence and does NOT require consent
  // - otherwise REAL requires consent and an available fix
  const currentOrigin = useMemo(() => {
    if (useMock && mockLoc && Number.isFinite(mockLoc.lat) && Number.isFinite(mockLoc.lng)) {
      return { lat: mockLoc.lat, lng: mockLoc.lng, source: "mock" };
    }
    if (!useMock && locationConsent && realUserLoc && Number.isFinite(realUserLoc.lat) && Number.isFinite(realUserLoc.lng)) {
      return { lat: realUserLoc.lat, lng: realUserLoc.lng, source: "real" };
    }
    return null;
  }, [useMock, mockLoc, locationConsent, realUserLoc]);

  // single place to (re)apply waypoints + update origin marker
  const applyWaypoints = useCallback((origin) => {
    const { L, routing, originMarker } = leafletRef.current;
    if (!routing || !L || !routeCoords || !origin) return;
    const withinRadius = haversineMeters(origin, CEMETERY) <= ORIGIN_RADIUS_M;
    const effectiveOrigin = withinRadius ? origin : CEMETERY;
    setOutsideNotice(!withinRadius);

    // move tiny origin marker for visual debug
    if (originMarker) originMarker.setLatLng([effectiveOrigin.lat, effectiveOrigin.lng]);

    routing.setWaypoints([ L.latLng(effectiveOrigin.lat, effectiveOrigin.lng), L.latLng(routeCoords.lat, routeCoords.lng) ]);
    routing.route(); // ← force reroute even if deltas are small
  }, [routeCoords]);

  // reroute whenever origin or destination changes
  useEffect(() => {
    if (currentOrigin) applyWaypoints(currentOrigin);
  }, [currentOrigin, routeCoords, applyWaypoints]);

  // extra: hard-reroute on every mock tick (ensures visible update)
  useEffect(() => {
    if (useMock && mockLoc) applyWaypoints({ lat: mockLoc.lat, lng: mockLoc.lng });
  }, [useMock, mockLoc, applyWaypoints]);

  // ---------- scan + search handlers (unchanged UI below) ----------
  function closeScanModal() { stopCamera(); setScanErr(""); setScanMode("choose"); setScanModalOpen(false); }
  async function startCamera() {
    setScanErr(""); setScanMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const v = videoRef.current; if (!v) return;
      v.srcObject = stream; await v.play();
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          try {
            const codes = await detector.detect(v);
            if (codes && codes.length) { handleQrFound(codes[0].rawValue || ""); return; }
          } catch {}
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(null, v, (res) => { if (res) { reader.reset(); handleQrFound(res.getText()); } }).catch(() => {});
      }
    } catch { setScanErr("Unable to access camera."); }
  }
  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current;
    if (v?.srcObject) { v.srcObject.getTracks?.().forEach((t) => t.stop?.()); v.srcObject = null; }
  }

  async function handleUploadFile(file) {
    if (!file) return;
    setScanErr(""); setScanMode("upload");
    const url = URL.createObjectURL(file); const cleanup = () => URL.revokeObjectURL(url);
    try {
      const img = await new Promise((ok, bad) => { const el = new Image(); el.onload = () => ok(el); el.onerror = () => bad(new Error("Could not load image.")); el.src = url; });
      const tryBarcode = async (src) => {
        if (!("BarcodeDetector" in window)) return null;
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats?.();
          if (Array.isArray(supported) && !supported.includes("qr_code")) return null;
        } catch {}
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        const canvas = (el, rot = 0, scale = 1.5) => {
          const w = (el.naturalWidth || el.width) * scale, h = (el.naturalHeight || el.height) * scale;
          const r = ((rot % 360) + 360) % 360; const cw = r === 90 || r === 270 ? h : w; const ch = r === 90 || r === 270 ? w : h;
          const c = document.createElement("canvas"); c.width = cw; c.height = ch;
          const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.translate(cw/2, ch/2); ctx.rotate((r*Math.PI)/180);
          ctx.drawImage(el, -w/2, -h/2, w, h); return c;
        };
        try { const codes = await det.detect(src); if (codes?.length) return codes[0].rawValue || null; } catch {}
        for (const r of [0, 90, 180, 270]) { try { const c = canvas(src, r, 2); const codes = await det.detect(c); if (codes?.length) return codes[0].rawValue || null; } catch {} }
        return null;
      };
      const valBD = await tryBarcode(img); if (valBD) { handleQrFound(valBD); cleanup(); return; }
      try { const { BrowserQRCodeReader } = await import("@zxing/browser"); const z = new BrowserQRCodeReader(); const res = await z.decodeFromImageElement(img); if (res?.getText) { handleQrFound(res.getText()); cleanup(); return; } } catch {}
      try {
        const jsqr = (await import("jsqr")).default;
        const make = (el, rot=0, scale=2) => {
          const w=(el.naturalWidth||el.width)*scale, h=(el.naturalHeight||el.height)*scale;
          const r=((rot%360)+360)%360; const cw=r===90||r===270?h:w; const ch=r===90||r===270?w:h;
          const c=document.createElement("canvas"); c.width=cw; c.height=ch;
          const ctx=c.getContext("2d"); ctx.imageSmoothingEnabled=false; ctx.translate(cw/2, ch/2); ctx.rotate((r*Math.PI)/180);
          ctx.drawImage(el, -w/2, -h/2, w, h); return c;
        };
        const scan = (canvas, invert=false, thresh=false) => {
          const ctx = canvas.getContext("2d", { willReadFrequently: true }); let d = ctx.getImageData(0,0,canvas.width,canvas.height);
          if (invert) { const a=d.data; for (let i=0;i<a.length;i+=4){a[i]=255-a[i];a[i+1]=255-a[i+1];a[i+2]=255-a[i+2];} }
          if (thresh) { const a=d.data; for (let i=0;i<a.length;i+=4){const v=(a[i]+a[i+1]+a[i+2])/3; const t=v>160?255:0; a[i]=a[i+1]=a[i+2]=t;} ctx.putImageData(d,0,0); }
          const code = jsqr(d.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
          return code?.data || null;
        };
        for (const r of [0,90,180,270]) {
          const c = make(img, r, 2);
          for (const t of [ [false,false],[false,true],[true,false],[true,true] ]) {
            const v = scan(c, t[0], t[1]); if (v) { handleQrFound(v); cleanup(); return; }
          }
        }
      } catch {}
      setScanErr("No QR code detected in the image.");
    } catch (e) { setScanErr(e?.message || "Failed to decode QR image."); }
    finally { cleanup(); }
  }

  function handleQrFound(text) {
    stopCamera(); setScanModalOpen(false);
    setSelected(null); setScanDataForSelected(null);
    const parsed = parseLatLngFromToken(text);
    const coords = parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) ? { lat: parsed.lat, lng: parsed.lng } : null;
    setRouteCoords(coords); setScanResult({ token: text, coords, data: parsed?.data || null });
  }

  function validateDates() { if (!birthDate || !deathDate) return "Please provide both Birth Date and Death Date."; return ""; }
  function onSubmit(e) {
    e.preventDefault();
    setScanResult(null); setNotFoundMsg(""); setExactMatches([]); setCloseSuggestions([]); setSelected(null); setScanDataForSelected(null); setRouteCoords(null);
    const dateErr = validateDates(); if (dateErr) { setNotFoundMsg(dateErr); return; }
    const fn = firstName.trim(), ln = lastName.trim();
    const dateFiltered = rows.filter((r) => sameDate(r.birth_date, birthDate) && sameDate(r.death_date, deathDate));
    if (!dateFiltered.length) { setNotFoundMsg("No records match the given Birth and Death dates."); return; }
    const exact = [], close = [];
    for (const r of dateFiltered) {
      const full = r.deceased_name || "";
      if (fn && ln) (namesExact(fn, ln, full) ? exact : namesClose(fn, ln, full) ? close : null);
      else if (fn || ln) (namesClose(fn, ln, full) ? close : null);
      else exact.push(r);
    }
    setExactMatches(exact); setCloseSuggestions(close);
    if (exact.length === 1) handleSelect(exact[0]);
    else if (!exact.length && close.length === 1) handleSelect(close[0]);
    else if (!exact.length && !close.length) setNotFoundMsg("No records found for those dates and name.");
  }
  function handleSelect(row) {
    setScanResult(null); setSelected(row || null);
    const parsed = parseLatLngFromToken(row?.qr_token);
    const coords = parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) ? { lat: parsed.lat, lng: parsed.lng } : null;
    setScanDataForSelected(parsed?.data && typeof parsed.data === "object" ? parsed.data : null);
    setRouteCoords(coords);
  }

  function RecordCard({ row, onPick }) {
    const parsed = parseLatLngFromToken(row?.qr_token);
    const hasCoords = parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng);
    return (
      <Card className="group relative overflow-hidden border-white/60 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur supports-[backdrop-filter]:bg-white/40 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        {/* backdrop gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-400/20 via-purple-400/15 to-indigo-400/20" />

        <CardHeader className="relative pb-2">
          <CardDescription className="text-slate-700 font-medium">
            {row.deceased_name ? row.deceased_name : "Unnamed"} · Born {formatDate(row.birth_date)} · Died {formatDate(row.death_date)}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative flex items-center justify-between gap-4">
          <div className="text-sm text-slate-600" />
          <Button size="sm" onClick={() => onPick?.(row)} className="shadow-md hover:shadow-lg">
            View details {hasCoords ? "and route" : ""}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const downloadSamples = () => {
    const blob = new Blob([JSON.stringify(samplesRef.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "location-samples.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="relative min-h-screen font-poppins">
      {/* global backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-cyan-50 to-blue-100" />
        <div className="absolute -top-24 -left-24 h-[32rem] w-[32rem] rounded-full bg-emerald-300/50 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute top-1/3 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-300/50 blur-3xl dark:bg-cyan-700/20" />
        <div className="absolute -bottom-32 left-1/4 h-[24rem] w-[24rem] rounded-full bg-blue-300/40 blur-3xl dark:bg-blue-700/20" />
      </div>

      {/* Header */}
      <section className="pt-24 pb-8">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
          <div className="mb-2 text-sm text-slate-500">
            <NavLink to="/" className="hover:text-slate-700">Home</NavLink>
            &nbsp;›&nbsp;<span className="text-slate-700">Search For Deceased</span>
          </div>

          <div className="relative">
            {/* backdrop shadow */}
            <div className="absolute -inset-2 bg-gradient-to-br from-emerald-400/25 via-cyan-400/20 to-blue-400/25 rounded-2xl blur-xl opacity-40" />

            <Card className="relative overflow-hidden border-white/60 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur supports-[backdrop-filter]:bg-white/40 shadow-lg">
              {/* backdrop gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 via-cyan-400/15 to-blue-400/20" />

            <CardHeader className="relative pb-3">
              <CardTitle className="text-2xl sm:text-3xl text-slate-900">Search For Deceased</CardTitle>
              <CardDescription className="text-slate-600">Search by name with exact birth and death dates, or scan a QR code.</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {/* Search form */}
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="firstName" className="mb-1 block text-sm text-slate-600">First Name</label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g., Juan" />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1 block text-sm text-slate-600">Last Name</label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g., Dela Cruz" />
                </div>
                <div>
                  <label htmlFor="birthDate" className="mb-1 block text-sm text-slate-600">Birth Date</label>
                  <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="deathDate" className="mb-1 block text-sm text-slate-600">Death Date </label>
                  <Input id="deathDate" type="date" value={deathDate} onChange={(e) => setDeathDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex gap-2 pt-1">
                  <Button type="submit">Search</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFirstName(""); setLastName(""); setBirthDate(""); setDeathDate("");
                      setExactMatches([]); setCloseSuggestions([]); setNotFoundMsg("");
                      setSelected(null); setScanDataForSelected(null); setScanResult(null);
                      setRouteCoords(null); destroyMap();
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>

              {/* Divider + Scan button */}
              <div className="flex items-center gap-4 my-6">
                <div className="h-px flex-1 bg-slate-200" />
                <div className="text-xs uppercase tracking-wide text-slate-400">or</div>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="flex justify-center">
                <Button onClick={() => { setScanModalOpen(true); setScanMode("choose"); setScanErr(""); }}>
                  Scan QR Code
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </section>

      {/* Loading / error states */}
      <section className="pb-6">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-8 space-y-3">
          {loading && (
            <Card className="bg-white/80 backdrop-blur shadow-md"><CardContent className="p-6 text-center text-slate-500">Loading records…</CardContent></Card>
          )}
          {error && (
            <Card className="bg-white/80 backdrop-blur shadow-md border-rose-200"><CardContent className="p-6 text-center text-rose-600">{error}</CardContent></Card>
          )}
        </div>
      </section>

      {/* Search results */}
      {(exactMatches.length > 0 || closeSuggestions.length > 0 || notFoundMsg) && (
        <section className="pb-2">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8 space-y-4">
            {notFoundMsg && (
              <Card className="bg-white/80 backdrop-blur shadow-md border-amber-200"><CardContent className="p-6 text-center text-slate-600">{notFoundMsg}</CardContent></Card>
            )}

            {exactMatches.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Results</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {exactMatches.map((r) => (
                    <RecordCard key={`ex-${r.id}`} row={r} onPick={handleSelect} />
                  ))}
                </div>
              </div>
            )}

            {closeSuggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Do you mean?</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {closeSuggestions.map((r) => (
                    <RecordCard key={`cl-${r.id}`} row={r} onPick={handleSelect} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Selected record details + Map (from search) */}
      {selected && (
        <section className="pb-10">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="relative lg:col-span-2">
                {/* backdrop shadow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-teal-400/30 via-cyan-400/20 to-blue-400/30 rounded-2xl blur-xl opacity-40" />

                <Card className="relative overflow-hidden bg-white/80 backdrop-blur shadow-lg">
                  {/* backdrop gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-400/15 via-cyan-400/10 to-blue-400/15" />

                <CardHeader className="relative pb-2">
                  <CardTitle className="text-lg text-slate-900">Route to Grave</CardTitle>
                  <CardDescription className="text-slate-600">From the cemetery entrance (auto-switches to your live location when within 10 km) to the grave</CardDescription>
                </CardHeader>
                <CardContent className="relative space-y-3">
                  {outsideNotice && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                      You are outside of 10 km from the cemetery. Live update of the location will not apply yet. Routing from the cemetery entrance.
                    </div>
                  )}
                  <div ref={setMapNode} className="w-full h-[420px]" />
                </CardContent>
              </Card>
              </div>

              <div className="relative">
                {/* backdrop shadow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-emerald-400/30 via-green-400/20 to-teal-400/30 rounded-2xl blur-xl opacity-40" />

                <Card className="relative overflow-hidden bg-white/80 backdrop-blur shadow-lg">
                  {/* backdrop gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/15 via-green-400/10 to-teal-400/15" />

                <CardHeader className="relative pb-2">
                  <CardTitle className="text-lg text-slate-900">Burial Record</CardTitle>
                </CardHeader>
                <CardContent className="relative space-y-2">
                  {scanDataForSelected && typeof scanDataForSelected === "object" ? (
                    <div className="space-y-2">
                      {(() => {
                        const entries = qrDisplayEntries(scanDataForSelected);
                        if (entries.length === 0) return <div className="text-sm text-slate-500">No displayable fields.</div>;
                        return entries.map(({ key, label, value }) => (
                          <div key={key} className="text-sm">
                            <div className="text-slate-500">{label}</div>
                            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 break-words">
                              {value}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div>
                        <div className="text-slate-500">Deceased Name</div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 break-words">
                          {selected.deceased_name || "—"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-slate-500">Birth Date</div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800">{formatDate(selected.birth_date)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">Death Date</div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800">{formatDate(selected.death_date)}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Plot</div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800">{selected.plot_id ?? "—"}</div>
                      </div>
                      {selected.qr_token && (
                        <div>
                          <div className="text-slate-500">QR (raw)</div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 break-all">
                            {String(selected.qr_token)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
            </div>

            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => {
                  setSelected(null);
                  setScanDataForSelected(null);
                  setRouteCoords(null);
                  destroyMap();
                }}
              >
                Back to results
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Map + QR details flow (from scanning) */}
      {scanResult && (
        <section className="pb-6">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Map */}
              <div className="relative lg:col-span-2">
                {/* backdrop shadow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-teal-400/30 via-cyan-400/20 to-blue-400/30 rounded-2xl blur-xl opacity-40" />

                <Card className="relative overflow-hidden bg-white/80 backdrop-blur shadow-lg">
                  {/* backdrop gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-400/15 via-cyan-400/10 to-blue-400/15" />

                <CardHeader className="relative pb-2">
                  <CardTitle className="text-lg text-slate-900">Route to Grave</CardTitle>
                  <CardDescription className="text-slate-600">From the cemetery entrance (auto-switches to your live location when within 10 km) to the grave</CardDescription>
                </CardHeader>
                <CardContent className="relative space-y-3">
                  {outsideNotice && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                      You are outside of 10 km from the cemetery. Live update of the location will not apply yet. Routing from the cemetery entrance.
                    </div>
                  )}
                  <div ref={setMapNode} className="w-full h-[420px]" />
                </CardContent>
              </Card>
              </div>

              {/* QR contents */}
              <div className="relative">
                {/* backdrop shadow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-emerald-400/30 via-green-400/20 to-teal-400/30 rounded-2xl blur-xl opacity-40" />

                <Card className="relative overflow-hidden bg-white/80 backdrop-blur shadow-lg">
                  {/* backdrop gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/15 via-green-400/10 to-teal-400/15" />

                <CardHeader className="relative pb-2">
                  <CardTitle className="text-lg text-slate-900">Burial Record</CardTitle>
                </CardHeader>
                <CardContent className="relative space-y-2">
                  {scanResult.data && typeof scanResult.data === "object" ? (
                    <div className="space-y-2">
                      {(() => {
                        const entries = qrDisplayEntries(scanResult.data);
                        if (entries.length === 0) return <div className="text-sm text-slate-500">No displayable fields.</div>;
                        return entries.map(({ key, label, value }) => (
                          <div key={key} className="text-sm">
                            <div className="text-slate-500">{label}</div>
                            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 break-words">
                              {value}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600 break-all">
                      <span className="font-semibold">Raw:</span> {scanResult.token}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
            </div>

            {/* Rescan */}
            <div className="text-center">
              <Button onClick={() => { setScanResult(null); setScanModalOpen(true); setScanMode("choose"); setRouteCoords(null); destroyMap(); }}>
                Scan another QR Code
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Live location (debug) + Mock controls */}
      {locationConsent && (
        <section className="pb-8">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="relative">
              {/* backdrop shadow */}
              <div className="absolute -inset-2 bg-gradient-to-br from-emerald-400/30 via-teal-400/20 to-cyan-400/30 rounded-2xl blur-xl opacity-40" />

              <Card className="relative overflow-hidden border-emerald-200 bg-white/80 backdrop-blur shadow-lg">
                {/* backdrop gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/15 via-teal-400/10 to-cyan-400/15" />

              <CardHeader className="relative pb-2">
                <CardTitle className="text-lg text-slate-900">Live Location (debug)</CardTitle>
                <CardDescription className="text-slate-600">Real or Mock. Export collected samples for testing.</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
                  <div className="flex items-center gap-2">
                    <input
                      id="mockToggle"
                      type="checkbox"
                      checked={useMock}
                      onChange={(e) => setUseMock(e.target.checked)}
                    />
                    <label htmlFor="mockToggle" className="text-sm text-slate-700">Use mock location</label>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Series</label>
                    <select
                      className="border rounded-md px-2 py-1 text-sm"
                      value={mockId}
                      onChange={(e) => setMockId(e.target.value)}
                      disabled={!useMock}
                    >
                      {mockSeries.series.map((s) => (
                        <option key={s.id} value={s.id}>{s.id}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Interval (ms)</label>
                    <Input
                      type="number"
                      className="w-28"
                      value={mockInterval}
                      onChange={(e) => setMockInterval(Math.max(250, Number(e.target.value) || 1000))}
                      disabled={!useMock}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={downloadSamples}>Export samples (JSON)</Button>
                    <div className="text-sm text-slate-600">Total samples: <strong>{samplesRef.current.length}</strong></div>
                  </div>
                </div>

                <div className="relative rounded-md border border-emerald-200/50 bg-white/90 backdrop-blur max-h-64 overflow-auto shadow-inner">
                  {/* table backdrop gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 via-teal-50/30 to-cyan-50/50 pointer-events-none" />

                  <table className="relative w-full text-sm">
                    <thead className="bg-gradient-to-r from-emerald-100/80 via-teal-100/80 to-cyan-100/80 sticky top-0 backdrop-blur">
                      <tr>
                        <th className="text-left p-2 font-semibold text-slate-700">#</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Time</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Lat</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Lng</th>
                        <th className="text-left p-2 font-semibold text-slate-700">±m</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Speed</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Heading</th>
                        <th className="text-left p-2 font-semibold text-slate-700">Source</th>
                      </tr>
                    </thead>
                    <tbody className="relative">
                      {locSamples.length === 0 ? (
                        <tr><td colSpan={8} className="p-3 text-slate-500 bg-white/50">Waiting for first fix…</td></tr>
                      ) : (
                        locSamples.map((s, i) => (
                          <tr key={s.__id} className="border-t border-emerald-100/50 hover:bg-emerald-50/50 transition-colors">
                            <td className="p-2 text-slate-700">{samplesRef.current.length - locSamples.length + i + 1}</td>
                            <td className="p-2 text-slate-600">{s.iso}</td>
                            <td className="p-2 text-slate-700 font-medium">{s.lat.toFixed(6)}</td>
                            <td className="p-2 text-slate-700 font-medium">{s.lng.toFixed(6)}</td>
                            <td className="p-2 text-slate-600">{s.accuracy ?? "—"}</td>
                            <td className="p-2 text-slate-600">{s.speed ?? "—"}</td>
                            <td className="p-2 text-slate-600">{s.heading ?? "—"}</td>
                            <td className="p-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.source === 'mock' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {s.source}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        </section>
      )}

      {/* Scan Modal */}
      <Dialog open={scanModalOpen} onOpenChange={(o) => (o ? setScanModalOpen(true) : closeScanModal())}>
        <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Scan a QR Code</DialogTitle>
            <DialogDescription>Use your camera or upload a QR image to locate a grave on the map.</DialogDescription>
          </DialogHeader>

          {scanMode === "choose" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button onClick={startCamera}>Open Camera</Button>

              <div className="flex items-center justify-center">
                <label
                  htmlFor="qr-upload"
                  className="w-full cursor-pointer rounded-md border border-input bg-background px-4 py-2.5 text-center text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Upload QR Image
                </label>
                <input
                  id="qr-upload"
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onClick={(e) => { e.currentTarget.value = ""; }}
                  onChange={(e) => handleUploadFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          )}

          {scanMode === "camera" && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border">
                <div className="w-full aspect-video bg-muted/40">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                </div>
              </div>

              {scanErr && (
                <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
                  {scanErr}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => { stopCamera(); setScanMode("choose"); }}>
                  Back
                </Button>
                <Button onClick={closeScanModal}>Close</Button>
              </DialogFooter>
            </div>
          )}

          {scanMode === "upload" && (
            <div className="text-sm text-slate-600">
              Processing image… {scanErr && <span className="text-rose-600 font-medium ml-2">{scanErr}</span>}
            </div>
          )}

          {scanErr && scanMode !== "upload" && scanMode !== "camera" && (
            <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-sm">
              {scanErr}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Location Permission Modal */}
      <Dialog open={locationModalOpen} onOpenChange={(o) => setLocationModalOpen(o)}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Use your location?</DialogTitle>
            <DialogDescription>
              We can use your current location (or a mock series) to compute a walking route to the grave and record samples.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setLocationConsent(true);
                setLocationModalOpen(false); // Route still shows from the cemetery entrance
              }}
            >
              Not now
            </Button>
            <Button
              onClick={() => {
                if (useMock) {
                  setLocationConsent(true);
                  setLocationModalOpen(false);
                  if (mockPoints.length) setUserLoc({ lat: mockPoints[0].lat, lng: mockPoints[0].lng });
                } else {
                  requestUserLocationReal();
                }
              }}
            >
              Allow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
