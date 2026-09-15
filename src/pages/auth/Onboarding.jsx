import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import CreatorOnboarding from "../../pages/onboarding/CreatorOnboarding";
import BrandOnboardingFlow from "../../components/Onboarding/BrandOnboardingFlow";
import { LogOut } from "lucide-react";

export default function Onboarding() {
  const { user, refreshUser, setUser, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If they finish onboarding, send them off
    if (user?.onboarding_completed || user?.onboarding_complete || user?.onboarded) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans relative">
      {user?.role === 'brand' ? (
        <BrandOnboardingFlow 
          user={user} 
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch(e){}
            navigate('/dashboard');
          }} 
        />
      ) : (
        <CreatorOnboarding 
          user={user} 
          onComplete={async () => {
            setUser({ ...user, onboarding_completed: true });
            try { await refreshUser(); } catch(e){}
            navigate('/dashboard');
          }} 
        />
      )}
      
      <button
        onClick={() => logout()}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg shadow-sm border border-red-100 transition-colors text-xs font-semibold dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/40"
      >
        <LogOut size={14} />
        Log Out
      </button>
    </div>
  );
}
