import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import CitizenPage from "./pages/CitizenPage";
import AdminPage from "./pages/AdminPage";

function Navbar() {
  return (
    <nav className="bg-white shadow-sm px-6 py-3 flex gap-6 items-center">
      <span className="font-bold text-blue-700 text-lg">CivicLens</span>
      <Link to="/citizen" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
        Citizen
      </Link>
      <Link to="/admin" className="text-gray-600 hover:text-indigo-600 text-sm font-medium">
        Admin
      </Link>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/citizen" replace />} />
        <Route path="/citizen" element={<CitizenPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
