"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { db, auth, storage } from "./lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  getDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import EmployeeDashboard from "./employee-dashboard";
import AdminDashboard from "./admin-dashboard";
import { AssessmentDraft } from "./admin-assessments";
import { ReportDraft, SaveProgress } from "./admin-reports";
import {
  Assessment,
  AssessmentBranch,
  AssessmentSubmission,
  AssessmentSubmissionStatus,
  AssignedTask,
  AttendanceRecord,
  ConfirmModal,
  ConfirmState,
  Employee,
  getCurrentIsoString,
  getTodayDateString,
  Report,
  ReportObservation,
  ReportObservationImage,
  ReportPriority,
  ReportStatus,
  setThemeMode,
  ThemeMode,
  Toast,
  ToastType,
  uploadFilesToStorage,
  WorkItem,
  WorkStatus,
  AttendanceStatus,
  UserRole,
  normalizeStoredFiles,
  mapLegacySingleFile,
  mapLegacySingleSubmittedFile,
} from "./portal-utils";

// Client-side image compression — downscale large photos and re-encode as JPEG
// before upload. Cuts upload time and storage dramatically with no visible
// quality loss. Falls back to the original file if compression yields no gain.
async function compressImage(file: File): Promise<File> {
  if (
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    return file;
  }
  if (file.size < 300 * 1024) return file; // already small enough
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file; // no benefit
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file; // any failure → upload original untouched
  }
}

type BirthdayEntry = {
  id: string;
  name: string;
  birthday: string;
  photoPath?: string;
  photoLink?: string;
};

type OHCCertificationEntry = {
  id: string;
  name: string;
  expiryDate: string;
  employeePhotoPath?: string;
  employeePhotoLink?: string;
  certificatePhotoPath?: string;
  certificatePhotoLink?: string;
  applied?: boolean;
};

type InvoiceStatus = "Approved" | "Pending Review" | "Paid";

type ExtractionStatus = "ready_for_review" | "pending_review" | "failed" | "duplicate";

type InvoiceItem = {
  id: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  supplierName: string;
  customerName: string;
  invoiceNumber?: string;
  dateReceived: string;
  dateApproved: string;
  totalAmount: number;
  status: InvoiceStatus;
  attachmentName?: string;
  attachmentPath?: string;
  attachmentType?: string;
  attachmentLink?: string;
  isDeleted?: boolean;
  // Bulk-scan extraction metadata (optional)
  sourceBatchId?: string;
  attachmentPageStart?: number;
  attachmentPageEnd?: number;
  extractionStatus?: ExtractionStatus;
  extractionConfidence?: Record<string, number>;
  reviewReasons?: string[];
  failedReason?: string;
  duplicateOfId?: string;
  archived?: boolean;
};

function AuthTransitionScreen({
  message,
  fading,
  zIndex = 99999,
}: {
  message: string;
  fading?: boolean;
  zIndex?: number;
}) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex,
      background: "linear-gradient(160deg, #0a1628 0%, #0f1c35 60%, #1b2a4a 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      animation: fading ? "authTransOut 0.35s ease-in forwards" : "authTransIn 0.22s ease-out forwards",
      pointerEvents: fading ? "none" : "all",
    }}>
      <div style={{
        width: 76, height: 76,
        background: "linear-gradient(145deg, #0d1a30 0%, #1b2a4a 100%)",
        borderRadius: 22,
        border: "1.5px solid rgba(240,192,64,0.45)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 32px rgba(240,192,64,0.12)",
        gap: 3,
      }}>
        <span style={{ color: "#F0C040", fontSize: 21, fontWeight: 900, letterSpacing: "0.06em", lineHeight: 1 }}>EIHG</span>
        <span style={{ color: "#c9a520", fontSize: 8, fontWeight: 700, letterSpacing: "0.22em", lineHeight: 1, opacity: 0.75 }}>PORTAL</span>
      </div>
      <div style={{ marginTop: 18, color: "#94a3b8", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
        {message}
        <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0s infinite" }}>.</span>
        <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0.2s infinite" }}>.</span>
        <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0.4s infinite" }}>.</span>
      </div>
      <div style={{ marginTop: 26, width: 110, height: 2, borderRadius: 999, background: "rgba(240,192,64,0.08)", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: "45%", background: "linear-gradient(90deg, transparent, rgba(240,192,64,0.85), transparent)", animation: "authShimmer 1.5s ease-in-out 0.2s infinite", borderRadius: 999 }} />
      </div>
      <style>{`
        @keyframes authTransIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes authTransOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes authDot { 0%, 80%, 100% { opacity: 0.25 } 40% { opacity: 1 } }
        @keyframes authShimmer { 0% { transform: translateX(-220%) } 100% { transform: translateX(420%) } }
      `}</style>
    </div>
  );
}

function LoginScreen({
  loginForm,
  setLoginForm,
  login,
  loginError,
  loginLoading,
  loginSuccess,
  themeMode,
  onToggleTheme,
}: {
  loginForm: { email: string; password: string };
  setLoginForm: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>;
  login: () => Promise<void>;
  loginError: string;
  loginLoading: boolean;
  loginSuccess: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}) {
  const isDark = themeMode === "dark";

  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
    outline: "none",
    fontSize: 14,
    background: isDark ? "#0f172a" : "#f9fafb",
    color: isDark ? "#f9fafb" : "#111827",
    boxSizing: "border-box",
  };

  const fieldLabelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 7,
    fontSize: 13,
    fontWeight: 700,
    color: isDark ? "#d1d5db" : "#374151",
  };

  return (
    <>
    <style>{loginKeyframes}</style>
    <div
      style={{
        minHeight: "100vh",
        background: isDark
          ? "linear-gradient(160deg, #060c1a 0%, #0b1120 50%, #0f172a 100%)"
          : "linear-gradient(160deg, #eef2ff 0%, #f8fafc 50%, #f0f4ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        position: "relative",
        animation: loginSuccess ? "loginPageOut 0.55s ease-in forwards" : "loginPageIn 0.4s ease-out forwards",
      }}
    >
      {/* Theme toggle — icon only */}
      <button
        onClick={onToggleTheme}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          position: "fixed",
          top: 18,
          right: 18,
          zIndex: 2000,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
          background: isDark ? "#111827" : "#ffffff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.3)" : "0 4px 12px rgba(0,0,0,0.08)",
        }}
      >
        {isDark ? "☀️" : "🌙"}
      </button>

      {/* Card container — 2 columns */}
      <div
        className="login-grid"
        style={{
          width: "100%",
          maxWidth: 960,
          display: "grid",
          gridTemplateColumns: "1fr 0.88fr",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: isDark
            ? "0 32px 64px rgba(0,0,0,0.5)"
            : "0 24px 56px rgba(15,23,42,0.12)",
          animation: loginSuccess
            ? "loginCardOut 0.5s cubic-bezier(0.4,0,1,1) forwards"
            : "loginCardIn 0.45s cubic-bezier(0,0,0.2,1) forwards",
        }}
      >
        {/* ── Left: brand panel ── */}
        <div
          className="login-brand-panel"
          style={{
            background: "linear-gradient(155deg, #4338ca 0%, #3730a3 45%, #312e81 100%)",
            padding: "52px 44px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
            minHeight: 520,
          }}
        >
          {/* Decorative circles */}
          <div style={{ position: "absolute", top: -80, right: -80, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "38%", right: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />

          <div>
            {/* Logo + company name */}
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 36 }}>
              <Image
                src="/eihg-logo.jpeg"
                alt="EIHG"
                width={54}
                height={54}
                style={{ width: 54, height: 54, borderRadius: 13, objectFit: "contain", background: "#fff", padding: 5, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Emirates International</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>Holdings Group</div>
              </div>
            </div>

            <h1 style={{ fontSize: 33, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.12, margin: "0 0 14px" }}>
              Employee Work<br />Management Portal
            </h1>

            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.75, marginBottom: 32 }}>
              One place to track daily work, manage tasks, review attendance, and handle invoices across the organization.
            </p>

            <div style={{ display: "grid", gap: 11 }}>
              {[
                "Submit work records & assigned tasks",
                "Track attendance with check-in / check-out",
                "Review and manage invoices",
                "Admin reports and HR certifications",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: 600 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                    ✓
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 36, fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.05em" }}>
            INTERNAL PORTAL · CONFIDENTIAL
          </div>
        </div>

        {/* ── Right: form panel ── */}
        <div
          style={{
            background: isDark ? "#0f172a" : "#ffffff",
            padding: "52px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 25, fontWeight: 900, color: isDark ? "#f9fafb" : "#111827", margin: 0, letterSpacing: "-0.02em" }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: isDark ? "#6b7280" : "#9ca3af", marginTop: 6, fontWeight: 500 }}>
              Sign in to your account to continue
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabelStyle}>Email address</label>
            <input
              style={{ ...fieldInputStyle, opacity: loginLoading ? 0.55 : 1, transition: "opacity 0.2s" }}
              value={loginForm.email}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={loginLoading}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabelStyle}>Password</label>
            <input
              type="password"
              style={{ ...fieldInputStyle, opacity: loginLoading ? 0.55 : 1, transition: "opacity 0.2s" }}
              value={loginForm.password}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loginLoading}
            />
          </div>

          {loginError && (
            <div
              style={{
                background: isDark ? "#3f1d24" : "#fee2e2",
                color: isDark ? "#fecdd3" : "#991b1b",
                border: isDark ? "1px solid #7f1d1d" : "1px solid #fecaca",
                borderRadius: 12,
                padding: "11px 14px",
                marginBottom: 16,
                fontSize: 13,
                fontWeight: 600,
                animation: "loginErrIn 0.3s ease-out forwards",
              }}
            >
              {loginError}
            </div>
          )}

          <button
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#ffffff",
              cursor: loginLoading ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: 15,
              boxShadow: loginLoading ? "0 4px 16px rgba(99,102,241,0.18)" : "0 4px 16px rgba(99,102,241,0.38)",
              letterSpacing: "0.01em",
              position: "relative",
              overflow: "hidden",
              transition: "box-shadow 0.25s, transform 0.1s",
            }}
            onClick={login}
            disabled={loginLoading}
          >
            {/* Shimmer sweep — visible only while loading */}
            {loginLoading && (
              <span style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
                animation: "authBtnShimmer 1.4s ease-in-out infinite",
              }} />
            )}
            <span style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 1 }}>
              {loginLoading ? (
                <>
                  Verifying
                  <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0s infinite" }}>.</span>
                  <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0.2s infinite" }}>.</span>
                  <span style={{ display: "inline-block", animation: "authDot 1.2s ease-in-out 0.4s infinite" }}>.</span>
                </>
              ) : "Sign In →"}
            </span>
          </button>

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: isDark ? "1px solid #1f2937" : "1px solid #f3f4f6",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 12, color: isDark ? "#4b5563" : "#9ca3af", fontWeight: 500 }}>
              For access issues, contact your system administrator
            </span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
// keyframes for LoginScreen — injected once globally
const loginKeyframes = `
  @keyframes loginPageIn   { from { opacity: 0 } to { opacity: 1 } }
  @keyframes loginPageOut  { from { opacity: 1 } to { opacity: 0 } }
  @keyframes loginCardIn   { from { opacity: 0; transform: translateY(14px) scale(0.99) } to { opacity: 1; transform: translateY(0) scale(1) } }
  @keyframes loginCardOut  { from { opacity: 1; transform: translateY(0) scale(1) } to { opacity: 0; transform: translateY(-10px) scale(0.99) } }
  @keyframes authBtnShimmer { 0% { transform: translateX(-150%) } 100% { transform: translateX(250%) } }
  @keyframes authDot       { 0%, 80%, 100% { opacity: 0.25 } 40% { opacity: 1 } }
  @keyframes loginErrIn    { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
`;

function getDaysBetweenDates(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return null;

  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  const diffMs = toDay.getTime() - fromDay.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function resolveInvoiceStatus(
  dateReceived: string,
  dateApproved: string,
  selectedStatus: InvoiceStatus
): InvoiceStatus {
  if (!dateApproved) {
    return "Pending Review";
  }

  const diff = getDaysBetweenDates(dateReceived, dateApproved);

  if (diff !== null && diff >= 4) {
    return "Pending Review";
  }

  return selectedStatus === "Paid" ? "Paid" : "Approved";
}

export default function HomePage() {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<Employee[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [ohcCertifications, setOhcCertifications] = useState<OHCCertificationEntry[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentSubmissions, setAssessmentSubmissions] = useState<AssessmentSubmission[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [loadingAssessmentSubmissions, setLoadingAssessmentSubmissions] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loadingWorks, setLoadingWorks] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [loadingBirthdays, setLoadingBirthdays] = useState(true);
  const [loadingOHC, setLoadingOHC] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(true);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const splashStart = useRef(Date.now());
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loginAnimatingOut, setLoginAnimatingOut] = useState(false); // keeps LoginScreen mounted during exit animation
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutFading, setLogoutFading] = useState(false);
  const [showLoginTransition, setShowLoginTransition] = useState(false);
  const [loginTransitionFading, setLoginTransitionFading] = useState(false);

  // Pagination limits (admin only) — sized for 100-employee scale
  const [worksLimit, setWorksLimit] = useState(300);
  const [tasksLimit, setTasksLimit] = useState(300);
  const [attendanceLimit, setAttendanceLimit] = useState(700);
  const [invoicesLimit, setInvoicesLimit] = useState(200);

  // hasMore flags — set true when loaded count equals the limit (more may exist)
  const [worksHasMore, setWorksHasMore] = useState(false);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [attendanceHasMore, setAttendanceHasMore] = useState(false);
  const [invoicesHasMore, setInvoicesHasMore] = useState(false);

  // URL caches: path → downloadURL — avoids re-fetching on every snapshot
  const birthdayUrlCache = useRef<Record<string, string>>({});
  const ohcUrlCache = useRef<Record<string, string>>({});

  const showToast = (type: ToastType, message: string) => {
    setToast({ type, message });
  };

  useEffect(() => {
    setThemeMode("light");
    setThemeModeState("light");
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const data = userSnap.data();

            const mappedUser: Employee = {
              uid: firebaseUser.uid,
              name: data.name ?? "Unknown User",
              department: data.department ?? "General",
              role: (data.role as UserRole) ?? "employee",
              position: data.position ?? "Staff",
              email: data.email ?? firebaseUser.email ?? "",
              completion:
                typeof data.completion === "number"
                  ? data.completion
                  : Number(data.completion ?? 0),
              profilePhotoUrl: data.profilePhotoUrl ?? "",
            };

            setCurrentUser(mappedUser);
            setLoginError("");
          } else {
            setCurrentUser(null);
            setLoginError("No user profile found in Firestore for this account.");
          }
        } else {
          setCurrentUser(null);
          setWorks([]);
          setAssignedTasks([]);
          setAttendance([]);
          setUsers([]);
          setBirthdays([]);
          setOhcCertifications([]);
          setInvoices([]);
          setAssessments([]);
          setAssessmentSubmissions([]);
        }
      } catch (error) {
        console.error("Error loading current user:", error);
        setCurrentUser(null);
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loginSuccess) return;
    setLoginAnimatingOut(true);     // keep LoginScreen in DOM during exit animation
    setShowLoginTransition(true);   // "Signing in..." overlay covers the gap
    setLoginTransitionFading(false);

    const t1 = setTimeout(() => setLoginAnimatingOut(false), 580);   // unmount LoginScreen
    const t2 = setTimeout(() => setLoginTransitionFading(true), 700); // dashboard painted → fade overlay
    const t3 = setTimeout(() => setShowLoginTransition(false), 1150); // remove overlay from DOM

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [loginSuccess]);

  // Minimum 1.8s splash + 0.5s fade-out = ~2.3s total
  useEffect(() => {
    if (!loadingAuth && !splashDone) {
      const elapsed = Date.now() - splashStart.current;
      const waitFor = Math.max(0, 1800 - elapsed);
      const t1 = setTimeout(() => setSplashFadingOut(true), waitFor);
      const t2 = setTimeout(() => setSplashDone(true), waitFor + 500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loadingAuth, splashDone]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      setUsers([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const usersData: Employee[] = snapshot.docs.map((document) => {
          const data = document.data();
          return {
            uid: document.id,
            name: data.name ?? "Unknown User",
            department: data.department ?? "General",
            role: (data.role as UserRole) ?? "employee",
            position: data.position ?? "Staff",
            email: data.email ?? "",
            completion:
              typeof data.completion === "number"
                ? data.completion
                : Number(data.completion ?? 0),
            profilePhotoUrl: data.profilePhotoUrl ?? "",
          };
        });
        setUsers(usersData);
      },
      (error) => {
        console.error("Error loading users:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setWorks([]);
      setLoadingWorks(false);
      return;
    }

    setLoadingWorks(true);

    const q =
      currentUser.role === "admin"
        ? query(collection(db, "employeeWorks"), where("isDeleted", "==", false), orderBy("createdAt", "desc"), limit(worksLimit))
        : query(collection(db, "employeeWorks"), where("employeeUid", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: WorkItem[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            employeeUid: data.employeeUid ?? "",
            employeeEmail: data.employeeEmail ?? "",
            employeeName: data.employeeName ?? "",
            title: data.title ?? "",
            category: data.category ?? "",
            department: data.department ?? "",
            date: data.date ?? "",
            status: (data.status as WorkStatus) ?? "Pending Review",
            notes: data.notes ?? "",
            attachmentName: data.attachmentName ?? "",
            attachmentPath: data.attachmentPath ?? "",
            attachmentType: data.attachmentType ?? "",
            attachmentLink: data.attachmentLink ?? "",
            attachments: normalizeStoredFiles(data.attachments),
            isDeleted: data.isDeleted ?? false,
          };
        });

        setWorks(items);
        setWorksHasMore(currentUser.role === "admin" && snapshot.docs.length === worksLimit);
        setLoadingWorks(false);
      },
      (error) => {
        console.error("Error loading works:", error);
        setLoadingWorks(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, worksLimit]);

  useEffect(() => {
    if (!currentUser) {
      setAssignedTasks([]);
      setLoadingTasks(false);
      return;
    }

    setLoadingTasks(true);

    const q =
      currentUser.role === "admin"
        ? query(collection(db, "assignedTasks"), where("isDeleted", "==", false), orderBy("createdAt", "desc"), limit(tasksLimit))
        : query(collection(db, "assignedTasks"), where("employeeUid", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AssignedTask[] = snapshot.docs.map((document) => {
          const data = document.data();
          const attachments = normalizeStoredFiles(data.attachments);
          const submittedFiles = mapLegacySingleSubmittedFile(data);

          return {
            id: document.id,
            employeeUid: data.employeeUid ?? "",
            employeeName: data.employeeName ?? "",
            employeeEmail: data.employeeEmail ?? "",
            title: data.title ?? "",
            description: data.description ?? "",
            attachments: attachments.length > 0 ? attachments : mapLegacySingleFile(data),
            deadline: data.deadline ?? "",
            status: data.status ?? "Assigned",
            submittedFiles,
            submittedNotes: data.submittedNotes ?? "",
            reviewNote: data.reviewNote ?? "",
            returnedAt: data.returnedAt ?? "",
            returnedBy: data.returnedBy ?? "",
            resubmissionCount:
              typeof data.resubmissionCount === "number"
                ? data.resubmissionCount
                : Number(data.resubmissionCount ?? 0),
            createdByAdmin: data.createdByAdmin ?? "",
            isDeleted: data.isDeleted ?? false,
          };
        });

        setAssignedTasks(items);
        setTasksHasMore(currentUser.role === "admin" && snapshot.docs.length === tasksLimit);
        setLoadingTasks(false);
      },
      (error) => {
        console.error("Error loading assigned tasks:", error);
        setLoadingTasks(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, tasksLimit]);

  useEffect(() => {
    if (!currentUser) {
      setAttendance([]);
      setLoadingAttendance(false);
      return;
    }

    setLoadingAttendance(true);

    const q =
      currentUser.role === "admin"
        ? query(collection(db, "attendance"), orderBy("date", "desc"), limit(attendanceLimit))
        : query(collection(db, "attendance"), where("employeeUid", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AttendanceRecord[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            employeeUid: data.employeeUid ?? "",
            employeeName: data.employeeName ?? "",
            employeeEmail: data.employeeEmail ?? "",
            department: data.department ?? "",
            date: data.date ?? "",
            checkIn: data.checkIn ?? "",
            checkOut: data.checkOut ?? "",
            status: (data.status as AttendanceStatus) ?? "Pending",
          };
        });

        items.sort((a, b) => (a.date < b.date ? 1 : -1));
        setAttendance(items);
        setAttendanceHasMore(currentUser.role === "admin" && snapshot.docs.length === attendanceLimit);
        setLoadingAttendance(false);
      },
      (error) => {
        console.error("Error loading attendance:", error);
        setLoadingAttendance(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, attendanceLimit]);

  useEffect(() => {
    if (!currentUser) {
      setBirthdays([]);
      setLoadingBirthdays(false);
      return;
    }

    setLoadingBirthdays(true);

    const unsubscribe = onSnapshot(
      collection(db, "birthdays"),
      async (snapshot) => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(async (document) => {
              const data = document.data();

              let photoLink = data.photoLink ?? "";

              if (!photoLink && data.photoPath) {
                // Use cached URL if available — avoids re-fetching on every snapshot
                if (birthdayUrlCache.current[data.photoPath]) {
                  photoLink = birthdayUrlCache.current[data.photoPath];
                } else {
                  try {
                    photoLink = await getDownloadURL(ref(storage, data.photoPath));
                    birthdayUrlCache.current[data.photoPath] = photoLink;
                  } catch (error) {
                    console.error("Error getting birthday photo URL:", error);
                  }
                }
              }

              return {
                id: document.id,
                name: data.name ?? "",
                birthday: data.birthday ?? "",
                photoPath: data.photoPath ?? "",
                photoLink,
              } as BirthdayEntry;
            })
          );

          setBirthdays(items);
          setLoadingBirthdays(false);
        } catch (error) {
          console.error("Error mapping birthdays:", error);
          setLoadingBirthdays(false);
        }
      },
      (error) => {
        console.error("Error loading birthdays:", error);
        setLoadingBirthdays(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setOhcCertifications([]);
      setLoadingOHC(false);
      return;
    }

    setLoadingOHC(true);

    const unsubscribe = onSnapshot(
      query(collection(db, "ohcCertifications"), orderBy("createdAt", "desc")),
      async (snapshot) => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(async (document) => {
              const data = document.data();

              let employeePhotoLink = data.employeePhotoLink ?? "";
              let certificatePhotoLink = data.certificatePhotoLink ?? "";

              if (!employeePhotoLink && data.employeePhotoPath) {
                if (ohcUrlCache.current[data.employeePhotoPath]) {
                  employeePhotoLink = ohcUrlCache.current[data.employeePhotoPath];
                } else {
                  try {
                    employeePhotoLink = await getDownloadURL(ref(storage, data.employeePhotoPath));
                    ohcUrlCache.current[data.employeePhotoPath] = employeePhotoLink;
                  } catch (error) {
                    console.error("Error getting employee photo URL:", error);
                  }
                }
              }

              if (!certificatePhotoLink && data.certificatePhotoPath) {
                if (ohcUrlCache.current[data.certificatePhotoPath]) {
                  certificatePhotoLink = ohcUrlCache.current[data.certificatePhotoPath];
                } else {
                  try {
                    certificatePhotoLink = await getDownloadURL(
                      ref(storage, data.certificatePhotoPath)
                    );
                    ohcUrlCache.current[data.certificatePhotoPath] = certificatePhotoLink;
                  } catch (error) {
                    console.error("Error getting certificate photo URL:", error);
                  }
                }
              }

              return {
                id: document.id,
                name: data.name ?? "",
                expiryDate: data.expiryDate ?? "",
                employeePhotoPath: data.employeePhotoPath ?? "",
                employeePhotoLink,
                certificatePhotoPath: data.certificatePhotoPath ?? "",
                certificatePhotoLink,
                applied: data.applied === true,
              } as OHCCertificationEntry;
            })
          );

          setOhcCertifications(items);
          setLoadingOHC(false);
        } catch (error) {
          console.error("Error mapping OHC certifications:", error);
          setLoadingOHC(false);
        }
      },
      (error) => {
        console.error("Error loading OHC certifications:", error);
        setLoadingOHC(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setInvoices([]);
      setLoadingInvoices(false);
      return;
    }

    setLoadingInvoices(true);

    const q =
      currentUser.role === "admin"
        ? query(collection(db, "invoices"), where("isDeleted", "==", false), orderBy("createdAt", "desc"), limit(invoicesLimit))
        : query(collection(db, "invoices"), where("employeeUid", "==", currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: InvoiceItem[] = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            employeeUid: data.employeeUid ?? "",
            employeeName: data.employeeName ?? "",
            employeeEmail: data.employeeEmail ?? "",
            supplierName: data.supplierName ?? "",
            customerName: data.customerName ?? "",
            invoiceNumber: data.invoiceNumber ?? "",
            dateReceived: data.dateReceived ?? "",
            dateApproved: data.dateApproved ?? "",
            totalAmount:
              typeof data.totalAmount === "number"
                ? data.totalAmount
                : Number(data.totalAmount ?? 0),
            status: (data.status as InvoiceStatus) ?? "Pending Review",
            attachmentName: data.attachmentName ?? "",
            attachmentPath: data.attachmentPath ?? "",
            attachmentType: data.attachmentType ?? "",
            attachmentLink: data.attachmentLink ?? "",
            sourceBatchId: data.sourceBatchId ?? "",
            attachmentPageStart:
              typeof data.attachmentPageStart === "number" ? data.attachmentPageStart : undefined,
            attachmentPageEnd:
              typeof data.attachmentPageEnd === "number" ? data.attachmentPageEnd : undefined,
            extractionStatus: data.extractionStatus,
            extractionConfidence: data.extractionConfidence ?? undefined,
            reviewReasons: Array.isArray(data.reviewReasons) ? data.reviewReasons : undefined,
            failedReason: data.failedReason ?? undefined,
            duplicateOfId: data.duplicateOfId ?? undefined,
            archived: data.archived === true,
            isDeleted: data.isDeleted ?? false,
          };
        });

        setInvoices(items);
        setInvoicesHasMore(currentUser.role === "admin" && snapshot.docs.length === invoicesLimit);
        setLoadingInvoices(false);
      },
      (error) => {
        console.error("Error loading invoices:", error);
        setLoadingInvoices(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, invoicesLimit]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      setAssessments([]);
      setLoadingAssessments(false);
      return;
    }

    setLoadingAssessments(true);

    const unsubscribe = onSnapshot(
      query(collection(db, "assessments"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const items: Assessment[] = snapshot.docs.map((document) => {
          const data = document.data();
          const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
          const questions = rawQuestions.map((raw: unknown, i: number) => {
            const q = (raw ?? {}) as Record<string, unknown>;
            return {
              id: typeof q.id === "string" ? q.id : `q_${i}`,
              text: typeof q.text === "string" ? q.text : "",
              options: Array.isArray(q.options)
                ? (q.options as unknown[]).map((o) => (typeof o === "string" ? o : ""))
                : [],
              correctAnswerIndex:
                typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0,
            };
          });
          const createdAtVal = data.createdAt;
          const createdAtIso =
            createdAtVal && typeof createdAtVal === "object" && "toDate" in createdAtVal
              ? (createdAtVal as { toDate: () => Date }).toDate().toISOString()
              : typeof createdAtVal === "string"
              ? createdAtVal
              : "";
          return {
            id: document.id,
            title: typeof data.title === "string" ? data.title : "",
            description: typeof data.description === "string" ? data.description : "",
            passingPercentage:
              typeof data.passingPercentage === "number" ? data.passingPercentage : 70,
            maxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 2,
            code: typeof data.code === "string" ? data.code : "",
            questions,
            createdAt: createdAtIso,
            createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
            createdByName: typeof data.createdByName === "string" ? data.createdByName : "",
            isActive: data.isActive !== false,
          } as Assessment;
        });
        setAssessments(items);
        setLoadingAssessments(false);
      },
      (error) => {
        console.error("Error loading assessments:", error);
        setLoadingAssessments(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      setAssessmentSubmissions([]);
      setLoadingAssessmentSubmissions(false);
      return;
    }

    setLoadingAssessmentSubmissions(true);

    const unsubscribe = onSnapshot(
      query(collection(db, "assessmentSubmissions"), orderBy("submittedAt", "desc")),
      (snapshot) => {
        const items: AssessmentSubmission[] = snapshot.docs.map((document) => {
          const data = document.data();
          const submittedAtVal = data.submittedAt;
          const submittedAtIso =
            submittedAtVal && typeof submittedAtVal === "object" && "toDate" in submittedAtVal
              ? (submittedAtVal as { toDate: () => Date }).toDate().toISOString()
              : typeof submittedAtVal === "string"
              ? submittedAtVal
              : "";
          const status: AssessmentSubmissionStatus =
            data.status === "Pass" ? "Pass" : "Fail";
          const rawBranch = typeof data.branch === "string" ? data.branch : "";
          const branch: AssessmentBranch | "" =
            rawBranch === "PS Muraqqabat" || rawBranch === "PS Karama"
              ? (rawBranch as AssessmentBranch)
              : "";
          return {
            id: document.id,
            assessmentId: typeof data.assessmentId === "string" ? data.assessmentId : "",
            assessmentCode: typeof data.assessmentCode === "string" ? data.assessmentCode : "",
            assessmentTitle: typeof data.assessmentTitle === "string" ? data.assessmentTitle : "",
            participantName: typeof data.participantName === "string" ? data.participantName : "",
            participantNameNormalized:
              typeof data.participantNameNormalized === "string"
                ? data.participantNameNormalized
                : "",
            branch,
            phoneNumber:
              typeof data.phoneNumber === "string" ? data.phoneNumber : undefined,
            attemptNumber:
              typeof data.attemptNumber === "number" ? data.attemptNumber : 1,
            answers: Array.isArray(data.answers)
              ? (data.answers as unknown[]).map((a) => (typeof a === "number" ? a : -1))
              : [],
            correctAnswers: Array.isArray(data.correctAnswers)
              ? (data.correctAnswers as unknown[]).map((a) => (typeof a === "number" ? a : -1))
              : [],
            score: typeof data.score === "number" ? data.score : 0,
            totalQuestions:
              typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
            percentage:
              typeof data.percentage === "number" ? data.percentage : 0,
            status,
            submittedAt: submittedAtIso,
            deleted: data.deleted === true,
            deletedAt:
              typeof data.deletedAt === "object" &&
              data.deletedAt &&
              "toDate" in data.deletedAt
                ? (data.deletedAt as { toDate: () => Date }).toDate().toISOString()
                : typeof data.deletedAt === "string"
                ? data.deletedAt
                : undefined,
            deletedBy: typeof data.deletedBy === "string" ? data.deletedBy : undefined,
            deletedByName:
              typeof data.deletedByName === "string" ? data.deletedByName : undefined,
          };
        });
        setAssessmentSubmissions(items);
        setLoadingAssessmentSubmissions(false);
      },
      (error) => {
        console.error("Error loading assessment submissions:", error);
        setLoadingAssessmentSubmissions(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      setReports([]);
      setLoadingReports(false);
      return;
    }

    setLoadingReports(true);

    const toIso = (val: unknown): string => {
      if (val && typeof val === "object" && "toDate" in val) {
        return (val as { toDate: () => Date }).toDate().toISOString();
      }
      return typeof val === "string" ? val : "";
    };

    const validPriority = (v: unknown): ReportPriority => {
      if (v === "Low" || v === "Medium" || v === "High" || v === "Critical") return v;
      return "Medium";
    };
    const validStatus = (v: unknown): ReportStatus => {
      if (
        v === "Draft" ||
        v === "Submitted" ||
        v === "Under Review" ||
        v === "Approved" ||
        v === "Action Required" ||
        v === "Closed"
      )
        return v;
      return "Draft";
    };

    const unsubscribe = onSnapshot(
      query(collection(db, "reports"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const items: Report[] = snapshot.docs.map((document) => {
          const data = document.data();
          const rawObservations = Array.isArray(data.observations)
            ? data.observations
            : [];
          const observations: ReportObservation[] = rawObservations.map(
            (raw: unknown) => {
              const o = (raw ?? {}) as Record<string, unknown>;
              const rawImages = Array.isArray(o.images) ? o.images : [];
              const images: ReportObservationImage[] = [];
              for (const rawImg of rawImages) {
                const im = (rawImg ?? {}) as Record<string, unknown>;
                if (typeof im.url !== "string" || !im.url) continue;
                const entry: ReportObservationImage = { url: im.url };
                if (typeof im.path === "string") entry.path = im.path;
                images.push(entry);
              }
              const legacyUrl =
                typeof o.imageUrl === "string" ? o.imageUrl : undefined;
              const legacyPath =
                typeof o.imagePath === "string" ? o.imagePath : undefined;
              return {
                id: typeof o.id === "string" ? o.id : `obs-${Math.random()}`,
                imageUrl: legacyUrl,
                imagePath: legacyPath,
                images:
                  images.length > 0
                    ? images
                    : legacyUrl
                    ? [{ url: legacyUrl, path: legacyPath }]
                    : [],
                description:
                  typeof o.description === "string" ? o.description : "",
                recommendation:
                  typeof o.recommendation === "string" ? o.recommendation : "",
                priority: validPriority(o.priority),
              };
            }
          );

          return {
            id: document.id,
            reportNumber:
              typeof data.reportNumber === "string" ? data.reportNumber : "",
            title: typeof data.title === "string" ? data.title : "",
            branchName:
              typeof data.branchName === "string" ? data.branchName : "",
            visitDate:
              typeof data.visitDate === "string" ? data.visitDate : "",
            preparedBy:
              typeof data.preparedBy === "string" ? data.preparedBy : "",
            status: validStatus(data.status),
            priority: validPriority(data.priority),
            observations,
            createdAt: toIso(data.createdAt),
            updatedAt: toIso(data.updatedAt),
            createdByUid:
              typeof data.createdByUid === "string" ? data.createdByUid : "",
            createdByName:
              typeof data.createdByName === "string" ? data.createdByName : "",
            deleted: data.deleted === true,
            deletedAt:
              data.deletedAt ? toIso(data.deletedAt) || undefined : undefined,
            deletedBy:
              typeof data.deletedBy === "string" ? data.deletedBy : undefined,
            deletedByName:
              typeof data.deletedByName === "string"
                ? data.deletedByName
                : undefined,
          };
        });
        setReports(items);
        setLoadingReports(false);
      },
      (error) => {
        console.error("Error loading reports:", error);
        setLoadingReports(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const loadMoreWorks      = () => setWorksLimit((n) => n + 200);
  const loadMoreTasks      = () => setTasksLimit((n) => n + 200);
  const loadMoreAttendance = () => setAttendanceLimit((n) => n + 300);
  const loadMoreInvoices   = () => setInvoicesLimit((n) => n + 150);

  const login = async () => {
    try {
      setLoginLoading(true);
      setLoginError("");
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      setLoginSuccess(true); // triggers exit animation; loginLoading stays true to keep button disabled
    } catch (error) {
      console.error(error);
      setLoginError("Invalid email or password.");
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    setIsLoggingOut(true);
    setLogoutFading(false);
    try {
      await signOut(auth);
      // Reset animation states BEFORE clearing currentUser
      // so LoginScreen renders fresh (no leftover loginPageOut animation)
      setLoginSuccess(false);
      setLoginAnimatingOut(false);
      setLoginLoading(false);
      setLoginError("");
      setCurrentUser(null);
      setWorks([]);
      setAssignedTasks([]);
      setAttendance([]);
      setUsers([]);
      setBirthdays([]);
      setOhcCertifications([]);
      setInvoices([]);
      setAssessments([]);
      setAssessmentSubmissions([]);
      setLoginForm({ email: "", password: "" });
      setLoadingWorks(false);
      setLoadingTasks(false);
      setLoadingAttendance(false);
      setLoadingBirthdays(false);
      setLoadingOHC(false);
      setLoadingInvoices(false);
    } catch (error) {
      console.error("Logout error:", error);
      setLoginSuccess(false);
      setLoginAnimatingOut(false);
      setLoginLoading(false);
      setLoginError("");
    } finally {
      setTimeout(() => setLogoutFading(true), 480);
      setTimeout(() => setIsLoggingOut(false), 750);
    }
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = themeMode === "light" ? "dark" : "light";
    setThemeMode(nextMode);
    setThemeModeState(nextMode);
  };

  const updateProfilePhoto = async (file: File) => {
    if (!currentUser) return;
    const uploaded = await uploadFilesToStorage("profile-photos", currentUser.uid, [file]);
    if (!uploaded[0]) return;
    const url = await getDownloadURL(ref(storage, uploaded[0].path));
    await updateDoc(doc(db, "users", currentUser.uid), { profilePhotoUrl: url });
    setCurrentUser((prev) => prev ? { ...prev, profilePhotoUrl: url } : prev);
  };

  const addWork = async (newWork: {
    title: string;
    category: string;
    date: string;
    notes: string;
    selectedFiles: File[];
  }) => {
    if (!currentUser) return;

    const attachments =
      newWork.selectedFiles.length > 0
        ? await uploadFilesToStorage("work-files", currentUser.uid, newWork.selectedFiles)
        : [];

    await addDoc(collection(db, "employeeWorks"), {
      employeeUid: currentUser.uid,
      employeeEmail: currentUser.email,
      employeeName: currentUser.name,
      department: currentUser.department,
      title: newWork.title,
      category: newWork.category,
      date: newWork.date,
      status: "Pending Review",
      notes: newWork.notes,
      attachmentName: attachments[0]?.name ?? "",
      attachmentPath: attachments[0]?.path ?? "",
      attachmentType: attachments[0]?.type ?? "",
      attachmentLink: "",
      attachments,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });
  };

  const addInvoice = async (newInvoice: {
    supplierName: string;
    customerName: string;
    dateReceived: string;
    dateApproved: string;
    totalAmount: number;
    status: InvoiceStatus;
    selectedFile: File | null;
  }) => {
    if (!currentUser) return;

    let uploaded = {
      attachmentPath: "",
      attachmentName: "",
      attachmentType: "",
    };

    if (newInvoice.selectedFile) {
      const files = await uploadFilesToStorage("invoice-files", currentUser.uid, [
        newInvoice.selectedFile,
      ]);

      uploaded = {
        attachmentPath: files[0]?.path ?? "",
        attachmentName: files[0]?.name ?? "",
        attachmentType: files[0]?.type ?? "",
      };
    }

    const finalStatus = resolveInvoiceStatus(
      newInvoice.dateReceived,
      newInvoice.dateApproved,
      newInvoice.status
    );

    await addDoc(collection(db, "invoices"), {
      employeeUid: currentUser.uid,
      employeeName: currentUser.name,
      employeeEmail: currentUser.email,
      supplierName: newInvoice.supplierName,
      customerName: newInvoice.customerName,
      dateReceived: newInvoice.dateReceived,
      dateApproved: newInvoice.dateApproved,
      totalAmount: newInvoice.totalAmount,
      status: finalStatus,
      attachmentName: uploaded.attachmentName,
      attachmentPath: uploaded.attachmentPath,
      attachmentType: uploaded.attachmentType,
      attachmentLink: "",
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const updateInvoice = async (
    invoiceId: string,
    payload: {
      supplierName: string;
      customerName: string;
      dateReceived: string;
      dateApproved: string;
      totalAmount: number;
      status: InvoiceStatus;
      selectedFile: File | null;
      currentAttachmentPath?: string;
      currentAttachmentLink?: string;
      currentAttachmentName?: string;
      currentAttachmentType?: string;
    }
  ) => {
    if (!currentUser) return;

    let attachmentPath = payload.currentAttachmentPath ?? "";
    let attachmentLink = payload.currentAttachmentLink ?? "";
    let attachmentName = payload.currentAttachmentName ?? "";
    let attachmentType = payload.currentAttachmentType ?? "";

    if (payload.selectedFile) {
      const files = await uploadFilesToStorage("invoice-files", currentUser.uid, [
        payload.selectedFile,
      ]);
      attachmentPath = files[0]?.path ?? "";
      attachmentLink = "";
      attachmentName = files[0]?.name ?? "";
      attachmentType = files[0]?.type ?? "";
    }

    const finalStatus = resolveInvoiceStatus(
      payload.dateReceived,
      payload.dateApproved,
      payload.status
    );

    const refDoc = doc(db, "invoices", invoiceId);

    await updateDoc(refDoc, {
      supplierName: payload.supplierName,
      customerName: payload.customerName,
      dateReceived: payload.dateReceived,
      dateApproved: payload.dateApproved,
      totalAmount: payload.totalAmount,
      status: finalStatus,
      attachmentPath,
      attachmentLink,
      attachmentName,
      attachmentType,
      updatedAt: serverTimestamp(),
    });
  };

  const approveInvoice = async (invoiceId: string, approvedDate: string) => {
    const refDoc = doc(db, "invoices", invoiceId);
    await updateDoc(refDoc, {
      status: "Approved",
      dateApproved: approvedDate,
      updatedAt: serverTimestamp(),
    });
  };

  type BulkExtractedInvoice = {
    first_page: number | null;
    last_page: number | null;
    supplier_name: string | null;
    customer_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    stamp_date: string | null;
    total_amount: number | null;
    confidence: Record<string, number>;
    warnings: string[];
  };

  const classifyExtraction = (
    inv: BulkExtractedInvoice,
    existingMatch: InvoiceItem | undefined
  ): { extractionStatus: ExtractionStatus; reviewReasons: string[]; failedReason?: string } => {
    const reasons: string[] = [];

    if (existingMatch) {
      return {
        extractionStatus: "duplicate",
        reviewReasons: [
          `Duplicate of existing invoice from ${existingMatch.supplierName} on ${existingMatch.dateReceived} (AED ${existingMatch.totalAmount}).`,
        ],
      };
    }

    if (inv.first_page === null || inv.last_page === null) {
      return {
        extractionStatus: "failed",
        reviewReasons: ["Could not determine the page range for this invoice."],
        failedReason: "page_range_undetected",
      };
    }

    const allMissing =
      !inv.supplier_name && !inv.customer_name && !inv.total_amount && !inv.invoice_date;
    if (allMissing) {
      return {
        extractionStatus: "failed",
        reviewReasons: ["No invoice fields could be extracted."],
        failedReason: "no_fields_extracted",
      };
    }

    if (!inv.supplier_name) reasons.push("Supplier Name is missing.");
    if (!inv.customer_name) reasons.push("Customer Name is missing.");
    if (inv.total_amount === null || inv.total_amount === 0) {
      reasons.push("Total Amount is missing or zero.");
    }
    if (!inv.invoice_date) reasons.push("Invoice date is missing.");

    const conf = inv.confidence || {};
    const checkConf = (key: string, label: string) => {
      const c = conf[key];
      if (typeof c === "number" && c < 0.8) {
        reasons.push(`${label} confidence is ${Math.round(c * 100)}% — please verify.`);
      }
    };
    checkConf("supplier_name", "Supplier Name");
    checkConf("customer_name", "Customer Name");
    checkConf("total_amount", "Total Amount");
    checkConf("invoice_date", "Invoice date");
    checkConf("page_range", "Invoice boundaries");

    if (Array.isArray(inv.warnings)) {
      for (const w of inv.warnings) {
        if (typeof w === "string" && w.trim()) reasons.push(w);
      }
    }

    return {
      extractionStatus: reasons.length === 0 ? "ready_for_review" : "pending_review",
      reviewReasons: reasons,
    };
  };

  const findDuplicateInvoice = (
    inv: BulkExtractedInvoice,
    list: InvoiceItem[]
  ): InvoiceItem | undefined => {
    const supplier = (inv.supplier_name || "").trim().toLowerCase();
    const customer = (inv.customer_name || "").trim().toLowerCase();
    const total = inv.total_amount;
    const date = inv.invoice_date || "";
    const invNumber = (inv.invoice_number || "").trim().toLowerCase();

    return list.find((existing) => {
      if (existing.isDeleted) return false;
      if (existing.archived) return false;
      if (existing.extractionStatus === "failed") return false;
      if (existing.extractionStatus === "duplicate") return false;

      if (invNumber && existing.invoiceNumber && existing.invoiceNumber.trim().toLowerCase() === invNumber) {
        return true;
      }

      const sameSupplier = supplier && existing.supplierName.trim().toLowerCase() === supplier;
      const sameCustomer = !customer || existing.customerName.trim().toLowerCase() === customer;
      const sameTotal = total !== null && Math.abs(existing.totalAmount - total) < 0.01;
      const sameDate = date && existing.dateReceived === date;

      return Boolean(sameSupplier && sameCustomer && sameTotal && sameDate);
    });
  };

  const bulkAddInvoices = async (
    extracted: BulkExtractedInvoice[],
    attachment: { path: string; name: string; type: string; totalPages: number }
  ): Promise<{
    batchId: string;
    summary: { ready: number; pending: number; duplicate: number; failed: number };
  }> => {
    if (!currentUser) {
      throw new Error("Not signed in.");
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const existingList = invoices;

    let ready = 0;
    let pending = 0;
    let duplicate = 0;
    let failed = 0;

    for (const inv of extracted) {
      const match = findDuplicateInvoice(inv, existingList);
      const classification = classifyExtraction(inv, match);

      if (classification.extractionStatus === "ready_for_review") ready++;
      else if (classification.extractionStatus === "pending_review") pending++;
      else if (classification.extractionStatus === "duplicate") duplicate++;
      else failed++;

      const totalAmount = typeof inv.total_amount === "number" ? inv.total_amount : 0;
      const dateReceived =
        typeof inv.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoice_date)
          ? inv.invoice_date
          : "";
      const dateApproved =
        typeof inv.stamp_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inv.stamp_date)
          ? inv.stamp_date
          : "";

      const docData: Record<string, unknown> = {
        employeeUid: currentUser.uid,
        employeeName: currentUser.name,
        employeeEmail: currentUser.email,
        supplierName: inv.supplier_name || "",
        customerName: inv.customer_name || "",
        invoiceNumber: inv.invoice_number || "",
        dateReceived,
        dateApproved,
        totalAmount,
        status: "Pending Review",
        attachmentName: attachment.name,
        attachmentPath: attachment.path,
        attachmentType: attachment.type,
        attachmentLink: "",
        isDeleted: false,
        sourceBatchId: batchId,
        attachmentPageStart: inv.first_page ?? null,
        attachmentPageEnd: inv.last_page ?? null,
        extractionStatus: classification.extractionStatus,
        extractionConfidence: inv.confidence ?? {},
        reviewReasons: classification.reviewReasons,
        extractedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (classification.failedReason) docData.failedReason = classification.failedReason;
      if (match) docData.duplicateOfId = match.id;

      await addDoc(collection(db, "invoices"), docData);
    }

    return { batchId, summary: { ready, pending, duplicate, failed } };
  };

  const archiveInvoice = async (invoiceId: string) => {
    const refDoc = doc(db, "invoices", invoiceId);
    await updateDoc(refDoc, { archived: true, updatedAt: serverTimestamp() });
  };

  const clearExtractionStatus = async (invoiceId: string) => {
    const refDoc = doc(db, "invoices", invoiceId);
    await updateDoc(refDoc, {
      extractionStatus: null,
      reviewReasons: [],
      updatedAt: serverTimestamp(),
    });
  };

  const deleteInvoice = async (invoiceId: string) => {
    setConfirmState({
      open: true,
      title: "Delete invoice",
      message: "Are you sure you want to permanently delete this invoice?",
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "invoices", invoiceId);
          await deleteDoc(refDoc);
          showToast("success", "Invoice deleted successfully.");
        } catch (error) {
          console.error(error);
          const msg = error instanceof Error ? error.message : "";
          if (/permission|insufficient|denied/i.test(msg)) {
            showToast(
              "error",
              "You don't have permission to delete this invoice. Contact the admin."
            );
          } else {
            showToast("error", msg || "Error deleting invoice.");
          }
        }
      },
    });
  };

  const openInvoiceAttachment = async (path?: string, link?: string) => {
    try {
      if (path) {
        const url = await getDownloadURL(ref(storage, path));
        window.open(url, "_blank");
        return;
      }

      if (link) {
        window.open(link, "_blank");
      }
    } catch (error) {
      console.error(error);
      showToast("error", "Error opening invoice attachment.");
    }
  };

  const checkIn = async () => {
    if (!currentUser) return;

    const today = getTodayDateString();
    const alreadyChecked = attendance.find(
      (record) => record.employeeUid === currentUser.uid && record.date === today
    );

    if (alreadyChecked) {
      throw new Error("You have already checked in today.");
    }

    await addDoc(collection(db, "attendance"), {
      employeeUid: currentUser.uid,
      employeeName: currentUser.name,
      employeeEmail: currentUser.email,
      department: currentUser.department,
      date: today,
      checkIn: getCurrentIsoString(),
      checkOut: "",
      status: "Pending",
      createdAt: serverTimestamp(),
    });
  };

  const checkOut = async (attendanceId: string) => {
    const refDoc = doc(db, "attendance", attendanceId);
    await updateDoc(refDoc, {
      checkOut: getCurrentIsoString(),
    });
  };

  const updateWorkStatus = async (id: string, status: WorkStatus) => {
    try {
      const refDoc = doc(db, "employeeWorks", id);
      await updateDoc(refDoc, { status });
      showToast("success", "Work status updated.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error updating status.");
    }
  };

  const updateAttendanceStatus = async (id: string, status: AttendanceStatus) => {
    try {
      const refDoc = doc(db, "attendance", id);
      await updateDoc(refDoc, { status });
      showToast("success", "Attendance status updated.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error updating attendance status.");
    }
  };

  const deleteAttendance = async (record: AttendanceRecord) => {
    setConfirmState({
      open: true,
      title: "Delete attendance record",
      message: `Are you sure you want to permanently delete the attendance for ${record.employeeName} on ${record.date}? This will be removed from both admin and employee views.`,
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "attendance", record.id);
          await deleteDoc(refDoc);
          showToast("success", "Attendance deleted permanently.");
        } catch (error) {
          console.error(error);
          showToast("error", "Error deleting attendance.");
        }
      },
    });
  };

  const permanentDeleteWork = async (id: string) => {
    setConfirmState({
      open: true,
      title: "Delete work permanently",
      message:
        "Are you sure you want to permanently delete this work record? It will be removed from both admin and employee views.",
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "employeeWorks", id);
          await deleteDoc(refDoc);
          showToast("success", "Work deleted permanently.");
        } catch (error) {
          console.error(error);
          showToast("error", "Error deleting work permanently.");
        }
      },
    });
  };

  const assignTask = async (task: {
    employeeUid: string;
    employeeName: string;
    employeeEmail: string;
    title: string;
    description: string;
    selectedFiles: File[];
    deadline: string;
  }) => {
    if (!currentUser) return;

    const uploadedFiles =
      task.selectedFiles.length > 0
        ? await uploadFilesToStorage("task-files", task.employeeUid, task.selectedFiles)
        : [];

    await addDoc(collection(db, "assignedTasks"), {
      employeeUid: task.employeeUid,
      employeeName: task.employeeName,
      employeeEmail: task.employeeEmail,
      title: task.title,
      description: task.description,
      attachments: uploadedFiles,
      deadline: task.deadline,
      status: "Assigned",
      submittedFiles: [],
      submittedNotes: "",
      reviewNote: "",
      returnedAt: "",
      returnedBy: "",
      resubmissionCount: 0,
      createdByAdmin: currentUser.name,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });
  };

  const addBirthday = async (payload: {
    name: string;
    birthday: string;
    photo: File | null;
  }) => {
    let uploaded = {
      photoPath: "",
      photoLink: "",
    };

    if (payload.photo) {
      const files = await uploadFilesToStorage("birthday-photos", "shared", [payload.photo]);
      uploaded = {
        photoPath: files[0]?.path ?? "",
        photoLink: "",
      };
    }

    await addDoc(collection(db, "birthdays"), {
      name: payload.name,
      birthday: payload.birthday,
      photoPath: uploaded.photoPath,
      photoLink: uploaded.photoLink,
      createdAt: serverTimestamp(),
    });
  };

  const deleteBirthday = async (birthdayId: string, birthdayName: string) => {
    setConfirmState({
      open: true,
      title: "Delete birthday",
      message: `Are you sure you want to delete the birthday entry for ${birthdayName}?`,
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "birthdays", birthdayId);
          await deleteDoc(refDoc);
          showToast("success", "Birthday deleted successfully.");
        } catch (error) {
          console.error(error);
          showToast("error", "Error deleting birthday.");
        }
      },
    });
  };

  const addOHCCertification = async (payload: {
    name: string;
    expiryDate: string;
    employeePhoto: File | null;
    certificatePhoto: File | null;
  }) => {
    let uploadedEmployeePhoto = {
      path: "",
      link: "",
    };

    let uploadedCertificatePhoto = {
      path: "",
      link: "",
    };

    if (payload.employeePhoto) {
      const files = await uploadFilesToStorage("ohc-employee-photos", "shared", [
        payload.employeePhoto,
      ]);
      uploadedEmployeePhoto = {
        path: files[0]?.path ?? "",
        link: "",
      };
    }

    if (payload.certificatePhoto) {
      const files = await uploadFilesToStorage("ohc-certificate-photos", "shared", [
        payload.certificatePhoto,
      ]);
      uploadedCertificatePhoto = {
        path: files[0]?.path ?? "",
        link: "",
      };
    }

    await addDoc(collection(db, "ohcCertifications"), {
      name: payload.name,
      expiryDate: payload.expiryDate,
      employeePhotoPath: uploadedEmployeePhoto.path,
      employeePhotoLink: uploadedEmployeePhoto.link,
      certificatePhotoPath: uploadedCertificatePhoto.path,
      certificatePhotoLink: uploadedCertificatePhoto.link,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const updateOHCCertification = async (
    certificationId: string,
    payload: {
      name: string;
      expiryDate: string;
      employeePhoto: File | null;
      certificatePhoto: File | null;
      currentEmployeePhotoPath?: string;
      currentEmployeePhotoLink?: string;
      currentCertificatePhotoPath?: string;
      currentCertificatePhotoLink?: string;
    }
  ) => {
    let employeePhotoPath = payload.currentEmployeePhotoPath ?? "";
    let employeePhotoLink = payload.currentEmployeePhotoLink ?? "";
    let certificatePhotoPath = payload.currentCertificatePhotoPath ?? "";
    let certificatePhotoLink = payload.currentCertificatePhotoLink ?? "";

    if (payload.employeePhoto) {
      const files = await uploadFilesToStorage("ohc-employee-photos", "shared", [
        payload.employeePhoto,
      ]);
      employeePhotoPath = files[0]?.path ?? "";
      employeePhotoLink = "";
    }

    if (payload.certificatePhoto) {
      const files = await uploadFilesToStorage("ohc-certificate-photos", "shared", [
        payload.certificatePhoto,
      ]);
      certificatePhotoPath = files[0]?.path ?? "";
      certificatePhotoLink = "";
    }

    const refDoc = doc(db, "ohcCertifications", certificationId);

    await updateDoc(refDoc, {
      name: payload.name,
      expiryDate: payload.expiryDate,
      employeePhotoPath,
      employeePhotoLink,
      certificatePhotoPath,
      certificatePhotoLink,
      updatedAt: serverTimestamp(),
    });
  };

  const setOHCApplied = async (certificationId: string, applied: boolean) => {
    const refDoc = doc(db, "ohcCertifications", certificationId);
    await updateDoc(refDoc, { applied, updatedAt: serverTimestamp() });
  };

  const deleteOHCCertification = async (certificationId: string, employeeName: string) => {
    setConfirmState({
      open: true,
      title: "Delete OHC certificate",
      message: `Are you sure you want to delete the OHC certificate for ${employeeName}?`,
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "ohcCertifications", certificationId);
          await deleteDoc(refDoc);
          showToast("success", "OHC certificate deleted successfully.");
        } catch (error) {
          console.error(error);
          showToast("error", "Error deleting OHC certificate.");
        }
      },
    });
  };

  const submitTask = async (id: string, submittedNotes: string, submittedFiles: File[]) => {
    const taskDoc = assignedTasks.find((task) => task.id === id);
    const ownerId = taskDoc?.employeeUid || currentUser?.uid || "unknown-user";

    const uploadedSubmittedFiles =
      submittedFiles.length > 0
        ? await uploadFilesToStorage("submitted-task-files", ownerId, submittedFiles)
        : [];

    const refDoc = doc(db, "assignedTasks", id);

    await updateDoc(refDoc, {
      submittedNotes,
      submittedFiles: uploadedSubmittedFiles,
      submittedLink: "",
      submittedFilePath: "",
      submittedFileName: "",
      submittedFileType: "",
      reviewNote: "",
      returnedAt: "",
      returnedBy: "",
      status: "Submitted",
    });
  };

  const approveTask = async (id: string) => {
    try {
      const refDoc = doc(db, "assignedTasks", id);
      await updateDoc(refDoc, {
        status: "Approved",
      });
      showToast("success", "Task marked as approved.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error approving task.");
    }
  };

  const returnTaskForRevision = async (id: string, note: string) => {
    try {
      const refDoc = doc(db, "assignedTasks", id);
      const task = assignedTasks.find((item) => item.id === id);

      await updateDoc(refDoc, {
        status: "Needs Revision",
        reviewNote: note,
        returnedAt: getCurrentIsoString(),
        returnedBy: currentUser?.name ?? "Admin",
        resubmissionCount: (task?.resubmissionCount ?? 0) + 1,
        adminNotificationSent: false,
      });

      showToast("success", "Task returned for revision.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error returning task for revision.");
    }
  };

  const permanentDeleteTask = async (id: string) => {
    setConfirmState({
      open: true,
      title: "Delete task permanently",
      message:
        "Are you sure you want to permanently delete this task? It will be removed from both admin and employee views.",
      onConfirm: async () => {
        try {
          const refDoc = doc(db, "assignedTasks", id);
          await deleteDoc(refDoc);
          showToast("success", "Task deleted permanently.");
        } catch (error) {
          console.error(error);
          showToast("error", "Error deleting task permanently.");
        }
      },
    });
  };

  // ── Assessments CRUD ────────────────────────────────────────────────
  const generateAssessmentCode = (): string => {
    // 8 chars, [A-Z0-9], no ambiguous chars (I, O, 0, 1)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };

  const createAssessment = async (draft: AssessmentDraft): Promise<{ id: string; code: string }> => {
    if (!currentUser) throw new Error("Not signed in.");

    // generate code with up to 5 retries to avoid extremely rare collisions
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateAssessmentCode();
      const existing = await getDocs(
        query(collection(db, "assessments"), where("code", "==", candidate), limit(1))
      );
      if (existing.empty) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Could not generate a unique code. Please try again.");

    const sanitizedQuestions = draft.questions.map((q) => ({
      id: q.id,
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctAnswerIndex: q.correctAnswerIndex,
    }));

    const docRef = await addDoc(collection(db, "assessments"), {
      title: draft.title.trim(),
      description: draft.description.trim(),
      passingPercentage: draft.passingPercentage,
      maxAttempts: draft.maxAttempts,
      code,
      questions: sanitizedQuestions,
      isActive: draft.isActive,
      createdBy: currentUser.uid,
      createdByName: currentUser.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { id: docRef.id, code };
  };

  const updateAssessment = async (id: string, draft: AssessmentDraft): Promise<void> => {
    const sanitizedQuestions = draft.questions.map((q) => ({
      id: q.id,
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctAnswerIndex: q.correctAnswerIndex,
    }));
    await updateDoc(doc(db, "assessments", id), {
      title: draft.title.trim(),
      description: draft.description.trim(),
      passingPercentage: draft.passingPercentage,
      maxAttempts: draft.maxAttempts,
      questions: sanitizedQuestions,
      isActive: draft.isActive,
      updatedAt: serverTimestamp(),
    });
  };

  const toggleAssessmentActive = async (id: string, nextActive: boolean): Promise<void> => {
    await updateDoc(doc(db, "assessments", id), {
      isActive: nextActive,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteAssessment = (id: string, title: string) => {
    setConfirmState({
      open: true,
      title: "Delete assessment",
      message: `Delete "${title}"? Any submissions will remain in Firestore for the audit trail.`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "assessments", id));
          showToast("success", "Assessment deleted.");
        } catch (error) {
          console.error(error);
          showToast("error", "Could not delete the assessment.");
        }
      },
    });
  };

  const softDeleteAssessmentSubmission = async (submissionId: string): Promise<void> => {
    if (!currentUser) throw new Error("Not signed in.");
    await updateDoc(doc(db, "assessmentSubmissions", submissionId), {
      deleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: currentUser.uid,
      deletedByName: currentUser.name,
    });
  };

  // ── Reports CRUD ────────────────────────────────────────────────────
  const uploadReportImage = async (
    reportId: string,
    file: File
  ): Promise<{ url: string; path: string }> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `report-images/${reportId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return { url, path };
  };

  // Builds the stored observation list: compresses + uploads all new images
  // across every observation in parallel (much faster than sequential), keeps
  // existing images, and reports upload progress.
  const buildObservations = async (
    reportId: string,
    draftObs: ReportDraft["observations"],
    onProgress?: SaveProgress
  ): Promise<ReportObservation[]> => {
    const total = draftObs.reduce(
      (n, o) => n + o.images.filter((im) => im.file).length,
      0
    );
    let done = 0;
    onProgress?.(0, total);

    const uploaded = new Map<string, { url: string; path: string }>();
    await Promise.all(
      draftObs.flatMap((o) =>
        o.images
          .filter((im) => im.file)
          .map(async (im) => {
            const compressed = await compressImage(im.file as File);
            // Retry transient upload failures (common on mobile networks) so a
            // report is never saved with a missing photo. If every attempt
            // fails, the error propagates and the whole save is aborted —
            // nothing partial is written and the user's draft is preserved.
            let lastErr: unknown;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const res = await uploadReportImage(reportId, compressed);
                uploaded.set(im.id, res);
                done += 1;
                onProgress?.(done, total);
                return;
              } catch (e) {
                lastErr = e;
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              }
            }
            throw lastErr instanceof Error
              ? lastErr
              : new Error("Image upload failed after multiple attempts.");
          })
      )
    );

    return draftObs.map((o) => {
      const images: ReportObservationImage[] = [];
      for (const im of o.images) {
        if (im.file) {
          const res = uploaded.get(im.id);
          if (res) images.push({ url: res.url, path: res.path });
        } else if (im.url) {
          const entry: ReportObservationImage = { url: im.url };
          if (im.existingPath) entry.path = im.existingPath;
          images.push(entry);
        }
      }
      const obs: ReportObservation = {
        id: o.id,
        description: o.description.trim(),
        recommendation: o.recommendation.trim(),
        priority: o.priority,
      };
      if (images.length > 0) {
        obs.images = images;
        obs.imageUrl = images[0].url;
        if (images[0].path) obs.imagePath = images[0].path;
      }
      return obs;
    });
  };

  const generateReportNumber = async (): Promise<string> => {
    return await runTransaction(db, async (tx) => {
      const counterRef = doc(db, "counters", "reportSequence");
      const counterSnap = await tx.get(counterRef);
      const year = new Date().getFullYear();
      let lastNumber = 0;
      if (counterSnap.exists()) {
        const data = counterSnap.data();
        if (data.year === year && typeof data.lastNumber === "number") {
          lastNumber = data.lastNumber;
        }
      }
      const nextNumber = lastNumber + 1;
      tx.set(counterRef, {
        year,
        lastNumber: nextNumber,
        updatedAt: serverTimestamp(),
      });
      return `RPT-${year}-${String(nextNumber).padStart(4, "0")}`;
    });
  };

  const createReport = async (
    draft: ReportDraft,
    onProgress?: SaveProgress
  ): Promise<{ id: string; reportNumber: string }> => {
    if (!currentUser) throw new Error("Not signed in.");

    const newDocRef = doc(collection(db, "reports"));
    // Run image processing and report-number allocation concurrently.
    const [observations, reportNumber] = await Promise.all([
      buildObservations(newDocRef.id, draft.observations, onProgress),
      generateReportNumber(),
    ]);

    await setDoc(newDocRef, {
      reportNumber,
      title: draft.title.trim(),
      branchName: draft.branchName.trim(),
      visitDate: draft.visitDate,
      preparedBy: draft.preparedBy.trim(),
      status: draft.status,
      priority: draft.priority,
      observations,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: currentUser.uid,
      createdByName: currentUser.name,
      deleted: false,
    });

    return { id: newDocRef.id, reportNumber };
  };

  const updateReport = async (
    id: string,
    draft: ReportDraft,
    onProgress?: SaveProgress
  ): Promise<void> => {
    if (!currentUser) throw new Error("Not signed in.");

    const observations = await buildObservations(
      id,
      draft.observations,
      onProgress
    );

    await updateDoc(doc(db, "reports", id), {
      title: draft.title.trim(),
      branchName: draft.branchName.trim(),
      visitDate: draft.visitDate,
      preparedBy: draft.preparedBy.trim(),
      status: draft.status,
      priority: draft.priority,
      observations,
      updatedAt: serverTimestamp(),
    });
  };

  const softDeleteReport = (id: string, title: string) => {
    if (!currentUser) return;
    setConfirmState({
      open: true,
      title: "Delete report",
      message: `Delete "${title}"? It will be soft-deleted and removed from the list. Firestore data is retained for the audit trail.`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "reports", id), {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: currentUser.uid,
            deletedByName: currentUser.name,
          });
          showToast("success", "Report deleted.");
        } catch (error) {
          console.error(error);
          showToast("error", "Could not delete the report.");
        }
      },
    });
  };

  if (!splashDone) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(160deg, #0a1628 0%, #0f1c35 60%, #1b2a4a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        animation: splashFadingOut
          ? "splashOut 0.5s ease-in forwards"
          : "splashBgFade 0.5s ease-out forwards",
      }}>

        {/* Logo box */}
        <div style={{
          width: 92,
          height: 92,
          background: "linear-gradient(145deg, #0d1a30 0%, #1b2a4a 100%)",
          borderRadius: 26,
          border: "1.5px solid rgba(240,192,64,0.55)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 40px rgba(240,192,64,0.15), 0 2px 12px rgba(0,0,0,0.5)",
          gap: 3,
          opacity: 0,
          animation: "splashLogoIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards",
        }}>
          <span style={{ color: "#F0C040", fontSize: 26, fontWeight: 900, letterSpacing: "0.06em", lineHeight: 1 }}>EIHG</span>
          <span style={{ color: "#c9a520", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", lineHeight: 1, opacity: 0.8 }}>PORTAL</span>
        </div>

        {/* Title */}
        <div style={{
          marginTop: 22,
          textAlign: "center",
          opacity: 0,
          animation: "splashFadeUp 0.5s ease-out 0.4s forwards",
        }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#F0C040", letterSpacing: "0.04em" }}>
            EIHG Portal
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          marginTop: 7,
          textAlign: "center",
          opacity: 0,
          animation: "splashFade 0.5s ease-out 0.65s forwards",
        }}>
          <div style={{ fontSize: 12, color: "#4e6080", fontWeight: 500, letterSpacing: "0.03em" }}>
            Emirates International Holdings Group
          </div>
        </div>

        {/* Gold shimmer loading bar */}
        <div style={{
          marginTop: 48,
          opacity: 0,
          animation: "splashFade 0.4s ease-out 0.85s forwards",
        }}>
          <div style={{
            width: 130,
            height: 2,
            borderRadius: 999,
            background: "rgba(240,192,64,0.08)",
            overflow: "hidden",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "45%",
              height: "100%",
              background: "linear-gradient(90deg, transparent 0%, rgba(240,192,64,0.9) 50%, transparent 100%)",
              animation: "shimmerBar 1.5s ease-in-out 1.1s infinite",
              borderRadius: 999,
            }} />
          </div>
        </div>

        <style>{`
          @keyframes splashBgFade  { from { opacity: 0 } to { opacity: 1 } }
          @keyframes splashLogoIn  { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
          @keyframes splashFadeUp  { from { opacity: 0; transform: translateY(7px) } to { opacity: 1; transform: translateY(0) } }
          @keyframes splashFade    { from { opacity: 0 } to { opacity: 1 } }
          @keyframes splashOut     { from { opacity: 1 } to { opacity: 0 } }
          @keyframes shimmerBar    { 0% { transform: translateX(-220%) } 100% { transform: translateX(420%) } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      {isLoggingOut    && <AuthTransitionScreen message="Signing out" fading={logoutFading}         zIndex={99999} />}
      {showLoginTransition && <AuthTransitionScreen message="Signing in"  fading={loginTransitionFading} zIndex={9997}  />}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState({ open: false, title: "", message: "", onConfirm: null })}
      />

      {(!currentUser || loginAnimatingOut) ? (
        <LoginScreen
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          login={login}
          loginError={loginError}
          loginLoading={loginLoading}
          loginSuccess={loginSuccess}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
        />
      ) : currentUser.role === "admin" ? (
        <AdminDashboard
          currentUser={currentUser}
          works={works}
          employees={users}
          assignedTasks={assignedTasks}
          attendance={attendance}
          birthdays={birthdays}
          ohcCertifications={ohcCertifications}
          invoices={invoices}
          worksHasMore={worksHasMore}
          tasksHasMore={tasksHasMore}
          attendanceHasMore={attendanceHasMore}
          invoicesHasMore={invoicesHasMore}
          onLoadMoreWorks={loadMoreWorks}
          onLoadMoreTasks={loadMoreTasks}
          onLoadMoreAttendance={loadMoreAttendance}
          onLoadMoreInvoices={loadMoreInvoices}
          onLogout={logout}
          onUpdateStatus={updateWorkStatus}
          onUpdateAttendanceStatus={updateAttendanceStatus}
          onDeleteAttendance={deleteAttendance}
          onAssignTask={assignTask}
          onAddBirthday={addBirthday}
          onDeleteBirthday={deleteBirthday}
          onAddOHCCertification={addOHCCertification}
          onUpdateOHCCertification={updateOHCCertification}
          onDeleteOHCCertification={deleteOHCCertification}
          onSetOHCApplied={setOHCApplied}
          onUpdateInvoice={updateInvoice}
          onApproveInvoice={approveInvoice}
          onOpenInvoiceAttachment={openInvoiceAttachment}
          onApproveTask={approveTask}
          onReturnForRevision={returnTaskForRevision}
          onDeleteWork={permanentDeleteWork}
          onDeleteTask={permanentDeleteTask}
          assessments={assessments}
          assessmentSubmissions={assessmentSubmissions}
          loadingAssessments={loadingAssessments}
          loadingAssessmentSubmissions={loadingAssessmentSubmissions}
          onCreateAssessment={createAssessment}
          onUpdateAssessment={updateAssessment}
          onDeleteAssessment={deleteAssessment}
          onToggleAssessmentActive={toggleAssessmentActive}
          onSoftDeleteSubmission={softDeleteAssessmentSubmission}
          reports={reports}
          loadingReports={loadingReports}
          onCreateReport={createReport}
          onUpdateReport={updateReport}
          onSoftDeleteReport={softDeleteReport}
          showToast={showToast}
        />
      ) : (
        <EmployeeDashboard
          currentUser={currentUser}
          works={works}
          assignedTasks={assignedTasks}
          attendance={attendance}
          invoices={invoices}
          onAddWork={addWork}
          onAddInvoice={addInvoice}
          onUpdateInvoice={updateInvoice}
          onDeleteInvoice={deleteInvoice}
          onOpenInvoiceAttachment={openInvoiceAttachment}
          onBulkAddInvoices={bulkAddInvoices}
          onArchiveInvoice={archiveInvoice}
          onClearExtractionStatus={clearExtractionStatus}
          onSubmitTask={submitTask}
          onCheckIn={checkIn}
          onCheckOut={checkOut}
          onLogout={logout}
          onUpdateProfilePhoto={updateProfilePhoto}
          showToast={showToast}
        />
      )}
    </>
  );
}