import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  logoutUser, sendMessage, listenToMessages,
  listenToReports, addReport, reactToReport,
  approveResolution, denyResolution,
  sendNotification, listenToNotifications, markNotificationRead,
  DEPARTMENT_CONFIG,
} from "../firebase";
import { analyzeReport } from "../utils/analyzeReport";

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
  pending:            { label: "Pending",            cls: "bg-gray-100 text-gray-600" },
  in_process:         { label: "In Process",         cls: "bg-yellow-100 text-yellow-700" },
  "in-progress":      { label: "In Process",         cls: "bg-yellow-100 text-yellow-700" },
  pending_to_resolve: { label: "Pending to Resolve", cls: "bg-blue-100 text-blue-700" },
  resolved:           { label: "Resolved",           cls: "bg-green-100 text-green-700" },
};

const FILTER_TABS = [
  { key: "all",                label: "All" },
  { key: "pending",            label: "Pending" },
  { key: "in_process",         label: "In Process" },
  { key: "pending_to_resolve", label: "Pending to Resolve" },
  { key: "resolved",           label: "Resolved" },
];

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

// ── Report Modal ──────────────────────────────────────────────────────────────

function ReportModal({ user, location, locating, onClose }) {
  const [description, setDescription] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [step, setStep] = useState("form"); // "form" | "analyzing" | "submitting" | "done"
  const fileRef = useRef(null);

  const homeCity  = localStorage.getItem("civicCity")  || "";
  const homeState = localStorage.getItem("civicState") || "";
  const homeZip   = localStorage.getItem("civicZip")   || "";
  const homeLabel = homeCity
    ? `${homeCity}, ${homeState}${homeZip ? " " + homeZip : ""}`
    : null;

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!photoBase64) return;

    const userName = user.displayName || user.email;
    const locationCtx = location?.address
      ? homeLabel ? `${location.address}, ${homeLabel}` : location.address
      : homeLabel ?? "";

    setStep("analyzing");
    const analysis = await analyzeReport({
      imageBase64: photoBase64,
      description,
      location: locationCtx,
    });

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

    // Post report card message to the group chat
    await sendMessage({
      senderId:   user.uid,
      senderName: userName,
      role:       "citizen",
      text:       `Submitted a report: ${analysis.issueType} – ${analysis.summary}`,
      type:       "report",
      reportId:   docId,
    });

    // AI announcement — include which department received it
    const deptName = DEPARTMENT_CONFIG[analysis.assignedDepartment]?.displayName ?? "City Team";
    await sendMessage({
      senderId:   "ai",
      senderName: "CivicLens AI 🤖",
      role:       "ai",
      text:       `📋 New report! ${reportId} submitted by ${userName}.\nIssue: ${analysis.issueType} – ${analysis.summary}\nAssigned to: ${deptName} for review.`,
      type:       "ai_update",
      reportId:   docId,
    });

    setStep("done");
    setTimeout(onClose, 1500);
  }

  const busy = step !== "form";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Report an Issue</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >✕</button>
        </div>

        {step === "done" ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="text-5xl">✅</div>
            <p className="font-semibold text-gray-800">Report submitted!</p>
            <p className="text-sm text-gray-400">Check the chat for updates.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">

            {/* Photo — mandatory */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Photo <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(required)</span>
              </label>
              {photoPreview ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={photoPreview} alt="preview" className="w-full h-44 object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setPhotoBase64(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-black/80"
                  >✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  <span className="text-3xl">📷</span>
                  <span className="text-sm font-medium">Tap to add a photo</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="hidden"
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
                rows={2}
                placeholder="Describe the issue…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            {/* Location */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-base">📡</span>
              {locating ? (
                <span className="text-gray-400 text-sm animate-pulse">Getting location…</span>
              ) : location ? (
                <span className="text-green-600 text-xs">{location.address}</span>
              ) : homeLabel ? (
                <span className="text-blue-600 text-xs">Reporting from {homeLabel}</span>
              ) : (
                <span className="text-gray-400 text-xs">Location unavailable</span>
              )}
            </div>

            <p className="text-xs text-gray-400">
              ✨ AI will classify the issue type and severity from your photo.
            </p>

            <button
              type="submit"
              disabled={!photoBase64 || busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              {step === "analyzing"  ? "🤖 AI analyzing…" :
               step === "submitting" ? "Submitting…"       :
                                       "Submit Report"}
            </button>
          </form>
        )}
      </div>
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
    <div className="border-l-4 border-blue-500 bg-white rounded-r-xl shadow-sm overflow-hidden max-w-xs">
      {report.photoUrl && (
        <img src={report.photoUrl} alt="report" className="w-full h-28 object-cover" />
      )}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold bg-blue-600 text-white rounded px-1.5 py-0.5 tracking-wide">
            {report.reportId || "RPT"}
          </span>
          <span className="text-xs text-gray-600">{ISSUE_LABELS[report.issueType] ?? "📋 Other"}</span>
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
            className={`flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 transition-all ${
              reacted
                ? "bg-blue-50 text-blue-600 cursor-default"
                : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
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
  const isMe   = msg.senderId === currentUser.uid;
  const isAI   = msg.role === "ai";
  const isReport = msg.type === "report";

  // AI / system message
  if (isAI) {
    return (
      <div className="flex justify-center my-1">
        <div className="max-w-sm w-full bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🤖</span>
            <span className="text-xs font-semibold text-indigo-600">CivicLens AI</span>
          </div>
          <p className="text-sm text-indigo-900 leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  // Report card message
  if (isReport) {
    const report = reports.find((r) => r.id === msg.reportId);
    return (
      <div className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
        <span className="text-xs text-gray-400 px-1">{msg.senderName}</span>
        {report ? (
          <ChatReportCard report={report} currentUserId={currentUser.uid} />
        ) : (
          <div className="border-l-4 border-blue-300 bg-gray-50 rounded-r-xl px-4 py-3 text-sm text-gray-400">
            Loading report…
          </div>
        )}
        <span className="text-[10px] text-gray-300 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  // Regular chat bubble
  return (
    <div className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
      {!isMe && (
        <span className="text-xs text-gray-400 px-2">
          {msg.senderName}
          {msg.role === "admin" && (
            <span className="ml-1 text-indigo-600 font-semibold">Admin 🏛️</span>
          )}
        </span>
      )}
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isMe
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
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
  const [submitting, setSubmitting]   = useState(false);

  async function handleSubmit() {
    if (!explanation.trim()) return;
    setSubmitting(true);
    await denyResolution(
      report.id,
      report.reportId,
      report.issueType,
      explanation.trim(),
      user.displayName || user.email
    );
    setSubmitting(false);
    onCancel();
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2">
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        rows={2}
        placeholder="Please explain why this is not resolved… (required)"
        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!explanation.trim() || submitting}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg py-2 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Denial"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── My Report Card ────────────────────────────────────────────────────────────

function MyReportCard({ report, user, denyingId, onDenyClick }) {
  const [approving, setApproving] = useState(false);
  const status     = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const isMyReport = report.createdBy === user.uid;
  const canApprove = isMyReport && report.status === "pending_to_resolve";
  const isDenying  = denyingId === report.id;

  async function handleApprove() {
    if (approving) return;
    setApproving(true);
    await approveResolution(
      report.id,
      report.reportId,
      report.issueType,
      report.location,
      user.displayName || user.email
    );
    setApproving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-blue-600 text-white rounded px-1.5 py-0.5 tracking-wide">
              {report.reportId || "RPT"}
            </span>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {ISSUE_LABELS[report.issueType] ?? "Other"}
          </p>
          <p className="text-xs text-gray-500 line-clamp-2">{report.summary}</p>
        </div>
        {report.photoUrl && (
          <img
            src={report.photoUrl}
            alt="report"
            className="w-14 h-14 object-cover rounded-lg shrink-0"
          />
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>👍 {report.reactionCount ?? 0}</span>
        <span>{timeAgo(report.timestamp)}</span>
        <span className="font-semibold text-orange-600">Sev {report.severityScore ?? "?"}/10</span>
      </div>

      {report.denialExplanation && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-700 font-medium">
            Denial reason: {report.denialExplanation}
          </p>
        </div>
      )}

      {/* Approve / Deny buttons */}
      {canApprove && !isDenying && (
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg py-2 transition-colors"
          >
            {approving ? "…" : "✅ Approve Resolution"}
          </button>
          <button
            onClick={() => onDenyClick(report.id)}
            className="flex-1 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg py-2 transition-colors"
          >
            ❌ Deny
          </button>
        </div>
      )}

      {isDenying && (
        <DenyForm report={report} user={user} onCancel={() => onDenyClick(null)} />
      )}
    </div>
  );
}

// ── My Reports Panel ──────────────────────────────────────────────────────────

function MyReportsPanel({ user, reports }) {
  const [filter,   setFilter]   = useState("all");
  const [denyingId, setDenyingId] = useState(null);

  const myReports = reports.filter((r) => r.createdBy === user.uid);
  const filtered  = filter === "all"
    ? myReports
    : myReports.filter((r) => {
        if (filter === "in_process") return r.status === "in_process" || r.status === "in-progress";
        return r.status === filter;
      });

  return (
    <div className="flex flex-col h-full">
      {/* Panel header + filter tabs */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <h2 className="font-bold text-gray-900 text-sm mb-2">My Reports</h2>
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${
                filter === f.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-gray-50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 text-center gap-2">
            <span className="text-4xl">📋</span>
            <p className="text-sm">No reports here yet.</p>
          </div>
        ) : (
          filtered.map((r) => (
            <MyReportCard
              key={r.id}
              report={r}
              user={user}
              denyingId={denyingId}
              onDenyClick={setDenyingId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────

function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]   = useState(false);
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
        className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">Notifications</span>
            {unread > 0 && (
              <span className="text-xs text-blue-600 font-medium">{unread} unread</span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-gray-400 text-sm">No notifications yet</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.read) await markNotificationRead(n.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex flex-col gap-1 ${
                    !n.read ? "bg-blue-50/60" : ""
                  }`}
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

// ── Citizen Page ──────────────────────────────────────────────────────────────

export default function CitizenPage({ user }) {
  const navigate  = useNavigate();
  const userName  = user?.displayName || user?.email || "Citizen";

  const [messages,   setMessages]   = useState([]);
  const [reports,    setReports]    = useState([]);
  const [text,       setText]       = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [location,   setLocation]   = useState(null);
  const [locating,   setLocating]   = useState(false);
  const [mobileTab,  setMobileTab]  = useState("chat"); // "chat" | "reports"

  const bottomRef = useRef(null);

  // Subscribe to messages and reports
  useEffect(() => {
    const unsub1 = listenToMessages(setMessages);
    const unsub2 = listenToReports(setReports);
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Acquire geolocation once
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

  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* Header */}
      <div className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold tracking-tight">🏛️ CivicLens</span>
          <span className="text-xs text-blue-200 hidden sm:inline">👤 {userName}</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userId={user.uid} />
          <button
            onClick={handleLogout}
            className="text-xs text-blue-200 hover:text-white underline underline-offset-2"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
        {[["chat", "💬 Chat"], ["reports", "📋 My Reports"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mobileTab === key
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body: two panels */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT — Group Chat (60%) */}
        <div className={`flex flex-col w-full md:w-3/5 border-r border-gray-200 ${
          mobileTab !== "chat" ? "hidden md:flex" : "flex"
        }`}>
          {/* Chat header */}
          <div className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
            <h2 className="font-bold text-gray-900 text-sm">CivicLens Community Chat 🏙️</h2>
            <p className="text-xs text-gray-400">{reports.length} total reports in the community</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-10">
                No messages yet. Start the conversation! 👋
              </div>
            )}
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} currentUser={user} reports={reports} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-3 py-2 transition-colors"
            >
              📎 Report
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-0"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              Send
            </button>
          </form>
        </div>

        {/* RIGHT — My Reports (40%) */}
        <div className={`w-full md:w-2/5 ${
          mobileTab !== "reports" ? "hidden md:flex md:flex-col" : "flex flex-col"
        }`}>
          <MyReportsPanel user={user} reports={reports} />
        </div>
      </div>

      {showModal && (
        <ReportModal
          user={user}
          location={location}
          locating={locating}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
