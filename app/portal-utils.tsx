"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./lib/firebase";

export type UserRole = "admin" | "employee";
export type WorkStatus = "Approved" | "Pending Review" | "Missing Attachment";
export type TaskStatus =
  | "Assigned"
  | "In Progress"
  | "Submitted"
  | "Needs Revision"
  | "Approved"
  | "Overdue";
export type AttendanceStatus = "Pending" | "Present" | "Absent";
export type AdminTab =
  | "dashboard"
  | "pending"
  | "employees"
  | "tasks"
  | "approved"
  | "attendance"
  | "trash";
export type ToastType = "success" | "error" | "info";

export type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: (() => Promise<void> | void) | null;
};

export type StorageFile = {
  name: string;
  path: string;
  type: string;
};

export type Employee = {
  uid: string;
  name: string;
  department: string;
  role: UserRole;
  position: string;
  email: string;
  completion: number;
  profilePhotoUrl?: string;
  gender?: "male" | "female";
};

export type WorkItem = {
  id: string;
  employeeUid: string;
  employeeEmail: string;
  employeeName: string;
  title: string;
  category: string;
  department: string;
  date: string;
  status: WorkStatus;
  notes: string;
  attachmentName: string;
  attachmentPath?: string;
  attachmentType?: string;
  attachmentLink?: string;
  attachments?: StorageFile[];
  isDeleted?: boolean;
};

export type AssignedTask = {
  id: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  title: string;
  description: string;
  attachments: StorageFile[];
  deadline: string;
  status: TaskStatus;
  submittedFiles: StorageFile[];
  submittedNotes: string;
  reviewNote: string;
  returnedAt: string;
  returnedBy: string;
  resubmissionCount: number;
  createdByAdmin: string;
  isDeleted?: boolean;
};

export type AttendanceRecord = {
  id: string;
  employeeUid: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: AttendanceStatus;
};

export type ReportDateRange = {
  from: string;
  to: string;
};

export type EmployeeReportData = {
  approvedTasks: AssignedTask[];
  approvedWorks: WorkItem[];
  activeTasks: AssignedTask[];
  submittedTasks: AssignedTask[];
  pendingWorks: WorkItem[];
  employeeAttendance: AttendanceRecord[];
  summary: string;
};

// ── Assessments ────────────────────────────────────────────────────────
export type AssessmentQuestion = {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
};

export type Assessment = {
  id: string;
  title: string;
  description: string;
  passingPercentage: number;
  maxAttempts: number;
  code: string;
  questions: AssessmentQuestion[];
  createdAt: string;
  createdBy: string;
  createdByName: string;
  isActive: boolean;
};

export type AssessmentSubmissionStatus = "Pass" | "Fail";

export type AssessmentBranch = "PS Muraqqabat" | "PS Karama";

export type AssessmentSubmission = {
  id: string;
  assessmentId: string;
  assessmentCode: string;
  assessmentTitle: string;
  participantName: string;
  participantNameNormalized: string;
  branch: AssessmentBranch | "";
  attemptNumber: number;
  answers: number[];
  correctAnswers: number[];
  score: number;
  totalQuestions: number;
  percentage: number;
  status: AssessmentSubmissionStatus;
  submittedAt: string;
  // Legacy: older submissions may still have phoneNumber. Kept optional so we
  // don't crash when admin views historical data.
  phoneNumber?: string;
  // Soft-delete fields. Deleted submissions are hidden from Results, print,
  // stats, and the public attempt count.
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
};

// ── Reports (Field Visit Reports) ──────────────────────────────────────
export type ReportStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Action Required"
  | "Closed";

export type ReportPriority =
  | "Positive"
  | "Low"
  | "Medium"
  | "High"
  | "Critical";

export type ReportBranch = "PS Muraqqabat" | "PS Karama";

export type ReportObservationImage = {
  url: string;
  path?: string;
};

// Whether an observation flags something to fix or celebrates a good practice.
// Existing reports predate this field — they normalize to "Needs Improvement".
export type ReportObservationType = "Needs Improvement" | "Positive";

export type ReportObservation = {
  id: string;
  // Legacy single-image fields — kept for backward compatibility and as the
  // cover thumbnail. New reports populate `images` instead.
  imageUrl?: string;
  imagePath?: string;
  images?: ReportObservationImage[];
  // Observation kind. Legacy records omit this and are treated as issues.
  type: ReportObservationType;
  description: string;
  // Corrective action — only meaningful for "Needs Improvement" observations.
  recommendation: string;
  // Only meaningful for "Needs Improvement"; positives keep a value but ignore it.
  priority: ReportPriority;
  // Optional "Good Practice" note shown only on positive observations.
  positiveNote?: string;
};

// Normalizes an observation's type, transparently upgrading legacy records
// (which have no `type`) to "Needs Improvement" so they keep their old look.
export function getObservationType(o: {
  type?: ReportObservationType | string;
}): ReportObservationType {
  return o && o.type === "Positive" ? "Positive" : "Needs Improvement";
}

// Normalizes an observation's images into a single ordered list, transparently
// upgrading legacy single-image records (imageUrl/imagePath) to the new shape.
export function getObservationImages(
  o: Pick<ReportObservation, "images" | "imageUrl" | "imagePath">
): ReportObservationImage[] {
  if (Array.isArray(o.images) && o.images.length > 0) {
    return o.images.filter((im) => im && typeof im.url === "string" && im.url);
  }
  if (o.imageUrl) {
    return [{ url: o.imageUrl, path: o.imagePath }];
  }
  return [];
}

export type Report = {
  id: string;
  reportNumber: string;
  title: string;
  branchName: ReportBranch | string;
  visitDate: string;
  preparedBy: string;
  status: ReportStatus;
  priority: ReportPriority;
  observations: ReportObservation[];
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  createdByName: string;
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
};

export const REPORT_STATUSES: ReportStatus[] = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Action Required",
  "Closed",
];

// Per-observation priority options (unchanged — no "Positive" here; a positive
// observation is expressed via its type, not its priority).
export const REPORT_PRIORITIES: ReportPriority[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

// Report-level "Overall Priority" options — includes "Positive" so an entire
// visit can be flagged as a good/positive outcome.
export const REPORT_OVERALL_PRIORITIES: ReportPriority[] = [
  "Positive",
  "Low",
  "Medium",
  "High",
  "Critical",
];

export const REPORT_OBSERVATION_TYPES: ReportObservationType[] = [
  "Needs Improvement",
  "Positive",
];

export const REPORT_BRANCHES: ReportBranch[] = [
  "PS Muraqqabat",
  "PS Karama",
];

export const COMPANY_NAME = "Emirates International Holdings Group";
export const SYSTEM_NAME = "Employee Work Management Portal";

export type ThemeMode = "light" | "dark";

type ThemePalette = {
  pageBackground: string;
  shellText: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  softCardBackground: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonSecondaryBorder: string;
  dangerBg: string;
  dangerText: string;
  dangerBorder: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  inputPlaceholder: string;
  tabActiveBg: string;
  tabActiveText: string;
  tabActiveBorder: string;
  tabInactiveBg: string;
  tabInactiveText: string;
  tabInactiveBorder: string;
  title: string;
  mutedText: string;
  subtleText: string;
  emptyBg: string;
  emptyBorder: string;
  brandLogoBg: string;
  toastShadow: string;
  modalOverlay: string;
  fileCardBg: string;
  fileCardBorder: string;
  skeletonA: string;
  skeletonB: string;
};

const lightTheme: ThemePalette = {
  pageBackground: "linear-gradient(180deg, #f8fafc 0%, #f8fafc 45%, #eef2ff 100%)",
  shellText: "#111827",
  cardBackground: "rgba(255,255,255,0.94)",
  cardBorder: "#e5e7eb",
  cardShadow: "0 16px 38px rgba(15,23,42,0.07)",
  softCardBackground: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
  buttonPrimaryBg: "#111827",
  buttonPrimaryText: "#ffffff",
  buttonSecondaryBg: "#ffffff",
  buttonSecondaryText: "#111827",
  buttonSecondaryBorder: "#d1d5db",
  dangerBg: "#fff1f2",
  dangerText: "#b91c1c",
  dangerBorder: "#fecaca",
  inputBg: "#ffffff",
  inputText: "#111827",
  inputBorder: "#d1d5db",
  inputPlaceholder: "#9ca3af",
  tabActiveBg: "#111827",
  tabActiveText: "#ffffff",
  tabActiveBorder: "#111827",
  tabInactiveBg: "#ffffff",
  tabInactiveText: "#111827",
  tabInactiveBorder: "#d1d5db",
  title: "#111827",
  mutedText: "#4b5563",
  subtleText: "#6b7280",
  emptyBg: "#fafafa",
  emptyBorder: "#d1d5db",
  brandLogoBg: "#ffffff",
  toastShadow: "0 18px 40px rgba(15,23,42,0.14)",
  modalOverlay: "rgba(15,23,42,0.35)",
  fileCardBg: "#f9fafb",
  fileCardBorder: "#e5e7eb",
  skeletonA: "#f3f4f6",
  skeletonB: "#e5e7eb",
};

const darkTheme: ThemePalette = {
  pageBackground: "linear-gradient(180deg, #0b1120 0%, #0f172a 45%, #111827 100%)",
  shellText: "#f9fafb",
  cardBackground: "rgba(17,24,39,0.94)",
  cardBorder: "#374151",
  cardShadow: "0 18px 40px rgba(0,0,0,0.34)",
  softCardBackground: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  buttonPrimaryBg: "#f9fafb",
  buttonPrimaryText: "#111827",
  buttonSecondaryBg: "#111827",
  buttonSecondaryText: "#f9fafb",
  buttonSecondaryBorder: "#4b5563",
  dangerBg: "#3f1d24",
  dangerText: "#fecdd3",
  dangerBorder: "#7f1d1d",
  inputBg: "#0f172a",
  inputText: "#f9fafb",
  inputBorder: "#4b5563",
  inputPlaceholder: "#9ca3af",
  tabActiveBg: "#f9fafb",
  tabActiveText: "#111827",
  tabActiveBorder: "#f9fafb",
  tabInactiveBg: "#111827",
  tabInactiveText: "#f9fafb",
  tabInactiveBorder: "#4b5563",
  title: "#f9fafb",
  mutedText: "#d1d5db",
  subtleText: "#9ca3af",
  emptyBg: "#111827",
  emptyBorder: "#4b5563",
  brandLogoBg: "#ffffff",
  toastShadow: "0 18px 40px rgba(0,0,0,0.38)",
  modalOverlay: "rgba(2,6,23,0.68)",
  fileCardBg: "#0f172a",
  fileCardBorder: "#374151",
  skeletonA: "#1f2937",
  skeletonB: "#374151",
};

export function getThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("portal-theme", mode);
  document.documentElement.dataset.theme = mode;
}

export function getThemePalette(): ThemePalette {
  return getThemeMode() === "dark" ? darkTheme : lightTheme;
}

export function pageStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    minHeight: "100vh",
    background: theme.pageBackground,
    padding: 24,
    color: theme.shellText,
    transition: "background 0.25s ease, color 0.25s ease",
  };
}

export function dashboardWrapperStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    display: "flex",
    minHeight: "100vh",
    background: theme.pageBackground,
    color: theme.shellText,
  };
}

export function sidebarStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    width: 240,
    minWidth: 240,
    background: theme.cardBackground,
    borderRight: `1px solid ${theme.cardBorder}`,
    display: "flex",
    flexDirection: "column",
    padding: "20px 12px",
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    overflowY: "auto",
    zIndex: 50,
    boxShadow: "2px 0 16px rgba(15,23,42,0.05)",
  };
}

export function sidebarContentStyle(): React.CSSProperties {
  return {
    marginLeft: 240,
    flex: 1,
    padding: "36px 32px 52px 32px",
    minHeight: "100vh",
  };
}

export function navItemStyle(active: boolean): React.CSSProperties {
  const theme = getThemePalette();
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    background: active
      ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
      : "transparent",
    color: active ? "#ffffff" : theme.mutedText,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    textAlign: "left",
    transition: "all 0.18s ease",
    boxShadow: active ? "0 4px 14px rgba(99,102,241,0.28)" : "none",
  };
}

export function navBadgeStyle(activeItem: boolean): React.CSSProperties {
  return {
    marginLeft: "auto",
    background: activeItem ? "rgba(255,255,255,0.28)" : "#ef4444",
    color: "#ffffff",
    borderRadius: 999,
    padding: "1px 7px",
    fontSize: 11,
    fontWeight: 800,
    minWidth: 20,
    textAlign: "center",
  };
}

export function shellStyle(maxWidth = 1280): React.CSSProperties {
  return {
    maxWidth,
    margin: "0 auto",
  };
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export function MobileBottomNav({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { id: string; label: string; icon: string; badge?: number }[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const theme = getThemePalette();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Up to 5 tabs fit comfortably on a phone. Beyond that, surface the first
  // 4 in the bar and tuck the rest into a "More" bottom sheet.
  const MAX_PRIMARY = 4;
  const primary = tabs.length <= 5 ? tabs : tabs.slice(0, MAX_PRIMARY);
  const secondary = tabs.length <= 5 ? [] : tabs.slice(MAX_PRIMARY);

  const moreBadgeTotal = secondary.reduce(
    (n, t) => n + (t.badge || 0),
    0
  );
  const moreActive = secondary.some((t) => t.id === activeTab);

  const renderTab = (
    tab: { id: string; label: string; icon: string; badge?: number },
    active: boolean,
    onClick: () => void,
    options?: { compactLabel?: boolean }
  ) => (
    <button
      key={tab.id}
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 2px",
        position: "relative",
        minWidth: 0,
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 28,
            height: 3,
            borderRadius: "0 0 4px 4px",
            background: "#6366f1",
          }}
        />
      )}
      <div style={{ position: "relative", display: "inline-flex" }}>
        <span style={{ fontSize: 20 }}>{tab.icon}</span>
        {tab.badge ? (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -6,
              background: "#ef4444",
              color: "#fff",
              borderRadius: 999,
              fontSize: 9,
              fontWeight: 900,
              padding: "1px 4px",
              minWidth: 14,
              textAlign: "center",
            }}
          >
            {tab.badge > 99 ? "99+" : tab.badge}
          </span>
        ) : null}
      </div>
      <span
        style={{
          fontSize: options?.compactLabel ? 9 : 10,
          fontWeight: active ? 800 : 600,
          color: active ? "#6366f1" : theme.subtleText,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {tab.label}
      </span>
    </button>
  );

  return (
    <>
      <nav
        className="portal-bottom-nav"
        style={{
          background: theme.cardBackground,
          borderTop: `1px solid ${theme.cardBorder}`,
        }}
      >
        {primary.map((tab) =>
          renderTab(tab, tab.id === activeTab, () => onTabChange(tab.id))
        )}
        {secondary.length > 0 && (
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 2px",
              position: "relative",
              minWidth: 0,
            }}
          >
            {moreActive && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 28,
                  height: 3,
                  borderRadius: "0 0 4px 4px",
                  background: "#6366f1",
                }}
              />
            )}
            <div style={{ position: "relative", display: "inline-flex" }}>
              <span style={{ fontSize: 20 }}>⋯</span>
              {moreBadgeTotal > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    background: "#ef4444",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 9,
                    fontWeight: 900,
                    padding: "1px 4px",
                    minWidth: 14,
                    textAlign: "center",
                  }}
                >
                  {moreBadgeTotal > 99 ? "99+" : moreBadgeTotal}
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: moreActive ? 800 : 600,
                color: moreActive ? "#6366f1" : theme.subtleText,
              }}
            >
              More
            </span>
          </button>
        )}
      </nav>

      {sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSheetOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              zIndex: 240,
              animation: "fadeInTab 0.18s ease",
            }}
          />
          {/* Sheet */}
          <div
            className="portal-mobile-sheet"
            role="dialog"
            aria-label="More navigation"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 241,
              background: theme.cardBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: "10px 16px calc(28px + env(safe-area-inset-bottom)) 16px",
              boxShadow: "0 -16px 40px rgba(15,23,42,0.18)",
              animation: "slideInNotif 0.22s ease",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                background: theme.cardBorder,
                borderRadius: 999,
                margin: "0 auto 14px auto",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: theme.title,
                  letterSpacing: "-0.01em",
                }}
              >
                More
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: theme.subtleText,
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              {secondary.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onTabChange(tab.id);
                      setSheetOpen(false);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "16px 8px",
                      border: `1px solid ${
                        active ? "#6366f1" : theme.cardBorder
                      }`,
                      borderRadius: 14,
                      background: active
                        ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                        : theme.softCardBackground,
                      color: active ? "#fff" : theme.title,
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1 }}>
                      {tab.icon}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {tab.label}
                    </span>
                    {tab.badge ? (
                      <span
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          background: active ? "#fff" : "#ef4444",
                          color: active ? "#4338ca" : "#fff",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 900,
                          padding: "1px 6px",
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {tab.badge > 99 ? "99+" : tab.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function cardStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    background: theme.cardBackground,
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 24,
    padding: 20,
    boxShadow: theme.cardShadow,
    backdropFilter: "blur(10px)",
    transition: "all 0.22s ease",
  };
}

export function hoverCardStyle(): React.CSSProperties {
  return {
    ...cardStyle(),
    transform: "translateY(0)",
  };
}

export function softCardStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    ...cardStyle(),
    background: theme.softCardBackground,
  };
}

export function buttonStyle(primary = true): React.CSSProperties {
  const theme = getThemePalette();
  return {
    padding: "10px 16px",
    borderRadius: 14,
    border: primary ? "none" : `1px solid ${theme.buttonSecondaryBorder}`,
    background: primary ? theme.buttonPrimaryBg : theme.buttonSecondaryBg,
    color: primary ? theme.buttonPrimaryText : theme.buttonSecondaryText,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    transition: "all 0.2s ease",
    boxShadow: primary ? "0 10px 20px rgba(17,24,39,0.12)" : "none",
  };
}

export function smallButtonStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    padding: "8px 11px",
    borderRadius: 12,
    border: `1px solid ${theme.buttonSecondaryBorder}`,
    background: theme.buttonSecondaryBg,
    color: theme.buttonSecondaryText,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s ease",
  };
}

export function dangerButtonStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    padding: "8px 11px",
    borderRadius: 12,
    border: `1px solid ${theme.dangerBorder}`,
    background: theme.dangerBg,
    color: theme.dangerText,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    transition: "all 0.2s ease",
  };
}

export function tabButtonStyle(active: boolean): React.CSSProperties {
  const theme = getThemePalette();
  return {
    padding: "11px 15px",
    borderRadius: 14,
    border: active
      ? `1px solid ${theme.tabActiveBorder}`
      : `1px solid ${theme.tabInactiveBorder}`,
    background: active ? theme.tabActiveBg : theme.tabInactiveBg,
    color: active ? theme.tabActiveText : theme.tabInactiveText,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
    boxShadow: active ? "0 10px 22px rgba(17,24,39,0.12)" : "none",
  };
}

export function inputStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 14,
    border: `1px solid ${theme.inputBorder}`,
    outline: "none",
    fontSize: 14,
    background: theme.inputBg,
    color: theme.inputText,
    opacity: 1,
    WebkitTextFillColor: theme.inputText,
    boxSizing: "border-box",
    transition: "all 0.2s ease",
  };
}

export function selectStyle(): React.CSSProperties {
  const theme = getThemePalette();
  return {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 12,
    border: `1px solid ${theme.inputBorder}`,
    fontSize: 13,
    background: theme.inputBg,
    color: theme.inputText,
    outline: "none",
  };
}

export function badgeStyle(status: string): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  let bg: string;
  let color: string;
  let border: string;

  if (status === "Approved" || status === "Present") {
    bg = isDark ? "rgba(16,185,129,0.14)" : "#dcfce7";
    color = isDark ? "#34d399" : "#166534";
    border = isDark ? "rgba(16,185,129,0.3)" : "transparent";
  } else if (
    status === "Pending Review" ||
    status === "Assigned" ||
    status === "In Progress" ||
    status === "Pending"
  ) {
    bg = isDark ? "rgba(245,158,11,0.14)" : "#fef3c7";
    color = isDark ? "#fbbf24" : "#92400e";
    border = isDark ? "rgba(245,158,11,0.3)" : "transparent";
  } else if (
    status === "Missing Attachment" ||
    status === "Overdue" ||
    status === "Absent" ||
    status === "Needs Revision"
  ) {
    bg = isDark ? "rgba(239,68,68,0.14)" : "#fee2e2";
    color = isDark ? "#f87171" : "#991b1b";
    border = isDark ? "rgba(239,68,68,0.3)" : "transparent";
  } else if (status === "Submitted") {
    bg = isDark ? "rgba(59,130,246,0.14)" : "#dbeafe";
    color = isDark ? "#60a5fa" : "#1d4ed8";
    border = isDark ? "rgba(59,130,246,0.3)" : "transparent";
  } else {
    bg = isDark ? "rgba(100,116,139,0.14)" : "#f3f4f6";
    color = isDark ? "#94a3b8" : "#111827";
    border = "transparent";
  }

  return {
    display: "inline-block",
    padding: "7px 11px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 800,
    alignSelf: "flex-start",
    border: `1px solid ${border}`,
  };
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const theme = getThemePalette();

  return (
    <h2
      style={{
        fontSize: 22,
        fontWeight: 800,
        marginBottom: 16,
        color: theme.title,
        letterSpacing: "-0.02em",
      }}
    >
      {children}
    </h2>
  );
}

export function StatBox({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  const theme = getThemePalette();

  return (
    <div
      style={{
        ...cardStyle(),
        padding: 18,
        background: theme.softCardBackground,
      }}
    >
      <div style={{ fontSize: 13, color: theme.subtleText, fontWeight: 600 }}>{title}</div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          marginTop: 10,
          color: theme.title,
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 6 }}>{hint}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}) {
  const theme = getThemePalette();

  return (
    <div
      style={{
        border: `1px dashed ${theme.emptyBorder}`,
        borderRadius: 18,
        padding: 32,
        background: theme.emptyBg,
        textAlign: "center",
      }}
    >
      {icon && <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>}
      <div style={{ fontSize: 16, fontWeight: 800, color: theme.title }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 14, color: theme.subtleText, lineHeight: 1.7 }}>
        {description}
      </div>
      {action && (
        <button
          style={{ ...buttonStyle(true), marginTop: 16, display: "inline-block" }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function AvatarInitials({ name, size = 44 }: { name: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients: [string, string][] = [
    ["#6366f1", "#4f46e5"],
    ["#10b981", "#059669"],
    ["#f59e0b", "#d97706"],
    ["#3b82f6", "#2563eb"],
    ["#ec4899", "#db2777"],
    ["#8b5cf6", "#7c3aed"],
    ["#14b8a6", "#0d9488"],
    ["#f97316", "#ea580c"],
  ];
  const [from, to] = gradients[Math.abs(hash) % gradients.length];
  const words = name.trim().split(/\s+/);
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 900,
        color: "#fff",
        letterSpacing: "-0.02em",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <SkeletonBlock height={22} />
        {Array.from({ length: rows - 1 }, (_, i) => (
          <SkeletonBlock key={i} height={14} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonBlock({ height = 20 }: { height?: number }) {
  const theme = getThemePalette();

  return (
    <div
      style={{
        height,
        width: "100%",
        borderRadius: 12,
        background: `linear-gradient(90deg, ${theme.skeletonA} 25%, ${theme.skeletonB} 37%, ${theme.skeletonA} 63%)`,
        backgroundSize: "400% 100%",
        animation: "pulse 1.4s ease infinite",
      }}
    />
  );
}

export function BrandHeader({ subtitle }: { subtitle: string }) {
  const theme = getThemePalette();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <Image
        src="/eihg-logo.jpeg"
        alt="EIHG Logo"
        width={82}
        height={82}
        style={{
          height: 82,
          width: "auto",
          objectFit: "contain",
          borderRadius: 12,
          background: theme.brandLogoBg,
          padding: 6,
          border: `1px solid ${theme.cardBorder}`,
        }}
      />

      <div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: theme.title,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          {COMPANY_NAME}
        </div>

        <div
          style={{
            fontSize: 14,
            color: theme.subtleText,
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

export function Toast({
  type,
  message,
  onClose,
}: {
  type: ToastType;
  message: string;
  onClose: () => void;
}) {
  const baseTheme = getThemePalette();

  const styles: Record<ToastType, { bg: string; color: string; border: string }> = {
    success: { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
    error: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    info: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  };

  const style = styles[type];

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        minWidth: 280,
        maxWidth: 420,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        borderRadius: 16,
        boxShadow: baseTheme.toastShadow,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{message}</div>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: style.color,
            fontWeight: 900,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState;
  onClose: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const theme = getThemePalette();

  useEffect(() => {
    setProcessing(false);
  }, [state.open, state.title]);

  if (!state.open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: theme.modalOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001,
        padding: 20,
      }}
    >
      <div style={{ ...cardStyle(), maxWidth: 460, width: "100%" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: theme.title }}>{state.title}</div>
        <div style={{ marginTop: 10, color: theme.mutedText, lineHeight: 1.8, fontSize: 14 }}>
          {state.message}
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={buttonStyle(false)} onClick={onClose} disabled={processing}>
            Cancel
          </button>
          <button
            style={dangerButtonStyle()}
            disabled={processing}
            onClick={async () => {
              if (!state.onConfirm) return;
              try {
                setProcessing(true);
                await state.onConfirm();
                onClose();
              } finally {
                setProcessing(false);
              }
            }}
          >
            {processing ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function getDaysUntilDate(dateString: string): number | null {
  if (!dateString) return null;
  const parts = dateString.split("-").map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isDateInRange(dateValue: string, range?: ReportDateRange) {
  if (!range) return true;
  if (!dateValue) return false;
  if (!range.from && !range.to) return true;
  if (range.from && dateValue < range.from) return false;
  if (range.to && dateValue > range.to) return false;
  return true;
}

export function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function getCurrentIsoString() {
  return new Date().toISOString();
}

export function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString();
}

export function formatFilesLabel(files: File[]) {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files.length} files selected`;
}

export function mergeFiles(existingFiles: File[], newFiles: File[]) {
  const merged = [...existingFiles];

  for (const file of newFiles) {
    const alreadyExists = merged.some(
      (item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified
    );

    if (!alreadyExists) {
      merged.push(file);
    }
  }

  return merged;
}

export function normalizeStoredFiles(value: unknown): StorageFile[] {
  if (!Array.isArray(value)) return [];

  return (value as Record<string, unknown>[])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "Unnamed file",
      path: typeof item.path === "string" ? item.path : "",
      type: typeof item.type === "string" ? item.type : "",
    }))
    .filter((item) => !!item.path);
}

export function mapLegacySingleFile(data: unknown): StorageFile[] {
  const d = data as Record<string, unknown> | null | undefined;
  if (d?.attachmentPath) {
    return [
      {
        name: typeof d.attachmentName === "string" ? d.attachmentName : "Attachment",
        path: String(d.attachmentPath),
        type: typeof d.attachmentType === "string" ? d.attachmentType : "",
      },
    ];
  }
  return [];
}

export function mapLegacySingleSubmittedFile(data: unknown): StorageFile[] {
  const d = data as Record<string, unknown> | null | undefined;

  if (d?.submittedFiles && Array.isArray(d.submittedFiles)) {
    return normalizeStoredFiles(d.submittedFiles);
  }

  if (d?.submittedFilePath) {
    return [
      {
        name: typeof d.submittedFileName === "string" ? d.submittedFileName : "Submitted file",
        path: String(d.submittedFilePath),
        type: typeof d.submittedFileType === "string" ? d.submittedFileType : "",
      },
    ];
  }

  if (
    typeof d?.submittedLink === "string" &&
    d.submittedLink.startsWith("submitted-task-files/")
  ) {
    return [
      {
        name: typeof d.submittedFileName === "string" ? d.submittedFileName : "Submitted file",
        path: d.submittedLink,
        type: typeof d.submittedFileType === "string" ? d.submittedFileType : "",
      },
    ];
  }

  return [];
}

export function escHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(value: unknown): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (!/^(https?:|data:image\/)/i.test(raw)) return "";
  return raw
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ALLOWED_UPLOAD_MIME = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);
const ALLOWED_UPLOAD_EXT = new Set<string>([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
]);

function sanitizeFileName(raw: string): string {
  // Strip any path component, keep last segment only
  const base = raw.split(/[\\/]/).pop() || "file";
  // Replace anything that isn't alphanumeric, dot, dash, underscore
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Collapse repeated underscores / dots, strip leading dots (no hidden files)
  const collapsed = cleaned.replace(/_+/g, "_").replace(/^\.+/, "");
  // Cap total length so paths stay reasonable
  const trimmed = collapsed.slice(0, 120);
  return trimmed || "file";
}

export async function uploadFilesToStorage(
  baseFolder: string,
  ownerId: string,
  files: File[]
) {
  const uploadedFiles: StorageFile[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `File "${file.name}" is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`
      );
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const mime = (file.type || "").toLowerCase();
    // Accept any image/* or text/* by category, plus our allow-listed document MIMEs and extensions
    const typeOk =
      mime.startsWith("image/") ||
      mime.startsWith("text/") ||
      ALLOWED_UPLOAD_MIME.has(mime);
    const extOk = ext && ALLOWED_UPLOAD_EXT.has(ext);
    if (!typeOk && !extOk) {
      throw new Error(
        `File "${file.name}" has an unsupported type. Allowed: images, PDF, Word, Excel, PowerPoint, CSV, TXT.`
      );
    }

    const safeName = sanitizeFileName(file.name);
    const filePath = `${baseFolder}/${ownerId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safeName}`;
    const fileRef = ref(storage, filePath);
    await uploadBytes(fileRef, file);
    uploadedFiles.push({
      name: safeName,
      path: filePath,
      type: file.type || "",
    });
  }

  return uploadedFiles;
}

export async function openStorageFile(path?: string, fallbackLink?: string) {
  if (path) {
    const fileRef = ref(storage, path);
    const url = await getDownloadURL(fileRef);
    window.open(url, "_blank");
    return;
  }

  if (fallbackLink) {
    window.open(fallbackLink, "_blank");
  }
}

export function FileList({
  files,
  emptyText,
}: {
  files: StorageFile[];
  emptyText: string;
}) {
  const theme = getThemePalette();

  if (files.length === 0) {
    return <div style={{ color: theme.subtleText, fontSize: 13 }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {files.map((file, index) => (
        <div
          key={`${file.path}-${index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            background: theme.fileCardBg,
            border: `1px solid ${theme.fileCardBorder}`,
            borderRadius: 14,
            padding: "10px 12px",
            transition: "all 0.2s ease",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: theme.title,
              fontWeight: 600,
              wordBreak: "break-word",
            }}
          >
            {file.name}
          </div>
          <button style={smallButtonStyle()} onClick={() => openStorageFile(file.path)}>
            Open
          </button>
        </div>
      ))}
    </div>
  );
}

export function SelectedFilesPreview({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  const theme = getThemePalette();

  if (files.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            background: theme.fileCardBg,
            border: `1px solid ${theme.fileCardBorder}`,
            borderRadius: 14,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: theme.title,
              fontWeight: 600,
              wordBreak: "break-word",
            }}
          >
            {file.name}
          </div>
          <button style={dangerButtonStyle()} onClick={() => onRemove(index)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

export function WorkCard({
  item,
  isAdmin,
  onUpdateStatus,
  onDeleteWork,
  initialExpanded,
  detailsOnly,
}: {
  item: WorkItem;
  isAdmin?: boolean;
  onUpdateStatus?: (id: string, status: WorkStatus) => void;
  onDeleteWork?: (id: string) => void;
  initialExpanded?: boolean;
  detailsOnly?: boolean;
}) {
  const theme = getThemePalette();
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded ?? false);

  const detailsContent = (
    <div style={{
      ...(detailsOnly ? {} : { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.cardBorder}` }),
      display: "grid",
      gap: 14,
    }}>
      {/* Metadata grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Category", value: item.category || "—", icon: "🏷" },
          { label: "Department", value: item.department || "—", icon: "🏢" },
          { label: "Date", value: item.date || "—", icon: "📅" },
          { label: "Employee", value: item.employeeName || "—", icon: "👤" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: theme.softCardBackground,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 10,
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: 10, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {icon} {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div style={{
        background: theme.softCardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          📝 Notes
        </div>
        <div style={{ fontSize: 14, color: theme.mutedText, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {item.notes || <span style={{ color: theme.subtleText, fontStyle: "italic" }}>No notes provided.</span>}
        </div>
      </div>

      {/* Attachment(s) */}
      {item.attachments && item.attachments.length > 0 ? (
        <div style={{
          background: theme.softCardBackground,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            📎 Attachments
          </div>
          <FileList files={item.attachments} emptyText="No attachments uploaded." />
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: theme.softCardBackground,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          padding: "10px 14px",
          gap: 10, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 18 }}>📎</div>
            <div>
              <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Attachment</div>
              <div style={{ fontSize: 13, color: theme.mutedText, marginTop: 1 }}>
                {item.attachmentName || "No attachment uploaded"}
              </div>
            </div>
          </div>
          {(item.attachmentPath || item.attachmentLink) && (
            <button
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700,
              }}
              onClick={() => openStorageFile(item.attachmentPath, item.attachmentLink)}
            >
              Open File ↗
            </button>
          )}
        </div>
      )}

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            style={{ ...selectStyle(), flex: "1 1 160px", maxWidth: 220 }}
            value={item.status}
            onChange={(e) => onUpdateStatus?.(item.id, e.target.value as WorkStatus)}
          >
            <option value="Pending Review">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Missing Attachment">Missing Attachment</option>
          </select>
          <button
            style={{
              padding: "7px 16px", borderRadius: 8,
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBackground, color: "#ef4444",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
            }}
            onClick={() => onDeleteWork?.(item.id)}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );

  if (detailsOnly) {
    return detailsContent;
  }

  const statusColor =
    item.status === "Approved" ? "#10b981"
    : item.status === "Pending Review" ? "#f59e0b"
    : item.status === "Missing Attachment" ? "#ef4444"
    : "#6366f1";

  const statusIcon =
    item.status === "Approved" ? "✅"
    : item.status === "Pending Review" ? "⏳"
    : item.status === "Missing Attachment" ? "📎"
    : "🔨";

  return (
    <div
      style={{
        background: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderLeft: `4px solid ${statusColor}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "box-shadow 0.15s ease",
        boxShadow: hovered ? "0 4px 20px rgba(0,0,0,0.09)" : theme.cardShadow,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${statusColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
          {statusIcon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
          <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
            {[item.category, item.date].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: (badgeStyle(item.status) as React.CSSProperties).background as string, color: (badgeStyle(item.status) as React.CSSProperties).color as string, border: (badgeStyle(item.status) as React.CSSProperties).border as string, whiteSpace: "nowrap" as const }}>{item.status}</span>
          <button
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.fileCardBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, transition: "all 0.15s ease", flexShrink: 0, color: theme.mutedText }}
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? "Hide details" : "View details"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: "14px 16px" }}>
          {detailsContent}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  isAdmin,
  onSubmitTask,
  onApproveTask,
  onReturnForRevision,
  onDeleteTask,
  showToast,
  initialExpanded,
  detailsOnly,
}: {
  task: AssignedTask;
  isAdmin?: boolean;
  onSubmitTask?: (id: string, submittedNotes: string, submittedFiles: File[]) => Promise<void>;
  onApproveTask?: (id: string) => Promise<void>;
  onReturnForRevision?: (id: string, note: string) => Promise<void>;
  onDeleteTask?: (id: string) => void;
  showToast?: (type: ToastType, message: string) => void;
  initialExpanded?: boolean;
  detailsOnly?: boolean;
}) {
  const theme = getThemePalette();
  const isMobile = useIsMobile();
  const [submittedNotes, setSubmittedNotes] = useState(task.submittedNotes || "");
  const [submittedFilesInput, setSubmittedFilesInput] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [revisionNote, setRevisionNote] = useState(task.reviewNote || "");
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded ?? false);

  const isOverdue =
    !!task.deadline &&
    new Date(task.deadline) < new Date(getTodayDateString()) &&
    task.status !== "Approved" &&
    task.status !== "Submitted";

  const displayStatus: TaskStatus = isOverdue ? "Overdue" : task.status;

  const handleSubmit = async () => {
    if (!onSubmitTask) return;

    try {
      setSubmitting(true);
      await onSubmitTask(task.id, submittedNotes, submittedFilesInput);
      setSubmittedFilesInput([]);
      showToast?.("success", "Task submitted successfully.");
    } catch (error) {
      console.error(error);
      showToast?.("error", "Error submitting task.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnForRevision = async () => {
    if (!onReturnForRevision) return;

    if (!revisionNote.trim()) {
      showToast?.("error", "Please enter a revision note first.");
      return;
    }

    try {
      setReturning(true);
      await onReturnForRevision(task.id, revisionNote.trim());
      showToast?.("success", "Task returned to employee for revision.");
    } catch (error) {
      console.error(error);
      showToast?.("error", "Error returning task for revision.");
    } finally {
      setReturning(false);
    }
  };

  const taskDetailsContent = (
    <div style={{
      ...(detailsOnly ? {} : { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.cardBorder}` }),
      display: "grid",
      gap: 14,
    }}>
      {/* Metadata grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Employee",  value: task.employeeName || "—",              icon: "👤" },
          { label: "Deadline",  value: task.deadline || "No deadline",         icon: "📅" },
          { label: "Email",     value: task.employeeEmail || "—",              icon: "📧" },
          { label: "Status",    value: displayStatus,                          icon: "⚡" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: theme.softCardBackground,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 10,
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: 10, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {icon} {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div style={{
        background: theme.softCardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          📄 Description
        </div>
        <div style={{ fontSize: 14, color: theme.mutedText, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {task.description || <span style={{ color: theme.subtleText, fontStyle: "italic" }}>No description provided.</span>}
        </div>
      </div>

      {/* Submitted notes */}
      {task.submittedNotes && (
        <div style={{
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 10,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            📝 Submitted Notes
          </div>
          <div style={{ fontSize: 14, color: theme.mutedText, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {task.submittedNotes}
          </div>
        </div>
      )}

      {/* Revision note */}
      {task.reviewNote && (
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 10,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            ⚠️ Revision Note
          </div>
          <div style={{ fontSize: 14, color: "#b45309", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {task.reviewNote}
          </div>
        </div>
      )}

      {/* Task attachments */}
      <div style={{
        background: theme.softCardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          📎 Task Attachments
        </div>
        <FileList files={task.attachments || []} emptyText="No task attachments uploaded." />
      </div>

      {/* Submitted files */}
      {task.submittedFiles?.length > 0 && (
        <div style={{
          background: "rgba(16,185,129,0.06)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: 10,
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: "#10b981", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            📤 Submitted Files
          </div>
          <FileList files={task.submittedFiles} emptyText="No submitted files." />
        </div>
      )}

      {/* Employee submit form */}
      {!isAdmin && task.status !== "Approved" && task.status !== "Submitted" && (
        <div style={{
          background: theme.softCardBackground,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          padding: "14px",
          display: "grid",
          gap: 10,
        }}>
          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            📤 Submit Task
          </div>
          <textarea
            style={{ ...inputStyle(), minHeight: 88, resize: "vertical" }}
            placeholder="Write notes for this submission"
            value={submittedNotes}
            onChange={(e) => setSubmittedNotes(e.target.value)}
          />
          <div>
            <input
              type="file"
              multiple
              style={inputStyle()}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                setSubmittedFilesInput((prev) => [...prev, ...picked]);
                e.target.value = "";
              }}
            />
            <SelectedFilesPreview
              files={submittedFilesInput}
              onRemove={(index) =>
                setSubmittedFilesInput((prev) => prev.filter((_, i) => i !== index))
              }
            />
          </div>
          <button
            style={{ ...buttonStyle(true), opacity: submitting ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Task"}
          </button>
        </div>
      )}

      {/* Admin approve / return */}
      {isAdmin && task.status === "Submitted" && (
        <div style={{
          background: theme.softCardBackground,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          padding: "14px",
          display: "grid",
          gap: 10,
        }}>
          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ⚙️ Admin Actions
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: returning ? 0.7 : 1 }}
              onClick={() => onApproveTask?.(task.id)}
              disabled={returning}
            >
              ✓ Approve
            </button>
            <button
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: returning ? 0.7 : 1 }}
              onClick={handleReturnForRevision}
              disabled={returning}
            >
              {returning ? "Returning…" : "↩ Return for Revision"}
            </button>
          </div>
          <textarea
            style={{ ...inputStyle(), minHeight: 80, resize: "vertical" }}
            placeholder="Write revision note to send the task back to the employee"
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
          />
        </div>
      )}

      {/* Admin delete */}
      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBackground, color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            onClick={() => onDeleteTask?.(task.id)}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );

  if (detailsOnly) {
    return taskDetailsContent;
  }

  return (
    <div
      style={{
        ...hoverCardStyle(),
        padding: 16,
        borderRadius: 18,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 18px 38px rgba(15,23,42,0.10)"
          : "0 10px 30px rgba(15,23,42,0.06)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.title }}>{task.title}</div>

          <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span>{task.employeeName} • Deadline: {task.deadline || "No deadline"}</span>
            {task.deadline && task.status !== "Approved" && (() => {
              const days = getDaysUntilDate(task.deadline);
              if (days === null) return null;
              const over = days < 0;
              const soon = days >= 0 && days <= 3;
              return (
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  background: over ? "rgba(239,68,68,0.14)" : soon ? "rgba(245,158,11,0.14)" : "rgba(16,185,129,0.12)",
                  color: over ? "#f87171" : soon ? "#fbbf24" : "#34d399",
                  border: `1px solid ${over ? "rgba(239,68,68,0.3)" : soon ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.25)"}`,
                }}>
                  {over ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                </span>
              );
            })()}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: isMobile ? 0 : 220, flexShrink: 0 }}>
          <span style={badgeStyle(displayStatus)}>{displayStatus}</span>
          <button style={smallButtonStyle()} onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? "Hide Details" : "View Details"}
          </button>
        </div>
      </div>

      {expanded && taskDetailsContent}
    </div>
  );
}

export function AttendanceCard({
  record,
  isAdmin,
  onUpdateAttendanceStatus,
  onDeleteAttendance,
}: {
  record: AttendanceRecord;
  isAdmin?: boolean;
  onUpdateAttendanceStatus?: (id: string, status: AttendanceStatus) => void;
  onDeleteAttendance?: (record: AttendanceRecord) => void;
}) {
  const theme = getThemePalette();
  const [hovered, setHovered] = useState(false);

  const canManageAttendance = !!isAdmin && (!!onUpdateAttendanceStatus || !!onDeleteAttendance);

  return (
    <div
      style={{
        ...hoverCardStyle(),
        padding: 16,
        borderRadius: 18,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 18px 38px rgba(15,23,42,0.10)"
          : "0 10px 30px rgba(15,23,42,0.06)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.title }}>
            {record.employeeName}
          </div>

          <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 8 }}>
            {record.department} • {record.date}
          </div>

          <div style={{ marginTop: 12, fontSize: 14, color: theme.mutedText, lineHeight: 1.8 }}>
            <div>
              <strong>Check In:</strong> {formatDateTime(record.checkIn)}
            </div>
            <div>
              <strong>Check Out:</strong> {record.checkOut ? formatDateTime(record.checkOut) : "-"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <span style={badgeStyle(record.status)}>{record.status}</span>

          {canManageAttendance && (
            <>
              {onUpdateAttendanceStatus && (
                <select
                  style={selectStyle()}
                  value={record.status}
                  onChange={(e) =>
                    onUpdateAttendanceStatus(record.id, e.target.value as AttendanceStatus)
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                </select>
              )}

              {onDeleteAttendance && (
                <button style={dangerButtonStyle()} onClick={() => onDeleteAttendance(record)}>
                  Delete Attendance
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function getEmployeeReportData(
  employee: Employee,
  works: WorkItem[],
  tasks: AssignedTask[],
  attendance: AttendanceRecord[],
  range?: ReportDateRange
): EmployeeReportData {
  const approvedTasks = tasks.filter(
    (task) =>
      task.status === "Approved" &&
      (task.employeeUid === employee.uid ||
        task.employeeEmail.toLowerCase() === employee.email.toLowerCase())
  );

  const approvedWorks = works.filter(
    (work) =>
      work.status === "Approved" &&
      (work.employeeUid === employee.uid ||
        work.employeeEmail.toLowerCase() === employee.email.toLowerCase()) &&
      isDateInRange(work.date, range)
  );

  const activeTasks = tasks.filter(
    (task) =>
      (task.status === "Assigned" ||
        task.status === "In Progress" ||
        task.status === "Needs Revision") &&
      (task.employeeUid === employee.uid ||
        task.employeeEmail.toLowerCase() === employee.email.toLowerCase())
  );

  const submittedTasks = tasks.filter(
    (task) =>
      task.status === "Submitted" &&
      (task.employeeUid === employee.uid ||
        task.employeeEmail.toLowerCase() === employee.email.toLowerCase())
  );

  const pendingWorks = works.filter(
    (work) =>
      work.status !== "Approved" &&
      (work.employeeUid === employee.uid ||
        work.employeeEmail.toLowerCase() === employee.email.toLowerCase()) &&
      isDateInRange(work.date, range)
  );

  const employeeAttendance = attendance.filter(
    (record) =>
      (record.employeeUid === employee.uid ||
        record.employeeEmail.toLowerCase() === employee.email.toLowerCase()) &&
      isDateInRange(record.date, range)
  );

  const summary = `${employee.name} has ${approvedTasks.length + approvedWorks.length} approved item(s), ${activeTasks.length} active task(s), ${submittedTasks.length + pendingWorks.length} item(s) still under review, and ${employeeAttendance.length} attendance record(s) in the selected range.`;

  return {
    approvedTasks,
    approvedWorks,
    activeTasks,
    submittedTasks,
    pendingWorks,
    employeeAttendance,
    summary,
  };
}

export function downloadEmployeeReportAsPrintPage(
  employee: Employee,
  report: EmployeeReportData,
  range?: ReportDateRange,
  photoUrl?: string
) {
  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) return;

  const approvedItems = report.approvedTasks.length + report.approvedWorks.length;
  const reviewItems = report.submittedTasks.length + report.pendingWorks.length;
  const presentCount = report.employeeAttendance.filter(r => r.status === "Present").length;
  const absentCount = report.employeeAttendance.filter(r => r.status === "Absent").length;
  const reportId = `EMP-${Date.now().toString().slice(-6)}`;

  const taskStatusBadge = (status: string) => {
    const map: Record<string, string> = { "Approved": "badge-approved", "Submitted": "badge-pending", "Active": "badge-active", "Pending": "badge-pending" };
    return `<span class="badge ${map[status] || "badge-pending"}">${escHtml(status)}</span>`;
  };
  const attBadge = (status: string) => {
    const map: Record<string, string> = { "Present": "badge-present", "Absent": "badge-absent", "Pending": "badge-pending" };
    return `<span class="badge ${map[status] || "badge-pending"}">${escHtml(status)}</span>`;
  };

  popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>HR Report — ${escHtml(employee.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f8fafc}
    .page{max-width:960px;margin:0 auto;padding:40px 32px}
    /* Header */
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #0f1c35;margin-bottom:26px}
    .brand-box{display:flex;align-items:center;gap:14px}
    .brand-icon{background:#0f1c35;border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;line-height:1.1}
    .brand-icon .b1{font-size:16px;font-weight:900;color:#F0C040;letter-spacing:.03em}
    .brand-icon .b2{font-size:9px;font-weight:700;color:#F0C040;letter-spacing:.12em;opacity:.85}
    .company{font-size:20px;font-weight:900;color:#0f1c35}
    .company-sub{font-size:12px;color:#6b7280;margin-top:3px;font-weight:500}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    /* Profile card */
    .profile-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:24px}
    .profile-banner{height:7px;background:linear-gradient(90deg,#0f1c35,#1b2a4a,#F0C040)}
    .profile-body{padding:20px 24px;display:flex;gap:20px;align-items:center}
    .avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0f1c35,#1b2a4a);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#F0C040;flex-shrink:0;border:3px solid #F0C040;overflow:hidden}
    .avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}
    .profile-info{flex:1}
    .profile-name{font-size:22px;font-weight:900;color:#0f1c35}
    .profile-role{font-size:13px;color:#6b7280;margin-top:3px}
    .profile-email{font-size:12px;color:#6b7280;margin-top:2px}
    .profile-range{font-size:12px;color:#6b7280;margin-top:2px}
    /* Stats tiles */
    .tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:24px}
    .tile{border-radius:10px;padding:14px 12px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:22px;font-weight:900}
    .tile-sub{font-size:10px;margin-top:3px;opacity:.75}
    .tile-approved{background:#e8f0fe;color:#0f1c35}
    .tile-active{background:#dbeafe;color:#1d4ed8}
    .tile-review{background:#fef3c7;color:#92400e}
    .tile-present{background:#dcfce7;color:#166534}
    .tile-absent{background:#fee2e2;color:#991b1b}
    /* Summary */
    .summary-box{background:#f5f3e8;border:1px solid #c9a520;border-left:4px solid #0f1c35;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#0f1c35;line-height:1.7}
    /* Section */
    .section{margin-bottom:26px}
    .section-title{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0f1c35;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #0f1c35;display:flex;align-items:center;gap:8px}
    .section-count{background:#0f1c35;color:#F0C040;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700}
    /* Tables */
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px}
    thead tr{background:#0f1c35}
    thead th{padding:9px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.04em;color:#F0C040}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody tr:nth-child(odd){background:#fff}
    tbody td{padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151}
    .empty-row td{text-align:center;color:#9ca3af;padding:16px;font-style:italic}
    /* Badges */
    .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800}
    .badge-approved{background:#dcfce7;color:#166534}
    .badge-active{background:#dbeafe;color:#1d4ed8}
    .badge-pending{background:#fef3c7;color:#92400e}
    .badge-present{background:#dcfce7;color:#166534}
    .badge-absent{background:#fee2e2;color:#991b1b}
    /* Footer */
    .footer{margin-top:32px;padding-top:14px;border-top:2px solid #0f1c35;display:flex;justify-content:space-between;font-size:11px;color:#6b7280}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#0f1c35,#1b2a4a);color:#F0C040;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:0.01em">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #0f1c35;background:#fff;color:#0f1c35;cursor:pointer;font-size:13px;font-weight:700">🖨 Print</button>
  <span style="margin-left:4px;font-size:11px;color:#9ca3af">This button is hidden when printing</span>
</div>
<div class="page">

  <div class="header">
    <div class="brand-box">
      <div class="brand-icon">
        <span class="b1">EIHG</span>
        <span class="b2">PORTAL</span>
      </div>
      <div>
        <div class="company">Emirates International Holdings Group</div>
        <div class="company-sub">Human Resources — Employee Performance Report</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>Report ID:</strong> ${reportId}<br/>
      <strong>Generated:</strong> ${new Date().toLocaleString()}<br/>
      <strong>Prepared by:</strong> HR Administration
    </div>
  </div>

  <div class="profile-card">
    <div class="profile-banner"></div>
    <div class="profile-body">
      <div class="avatar">${(photoUrl || employee.profilePhotoUrl) ? `<img src="${safeUrl(photoUrl || employee.profilePhotoUrl)}" alt="${escHtml(employee.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'"/>` : escHtml(employee.name.charAt(0).toUpperCase())}</div>
      <div class="profile-info">
        <div class="profile-name">${escHtml(employee.name)}</div>
        <div class="profile-role">${escHtml(employee.position)} &nbsp;·&nbsp; ${escHtml(employee.department)}</div>
        <div class="profile-email">✉ ${escHtml(employee.email)}</div>
        ${range?.from || range?.to ? `<div class="profile-range">📅 Report Range: ${escHtml(range?.from || "—")} to ${escHtml(range?.to || "—")}</div>` : ""}
      </div>
    </div>
  </div>

  <div class="tiles">
    <div class="tile tile-approved">
      <div class="tile-label">Approved</div>
      <div class="tile-value">${approvedItems}</div>
      <div class="tile-sub">tasks + works</div>
    </div>
    <div class="tile tile-active">
      <div class="tile-label">Active Tasks</div>
      <div class="tile-value">${report.activeTasks.length}</div>
      <div class="tile-sub">in progress</div>
    </div>
    <div class="tile tile-review">
      <div class="tile-label">Under Review</div>
      <div class="tile-value">${reviewItems}</div>
      <div class="tile-sub">awaiting approval</div>
    </div>
    <div class="tile tile-present">
      <div class="tile-label">Present</div>
      <div class="tile-value">${presentCount}</div>
      <div class="tile-sub">attendance days</div>
    </div>
    <div class="tile tile-absent">
      <div class="tile-label">Absent</div>
      <div class="tile-value">${absentCount}</div>
      <div class="tile-sub">attendance days</div>
    </div>
  </div>

  <div class="summary-box">📋 ${escHtml(report.summary)}</div>

  <div class="section">
    <div class="section-title">✅ Approved Tasks <span class="section-count">${report.approvedTasks.length}</span></div>
    <table>
      <thead><tr><th>#</th><th>Task Title</th><th>Deadline</th><th>Status</th></tr></thead>
      <tbody>
        ${report.approvedTasks.length > 0 ? report.approvedTasks.map((t, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
          <td style="font-weight:600">${escHtml(t.title)}</td>
          <td>${escHtml(t.deadline || "—")}</td>
          <td>${taskStatusBadge(t.status)}</td>
        </tr>`).join("") : `<tr class="empty-row"><td colspan="4">No approved tasks in this range</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">🔨 Approved Works <span class="section-count">${report.approvedWorks.length}</span></div>
    <table>
      <thead><tr><th>#</th><th>Work Title</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>
        ${report.approvedWorks.length > 0 ? report.approvedWorks.map((w, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
          <td style="font-weight:600">${escHtml(w.title)}</td>
          <td>${escHtml(w.date || "—")}</td>
          <td>${taskStatusBadge(w.status)}</td>
        </tr>`).join("") : `<tr class="empty-row"><td colspan="4">No approved works in this range</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">📋 Active Tasks <span class="section-count">${report.activeTasks.length}</span></div>
    <table>
      <thead><tr><th>#</th><th>Task Title</th><th>Deadline</th><th>Status</th></tr></thead>
      <tbody>
        ${report.activeTasks.length > 0 ? report.activeTasks.map((t, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
          <td style="font-weight:600">${escHtml(t.title)}</td>
          <td>${escHtml(t.deadline || "—")}</td>
          <td>${taskStatusBadge(t.status)}</td>
        </tr>`).join("") : `<tr class="empty-row"><td colspan="4">No active tasks</td></tr>`}
      </tbody>
    </table>
  </div>

  ${reviewItems > 0 ? `
  <div class="section">
    <div class="section-title">⏳ Under Review <span class="section-count">${reviewItems}</span></div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th>Type</th><th>Date / Deadline</th><th>Status</th></tr></thead>
      <tbody>
        ${report.submittedTasks.map((t, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
          <td style="font-weight:600">${escHtml(t.title)}</td>
          <td><span class="badge badge-active">Task</span></td>
          <td>${escHtml(t.deadline || "—")}</td>
          <td>${taskStatusBadge(t.status)}</td>
        </tr>`).join("")}
        ${report.pendingWorks.map((w, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${report.submittedTasks.length + i + 1}</td>
          <td style="font-weight:600">${escHtml(w.title)}</td>
          <td><span class="badge badge-pending">Work</span></td>
          <td>${escHtml(w.date || "—")}</td>
          <td>${taskStatusBadge(w.status)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  <div class="section">
    <div class="section-title">🕐 Attendance History <span class="section-count">${report.employeeAttendance.length}</span></div>
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
      <tbody>
        ${report.employeeAttendance.length > 0 ? report.employeeAttendance.map((r, i) => `
        <tr>
          <td style="color:#9ca3af;font-size:11px">${i + 1}</td>
          <td style="font-weight:600">${escHtml(r.date)}</td>
          <td>${escHtml(formatDateTime(r.checkIn))}</td>
          <td>${escHtml(r.checkOut ? formatDateTime(r.checkOut) : "—")}</td>
          <td>${attBadge(r.status)}</td>
        </tr>`).join("") : `<tr class="empty-row"><td colspan="5">No attendance records in this range</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <span>Emirates International Holdings Group — HR Department · Confidential</span>
    <span>Employee Portal · ${new Date().toLocaleDateString()}</span>
  </div>

</div>
</body>
</html>`);

  popup.document.close();
  setTimeout(() => popup.focus(), 100);
}