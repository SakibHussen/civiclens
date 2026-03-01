import { useState } from "react";
import { Link } from "react-router-dom";
import { createAdminUser } from "../firebase";

const ADMIN_EMAIL = "admin@civiclens.com";
const ADMIN_PASSWORD = "CivicLens@2024";

export default function SetupAdminPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [isError, setIsError] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setMessage(null);
    try {
      await createAdminUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      setMessage(`Admin created. You can now sign in with ${ADMIN_EMAIL}`);
      setIsError(false);
    } catch (err) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        setMessage("Admin already exists. You can sign in with admin@civiclens.com");
        setIsError(false);
      } else {
        setMessage(err?.message ?? "Something went wrong.");
        setIsError(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Create Admin</h1>
        <p className="text-sm text-gray-500 mb-6">
          Creates admin@civiclens.com with the configured password. Run once, then remove this route.
        </p>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 transition-colors"
        >
          {loading ? "Creating…" : "Create Admin"}
        </button>
        {message && (
          <p className={`mt-4 text-sm font-medium ${isError ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        )}
        <Link to="/" className="mt-6 block text-center text-sm text-gray-500 hover:text-gray-700">
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
