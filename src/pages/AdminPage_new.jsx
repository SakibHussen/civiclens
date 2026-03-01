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
  pending:            { label: "Pending",            cls: "bg-gray-800 text-gray-400" },
  in_process:         { label: "In Process",         cls: "bg-yellow-900/50 text-yellow-400" },
  "in-progress":      { label: "In Process",         cls: "bg-yellow-900/50 text-yellow-400" },
  pending_to_resolve: { label: "Pending to Resolve", cls: "bg-blue-900/50 text-blue-400" },
  resolved:           { label: "Resolved",           cls: "bg-green-900/50 text-green-400" },
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
        <div className="min-h-screen bg-[#030712] flex items-center justify-center p-8">
          <div className="bg-gray-900 rounded-2xl border border-red-500/30 shadow-lg max-w-xl w-full p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">💥</span>
              <h2 className="text-lg font-bold text-red-400">AdminPage crashed</h2>
            </div>
            <pre className="bg-red-900/20 text-red-300 text-xs rounded-lg p-4 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}{"\n\n"}{this.state.error.stack}
            </pre>
            <button onClick={() => this.setState({ error: null })}
              className="self-start text-sm font-medium text-blue-400 hover:underline">
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Department Colors ─────────────────────────────────────────────────────────

const DEPT_COLORS = {
  fire:    { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30", accent: "border-red-500" },
  water:   { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30", accent: "border-blue-500" },
  electric:{ bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30", accent: "border-yellow-500" },
  null:    { bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/30", accent: "border-slate-500" },
};

// ── Report Card inside Chat ───────────────────────────────────────────────────

function ChatReportCard({ report }) {
  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const deptColor = DEPT_COLORS[report.assignedDepartment] ?? DEPT_COLORS.null;
  
  return (
    <div className={`border-l-4 ${deptColor.accent} bg-gray-800 rounded-2xl overflow-hidden max-w-xs shadow-lg`}>
      {report.photoUrl && (
        <img src={report.photoUrl} alt="report" className="w-full h-28 object-cover rounded-t-xl" />
      )}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold bg-gray-700 text-white rounded px-1.5 py-0.5 tracking-wide">
            {report.reportId || "RPT"}
          </span>
          <span className={`text-xs ${deptColor.text}`}>
            {ISSUE_LABELS[report.issueType] ?? "📋 Other"}
          </span>
          <span className="text-[10px] font-semibold text-orange-400">Sev {report.severityScore ?? "?"}/10</span>
        </div>
        <p className="text-sm font-medium text-gray-200 leading-snug line-clamp-2">{report.summary}</p>
        <div className="flex items-center justify-between pt-1">
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
            {status.label}
          </span>
          <span className="text-xs text-gray-500">👍 {report.reactionCount ?? 0}</span>
        </div>
        <p className="text-[10px] text-gray-500 truncate">📍 {locStr(report.location)}</p>
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
      <div className="flex justify-center my-2">
        <div className="max-w-sm w-full bg-gradient-to-r from-violet-900/50 to-indigo-900/50 border border-violet-500/20 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🤖</span>
            <span className="text-xs font-semibold text-violet-300">CivicLens AI</span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (isReport) {
    const report = reports.find((r) => r.id === msg.reportId);
    return (
      <div className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
        <span className="text-xs text-gray-500 px-1">{msg.senderName}</span>
        {report ? (
          <ChatReportCard report={report} />
        ) : (
          <div className="border-l-4 border-indigo-500 bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-400">
            Loading report…
          </div>
        )}
        <span className="text-[10px] text-gray-600 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-500 px-2">
        {isMe ? (
          <span className="text-blue-400 font-semibold text-[10px]">{msg.senderName}</span>
        ) : (
          <>
            {msg.senderName}
            {msg.role === "citizen" && (
              <span className="ml-1 text-blue-400 text-[10px]">Citizen</span>
            )}
          </>
        )}
      </span>
      <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-3xl text-sm leading-relaxed ${
        isMe
          ? "bg-gradient-to-br from-slate-600 to-slate-700 text-white rounded-br-lg shadow-lg"
          : "bg-gray-800 text-gray-100 rounded-bl-lg"
      }`}>
        {msg.text}
      </div>
      <span className="text-[10px] text-gray-600 px-2">{timeAgo(msg.timestamp)}</span>
    </div>
  );
}

// ── Admin Report Card ─────────────────────────────────────────────────────────

function AdminReportCard({ report, deptName, index }) {
  const [updating, setUpdating] = useState(false);
  const status      = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const isPending   = report.status === "pending";
  const isInProcess = report.status === "in_process" || report.status === "in-progress";
  const deptColor = DEPT_COLORS[report.assignedDepartment] ?? DEPT_COLORS.null;

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
    <div 
      className="bg-gray-900 rounded-2xl border border-white/5 border-l-4 p-4 flex flex-col gap-2 hover:-translate-y-0.5 hover:brightness-105 transition-all duration-200"
      style={{ 
        borderLeftColor: deptColor.accent.replace('border-', ''),
        animation: `slide-in-right 0.4s ease-out ${index * 0.05}s both`
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-gray-800 text-gray-300 rounded px-1.5 py-0.5 tracking-wide font-mono">
              {report.reportId || "RPT"}
            </span>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>
              {status.label}
            </span>
            <span className="text-[10px] font-semibold text-orange-400">
              Sev {report.severityScore ?? "?"}/10
            </span>
            {report.urgency && (
              <span className="text-[10px] font-semibold text-purple-400 capitalize">
                {report.urgency}
              </span>
            )}
          </div>
          <p className={`text-sm font-semibold ${deptColor.text}`}>
            {ISSUE_LABELS[report.issueType] ?? "Other"}
          </p>
          <p className="text-xs text-gray-400 line-clamp-2">
            {report.caseDescription || report.summary}
          </p>
          <p className="text-[10px] text-gray-600 truncate">📍 {locStr(report.location)}</p>
          <p className="text-[10px] text-gray-600">
            👤 {report.createdByName || "Unknown"} · 👍 {report.reactionCount ?? 0} · {timeAgo(report.timestamp)}
          </p>
        </div>
        {report.photoUrl && (
          <img src={report.photoUrl} alt="report"
            className="w-16 h-16 object-cover rounded-xl shrink-0" />
        )}
      </div>

      {report.denialExplanation && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-xs text-red-400 font-medium">
            ⚠️ Denied: {report.denialExplanation}
          </p>
        </div>
      )}

      {/* Status action buttons */}
      <div className="flex gap-2 pt-1 border-t border-white/5 flex-wrap">
        {isPending && (
          <button 
            onClick={handleStartWorking} 
            disabled={updating}
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-black text-xs font-semibold rounded-xl px-4 py-2 transition-all active:scale-95"
          >
            {updating ? <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin mr-1"></span> : "▶ Start Working"}
          </button>
        )}
        {isInProcess && (
          <button 
            onClick={handleRequestResolution} 
            disabled={updating}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-all active:scale-95"
          >
            {updating ? <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1"></span> : "✔ Request Resolution"}
          </button>
        )}
        {report.status === "pending_to_resolve" && (
          <span className="text-xs text-blue-400 font-medium py-1.5">
            ⏳ Awaiting citizen approval…
          </span>
        )}
        {report.status === "resolved" && (
          <span className="text-xs text-green-400 font-medium py-1.5">✅ Resolved</span>
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
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h2 className="font-bold text-white text-xl">Report Queue</h2>
        <p className="text-xs text-gray-400 mb-3">
          {deptReports.length} report{deptReports.length !== 1 ? "s" : ""}
          {department ? " assigned to your department" : " across all departments"}
        </p>
        
        {/* Filter pills horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {FILTER_TABS.map((f) => (
            <button 
              key={f.key} 
              onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-all ${
                filter === f.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-950">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-500 text-center gap-2">
            <span className="text-4xl">📭</span>
            <p className="text-sm">No reports in this category.</p>
          </div>
        ) : (
          filtered.map((r, idx) => (
            <AdminReportCard key={r.id} report={r} deptName={deptName} index={idx} />
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
    fire:    { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30" },
    water:   { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30" },
    electric:{ bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30" },
  };
  const deptColor = deptColors[department] ?? { bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/30" };

  return (
    <div className="h-screen flex flex-col bg-[#030712]">

      {/* Header - fixed top */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-xl h-14 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${deptColor.bg} ${deptColor.text} border ${deptColor.border}`}>
            {deptName}
          </span>
          <span className="text-white font-semibold">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
          {/* Logout button */}
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-14 shrink-0"></div>

      {/* Mobile tab switcher - bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-xl border-t border-white/5 h-16 flex items-end pb-2 px-4">
        {/* Indicator bar */}
        <div 
          className="absolute h-0.5 bg-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{
            width: 'calc(50% - 1rem)',
            top: '0',
            left: mobileTab === 'chat' ? '0.5rem' : 'calc(50% + 0.5rem)',
            transform: mobileTab === 'chat' ? 'translateX(0)' : 'translateX(0)',
          }}
        ></div>
        
        {[
          ["chat", "💬 Chat"], 
          ["reports", "📋map(([key, label]) => Reports"]
        ]. (
          <button 
            key={key} 
            onClick={() => setMobileTab(key)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors relative z-10 ${
              mobileTab === key
                ? "text-white"
                : "text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden pb-16 md:pb-0">

        {/* LEFT — Chat (55% on desktop) */}
        <div className={`flex flex-col w-full md:w-[55%] border-r border-white/5 ${
          mobileTab !== "chat" ? "hidden md:flex" : "flex"
        }`}>
          <div className="px-4 py-3 bg-gray-900/50 border-b border-white/5 shrink-0">
            <h2 className="font-bold text-white text-sm">CivicLens Community Chat 🏙️</h2>
            <p className="text-xs text-gray-500">All citizens and departments · Signed in as {deptName}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-950">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-10">No messages yet.</div>
            )}
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} currentUser={user} reports={reports} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <form 
            onSubmit={handleSend} 
            className="bg-gray-900 border-t border-white/5 px-4 py-3 flex gap-2 shrink-0"
          >
            <div className="flex-1 bg-gray-800 rounded-full flex items-center px-4">
              <input 
                value={text} 
                onChange={(e) => setText(e.target.value)}
                placeholder={`Message as ${deptName}…`}
                className="flex-1 bg-transparent text-white placeholder-gray-500 py-2 text-sm focus:outline-none"
              />
            </div>
            <button 
              type="submit" 
              disabled={!text.trim()}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full w-10 h-10 flex items-center justify-center transition-all active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>

        {/* RIGHT — Report Management (45% on desktop) */}
        <div className={`w-full md:w-[45%] ${
          mobileTab !== "reports" ? "hidden md:flex md:flex-col" : "flex flex-col"
        }`}>
          <AdminReportsPanel reports={reports} department={department} />
        </div>
      </div>

      {/* Spacer for fixed bottom nav on mobile */}
      <div className="md:hidden h-16 shrink-0"></div>
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
