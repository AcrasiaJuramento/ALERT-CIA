import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle, User, Building, Phone, Mail, Lock } from "lucide-react";

const roles = ["Dispatcher", "Field Officer"];
const agencies = ["MDRRMO Davao City", "BFP Davao City", "PNP Davao City", "DOH Davao Region", "Other"];
const positions = ["MDRRMO Head", "Dispatcher", "Field Officer / EMT", "Rescue Team Leader", "Medical Officer", "Other"];

export default function Register() {
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    position: "", agency: "", role: "", password: "", confirmPassword: "",
    agreeTerms: false,
  });

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSuccess(true);
    setTimeout(() => navigate("/login"), 3000);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#050d1a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={36} className="text-green-400" />
          </div>
          <h2 className="text-white font-black text-2xl mb-3">Registration Submitted!</h2>
          <p className="text-slate-400 max-w-sm mx-auto text-sm leading-relaxed mb-6">
            Your account request has been submitted for review. An administrator will approve your account within 24-48 hours.
            You will receive an email notification once approved.
          </p>
          <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
            <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
            Redirecting to login...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050d1a] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "radial-gradient(rgba(59,130,246,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/30">
              <Shield size={26} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-xl tracking-tight">ALERT-CIA</p>
              <p className="text-slate-400 text-xs">Request System Access</p>
            </div>
          </Link>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0
                ${step > s ? "bg-green-500 text-white" : step === s ? "bg-blue-600 text-white" : "bg-white/10 text-slate-500"}`}>
                {step > s ? <CheckCircle size={14} /> : s}
              </div>
              <div className={`h-px flex-1 transition-all ${step > s ? "bg-green-500" : "bg-white/10"}`} />
            </div>
          ))}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
            ${step > 3 ? "bg-green-500 text-white" : step === 3 ? "bg-blue-600 text-white" : "bg-white/10 text-slate-500"}`}>
            3
          </div>
        </div>

        <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-white font-bold text-xl mb-1">
              {step === 1 ? "Personal Information" : step === 2 ? "Agency & Role" : "Account Security"}
            </h2>
            <p className="text-slate-400 text-sm">Step {step} of 3</p>
          </div>

          <form onSubmit={step < 3 ? (e) => { e.preventDefault(); setStep(s => s + 1); } : handleSubmit}>
            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Name, Email, Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">First Name</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => update("firstName", e.target.value)}
                        placeholder="Juan"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">Last Name</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                      placeholder="dela Cruz"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Email Address</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="jcruz@mdrrmo.gov.ph"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Contact Number</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="09171234567"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Agency, Position, Role */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Agency / Organization</label>
                  <div className="relative">
                    <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={form.agency}
                      onChange={(e) => update("agency", e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-all appearance-none"
                    >
                      <option value="" className="bg-slate-800">Select agency</option>
                      {agencies.map(a => <option key={a} value={a} className="bg-slate-800">{a}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Position / Designation</label>
                  <select
                    value={form.position}
                    onChange={(e) => update("position", e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value="" className="bg-slate-800">Select position</option>
                    {positions.map(p => <option key={p} value={p} className="bg-slate-800">{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Requested Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => update("role", role)}
                        className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all border
                          ${form.role === role
                            ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                            : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                          }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <p className="text-slate-500 text-xs mt-2">Roles are subject to administrator approval</p>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => update("confirmPassword", e.target.value)}
                      placeholder="Repeat your password"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <p className="text-slate-300 text-sm font-medium mb-3">Registration Summary</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-400">Name</span><span className="text-white">{form.firstName} {form.lastName}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="text-white">{form.email || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Agency</span><span className="text-white">{form.agency || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Role</span><span className="text-blue-400">{form.role || "—"}</span></div>
                  </div>
                </div>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agreeTerms}
                    onChange={(e) => update("agreeTerms", e.target.checked)}
                    required
                    className="mt-1 w-3.5 h-3.5 accent-blue-500"
                  />
                  <span className="text-slate-400 text-xs leading-relaxed">
                    I agree to the ALERT-CIA system terms of use and understand that this account is for official emergency response duties only.
                  </span>
                </label>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-3 rounded-xl transition-colors text-sm"
                >
                  <ArrowLeft size={15} /> Back
                </button>
              )}
              <button
                type="submit"
                disabled={loading || (step === 3 && !form.agreeTerms)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                ) : step < 3 ? (
                  <>Continue <ArrowRight size={15} /></>
                ) : (
                  <>Submit Registration <ArrowRight size={15} /></>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-slate-400 text-sm mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
