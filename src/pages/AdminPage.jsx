import { useState, useEffect, useRef, Component } from "react";
import { useNavigate } from "react-router-dom";
import {
  logoutUser, sendMessage, listenToMessages,
  listenToReports, updateReportStatus, sendNotification,
  listenToNotifications, markNotificationRead,
  DEPARTMENT_CONFIG,
} from "../firebase";

// ── Constants ─────────────────────────────────────────────────────────────────

const ISSUE_LABELS = {
  biohazard: "🧪 Biohazard", fire_hazard: "🔥 Fire Hazard", chemical_spill: "☣️ Chemical Spill",
  gas_leak: "💨 Gas Leak", smoke_odor: "🌫️ Smoke/Odor", abandoned_fire: "🔥 Abandoned Fire",
  hazardous_material: "⚠️ Hazardous Material", structural_fire_damage: "🏚️ Fire Damage",
  fallen_tree_blocking_road: "🌳 Fallen Tree", flooding: "🌊 Flooding", water_leakage: "💧 Water Leakage",
  burst_pipe: "🚰 Burst Pipe", drainage_blockage: "🚧 Drainage Blockage", sewer_overflow: "🦠 Sewer Overflow",
  manhole_overflow: "⚠️ Manhole Overflow", water_main_break: "💧 Water Main Break",
  contaminated_water: "🧪 Contaminated Water", standing_water: "💧 Standing Water",
  storm_drain_blockage: "🌧️ Storm Drain", sinkholes: "🕳️ Sinkhole", water_pressure_issue: "💧 Water Pressure",
  electrical_hazard: "⚡ Electrical Hazard", broken_streetlight: "💡 Broken Streetlight",
  downed_power_line: "⚡ Downed Power Line", pothole: "🕳️ Pothole", road_damage: "🛣️ Road Damage",
  broken_infrastructure: "🏗️ Infrastructure", traffic_light_malfunction: "🚦 Traffic Light",
  damaged_guardrail: "🚧 Guardrail", road_sign_damage: "🛑 Road Sign", sidewalk_damage: "🚶 Sidewalk",
  bridge_damage: "🌉 Bridge", exposed_wiring: "⚡ Exposed Wiring", transformer_issue: "⚡ Transformer",
  road_cave_in: "🕳️ Road Cave-In", construction_hazard: "🏗️ Construction", debris_on_road: "🚧 Debris on Road",
  vandalism: "🎨 Vandalism", other: "📋 Other",
};

const STATUS_CONFIG = {
  pending: { label: "Pending", cls: "bg-gray-800 text-gray-400" },
  in_process: { label: "In Process", cls: "bg-yellow-900/50 text-yellow-400" },
  "in-progress": { label: "In Process", cls: "bg-yellow-900/50 text-yellow-400" },
  pending_to_resolve: { label: "Pending to Resolve", cls: "bg-blue-900/50 text-blue-400" },
  resolved: { label: "Resolved", cls: "bg-green-900/50 text-green-400" },
};

const FILTER_TABS = [
  { key: "all", label: "All" }, { key: "pending", label: "Pending" },
  { key: "in_process", label: "In Process" }, { key: "pending_to_resolve", label: "Pending to Resolve" },
  { key: "resolved", label: "Resolved" },
];

function timeAgo(ts) {
  if (!ts) return "just now";
  try {
    const ms = ts.toMillis?.() ?? new Date(ts).getTime();
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch { return "just now"; }
}

function locStr(loc) {
  if (!loc) return "Unknown location";
  if (typeof loc === "string") return loc;
  return loc.address || `${loc.lat?.toFixed(4)}, ${loc.lng?.toFixed(4)}`;
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[AdminPage ErrorBoundary]", error, info.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3"><span className="text-3xl">💥</span><h2 className="text-lg font-bold text-red-400">AdminPage crashed</h2></div>
            <pre className="bg-red-900/20 text-red-300 text-xs rounded-lg p-4 overflow-auto whitespace-pre-wrap">{this.state.error.message}{"\n\n"}{this.state.error.stack}</pre>
            <button onClick={() => this.setState({ error: null })} className="self-start text-sm font-medium text-cyan-400 hover:underline">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEPT_COLORS = {
  fire: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30", accent: "border-red-500" },
  water: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30", accent: "border-blue-500" },
  electric: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30", accent: "border-yellow-500" },
  null: { bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/30", accent: "border-slate-500" },
};

function ChatReportCard({ report }) {
  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const deptColor = DEPT_COLORS[report.assignedDepartment] ?? DEPT_COLORS.null;
  return (
    <div className={`border-l-4 ${deptColor.accent} bg-white/10 backdrop-blur-md rounded-2xl overflow-hidden max-w-xs shadow-lg`}>
      {report.photoUrl && <img src={report.photoUrl} alt="report" className="w-full h-28 object-cover rounded-t-xl" />}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded px-1.5 py-0.5 tracking-wide">{report.reportId || "RPT"}</span>
          <span className={`text-xs ${deptColor.text}`}>{ISSUE_LABELS[report.issueType] ?? "📋 Other"}</span>
          <span className="text-[10px] font-semibold text-orange-400">Sev {report.severityScore ?? "?"}/10</span>
        </div>
        <p className="text-sm font-medium text-white/80 leading-snug line-clamp-2">{report.summary}</p>
        <div className="flex items-center justify-between pt-1">
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>{status.label}</span>
          <span className="text-xs text-white/50">👍 {report.reactionCount ?? 0}</span>
        </div>
        <p className="text-[10px] text-white/40 truncate">📍 {locStr(report.location)}</p>
      </div>
    </div>
  );
}

function MessageItem({ msg, currentUser, reports }) {
  const isMe = msg.senderId === currentUser.uid;
  const isAI = msg.role === "ai";
  const isReport = msg.type === "report";

  if (isAI) {
    return (
      <div className="flex justify-center my-2 msg-enter">
        <div className="w-full max-w-[calc(100%-2rem)] bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-full bg-teal-500/30 flex items-center justify-center text-sm">🤖</span>
            <span className="text-xs font-bold text-white bg-teal-500 rounded-full px-2.5 py-0.5 tracking-wide shadow-sm shadow-teal-500/40">CivicLens AI</span>
          </div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (isReport) {
    const report = reports.find((r) => r.id === msg.reportId);
    return (
      <div className={`flex flex-col gap-1 msg-enter ${isMe ? "items-end" : "items-start"}`}>
        <span className="text-xs text-white/50 px-1">{msg.senderName}</span>
        {report ? <ChatReportCard report={report} /> : <div className="border-l-4 border-indigo-500 bg-white/10 backdrop-blur-md rounded-2xl px-4 py-3 text-sm text-white/50">Loading report…</div>}
        <span className="text-[10px] text-white/30 px-1">{timeAgo(msg.timestamp)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 msg-enter ${isMe ? "items-end" : "items-start"}`}>
      <span className="text-xs text-white/50 px-2">{isMe ? <span className="text-teal-400 font-semibold text-[10px]">{msg.senderName}</span> : <>{msg.senderName}{msg.role === "citizen" && <span className="ml-1 text-blue-400 text-[10px]">Citizen</span>}</>}</span>
      <div className={`px-4 py-2.5 max-w-[85%] mb-2 ${isMe ? "bg-civic-600 text-white self-end rounded-2xl rounded-tr-none shadow-lg animate-fade-up-msg" : "bg-white/10 backdrop-blur-md text-white/80 self-start rounded-2xl rounded-tl-none border border-white/20"}`}>
        {msg.text}
      </div>
      <span className="text-[10px] text-white/30 px-2">{timeAgo(msg.timestamp)}</span>
    </div>
  );
}

function AdminReportCard({ report, deptName, index }) {
  const [updating, setUpdating] = useState(false);
  const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.pending;
  const isPending = report.status === "pending";
  const isInProcess = report.status === "in_process" || report.status === "in-progress";
  const deptColor = DEPT_COLORS[report.assignedDepartment] ?? DEPT_COLORS.null;

  const handleStartWorking = async () => {
    if (updating) return;
    setUpdating(true);
    await updateReportStatus(report.id, "in_process");
    if (report.createdBy) await sendNotification({ userId: report.createdBy, reportId: report.id, type: "status_update", message: `🔄 ${deptName} has started working on your report ${report.reportId} (${report.issueType ?? "issue"}).` });
    await sendMessage({ senderId: "ai", senderName: "CivicLens AI 🤖", role: "ai", text: `🔄 ${deptName} has started working on ${report.reportId} (${report.issueType ?? "issue"}).`, type: "ai_update", reportId: report.id });
    setUpdating(false);
  };

  const handleRequestResolution = async () => {
    if (updating) return;
    setUpdating(true);
    await updateReportStatus(report.id, "pending_to_resolve");
    if (report.createdBy) await sendNotification({ userId: report.createdBy, reportId: report.id, type: "approval_request", message: `✅ ${report.reportId} (${report.issueType ?? "issue"}) has been marked as resolved by ${deptName}. Please review and approve or deny.` });
    await sendMessage({ senderId: "ai", senderName: "CivicLens AI 🤖", role: "ai", text: `✔ ${deptName} requested resolution for ${report.reportId} (${report.issueType ?? "issue"}). Awaiting approval from ${report.createdByName ?? "the reporter"}.`, type: "ai_update", reportId: report.id });
    setUpdating(false);
  };

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 border-l-4 p-4 flex flex-col gap-2 hover:-translate-y-0.5 hover:bg-white/10 hover:border-white/20 transition-all duration-200 shadow-lg" style={{ borderLeftColor: deptColor.accent.replace('border-', ''), animation: `slide-in-right 0.4s ease-out ${index * 0.05}s both` }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded px-1.5 py-0.5 tracking-wide font-mono">{report.reportId || "RPT"}</span>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${status.cls}`}>{status.label}</span>
            <span className="text-[10px] font-semibold text-orange-400">Sev {report.severityScore ?? "?"}/10</span>
            {report.urgency && <span className="text-[10px] font-semibold text-purple-400 capitalize">{report.urgency}</span>}
          </div>
          <p className={`text-sm font-semibold ${deptColor.text}`}>{ISSUE_LABELS[report.issueType] ?? "Other"}</p>
          <p className="text-xs text-white/50 line-clamp-2">{report.caseDescription || report.summary}</p>
          <p className="text-[10px] text-white/40 truncate">📍 {locStr(report.location)}</p>
          <p className="text-[10px] text-white/40">👤 {report.createdByName || "Unknown"} · 👍 {report.reactionCount ?? 0} · {timeAgo(report.timestamp)}</p>
        </div>
        {report.photoUrl && <img src={report.photoUrl} alt="report" className="w-16 h-16 object-cover rounded-xl shrink-0 border border-white/20" />}
      </div>
      {report.denialExplanation && report.status !== "resolved" && <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2"><p className="text-xs text-red-400 font-medium">⚠️ Denied: {report.denialExplanation}</p></div>}
      <div className="flex gap-2 pt-1 border-t border-white/10 flex-wrap">
        {isPending && <button onClick={handleStartWorking} disabled={updating} className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-60 text-black text-xs font-semibold rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg shadow-yellow-500/20">{updating ? "…" : "▶ Start Working"}</button>}
        {isInProcess && <button onClick={handleRequestResolution} disabled={updating} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-60 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg shadow-blue-500/20">{updating ? "…" : "✔ Request Resolution"}</button>}
        {report.status === "pending_to_resolve" && <span className="text-xs text-blue-400 font-medium py-1.5">⏳ Awaiting citizen approval…</span>}
        {report.status === "resolved" && <span className="text-xs text-green-400 font-medium py-1.5">✅ Resolved</span>}
      </div>
    </div>
  );
}

function AdminReportsPanel({ reports, department }) {
  const [filter, setFilter] = useState("all");
  const deptName = DEPARTMENT_CONFIG[department]?.displayName ?? "All Departments";
  const deptReports = department ? reports.filter((r) => r.assignedDepartment === department) : reports;
  const filtered = filter === "all" ? deptReports : deptReports.filter((r) => { if (filter === "in_process") return r.status === "in_process" || r.status === "in-progress"; return r.status === filter; });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 shrink-0 bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-cyan-900/40 border-b border-white/5">
        <h2 className="font-bold text-white text-xl">Report Queue</h2>
        <p className="text-xs text-white/50 mb-3">{deptReports.length} report{deptReports.length !== 1 ? "s" : ""}{department ? " assigned to your department" : " across all departments"}</p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {FILTER_TABS.map((f) => (<button key={f.key} onClick={() => setFilter(f.key)} className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-all ${filter === f.key ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:border-white/20"}`}>{f.label}</button>))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#164e63]">
        {filtered.length === 0 ? <div className="flex flex-col items-center py-16 text-white/50 text-center gap-2"><span className="text-4xl">📭</span><p className="text-sm">No reports in this category.</p></div> : filtered.map((r, idx) => <AdminReportCard key={r.id} report={r} deptName={deptName} index={idx} />)}
      </div>
    </div>
  );
}

const NOTIF_ICONS = {
  status_update:    "🔄",
  approval_request: "✅",
  report_denied:    "⚠️",
};

function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const unsub = listenToNotifications(userId, setNotifications);
    return () => unsub?.();
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;

  async function handleClick(n) {
    if (!n.read) await markNotificationRead(n.id);
  }

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
        <div className="absolute right-0 top-12 w-80 bg-[#1e1b4b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[60]">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-semibold text-white text-sm">Notifications</span>
            {unread > 0 && <span className="text-xs text-blue-400 font-medium">{unread} unread</span>}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-white/40 text-sm">No notifications yet</p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-colors ${!n.read ? "bg-blue-500/10" : ""}`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{NOTIF_ICONS[n.type] ?? "🔔"}</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <p className="text-xs text-white/90 leading-snug">{n.message}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40">{timeAgo(n.timestamp)}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPage({ user, department }) {
  const navigate = useNavigate();
  const deptCfg = DEPARTMENT_CONFIG[department];
  const deptName = deptCfg?.displayName ?? user?.displayName ?? "Admin";
  const [messages, setMessages] = useState([]);
  const [reports, setReports] = useState([]);
  const [text, setText] = useState("");
  const [mobileTab, setMobileTab] = useState("chat");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => { const unsub1 = listenToMessages(setMessages); const unsub2 = listenToReports(setReports); return () => { unsub1?.(); unsub2?.(); }; }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setShowScrollButton(false); }, [messages]);
  useEffect(() => { const handleScroll = () => { if (!chatContainerRef.current) return; const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current; setShowScrollButton(scrollHeight - scrollTop - clientHeight < 300); }; const container = chatContainerRef.current; if (container) { container.addEventListener('scroll', handleScroll); return () => container.removeEventListener('scroll', handleScroll); } }, [mobileTab]);
  useEffect(() => { const lastMsg = messages[messages.length - 1]; if (lastMsg && lastMsg.role === 'ai') setIsTyping(false); }, [messages]);

  const handleLogout = () => { logoutUser(); navigate("/"); };
  const handleSend = async (e) => { e.preventDefault(); if (!text.trim()) return; const t = text.trim(); setText(""); setIsTyping(true); await sendMessage({ senderId: user.uid, senderName: deptName, role: "admin", text: t, type: "chat" }); };
  const scrollToBottom = () => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setShowScrollButton(false); };

  const deptColors = { fire: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/30" }, water: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30" }, electric: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/30" } };
  const deptColor = deptColors[department] ?? { bg: "bg-slate-500/20", text: "text-slate-300", border: "border-slate-500/30" };

  return (
    <div className="h-screen flex flex-col min-w-0 relative">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-blue-500/30 blur-[100px] -top-40 -left-40 animate-blob-blue" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-500/30 blur-[100px] top-1/2 -right-40 animate-blob-purple" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-cyan-400/30 blur-[100px] -bottom-40 left-1/4 animate-blob-cyan" />
      </div>
      <div className="fixed inset-0 -z-10 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }} />

      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900/90 via-purple-900/80 to-cyan-900/90 backdrop-blur-xl h-14 px-4 flex items-center justify-between shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${deptColor.bg} ${deptColor.text} border ${deptColor.border}`}>{deptName}</span>
          <span className="text-white font-semibold">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
            <span className="text-xs text-green-400 font-medium">Live</span>
          </div>
          <NotificationBell userId={user.uid} />
          <button onClick={handleLogout} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>
      </div>
      <div className="h-14 shrink-0"></div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-blue-900/90 via-purple-900/80 to-cyan-900/90 backdrop-blur-xl border-t border-white/10 h-16 flex items-end pb-2 px-4">
        <div className="absolute h-0.5 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full transition-all" style={{ width: 'calc(50% - 1rem)', top: '0', left: mobileTab === 'chat' ? '0.5rem' : 'calc(50% + 0.5rem)' }}></div>
        {[["chat", "💬 Chat"], ["reports", "📋 Reports"]].map(([key, label]) => (<button key={key} onClick={() => setMobileTab(key)} className={`flex-1 py-2 text-sm font-semibold transition-colors relative z-10 ${mobileTab === key ? "text-white" : "text-white/50"}`}>{label}</button>))}
      </div>

      <div className="flex-1 flex overflow-hidden pb-16 md:pb-0">
        <div className={`flex flex-col w-full md:w-[55%] border-r border-white/5 ${mobileTab !== "chat" ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 bg-white/5 border-b border-white/5 shrink-0">
            <h2 className="font-bold text-white text-sm">CivicLens Community Chat 🏙️</h2>
            <p className="text-xs text-white/50">All citizens and departments · Signed in as {deptName}</p>
          </div>
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain relative">
            {messages.length === 0 && <div className="text-center text-white/50 text-sm py-10">No messages yet.</div>}
            {messages.map((msg) => <MessageItem key={msg.id} msg={msg} currentUser={user} reports={reports} />)}
            {isTyping && <div className="flex justify-start msg-enter"><div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1"><span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>}
            <div ref={bottomRef} />
            {showScrollButton && <button onClick={scrollToBottom} className="fixed bottom-24 right-8 md:right-12 z-50 w-12 h-12 bg-civic-600 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform animate-bounce-in"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg></button>}
          </div>
          <form onSubmit={handleSend} className="sticky bottom-6 mx-auto w-[90%] max-w-2xl z-50 mb-4">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full py-2 px-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-3 transition-all focus-within:border-civic-400">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message as ${deptName}…`} className="flex-1 bg-transparent border-none focus:ring-0 text-sm min-w-0 text-white placeholder-white/50" />
              <button type="submit" disabled={!text.trim()} className="shrink-0 w-10 h-10 rounded-full bg-civic-500 shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:scale-110 hover:bg-civic-600 disabled:opacity-40 disabled:scale-100 text-white flex items-center justify-center text-lg transition-all">➤</button>
            </div>
          </form>
        </div>
        <div className={`w-full md:w-[45%] ${mobileTab !== "reports" ? "hidden md:flex md:flex-col" : "flex flex-col"}`}>
          <AdminReportsPanel reports={reports} department={department} />
        </div>
      </div>
      <div className="md:hidden h-16 shrink-0"></div>
    </div>
  );
}

export default function AdminPageWithBoundary({ user, department }) {
  return (<ErrorBoundary><AdminPage user={user} department={department} /></ErrorBoundary>);
}

