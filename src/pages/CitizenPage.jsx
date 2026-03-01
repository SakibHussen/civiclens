import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  logoutUser, sendMessage, listenToMessages,
  listenToReports, addReport, reactToReport,
  approveResolution, denyResolution,
  sendNotification, listenToNotifications, markNotificationRead,
  DEPARTMENT_CONFIG,
} from "../firebase";
import { analyzeReport } from "../utils/analyzeReport";
import MapPicker from "../utils/MapPicker";

const CITIZEN_KEYFRAMES = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeUpMsg { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
  @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes bounce-icon { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-3px); } }
  @keyframes slideInRight { from { transform:translateX(100%); } to { transform:translateX(0); } }
  @keyframes slideDown { from { transform:translateY(-100%); } to { transform:translateY(0); } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
  .msg-enter { animation: fadeUpMsg 0.25s ease-out forwards; }
  .animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .animate-slide-in-right { animation: slideInRight 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
  .animate-slide-down { animation: slideDown 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .animate-float { animation: float 3s ease-in-out infinite; }
  .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
  .animate-shimmer { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
  .animate-bounce-icon { animation: bounce-icon 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .animate-scale-tap:active { transform: scale(0.98); }
  .animate-scale-bounce:active { transform: scale(1.4); animation: bounce-icon 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
`;

// ── Constants ─────────────────────────────────────────────────────────────────

const ISSUE_LABELS = {
  // Fire dept
  biohazard:                 "🧪 Biohazard",
  fire_hazard:               "🔥 Fire Hazard",
  chemical_spill:            "☣️ Chemical Spill",
  gas_leak:                  "💨 Gas Leak",
  smoke_odor:                "🌫️ Smoke/Odor",
  abandoned_fire:            "🔥 Abandoned Fire",
  hazardous_material:        "⚠️ Hazardous Material",
  structural_fire_damage:    "🏚️ Fire Damage",
  fallen_tree_blocking_road: "🌳 Fallen Tree",
  // Water dept
  flooding:              "🌊 Flooding",
  water_leakage:         "💧 Water Leakage",
  burst_pipe:            "🚰 Burst Pipe",
  drainage_blockage:     "🚧 Drainage Blockage",
  sewer_overflow:        "🦠 Sewer Overflow",
  manhole_overflow:      "⚠️ Manhole Overflow",
  water_main_break:      "💧 Water Main Break",
  contaminated_water:    "🧪 Contaminated Water",
  standing_water:        "💧 Standing Water",
  storm_drain_blockage:  "🌧️ Storm Drain",
  sinkholes:             "🕳️ Sinkhole",
  water_pressure_issue:  "💧 Water Pressure",
  // Electric / Public Works
  electrical_hazard:         "⚡ Electrical Hazard",
  broken_streetlight:        "💡 Broken Streetlight",
  downed_power_line:         "⚡ Downed Power Line",
  pothole:                   "🕳️ Pothole",
  road_damage:               "🛣️ Road Damage",
  broken_infrastructure:     "🏗️ Infrastructure",
  traffic_light_malfunction: "🚦 Traffic Light",
  damaged_guardrail:         "🚧 Guardrail",
  road_sign_damage:          "🛑 Road Sign",
  sidewalk_damage:           "🚶 Sidewalk",
  bridge_damage:             "🌉 Bridge",
  exposed_wiring:            "⚡ Exposed Wiring",
  transformer_issue:         "⚡ Transformer",
  road_cave_in:              "🕳️ Road Cave-In",
  construction_hazard:       "🏗️ Construction",
  debris_on_road:            "🚧 Debris on Road",
  // Legacy / catch-all
  vandalism: "🎨 Vandalism",
  other:     "📋 Other",
};

const STATUS_CONFIG = {
  pending:            { label: "Pending",            cls: "bg-gray-100 text-gray-600", dotCls: "bg-gray-500" },
  in_process:         { label: "In Process",         cls: "bg-yellow-100 text-yellow-700", dotCls: "bg-yellow-500 animate-pulse-dot" },
  "in-progress":      { label: "In Process",         cls: "bg-yellow-100 text-yellow-700", dotCls: "bg-yellow-500 animate-pulse-dot" },
  pending_to_resolve: { label: "Pending Approval",   cls: "bg-blue-100 text-blue-700", dotCls: "bg-blue-500" },
  resolved:           { label: "Resolved",           cls: "bg-green-100 text-green-700", dotCls: "bg-green-500" },
};

// Department issue sets for color coding
const FIRE_ISSUES = new Set([
  "biohazard", "fire_hazard", "chemical_spill", "gas_leak", "smoke_odor",
  "abandoned_fire", "hazardous_material", "structural_fire_damage", "fallen_tree_blocking_road",
]);
const WATER_ISSUES = new Set([
  "flooding", "water_leakage", "burst_pipe", "drainage_blockage", "sewer_overflow",
  "manhole_overflow", "water_main_break", "contaminated_water", "standing_water",
  "storm_drain_blockage", "sinkholes", "water_pressure_issue",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return "just now";
  try {
    const ms = ts.toMillis?.() ?? new Date(ts).getTime();
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch { return "just now"; }
}

function locStr(loc) {
  if (!loc) return "Unknown location";
  if (typeof loc === "string") return loc;
  return loc.address || `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}`;
}

function deptBorderCls(issueType) {
  if (FIRE_ISSUES.has(issueType))  return "border-l-red-500";
  if (WATER_ISSUES.has(issueType)) return "border-l-blue-500";
  return "border-l-yellow-500";
}

function issueBadgeCls(issueType) {
  if (FIRE_ISSUES.has(issueType))  return "bg-red-100 text-red-700";
  if (WATER_ISSUES.has(issueType)) return "bg-blue-100 text-blue-700";
  return "bg-yellow-100 text-yellow-700";
}

function severityCls(score) {
  if (score >= 8) return "bg-red-100 text-red-700";
  if (score >= 5) return "bg-orange-100 text-orange-700";
  if (score >= 3) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

// ── Camera Modal ──────────────────────────────────────────────────────────────

function CameraModal({ onCapture, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready,      setReady]      = useState(false);
  const [error,      setError]      = useState("");
  const [facingMode, setFacingMode] = useState("environment");

  useEffect(() => {
    let active = true;
    async function start() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
      setError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { if (active) setReady(true); };
        }
      } catch {
        if (active) setError("Camera access denied or not available.");
      }
    }
    start();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  function handleCapture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <button onClick={onClose} className="text-white text-sm font-medium bg-white/10 rounded-xl px-3 py-1.5">
          Cancel
        </button>
        <span className="text-white text-sm font-semibold">Take Photo</span>
        <button
          onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
          className="text-white text-sm bg-white/10 rounded-xl px-3 py-1.5"
        >
          🔄 Flip
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white text-center px-8">
            <div>
              <p className="text-5xl mb-4">📵</p>
              <p className="font-semibold text-lg">{error}</p>
              <p className="text-sm text-gray-400 mt-2">Allow camera access in your browser settings and try again.</p>
            </div>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-white text-sm animate-pulse">Starting camera…</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center py-10 shrink-0 bg-black">
        <button
          onClick={handleCapture}
          disabled={!ready}
          className="w-20 h-20 rounded-full bg-white disabled:opacity-30 active:scale-95 transition-transform shadow-lg ring-4 ring-white/30"
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ── Create Report View (full-page) ────────────────────────────────────────────

function CreateReportView({ user, location, locating, onCreated, onBack }) {
  const [description,  setDescription]  = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64,  setPhotoBase64]  = useState(null);
  const [step,         setStep]         = useState("form"); // "form" | "analyzing" | "submitting" | "done"
  const [submittedId,  setSubmittedId]  = useState(null);
  const [showCamera,   setShowCamera]   = useState(false);
  const galleryRef = useRef(null);

  const homeCity  = localStorage.getItem("civicCity")  || "";
  const homeState = localStorage.getItem("civicState") || "";
  const homeZip   = localStorage.getItem("civicZip")   || "";
  const homeLabel = homeCity ? `${homeCity}, ${homeState}${homeZip ? " " + homeZip : ""}` : null;

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target.result);
      setPhotoBase64(ev.target.result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  }

  function handleCameraCapture(dataUrl) {
    setPhotoPreview(dataUrl);
    setPhotoBase64(dataUrl.split(",")[1]);
    setShowCamera(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!photoBase64) return;

    const userName    = user.displayName || user.email;
    const locationCtx = location?.address
      ? homeLabel ? `${location.address}, ${homeLabel}` : location.address
      : homeLabel ?? "";

    setStep("analyzing");
    const analysis = await analyzeReport({ imageBase64: photoBase64, description, location: locationCtx });

    const storedLocation = {
      ...(location ?? {}),
      address: location?.address
        ? homeLabel ? `${location.address} · ${homeLabel}` : location.address
        : homeLabel ?? "Location unavailable",
    };

    setStep("submitting");
    const { id: docId, reportId } = await addReport({
      createdBy:     user.uid,
      createdByName: userName,
      photoUrl:      photoPreview,
      description,
      location:      storedLocation,
      ...analysis,
    });

    await sendMessage({
      senderId:   user.uid,
      senderName: userName,
      role:       "citizen",
      text:       `Submitted a report: ${analysis.issueType} – ${analysis.summary}`,
      type:       "report",
      reportId:   docId,
    });

    const deptName = DEPARTMENT_CONFIG[analysis.assignedDepartment]?.displayName ?? "City Team";
    await sendMessage({
      senderId:   "ai",
      senderName: "CivicLens AI 🤖",
      role:       "ai",
      text:       `📋 New report! ${reportId} submitted by ${userName}.\nIssue: ${analysis.issueType} – ${analysis.summary}\nAssigned to: ${deptName} for review.`,
      type:       "ai_update",
      reportId:   docId,
    });

    setSubmittedId(reportId);
    setStep("done");
    setTimeout(() => onCreated(), 4000);
  }

  const busy = step !== "form";

  if (step === "done") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="bg-green-500 text-white rounded-2xl shadow-xl px-6 py-6 text-center max-w-sm w-full animate-slide-down">
          <div className="text-5xl mb-4">✅</div>
          <p className="font-bold text-lg">Report submitted!</p>
          <p className="text-sm text-white/90 mt-2">
            <span className="font-semibold">{submittedId}</span> has been submitted.
          </p>
          <p className="text-xs text-white/70 mt-3">Redirecting to My Reports…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 animate-slide-in-right">
      <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden text-sm text-blue-600 font-medium flex items-center gap-1 -ml-1 mb-2"
          >
            ← Back
          </button>
        )}

        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-gray-900">Report an Issue</h2>
          <p className="text-xs text-gray-400 mt-0.5">✨ AI will classify the issue type and severity from your photo.</p>
        </div>

        {/* Photo — mandatory */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Photo <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal ml-1">(required)</span>
          </label>
          {photoPreview ? (
            <div className="relative rounded-3xl overflow-hidden h-[200px] animate-scale-in">
              <img src={photoPreview} alt="preview" className="w-full h-full object-cover rounded-3xl" />
              <button
                type="button"
                onClick={() => { setPhotoPreview(null); setPhotoBase64(null); if (galleryRef.current) galleryRef.current.value = ""; }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs hover:bg-black/80 transition-transform active:scale-95"
              >
                ✕ Remove
              </button>
            </div>
          ) : (
            <div className="h-[200px] bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3">
              <span className="text-4xl text-gray-300">📷</span>
              <p className="text-sm text-gray-500">Add a photo of the issue</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3 text-sm font-medium text-gray-700 transition-transform active:scale-95"
                >
                  📷 Camera
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-3 text-sm font-medium text-gray-700 transition-transform active:scale-95"
                >
                  🖼️ Gallery
                </button>
              </div>
            </div>
          )}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            onChange={handlePhoto}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the issue…"
            className="w-full bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3 text-base focus:border-blue-300 focus:bg-white focus:outline-none resize-none transition-all duration-200"
          />
        </div>

        {/* Location */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center gap-2">
          <span className="text-blue-500">📍</span>
          {locating ? (
            <span className="text-gray-400 text-sm animate-pulse">Getting location…</span>
          ) : location ? (
            <span className="text-gray-700 text-sm">{location.address}</span>
          ) : homeLabel ? (
            <span className="text-blue-600 text-sm">Reporting from {homeLabel}</span>
          ) : (
            <span className="text-gray-400 text-sm">Location unavailable</span>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!photoBase64 || busy}
          className="w-full rounded-2xl py-4 font-semibold text-base text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {step === "analyzing" ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing with AI...
            </>
          ) : step === "submitting" ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting…
            </>
          ) : step === "done" ? (
            "✅ Submitted!"
          ) : (
            "Submit Report"
          )}
        </button>
      </div>

      {showCamera && (
        <CameraModal
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Report Card inside Chat ───────────────────────────────────────────────────

function ChatReportCard({ report, currentUserId }) {
  const [reacted, setReacted] = useState(report.reactions?.includes(currentUserId));
  const [count,   setCount]   = useState(report.reactionCount ?? 0);
  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;

  async function handleReact() {
    if (reacted) return;
    setReacted(true);
    setCount((c) => c + 1);
    await reactToReport(report.id, currentUserId);
  }

  return (
    <div className={`border-l-4 ${deptBorderCls(report.issueType)} bg-white rounded-2xl shadow-sm overflow-hidden max-w-xs msg-enter`}>
      {report.photoUrl && (
        <img src={report.photoUrl} alt="report" className="w-full h-[60px] object-cover rounded-t-xl" />
      )}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold bg-blue-600 text-white rounded px-1.5 py-0.5 tracking-wide">
            {report.reportId || "RPT"}
          </span>
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${issueBadgeCls(report.issueType)}`}>
            {ISSUE_LABELS[report.issueType] ?? "📋 Other"}
          </span>
          <span className="text-[10px] font-semibold text-orange-600">Sev {report.severityScore ?? "?"}/10</span>
        </div>
        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{report.summary}</p>
        <div className="flex items-center justify-between pt-1">
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
            {status.label}
          </span>
          <button
            onClick={handleReact}
            disabled={reacted}
            className={`flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 transition-transform active:scale-125 ${
              reacted ? "bg-blue-50 text-blue-600 cursor-default" : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
            }`}
          >
            👍 {count}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 truncate">📍 {locStr(report.location)}</p>
      </div>
    </div>
  );
}

// ── Message Item ──────────────────────────────────────────────────────────────

function MessageItem({ msg, currentUser, reports }) {
  const isMe     = msg.senderId === currentUser.uid;
  const isAI     = msg.role === "ai";
  const isReport = msg.type === "report";

  if (isAI) {
    return (
      <div className="flex justify-center my-1 msg-enter">
        <div className="w-full max-w-[calc(100%-2rem)] bg-gradient-to-r from-violet-600/15 to-indigo-600/15 border border-violet-500/20 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-sm">🤖</span>
            <span className="text-xs font-semibold text-violet-600">CivicLens AI</span>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (isReport) {
    const report = reports.find((r) => r.id === msg.reportId);
    return (
      <div className={`flex flex-col gap-1 msg-enter ${isMe ? "items-end" : "items-start"}`}>
        <span className="text-xs text-gray-400 px-1">{msg.senderName}</span>
        {report ? (
          <ChatReportCard report={report} currentUserId={currentUser.uid} />
        ) : (
          <div className="border-l-4 border-blue-300 bg-gray-50 rounded-r-xl px-4 py-3 text-sm text-gray-400 rounded-2xl rounded-bl-lg">
            Loading report…
          </div>
        )}
        <span className="text-[10px] text-gray-300 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 msg-enter ${isMe ? "items-end" : "items-start"}`}>
      {!isMe && (
        <span className="text-xs text-gray-400 px-2">
          {msg.senderName}
          {msg.role === "admin" && <span className="ml-1 text-indigo-600 font-semibold">Admin 🏛️</span>}
        </span>
      )}
      <div
        className={`max-w-[78%] px-4 py-3 rounded-3xl text-sm leading-relaxed ${
          isMe
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-lg shadow-lg shadow-blue-500/20 ml-auto"
            : "bg-white text-gray-800 rounded-bl-lg shadow-sm"
        }`}
      >
        {msg.text}
      </div>
      <span className="text-[10px] text-gray-300 px-2">{timeAgo(msg.timestamp)}</span>
    </div>
  );
}

// ── Deny Form ─────────────────────────────────────────────────────────────────

function DenyForm({ report, user, onCancel }) {
  const [explanation, setExplanation] = useState("");
  const [submitting,  setSubmitting]  = useState(false);

  async function handleSubmit() {
    if (!explanation.trim()) return;
    setSubmitting(true);
    await denyResolution(
      report.id, report.reportId, report.issueType,
      explanation.trim(), user.displayName || user.email
    );
    setSubmitting(false);
    onCancel();
  }

  return (
    <div
      className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2 overflow-hidden transition-all duration-300"
      style={{ maxHeight: 180, opacity: 1 }}
    >
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        rows={3}
        placeholder="Please explain why this is not resolved… (required)"
        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 resize-none transition-all duration-200"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!explanation.trim() || submitting}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-2xl py-2.5 transition-transform active:scale-95"
        >
          {submitting ? "Submitting…" : "Submit Denial"}
        </button>
        <button onClick={onCancel} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────

function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const unsub = listenToNotifications(userId, (data) => setNotifications(data));
    return () => unsub?.();
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[60]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">Notifications</span>
            {unread > 0 && <span className="text-xs text-blue-600 font-medium">{unread} unread</span>}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-gray-400 text-sm">No notifications yet</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  key={n.id}
                  onClick={async () => { if (!n.read) await markNotificationRead(n.id); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex flex-col gap-1 ${!n.read ? "bg-blue-50/60" : ""}`}
                >
                  <p className="text-xs text-gray-800 leading-snug">{n.message}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{timeAgo(n.timestamp)}</span>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Report Card ───────────────────────────────────────────────────────────────

function ReportCard({ report, currentUser, denyingId, onDenyClick }) {
  const [approving, setApproving] = useState(false);
  const [reacted,   setReacted]   = useState(report.reactions?.includes(currentUser.uid));
  const [count,     setCount]     = useState(report.reactionCount ?? 0);

  const status     = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const isMyReport = report.createdBy === currentUser.uid;
  const canApprove = isMyReport && report.status === "pending_to_resolve";
  const isDenying  = denyingId === report.id;
  const sevScore   = report.severityScore ?? 0;

  async function handleApprove() {
    if (approving) return;
    setApproving(true);
    await approveResolution(
      report.id, report.reportId, report.issueType, report.location,
      currentUser.displayName || currentUser.email
    );
    setApproving(false);
  }

  async function handleReact() {
    if (reacted || isMyReport) return;
    setReacted(true);
    setCount((c) => c + 1);
    await reactToReport(report.id, currentUser.uid);
  }

  const dotCls = status.dotCls ?? "bg-gray-500";

  return (
    <div
      className={`bg-white rounded-3xl border border-gray-100 border-l-4 ${deptBorderCls(report.issueType)} shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] md:hover:shadow-md`}
    >
      <div className="p-4 flex flex-col gap-2">
        {/* Row 1: ID + Status + time */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-gray-400">{report.reportId || "RPT"}</span>
          <span className={`flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
            {status.label}
          </span>
          <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(report.timestamp)}</span>
        </div>

        {/* Row 2: Issue badge + severity badge + photo */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${issueBadgeCls(report.issueType)}`}>
                {ISSUE_LABELS[report.issueType] ?? "📋 Other"}
              </span>
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${severityCls(sevScore)}`}>
                Sev {sevScore}/10
              </span>
            </div>
            <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">{report.summary}</p>
          </div>
          {report.photoUrl && (
            <img src={report.photoUrl} alt="report" className="w-[60px] h-[60px] object-cover rounded-xl shrink-0" />
          )}
        </div>

        {/* Row 3: Location */}
        <p className="text-[10px] text-gray-400 truncate">📍 {locStr(report.location)}</p>

        {/* Denial explanation */}
        {report.denialExplanation && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-xs text-red-700 font-medium">Denial reason: {report.denialExplanation}</p>
          </div>
        )}

        {/* Actions */}
        {canApprove && !isDenying && (
          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-xs font-semibold rounded-2xl py-2.5 transition-transform active:scale-95"
            >
              {approving ? "…" : "✅ Approve"}
            </button>
            <button
              onClick={() => onDenyClick(report.id)}
              className="flex-1 border-2 border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-2xl py-2.5 transition-transform active:scale-95"
            >
              ❌ Deny
            </button>
          </div>
        )}

        {isDenying && (
          <DenyForm report={report} user={currentUser} onCancel={() => onDenyClick(null)} />
        )}

        {!isMyReport && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <button
              onClick={handleReact}
              disabled={reacted}
              className={`flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 transition-transform active:scale-125 ${
                reacted ? "bg-blue-50 text-blue-600 cursor-default" : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              👍 {count}
            </button>
          </div>
        )}

        {isMyReport && !canApprove && (
          <div className="flex items-center pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-400">👍 {count} reactions</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reports Panel ─────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: "all",                label: "All" },
  { key: "pending",            label: "Pending" },
  { key: "in_process",         label: "In Progress" },
  { key: "pending_to_resolve", label: "Pending Approval" },
  { key: "resolved",           label: "Resolved" },
];

function ReportsPanel({ reports, currentUser, myOnly, title, onCreateReport }) {
  const [search,       setSearch]       = useState("");
  const [sortBy,       setSortBy]       = useState("priority");
  const [statusFilter, setStatusFilter] = useState("all");
  const [denyingId,    setDenyingId]    = useState(null);

  const filtered = useMemo(() => {
    let list = myOnly
      ? reports.filter((r) => r.createdBy === currentUser.uid)
      : [...reports];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.issueType?.toLowerCase().includes(q) ||
        r.summary?.toLowerCase().includes(q) ||
        locStr(r.location).toLowerCase().includes(q) ||
        r.reportId?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      list = list.filter((r) => {
        if (statusFilter === "in_process") return r.status === "in_process" || r.status === "in-progress";
        return r.status === statusFilter;
      });
    }

    if (sortBy === "priority") {
      list.sort((a, b) => (b.severityScore ?? 0) - (a.severityScore ?? 0));
    } else if (sortBy === "date-newest") {
      list.sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0));
    } else {
      list.sort((a, b) => (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0));
    }

    return list;
  }, [reports, currentUser.uid, myOnly, search, statusFilter, sortBy]);

  // Base count (before search/status filter) for total
  const baseCount = myOnly
    ? reports.filter((r) => r.createdBy === currentUser.uid).length
    : reports.length;

  const hasFilters = search.trim() || statusFilter !== "all" || sortBy !== "priority";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
          <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
            {filtered.length}
          </span>
        </div>

        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, type, summary…"
            className="w-full bg-gray-100 rounded-2xl pl-10 pr-4 py-3 text-sm focus:bg-white focus:border focus:border-blue-200 focus:outline-none transition-all duration-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 border-0"
          >
            <option value="priority">↑ Priority</option>
            <option value="date-newest">🕐 Newest</option>
            <option value="date-oldest">🕐 Oldest</option>
          </select>
        </div>

        {/* Status filter pills — All Reports only */}
        {!myOnly && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
            {STATUS_FILTERS.map((f) => {
              const isActive = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-blue-600 text-white scale-105 shadow-lg shadow-blue-500/30"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 active:scale-95"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center gap-2">
            <span className="text-3xl animate-float">📋</span>
            <p className="text-gray-500 text-sm">No reports found</p>
            {myOnly && baseCount === 0 ? (
              <>
                <p className="text-gray-400 text-sm">You haven&apos;t submitted any reports yet</p>
                <button
                  onClick={onCreateReport}
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-2xl px-5 py-2.5 transition-colors active:scale-95"
                >
                  Create your first report
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm">
                  {myOnly ? "No reports match your search." : `No ${statusFilter !== "all" ? STATUS_FILTERS.find((f) => f.key === statusFilter)?.label : ""} reports.`}
                </p>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); setSortBy("priority"); }}
                    className="text-sm text-blue-500 hover:text-blue-700 font-medium mt-1"
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          filtered.map((r, i) => (
            <div
              key={r.id}
              style={{
                animation: `fadeUp 0.4s ease-out ${i * 50}ms forwards`,
                opacity: 0,
                transform: "translateY(16px)",
              }}
            >
              <ReportCard
                report={r}
                currentUser={currentUser}
                denyingId={denyingId}
                onDenyClick={setDenyingId}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ activeView, onNavigate, userName, onLogout }) {
  const navItems = [
    { key: "chat",          icon: "💬", label: "Chat" },
    { key: "create-report", icon: "✍️", label: "Report" },
    { key: "my-reports",    icon: "📁", label: "My Reports" },
    { key: "all-reports",   icon: "🌐", label: "All Reports" },
  ];

  return (
    <div className="hidden md:flex flex-col w-[220px] border-r border-gray-800 bg-gray-900 shrink-0">
      <nav className="flex-1 p-2 pt-3 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
              }`}
            >
              {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r" />}
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <p className="text-xs text-gray-400 font-medium truncate px-1 mb-1">👤 {userName}</p>
        <button
          onClick={onLogout}
          className="w-full text-xs text-gray-500 hover:text-red-400 text-left px-1 py-1 transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────

function BottomNav({ activeView, onNavigate }) {
  const tabs = [
    { key: "chat", icon: "💬", label: "Chat" },
    { key: "create-report", icon: "✍️", label: "Report" },
    { key: "my-reports", icon: "📁", label: "Mine" },
    { key: "all-reports", icon: "🌐", label: "All" },
  ];
  return (
    <div className="md:hidden flex bg-white/80 backdrop-blur-xl border-t border-gray-100 shrink-0 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <style dangerouslySetInnerHTML={{ __html: CITIZEN_KEYFRAMES }} />
      {tabs.map((tab) => {
        const isActive = activeView === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.key)}
            className={`flex-1 flex flex-col items-center py-2 px-4 gap-0.5 text-xs font-medium transition-all duration-300 ${
              isActive ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <span className={`text-xl transition-transform duration-300 ${isActive ? "animate-bounce-icon" : ""}`}>{tab.icon}</span>
            <span>{tab.label}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-0.5" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Citizen Page ──────────────────────────────────────────────────────────────

export default function CitizenPage({ user }) {
  const navigate  = useNavigate();
  const userName  = user?.displayName || user?.email || "Citizen";

  const [messages,   setMessages]   = useState([]);
  const [reports,    setReports]    = useState([]);
  const [text,       setText]       = useState("");
  const [location,   setLocation]   = useState(null);
  const [locating,   setLocating]   = useState(false);
  const [activeView, setActiveView] = useState("chat"); // "chat" | "create-report" | "my-reports" | "all-reports"

  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub1 = listenToMessages(setMessages);
    const unsub2 = listenToReports(setReports);
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  useEffect(() => {
    if (activeView === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeView]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        setLocation({ lat, lng, address: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}` });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }, []);

  async function handleLogout() {
    await logoutUser();
    navigate("/");
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text.trim();
    setText("");
    await sendMessage({
      senderId:   user.uid,
      senderName: userName,
      role:       "citizen",
      text:       t,
      type:       "chat",
    });
  }

  const initials = (userName || "C").split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="h-screen flex flex-col bg-gray-50 min-w-0">
      <style dangerouslySetInnerHTML={{ __html: CITIZEN_KEYFRAMES }} />

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-4 shrink-0">
        <h1 className="text-lg font-bold text-gray-900">CivicLens</h1>
        <div className="flex items-center gap-3">
          <NotificationBell userId={user.uid} />
          <div
            className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0"
            aria-hidden
          >
            {initials}
          </div>
          <button
            onClick={handleLogout}
            className="hidden md:block text-xs text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden pt-14 pb-20 md:pb-0">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          userName={userName}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-hidden flex flex-col">

          {/* Chat view */}
          {activeView === "chat" && (
            <>
              <div className="px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100 shrink-0 md:border-none md:bg-transparent">
                <h2 className="font-bold text-gray-900 text-sm">Community Chat 🏙️</h2>
                <p className="text-xs text-gray-400">{reports.length} reports in the community</p>
              </div>
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 overscroll-contain"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {messages.length === 0 && (
                  <div className="py-20 text-center">
                    <span className="text-3xl block mb-3 animate-float">👋</span>
                    <p className="text-gray-500 text-sm">No messages yet. Start the conversation!</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <MessageItem key={msg.id} msg={msg} currentUser={user} reports={reports} />
                ))}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={handleSend}
                className="border-t border-gray-100 bg-white/90 backdrop-blur-xl px-4 py-3 flex items-center gap-2 shrink-0"
              >
                <div className="flex-1 bg-gray-100 rounded-full flex items-center px-4 py-2 min-h-10">
                  <button
                    type="button"
                    onClick={() => setActiveView("create-report")}
                    className="shrink-0 text-blue-500 text-sm font-medium mr-2"
                  >
                    📎 Report
                  </button>
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message…"
                    className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-sm min-w-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="shrink-0 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center text-lg transition-transform active:scale-90"
                >
                  ➤
                </button>
              </form>
            </>
          )}

          {/* Create Report view */}
          {activeView === "create-report" && (
            <CreateReportView
              user={user}
              location={location}
              locating={locating}
              onCreated={() => setActiveView("my-reports")}
              onBack={() => setActiveView("chat")}
            />
          )}

          {/* My Reports view */}
          {activeView === "my-reports" && (
            <ReportsPanel
              reports={reports}
              currentUser={user}
              myOnly={true}
              title="My Reports"
              onCreateReport={() => setActiveView("create-report")}
            />
          )}

          {/* All Reports view */}
          {activeView === "all-reports" && (
            <ReportsPanel
              reports={reports}
              currentUser={user}
              myOnly={false}
              title="Community Reports"
              onCreateReport={() => setActiveView("create-report")}
            />
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
        <BottomNav activeView={activeView} onNavigate={setActiveView} />
      </div>
    </div>
  );
}
