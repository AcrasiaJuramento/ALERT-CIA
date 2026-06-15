import { ArrowLeft, ShieldX } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-full grid place-items-center p-6 bg-background">
      <div className="max-w-md text-center bg-card border border-border rounded-2xl p-8 shadow-xl">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 text-red-400 grid place-items-center">
          <ShieldX className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your role is not authorized to open this page. Contact an administrator if your responsibilities have changed.
        </p>
        {location.state?.from && <p className="text-xs text-muted-foreground/70 mt-3 font-mono">{location.state.from}</p>}
        <button onClick={() => navigate('/admin')} className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
