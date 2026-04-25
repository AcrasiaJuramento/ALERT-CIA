import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, AlertTriangle, Lock, Mail, ArrowRight } from "lucide-react";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);

    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#050d1a] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "radial-gradient(rgba(59,130,246,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/30">
              <Shield size={30} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-2xl tracking-tight">ALERT-CIA</p>
              <p className="text-slate-400 text-xs mt-1">
                Emergency Response Management System
              </p>
            </div>
          </Link>
        </div>

        <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-white font-bold text-xl mb-1">Sign In to System</h2>
            <p className="text-slate-400 text-sm">Authorized personnel only</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full p-3 rounded-xl bg-white/5 text-white"
            />

            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full p-3 rounded-xl bg-white/5 text-white"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-white text-sm"
            >
              {showPassword ? "Hide" : "Show"} Password
            </button>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 text-white py-3 rounded-xl"
            >
              {loading ? "Loading..." : "Sign In"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/register" className="text-blue-400">
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}