import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerCitizen, loginUser, getUserRole, logoutUser } from "../firebase";

const KEYFRAMES_CSS = `
  @keyframes blobBlue {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(30px, -40px); }
  }
  @keyframes blobPurple {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-40px, 20px); }
  }
  @keyframes blobCyan {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(20px, 30px); }
  }
  @keyframes fadeUp {
    0% { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 rgba(96, 165, 250, 0.3); }
    50% { box-shadow: 0 0 20px rgba(96, 165, 250, 0.5); }
  }
  @keyframes formSlideUp {
    0% { opacity: 0; transform: translateY(100%); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .animate-blob-blue { animation: blobBlue 8s ease-in-out infinite alternate; }
  .animate-blob-purple { animation: blobPurple 10s ease-in-out infinite alternate; }
  .animate-blob-cyan { animation: blobCyan 12s ease-in-out infinite alternate; }
  .animate-fade-up { animation: fadeUp 0.6s ease-out forwards; opacity: 0; }
  .animate-pulse-glow { animation: pulseGlow 3s ease-in-out infinite; }
  .animate-form-slide { animation: formSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; }
`;

function authErrorMessage(code) {
  const map = {
    "auth/email-already-in-use":    "An account with this email already exists.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/weak-password":           "Password must be at least 6 characters.",
    "auth/user-not-found":          "No account found with this email.",
    "auth/wrong-password":          "Incorrect password.",
    "auth/invalid-credential":      "Incorrect email or password.",
    "auth/invalid-login-credential":"Incorrect email or password.",
    "auth/too-many-requests":       "Too many attempts. Please try again later.",
    "auth/operation-not-allowed":   "Email/password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/network-request-failed":  "Network error. Check your connection.",
    "auth/requires-recent-login":   "Please sign out and try again.",
  };
  return map[code] ?? `Something went wrong (${code || "unknown"}). Please try again.`;
}

const inputCls =
  "w-full bg-white/10 border border-white/15 rounded-2xl px-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-blue-400/60 focus:bg-white/15 focus:ring-0 focus:shadow-[0_0_0_3px_rgba(96,165,250,0.15)] transition-all duration-300 text-base";

export default function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("citizen"); // "citizen" | "admin"
  const [view, setView] = useState("signin"); // "signin" | "signup" (citizen only)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Citizen sign-in
  const [signin, setSignin] = useState({ email: "", password: "" });
  const setI = (f) => (e) => { setSignin((p) => ({ ...p, [f]: e.target.value })); setError(""); };

  // Citizen sign-up
  const [signup, setSignup] = useState({ email: "", password: "", confirm: "", displayName: "", city: "", state: "DE", zip: "" });
  const setS = (f) => (e) => { setSignup((p) => ({ ...p, [f]: e.target.value })); setError(""); };

  // Admin
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");

  const [showPass, setShowPass] = useState(false);

  async function handleCitizenSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const firebaseUser = await loginUser(signin.email, signin.password);
      const userRole = await getUserRole(firebaseUser.uid);
      if (userRole === "admin") {
        await logoutUser();
        setError("You're an admin. Please use the Admin Login.");
        return;
      }
      navigate("/citizen");
    } catch (err) {
      const code = err?.code ?? err?.message?.match?.(/auth\/[\w-]+/)?.[0];
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleCitizenSignUp(e) {
    e.preventDefault();
    if (signup.password !== signup.confirm) { setError("Passwords do not match."); return; }
    if (!/^\d{5}$/.test(signup.zip)) { setError("Enter a valid 5-digit zip code."); return; }
    setLoading(true);
    setError("");
    try {
      await registerCitizen({
        email: signup.email,
        password: signup.password,
        displayName: signup.displayName,
        city: signup.city,
        state: signup.state,
        zipCode: signup.zip,
      });
      navigate("/citizen");
    } catch (err) {
      const code = err?.code ?? err?.message?.match?.(/auth\/[\w-]+/)?.[0];
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const firebaseUser = await loginUser(adminEmail, adminPass);
      const userRole = await getUserRole(firebaseUser.uid);
      if (userRole !== "admin") {
        await logoutUser();
        setError("This account does not have admin access. Use Citizen login instead.");
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
    <div className="min-h-screen min-w-[375px] bg-gradient-to-b from-[#020617] to-[#0f172a] flex flex-col items-center justify-center px-4 py-8 sm:py-12 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_CSS }} />
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[400px] h-[400px] rounded-full bg-blue-500 opacity-15 blur-[80px] -top-40 -left-40 animate-blob-blue"
          style={{ filter: "blur(80px)" }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full bg-purple-500 opacity-15 blur-[80px] top-1/2 -right-40 animate-blob-purple"
          style={{ filter: "blur(80px)" }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full bg-cyan-400 opacity-15 blur-[80px] -bottom-40 left-1/4 animate-blob-cyan"
          style={{ filter: "blur(80px)" }}
        />
      </div>

      {/* Logo section — top 40% */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center max-h-[40vh] min-h-[200px]">
        <div className="w-20 h-20 flex items-center justify-center rounded-full bg-white/10 backdrop-blur border border-white/20 animate-pulse-glow mb-6">
          <span className="text-4xl">🏙️</span>
        </div>
        <h1
          className="text-4xl font-bold text-white tracking-tight animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          Civic<span className="text-blue-400">Lens</span>
        </h1>
        <p
          className="text-sm text-white/50 mt-2 animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          Newark&apos;s Civic Intelligence Platform
        </p>
      </div>

      {/* Role selector */}
      <div
        className="relative z-10 w-full max-w-xs mb-6 animate-fade-up"
        style={{ animationDelay: "500ms" }}
      >
        <div className="relative flex bg-white/5 backdrop-blur rounded-full p-1 border border-white/10">
          <button
            type="button"
            onClick={() => { setRole("citizen"); setError(""); setView("signin"); }}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative z-10 ${
              role === "citizen" ? "text-gray-900" : "text-white/60"
            }`}
          >
            👤 Citizen
          </button>
          <button
            type="button"
            onClick={() => { setRole("admin"); setError(""); }}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative z-10 ${
              role === "admin" ? "text-gray-900" : "text-white/60"
            }`}
          >
            🏛️ Admin
          </button>
          <div
            className="absolute top-1 bottom-1 rounded-full bg-white"
            style={{
              left: role === "citizen" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 10px)",
              transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />
        </div>
      </div>

      {/* Form card */}
      <div
        className="relative z-10 w-full max-w-md animate-form-slide"
        style={{ animationDelay: "600ms" }}
      >
        <div className="bg-white/8 backdrop-blur-2xl border-t border-white/10 rounded-t-3xl sm:rounded-3xl px-6 pt-8 pb-10 sm:border sm:border-white/10">
          {/* Pull indicator (mobile) */}
          <div className="sm:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

          {/* Form title */}
          <h2 className="text-xl font-bold text-white mb-6">
            {role === "citizen" ? "Welcome back 👋" : "Admin Access 🔒"}
          </h2>

          {error && (
            <div
              className="mb-4 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm transition-all duration-300"
              style={{ maxHeight: 60 }}
            >
              {error}
            </div>
          )}

          {/* Citizen: Sign In form */}
          {role === "citizen" && view === "signin" && (
            <form onSubmit={handleCitizenSignIn} className="space-y-4">
              <div>
                <input
                  required
                  type="email"
                  value={signin.email}
                  onChange={setI("email")}
                  placeholder="Email"
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <input
                  required
                  type={showPass ? "text" : "password"}
                  value={signin.password}
                  onChange={setI("password")}
                  placeholder="Password"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-[1.02] hover:brightness-110 active:scale-[0.97] disabled:opacity-80 disabled:pointer-events-none disabled:hover:scale-100 disabled:hover:brightness-100 transition-all duration-150 text-white flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In →"
                )}
              </button>
              <p className="text-white/40 text-sm text-center mt-4">
                New here?{" "}
                <button
                  type="button"
                  onClick={() => { setView("signup"); setError(""); }}
                  className="text-blue-400 underline-offset-4 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  Create an account
                </button>
              </p>
            </form>
          )}

          {/* Citizen: Sign Up form */}
          {role === "citizen" && view === "signup" && (
            <form onSubmit={handleCitizenSignUp} className="space-y-4">
              <div>
                <input
                  required
                  type="email"
                  value={signup.email}
                  onChange={setS("email")}
                  placeholder="Email"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="password"
                  value={signup.password}
                  onChange={setS("password")}
                  placeholder="Password (6+ chars)"
                  className={inputCls}
                />
                <input
                  required
                  type="password"
                  value={signup.confirm}
                  onChange={setS("confirm")}
                  placeholder="Confirm"
                  className={inputCls}
                />
              </div>
              <div>
                <input
                  required
                  value={signup.displayName}
                  onChange={setS("displayName")}
                  placeholder="Display name"
                  className={inputCls}
                />
              </div>
              <div>
                <input
                  required
                  value={signup.city}
                  onChange={setS("city")}
                  placeholder="City"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  value={signup.state}
                  onChange={setS("state")}
                  placeholder="State"
                  maxLength={2}
                  className={inputCls + " uppercase"}
                />
                <input
                  required
                  value={signup.zip}
                  onChange={setS("zip")}
                  placeholder="Zip"
                  maxLength={5}
                  inputMode="numeric"
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-[1.02] hover:brightness-110 active:scale-[0.97] disabled:opacity-80 disabled:pointer-events-none transition-all duration-150 text-white flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account →"
                )}
              </button>
              <p className="text-white/40 text-sm text-center mt-4">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setView("signin"); setError(""); }}
                  className="text-blue-400 underline-offset-4 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* Admin form */}
          {role === "admin" && (
            <form onSubmit={handleAdminSubmit} autoComplete="off" className="space-y-4">
              <div>
                <input
                  required
                  type="email"
                  value={adminEmail}
                  onChange={(e) => { setAdminEmail(e.target.value); setError(""); }}
                  placeholder="Admin email"
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
              <div>
                <input
                  required
                  type="password"
                  value={adminPass}
                  onChange={(e) => { setAdminPass(e.target.value); setError(""); }}
                  placeholder="Password"
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl font-semibold text-base bg-gradient-to-r from-slate-600 to-slate-700 hover:scale-[1.02] hover:brightness-110 active:scale-[0.97] disabled:opacity-80 disabled:pointer-events-none transition-all duration-150 text-white flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Admin Sign In →"
                )}
              </button>
              <p className="text-xs text-white/40 mt-4">City staff only. No registration available.</p>
            </form>
          )}
        </div>
      </div>

      <p className="relative z-10 mt-8 text-xs text-white/30">Built for HenHacks · Powered by Gemini AI</p>
    </div>
  );
}
