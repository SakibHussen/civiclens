import { useState, useEffect, useRef, Component } from "react";
import { useNavigate } from "react-router-dom";
import {
  logoutUser, sendMessage, listenToMessages,
  listenToReports, updateReportStatus, sendNotification,
  DEPARTMENT_CONFIG,
} from "../firebase";

// ── Constants ─────────────────────────────────────────────────────────────────

const ISSUE_LABELS = {
  // Fire
  biohazard:                 "🧪 Biohazard",
  fire_hazard:               "🔥 Fire Hazard",
  chemical_spill:            "☣️ Chemical Spill",
  gas_leak:                  "💨 Gas Leak",
  smoke_odor:                "🌫️ Smoke/Odor",
  abandoned_fire:            "🔥 Abandoned Fire",
  hazardous_material:        "⚠️ Hazardous Material",
  structural_fire_damage:    "🏚️ Fire Damage",
  fallen_tree_blocking_road: "🌳 Fallen Tree",
  // Water
  flooding:             "🌊 Flooding",
  water_leakage:        "💧 Water Leakage",
  burst_pipe:           "🚰 Burst Pipe",
  drainage_blockage:    "🚧 Drainage Blockage",
  sewer_overflow:       "🦠 Sewer Overflow",
  manhole_overflow:     "⚠️ Manhole Overflow",
  water_main_break:     "💧 Water Main Break",
  contaminated_water:   "🧪 Contaminated Water",
  standing_water:       "💧 Standing Water",
  storm_drain_blockage: "🌧️ Storm Drain",
  sinkholes:            "🕳️ Sinkhole",
  water_pressure_issue: "💧 Water Pressure",
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
  vandalism:                 "🎨 Vandalism",
  other:                     "📋 Other",
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

// ── Error Boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("[AdminPage ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl border border-red-200 shadow-lg max-w-xl w-full p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">💥</span>
              <h2 className="text-lg font-bold text-red-700">AdminPage crashed</h2>
            </div>
            <pre className="bg-red-50 text-red-800 text-xs rounded-lg p-4 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}{"\n\n"}{this.state.error.stack}
            </pre>
            <button onClick={() => this.setState({ error: null })}
              className="self-start text-sm font-medium text-indigo-600 hover:underline">
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Report Card inside Chat ───────────────────────────────────────────────────

function ChatReportCard({ report }) {
  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  return (
    <div className="border-l-4 border-indigo-500 bg-white rounded-r-xl shadow-sm overflow-hidden max-w-xs">
      {report.photoUrl && (
        <img src={report.photoUrl} alt="report" className="w-full h-28 object-cover" />
      )}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold bg-indigo-600 text-white rounded px-1.5 py-0.5 tracking-wide">
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
          <span className="text-xs text-gray-400">👍 {report.reactionCount ?? 0}</span>
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
      <div className="flex justify-center my-1">
        <div className="max-w-sm w-full bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🤖</span>
            <span className="text-xs font-semibold text-indigo-600">CivicLens AI</span>
          </div>
          <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-line">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (isReport) {
    const report = reports.find((r) => r.id === msg.reportId);
    return (
      <div className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
        <span className="text-xs text-gray-400 px-1">{msg.senderName}</span>
        {report ? (
          <ChatReportCard report={report} />
        ) : (
          <div className="border-l-4 border-indigo-300 bg-gray-50 rounded-r-xl px-4 py-3 text-sm text-gray-400">
            Loading report…
          </div>
        )}
        <span className="text-[10px] text-gray-300 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-400 px-2">
        {isMe ? (
          <span className="text-indigo-600 font-semibold text-[10px]">{msg.senderName}</span>
        ) : (
          <>
            {msg.senderName}
            {msg.role === "citizen" && (
              <span className="ml-1 text-blue-500 text-[10px]">Citizen</span>
            )}
          </>
        )}
      </span>
      <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isMe
          ? "bg-indigo-700 text-white rounded-br-sm"
          : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
      }`}>
        {msg.text}
      </div>
      <span className="text-[10px] text-gray-300 px-2">{timeAgo(msg.timestamp)}</span>
    </div>
  );
}

// ── Admin Report Card ─────────────────────────────────────────────────────────

function AdminReportCard({ report, deptName }) {
  const [updating, setUpdating] = useState(false);
  const status      = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const isPending   = report.status === "pending";
  const isInProcess = report.status === "in_process" || report.status === "in-progress";

  async function handleStartWorking() {
    if (updating) return;
    setUpdating(true);
    await updateReportStatus(report.id, "in_process");
    await sendMessage({
      senderId:   "ai",
      senderName: "CivicLens AI 🤖",
      role:       "ai",
      text:       `🔄 ${deptName} has started working on ${report.reportId} (${report.issueType ?? "issue"}).`,
      type:       "ai_update",
      reportId:   report.id,
    });
    setUpdating(false);
  }

  async function handleRequestResolution() {
    if (updating) return;
    setUpdating(true);
    await updateReportStatus(report.id, "pending_to_resolve");

    if (report.createdBy) {
      await sendNotification({
        userId:   report.createdBy,
        reportId: report.id,
        type:     "approval_request",
        message:  `✅ ${report.reportId} (${report.issueType ?? "issue"}) has been marked as resolved by ${deptName}. Please review and approve or deny.`,
      });
    }

    await sendMessage({
      senderId:   "ai",
      senderName: "CivicLens AI 🤖",
      role:       "ai",
      text:       `✔ ${deptName} requested resolution for ${report.reportId} (${report.issueType ?? "issue"}). Awaiting approval from ${report.createdByName ?? "the reporter"}.`,
      type:       "ai_update",
      reportId:   report.id,
    });
    setUpdating(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-indigo-600 text-white rounded px-1.5 py-0.5 tracking-wide">
              {report.reportId || "RPT"}
            </span>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
              {status.label}
            </span>
            <span className="text-[10px] font-semibold text-orange-600">
              Sev {report.severityScore ?? "?"}/10
            </span>
            {report.urgency && (
              <span className="text-[10px] font-semibold text-purple-600 capitalize">
                {report.urgency}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {ISSUE_LABELS[report.issueType] ?? "Other"}
          </p>
          <p className="text-xs text-gray-500 line-clamp-2">
            {report.caseDescription || report.summary}
          </p>
          <p className="text-[10px] text-gray-400 truncate">📍 {locStr(report.location)}</p>
          <p className="text-[10px] text-gray-400">
            👤 {report.createdByName || "Unknown"} · 👍 {report.reactionCount ?? 0} · {timeAgo(report.timestamp)}
          </p>
        </div>
        {report.photoUrl && (
          <img src={report.photoUrl} alt="report"
            className="w-16 h-16 object-cover rounded-lg shrink-0" />
        )}
      </div>

      {report.denialExplanation && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-700 font-medium">
            ⚠️ Denied: {report.denialExplanation}
          </p>
        </div>
      )}

      {/* Status action buttons */}
      <div className="flex gap-2 pt-1 border-t border-gray-100 flex-wrap">
        {isPending && (
          <button onClick={handleStartWorking} disabled={updating}
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg py-2 transition-colors">
            {updating ? "…" : "▶ Start Working"}
          </button>
        )}
        {isInProcess && (
          <button onClick={handleRequestResolution} disabled={updating}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg py-2 transition-colors">
            {updating ? "…" : "✔ Request Resolution"}
          </button>
        )}
        {report.status === "pending_to_resolve" && (
          <span className="text-xs text-blue-600 font-medium py-1.5">
            ⏳ Awaiting citizen approval…
          </span>
        )}
        {report.status === "resolved" && (
          <span className="text-xs text-green-600 font-medium py-1.5">✅ Resolved</span>
        )}
      </div>
    </div>
  );
}

// ── Admin Reports Panel ───────────────────────────────────────────────────────

function AdminReportsPanel({ reports, department }) {
  const [filter, setFilter] = useState("all");

  const deptName = DEPARTMENT_CONFIG[department]?.displayName ?? "All Departments";
  // null department = general admin → sees everything
  const deptReports = department
    ? reports.filter((r) => r.assignedDepartment === department)
    : reports;

  const filtered = filter === "all"
    ? deptReports
    : deptReports.filter((r) => {
        if (filter === "in_process") return r.status === "in_process" || r.status === "in-progress";
        return r.status === filter;
      });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <h2 className="font-bold text-gray-900 text-sm">{deptName}</h2>
        <p className="text-xs text-gray-400 mb-2">
          {deptReports.length} report{deptReports.length !== 1 ? "s" : ""}
          {department ? " assigned to your department" : " across all departments"}
        </p>
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors ${
                filter === f.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 bg-gray-50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 text-center gap-2">
            <span className="text-4xl">📭</span>
            <p className="text-sm">No reports in this category.</p>
          </div>
        ) : (
          filtered.map((r) => (
            <AdminReportCard key={r.id} report={r} deptName={deptName} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Admin Page ────────────────────────────────────────────────────────────────

function AdminPage({ user, department }) {
  const navigate  = useNavigate();
  const deptCfg   = DEPARTMENT_CONFIG[department];
  const deptName  = deptCfg?.displayName ?? user?.displayName ?? "Admin";

  const [messages,  setMessages]  = useState([]);
  const [reports,   setReports]   = useState([]);
  const [text,      setText]      = useState("");
  const [mobileTab, setMobileTab] = useState("chat");

  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub1 = listenToMessages(setMessages);
    const unsub2 = listenToReports(setReports);
    return () => { unsub1?.(); unsub2?.(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      senderName: deptName,
      role:       "admin",
      text:       t,
      type:       "chat",
    });
  }

  // Department badge color
  const deptColors = {
    fire:    "bg-red-100 text-red-700",
    water:   "bg-blue-100 text-blue-700",
    electric:"bg-yellow-100 text-yellow-700",
  };
  const badgeCls = deptColors[department] ?? "bg-indigo-100 text-indigo-700";

  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* Header */}
      <div className="bg-indigo-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold tracking-tight">🏛️ CivicLens</span>
          <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${badgeCls}`}>
            {deptName}
          </span>
        </div>
        <button onClick={handleLogout}
          className="text-xs text-indigo-300 hover:text-white underline underline-offset-2">
          Logout
        </button>
      </div>

      {/* Mobile tab switcher */}
      <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
        {[["chat", "💬 Chat"], ["reports", "📋 Reports"]].map(([key, label]) => (
          <button key={key} onClick={() => setMobileTab(key)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mobileTab === key
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-500"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT — Chat (60%) */}
        <div className={`flex flex-col w-full md:w-3/5 border-r border-gray-200 ${
          mobileTab !== "chat" ? "hidden md:flex" : "flex"
        }`}>
          <div className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
            <h2 className="font-bold text-gray-900 text-sm">CivicLens Community Chat 🏙️</h2>
            <p className="text-xs text-gray-400">All citizens and departments · Signed in as {deptName}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-10">No messages yet.</div>
            )}
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} currentUser={user} reports={reports} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input — no Report button for admin */}
          <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3 flex gap-2 shrink-0">
            <input value={text} onChange={(e) => setText(e.target.value)}
              placeholder={`Message as ${deptName}…`}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-0" />
            <button type="submit" disabled={!text.trim()}
              className="shrink-0 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
              Send
            </button>
          </form>
        </div>

        {/* RIGHT — Report Management (40%) */}
        <div className={`w-full md:w-2/5 ${
          mobileTab !== "reports" ? "hidden md:flex md:flex-col" : "flex flex-col"
        }`}>
          <AdminReportsPanel reports={reports} department={department} />
        </div>
      </div>
    </div>
  );
}

export default function AdminPageWithBoundary({ user, department }) {
  return (
    <ErrorBoundary>
      <AdminPage user={user} department={department} />
    </ErrorBoundary>
  );
}
