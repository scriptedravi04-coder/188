import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import CreatorOnboarding from "../../pages/onboarding/CreatorOnboarding";
import BrandOnboardingFlow from "../../components/Onboarding/BrandOnboardingFlow";

export default function Onboarding() {
  const { user, refreshUser, setUser } = useAuth();
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
    </div>
  );
}
