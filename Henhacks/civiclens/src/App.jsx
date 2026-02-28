import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CitizenPage    from "./pages/CitizenPage";
import AdminPage      from "./pages/AdminPage";
import LoginPage      from "./pages/LoginPage";
import SetupAdminPage from "./pages/SetupAdminPage";
import SetupPage      from "./pages/SetupPage";
import { onAuthChanged, getUserProfile } from "./firebase";

// ── Protected Route ───────────────────────────────────────────────────────────

function ProtectedRoute({ user, role, adminOnly, children }) {
  if (!user) return <Navigate to="/" replace />;
  if (adminOnly && role !== "admin") return <Navigate to="/" replace />;
  return children;
}

// ── Loading Screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Loading CivicLens…</p>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // undefined = auth not yet checked, null = signed out, object = signed in
  const [authUser,    setAuthUser]    = useState(undefined);
  const [userRole,    setUserRole]    = useState(null);
  const [userDept,    setUserDept]    = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setAuthUser(firebaseUser);
        setRoleLoading(true);
        const profile = await getUserProfile(firebaseUser.uid);
        setUserRole(profile.role);
        setUserDept(profile.department);
        setRoleLoading(false);
      } else {
        setAuthUser(null);
        setUserRole(null);
        setUserDept(null);
        setRoleLoading(false);
      }
    });
    return unsub;
  }, []);

  // Don't block the /setup page with the loading screen (auth changes during account creation)
  const isSetup = typeof window !== "undefined" && window.location.pathname === "/setup";
  if (!isSetup && (authUser === undefined || roleLoading)) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<LoginPage />} />
        <Route path="/setup-admin" element={<SetupAdminPage />} />
        <Route path="/setup"       element={<SetupPage />} />

        <Route
          path="/citizen"
          element={
            <ProtectedRoute user={authUser} role={userRole}>
              <CitizenPage user={authUser} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute user={authUser} role={userRole} adminOnly>
              <AdminPage user={authUser} department={userDept} />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
