import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerCitizen, loginUser, getUserRole, logoutUser } from "../firebase";

// Shared input class helpers
const inputCls =
  "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const adminInputCls =
  "w-full bg-white/10 border border-white/20 text-white placeholder-indigo-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/40";

function authErrorMessage(code) {
  const map = {
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/invalid-credential":     "Incorrect email or password.",
    "auth/invalid-login-credential":"Incorrect email or password.",
    "auth/too-many-requests":      "Too many attempts. Please try again later.",
    "auth/operation-not-allowed":  "Email/password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/requires-recent-login":  "Please sign out and try again.",
  };
  return map[code] ?? `Something went wrong (${code || "unknown"}). Please try again.`;
}

// ── Citizen Card ──────────────────────────────────────────────────────────────

function CitizenCard() {
  const navigate = useNavigate();
  const [view, setView]   = useState("signin"); // "signin" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sign-up fields
  const [signup, setSignup] = useState({ email: "", password: "", confirm: "", displayName: "", city: "", state: "DE", zip: "" });
  const setS = (f) => (e) => { setSignup((p) => ({ ...p, [f]: e.target.value })); setError(""); };

  // Sign-in fields
  const [signin, setSignin] = useState({ email: "", password: "" });
  const setI = (f) => (e) => { setSignin((p) => ({ ...p, [f]: e.target.value })); setError(""); };

  async function handleSignUp(e) {
    e.preventDefault();
    if (signup.password !== signup.confirm) { setError("Passwords do not match."); return; }
    if (!/^\d{5}$/.test(signup.zip))        { setError("Enter a valid 5-digit zip code."); return; }
    setLoading(true);
    try {
      await registerCitizen({
        email:       signup.email,
        password:    signup.password,
        displayName: signup.displayName,
        city:        signup.city,
        state:       signup.state,
        zipCode:     signup.zip,
      });
      navigate("/citizen");
    } catch (err) {
      const code = err?.code ?? err?.message?.match?.(/auth\/[\w-]+/)?.[0];
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await loginUser(signin.email, signin.password);
      navigate("/citizen");
    } catch (err) {
      const code = err?.code ?? err?.message?.match?.(/auth\/[\w-]+/)?.[0];
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-7 flex flex-col gap-5 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div>
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mb-4">🏙️</div>
        <h2 className="text-xl font-bold text-gray-900">Citizen Portal</h2>
        <p className="text-sm text-gray-500 mt-1">Report issues and track community progress</p>
      </div>

      {error && (
        <p className="text-red-500 text-xs font-medium bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* ── Sign In form (default) ── */}
      {view === "signin" && (
        <form onSubmit={handleSignIn} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input required type="email" value={signin.email} onChange={setI("email")}
              placeholder="you@email.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input required type="password" value={signin.password} onChange={setI("password")}
              placeholder="Your password" className={inputCls} />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 transition-colors text-sm mt-1">
            {loading ? "Signing in…" : "Sign In →"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={() => { setView("signup"); setError(""); }}
              className="text-blue-500 hover:text-blue-700 font-medium">
              Create one
            </button>
          </p>
        </form>
      )}

      {/* ── Sign Up form ── */}
      {view === "signup" && (
        <form onSubmit={handleSignUp} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input required type="email" value={signup.email} onChange={setS("email")}
              placeholder="you@email.com" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input required type="password" value={signup.password} onChange={setS("password")}
                placeholder="Min. 6 chars" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm</label>
              <input required type="password" value={signup.confirm} onChange={setS("confirm")}
                placeholder="Repeat password" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
            <input required value={signup.displayName} onChange={setS("displayName")}
              placeholder='"John" or "Concerned Resident"' className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input required value={signup.city} onChange={setS("city")}
              placeholder="Newark" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input required value={signup.state} onChange={setS("state")}
                placeholder="DE" maxLength={2} className={inputCls + " uppercase"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zip Code</label>
              <input required value={signup.zip} onChange={setS("zip")}
                placeholder="19711" maxLength={5} inputMode="numeric" className={inputCls} />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 transition-colors text-sm mt-1">
            {loading ? "Creating account…" : "Create Account →"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Already have an account?{" "}
            <button type="button" onClick={() => { setView("signin"); setError(""); }}
              className="text-blue-500 hover:text-blue-700 font-medium">
              Sign in
            </button>
          </p>
        </form>
      )}
    </div>
  );
}

// ── Admin Card ────────────────────────────────────────────────────────────────

function AdminCard() {
  const navigate = useNavigate();
  const [email, setEmail]   = useState("");
  const [pass,  setPass]    = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const firebaseUser = await loginUser(email, pass);
      const role = await getUserRole(firebaseUser.uid);
      if (role !== "admin") {
        await logoutUser();
        setError("This account does not have admin access.");
        return;
      }
      navigate("/admin");
    } catch (err) {
      const code = err?.code ?? err?.message?.match?.(/auth\/[\w-]+/)?.[0];
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-2xl shadow-md p-7 flex flex-col gap-5 hover:shadow-lg transition-shadow">
      <div>
        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl mb-4">🛡️</div>
        <h2 className="text-xl font-bold text-white">I&apos;m an Admin</h2>
        <p className="text-sm text-indigo-300 mt-1">Manage reports and resolve civic issues</p>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-indigo-300 mb-1">Email</label>
          <input required type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="dept@civiclens.com"
            autoComplete="off"
            className={adminInputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-indigo-300 mb-1">Password</label>
          <input required type="password" value={pass}
            onChange={(e) => { setPass(e.target.value); setError(""); }}
            placeholder="Password"
            autoComplete="new-password"
            className={adminInputCls} />
        </div>

        {error && <p className="text-red-300 text-xs font-medium bg-white/10 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-white hover:bg-indigo-50 disabled:opacity-60 text-indigo-700 font-semibold rounded-xl py-2.5 transition-colors text-sm">
          {loading ? "Signing in…" : "Enter as Admin →"}
        </button>
      </form>

      <p className="text-xs text-indigo-400">City staff only.</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
          <span className="text-3xl">🏛️</span>
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          Civic<span className="text-blue-600">Lens</span>
        </h1>
        <p className="mt-2 text-gray-500 text-base">Community-powered civic issue reporting</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl items-start">
        <CitizenCard />
        <AdminCard />
      </div>

      <p className="mt-10 text-xs text-gray-400">Built for HenHacks · Powered by Gemini AI</p>
    </div>
  );
}
