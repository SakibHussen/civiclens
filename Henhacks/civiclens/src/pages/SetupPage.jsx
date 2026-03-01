import { useState } from "react";
import { Link } from "react-router-dom";
import { createDepartmentAdmins, createAdminUser, DEPARTMENT_CONFIG } from "../firebase";

const GENERAL_ADMIN = {
  email:       "admin@civiclens.com",
  password:    "Cv!cL3ns#Adm9xQz",
  displayName: "Admin 🏛️",
};

const ALL_ACCOUNTS = [
  { key: "general", displayName: "Admin 🏛️",                email: GENERAL_ADMIN.email },
  ...Object.entries(DEPARTMENT_CONFIG).map(([dept, cfg]) => ({
    key: dept, displayName: cfg.displayName, email: cfg.email,
  })),
];

export default function SetupPage() {
  const [results,  setResults]  = useState([]);
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);

  const hasErrors = results.some((r) => r.status === "error");

  async function handleCreate() {
    setRunning(true);
    setResults([]);

    // Create the general admin first
    try {
      await createAdminUser({ email: GENERAL_ADMIN.email, password: GENERAL_ADMIN.password });
      setResults((prev) => [...prev, { key: "general", email: GENERAL_ADMIN.email, status: "created" }]);
    } catch (err) {
      const status = err.code === "auth/email-already-in-use" ? "exists" : "error";
      setResults((prev) => [...prev, {
        key: "general", email: GENERAL_ADMIN.email, status, message: err.message,
      }]);
    }

    // Create the 3 department admins
    await createDepartmentAdmins((result) => {
      setResults((prev) => [...prev, result]);
    });

    setRunning(false);
    setDone(true);
  }

  function icon(status) {
    return status === "created" ? "✅" : status === "exists" ? "⚠️" : "❌";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 max-w-lg w-full flex flex-col gap-5">

        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">CivicLens Admin Setup</h1>
          <p className="text-sm text-gray-500">
            Creates all 4 admin accounts in Firebase Auth + Firestore. Run once.
          </p>
        </div>

        {/* Account preview */}
        <div className="flex flex-col gap-2">
          {ALL_ACCOUNTS.map((a) => (
            <div key={a.key} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gray-800">{a.displayName}</span>
                <span className="text-xs text-gray-400">{a.email}</span>
              </div>
            </div>
          ))}
        </div>

        {/* If errors, show Firestore rules tip */}
        {hasErrors && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex flex-col gap-1">
            <p className="font-semibold">❗ Some accounts failed. Most likely cause: Firestore rules are in locked mode.</p>
            <p>Go to <strong>Firebase Console → Firestore → Rules</strong> and replace the rules with:</p>
            <pre className="bg-amber-100 rounded p-2 mt-1 overflow-x-auto text-[10px] leading-relaxed">{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`}</pre>
            <p className="mt-1">Then click <strong>Retry</strong> below.</p>
          </div>
        )}

        {/* Progress results */}
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <div key={r.email} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-sm">
                  <span>{icon(r.status)}</span>
                  <span className="font-medium text-gray-700">{r.email}</span>
                  <span className="text-gray-400 text-xs">
                    {r.status === "created" ? "created"
                      : r.status === "exists" ? "already exists"
                      : "failed"}
                  </span>
                </div>
                {r.status === "error" && r.message && (
                  <p className="text-[11px] text-red-600 pl-6 break-all">{r.message}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {done && !hasErrors && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium">
            🎉 All accounts ready! Go to the login page and sign in.
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={running || (done && !hasErrors)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          {running      ? "Creating accounts…"  :
           done && !hasErrors ? "Setup complete"   :
           hasErrors     ? "Retry"               :
                           "Create All Admin Accounts"}
        </button>

        <Link to="/" className="text-center text-sm text-gray-500 hover:text-gray-700">
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
