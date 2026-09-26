import React from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MobileSheet({ onClose, children }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(18,18,26,.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
        style={{
          position: "relative",
          zIndex: 31,
          background: "#fff",
          borderRadius: "22px 22px 0 0",
          padding: "10px 20px 24px",
          boxShadow: "0 -18px 44px -16px rgba(18,18,26,.3)",
          maxHeight: "88%",
          overflowY: "auto",
        }}
      >
        <div style={{ height: 5, width: 44, borderRadius: 3, background: "#E5E5EA", margin: "0 auto 16px" }} />
        {children}
      </motion.div>
    </div>
  );
}

export function SheetHeader({ title, subtitle, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ font: "600 17px 'DM Sans',sans-serif", letterSpacing: "-.3px", color: "#0A0A0A" }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, font: "400 13px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>{subtitle}</div>}
      </div>
      <button
        onClick={onClose}
        style={{ width: 28, height: 28, borderRadius: 14, background: "#F2F2F7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
      >
        <X size={12} color="#6B7280" strokeWidth={2.6} />
      </button>
    </div>
  );
}
