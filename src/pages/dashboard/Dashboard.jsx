import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CreatorDashboard from "../../components/dashboard/CreatorDashboard";
import CreatorHomeMobile from "../creator/CreatorHomeMobile";
import BrandDashboard from "../../components/dashboard/BrandDashboard";
import BrandHomeMobile from "../brand/BrandHomeMobile";
import TourRunner from "../../components/dashboard/TourRunner";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const isAdminOrSubAdmin = user?.role === "admin" || user?.team_role === "sub_admin";

  useEffect(() => {
    if (isAdminOrSubAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [isAdminOrSubAdmin, navigate]);

  if (isAdminOrSubAdmin) return null;

  const isCreator = user?.role === "creator";

  if (isCreator && isMobile) {
    return <CreatorHomeMobile user={user} />;
  }

  if (!isCreator && isMobile) {
    return <BrandHomeMobile user={user} />;
  }

  return (
    <>
      {user && <TourRunner user={user} />}
      {isCreator ? <CreatorDashboard user={user} /> : <BrandDashboard user={user} />}
    </>
  );
}
