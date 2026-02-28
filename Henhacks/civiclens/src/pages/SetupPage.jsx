import { useState } from "react";
import { Link } from "react-router-dom";
import { createDepartmentAdmins, DEPARTMENT_CONFIG } from "../firebase";

export default function SetupPage() {
  const [results,  setResults]  = useState([]);
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleCreate() {
    setRunning(true);
    setResults([]);
    await createDepartmentAdmins((result) => {
      setResults((prev) => [...prev, result]);
    });
    setRunning(false);
    setDone(true);
  }

  function statusIcon(status) {
    if (status === "created") return "✅";
    if (status === "exists")  return "⚠️";
    return "❌";
  }

  function statusText(status) {
    if (status === "created") return "created successfully";
    if (status === "exists")  return "already exists (skipped)";
    return "error";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 max-w-lg w-full flex flex-col gap-5">

        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Department Admin Setup
          </h1>
          <p className="text-sm text-gray-500">
            Creates 3 Firebase Auth accounts (Fire, Water, Electric) and their
            Firestore profiles. Run once — then remove <code className="bg-gray-100 px-1 rounded">/setup</code> from App.jsx.
          </p>
        </div>

        {/* Department preview */}
        <div className="flex flex-col gap-2">
          {Object.entries(DEPARTMENT_CONFIG).map(([dept, cfg]) => (
            <div key={dept} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-lg">{cfg.displayName.split(" ").pop()}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gray-800">{cfg.displayName}</span>
                <span className="text-xs text-gray-400">{cfg.email}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Progress */}
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <div key={r.email} className="flex items-center gap-2 text-sm">
                <span>{statusIcon(r.status)}</span>
                <span className="font-medium text-gray-700">{r.email}</span>
                <span className="text-gray-400">{statusText(r.status)}</span>
              </div>
            ))}
          </div>
        )}

        {done && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
            🎉 All departments ready! You have been signed out. Go to the login page and sign in with your department credentials.
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={running || done}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          {running ? "Creating accounts…" : done ? "Setup complete" : "Create Department Admins"}
        </button>

        <Link to="/" className="text-center text-sm text-gray-500 hover:text-gray-700">
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
