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
  serverTimestamp,
  updateDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getDownloadURL, ref } from "firebase/storage";

import EmployeeDashboard from "./employee-dashboard";
import AdminDashboard from "./admin-dashboard";
import {
  AssignedTask,
  AttendanceRecord,
  cardStyle,
  ConfirmModal,
  ConfirmState,
  Employee,
  getCurrentIsoString,
  getTodayDateString,
  pageStyle,
  setThemeMode,
  shellStyle,
  SkeletonBlock,
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
};

type InvoiceStatus = "Approved" | "Pending Review" | "Paid";

type InvoiceItem = {
  id: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  supplierName: string;
  dateReceived: string;
  dateApproved: string;
  totalAmount: number;
  status: InvoiceStatus;
  attachmentName?: string;
  attachmentPath?: string;
  attachmentType?: string;
  attachmentLink?: string;
  isDeleted?: boolean;
};

function LoginScreen({
  loginForm,
  setLoginForm,
  login,
  loginError,
  loginLoading,
  themeMode,
  onToggleTheme,
}: {
  loginForm: { email: string; password: string };
  setLoginForm: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>;
  login: () => Promise<void>;
  loginError: string;
  loginLoading: boolean;
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
              style={fieldInputStyle}
              value={loginForm.email}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabelStyle}>Password</label>
            <input
              type="password"
              style={fieldInputStyle}
              value={loginForm.password}
              onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              placeholder="Enter your password"
              autoComplete="current-password"
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
              background: loginLoading
                ? (isDark ? "#374151" : "#d1d5db")
                : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#ffffff",
              cursor: loginLoading ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: 15,
              opacity: loginLoading ? 0.8 : 1,
              boxShadow: loginLoading ? "none" : "0 4px 16px rgba(99,102,241,0.38)",
              letterSpacing: "0.01em",
            }}
            onClick={login}
            disabled={loginLoading}
          >
            {loginLoading ? "Signing in..." : "Sign In →"}
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
  );
}

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
  const [themeReady, setThemeReady] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
  });

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

  const loadMoreWorks      = () => setWorksLimit((n) => n + 200);
  const loadMoreTasks      = () => setTasksLimit((n) => n + 200);
  const loadMoreAttendance = () => setAttendanceLimit((n) => n + 300);
  const loadMoreInvoices   = () => setInvoicesLimit((n) => n + 150);

  const login = async () => {
    try {
      setLoginLoading(true);
      setLoginError("");
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
    } catch (error) {
      console.error(error);
      setLoginError("Invalid email or password.");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setWorks([]);
    setAssignedTasks([]);
    setAttendance([]);
    setUsers([]);
    setBirthdays([]);
    setOhcCertifications([]);
    setInvoices([]);
    setLoginForm({ email: "", password: "" });
    setLoadingWorks(false);
    setLoadingTasks(false);
    setLoadingAttendance(false);
    setLoadingBirthdays(false);
    setLoadingOHC(false);
    setLoadingInvoices(false);
    showToast("info", "Logged out successfully.");
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
          showToast("error", "Error deleting invoice.");
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

  if (
    !themeReady ||
    loadingAuth ||
    loadingWorks ||
    loadingTasks ||
    loadingAttendance ||
    loadingBirthdays ||
    loadingOHC ||
    loadingInvoices
  ) {
    return (
      <div style={pageStyle()}>
        <div style={shellStyle(980)}>
          <div style={{ ...cardStyle(), marginTop: 40 }}>
            <SkeletonBlock height={28} />
            <div style={{ marginTop: 16 }}>
              <SkeletonBlock height={18} />
            </div>
            <div style={{ marginTop: 10 }}>
              <SkeletonBlock height={18} />
            </div>
            <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
              <SkeletonBlock height={72} />
              <SkeletonBlock height={72} />
              <SkeletonBlock height={72} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState({ open: false, title: "", message: "", onConfirm: null })}
      />

      {!currentUser ? (
        <LoginScreen
          loginForm={loginForm}
          setLoginForm={setLoginForm}
          login={login}
          loginError={loginError}
          loginLoading={loginLoading}
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
          onUpdateInvoice={updateInvoice}
          onApproveInvoice={approveInvoice}
          onOpenInvoiceAttachment={openInvoiceAttachment}
          onApproveTask={approveTask}
          onReturnForRevision={returnTaskForRevision}
          onDeleteWork={permanentDeleteWork}
          onDeleteTask={permanentDeleteTask}
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