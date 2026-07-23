"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Assessment,
  AssessmentSubmission,
  AssignedTask,
  AttendanceCard,
  AttendanceRecord,
  AttendanceStatus,
  AvatarInitials,
  buttonStyle,
  cardStyle,
  dangerButtonStyle,
  dashboardWrapperStyle,
  downloadEmployeeReportAsPrintPage,
  Employee,
  EmptyState,
  getEmployeeReportData,
  getThemeMode,
  getThemePalette,
  inputStyle,
  navBadgeStyle,
  navItemStyle,
  Report,
  ReportDateRange,
  SectionTitle,
  sidebarContentStyle,
  sidebarStyle,
  SkeletonCard,
  smallButtonStyle,
  softCardStyle,
  StatBox,
  TaskCard,
  ToastType,
  WorkCard,
  WorkItem,
  WorkStatus,
  getDaysUntilDate,
  formatDateTime,
  useIsMobile,
  MobileBottomNav,
  escHtml,
  safeUrl,
} from "./portal-utils";
import AdminAssessments, { AssessmentDraft } from "./admin-assessments";
import AdminReports, { ReportDraft } from "./admin-reports";
import {
  BirthdayCardModal,
  BirthdayCardSettingsModal,
  BirthdayCardSettings,
  BirthdayPerson,
} from "./birthday-card";

type DashboardTab = "dashboard" | "review" | "employees" | "hr" | "invoices" | "assessments" | "reports";
type HRSubTab = "attendance" | "ohc" | "foodSafety" | "birthdays";
type ReviewFilter = "pending" | "active" | "approved";

type BirthdayEntry = {
  id: string;
  name: string;
  birthday: string;
  photoPath?: string;
  photoLink?: string;
  gender?: "male" | "female";
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

type FoodSafetyCertificationEntry = {
  id: string;
  name: string;
  employeeId?: string;
  certificateId: string;
  issueDate: string;
  expiryDate: string;
  updatedAt?: string;
};

const FOOD_SAFETY_DEFAULT_EXPIRY = "2028-07-02";

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

type EmployeeProfileTab =
  | "overview"
  | "assign"
  | "tasks"
  | "works"
  | "approved"
  | "attendance";

type OHCStatus = "Active" | "Expiring Soon" | "Expires Today" | "Expired";
type OHCDisplayStatus = OHCStatus | "Applied";

function getOHCDisplayStatus(
  expiryDate: string,
  applied: boolean | undefined
): OHCDisplayStatus {
  const base = getOHCStatus(expiryDate);
  return applied && base === "Expired" ? "Applied" : base;
}

type AdminDashboardProps = {
  currentUser: Employee;
  works: WorkItem[];
  employees: Employee[];
  assignedTasks: AssignedTask[];
  attendance: AttendanceRecord[];
  birthdays: BirthdayEntry[];
  birthdayCardSettings: BirthdayCardSettings;
  onSaveBirthdayCardSettings: (settings: BirthdayCardSettings) => Promise<void>;
  ohcCertifications?: OHCCertificationEntry[];
  invoices: InvoiceItem[];
  worksHasMore?: boolean;
  tasksHasMore?: boolean;
  attendanceHasMore?: boolean;
  invoicesHasMore?: boolean;
  onLoadMoreWorks?: () => void;
  onLoadMoreTasks?: () => void;
  onLoadMoreAttendance?: () => void;
  onLoadMoreInvoices?: () => void;
  onLogout: () => Promise<void>;
  onUpdateStatus: (id: string, status: WorkStatus) => Promise<void>;
  onUpdateAttendanceStatus: (id: string, status: AttendanceStatus) => Promise<void>;
  onDeleteAttendance: (record: AttendanceRecord) => Promise<void>;
  onAssignTask: (task: {
    employeeUid: string;
    employeeName: string;
    employeeEmail: string;
    title: string;
    description: string;
    selectedFiles: File[];
    deadline: string;
  }) => Promise<void>;
  onAddBirthday: (payload: {
    name: string;
    birthday: string;
    photo: File | null;
    gender?: "male" | "female";
  }) => Promise<void>;
  onUpdateBirthdayPhoto: (birthdayId: string, file: File) => Promise<void>;
  onDeleteBirthday: (birthdayId: string, birthdayName: string) => Promise<void>;
  onAddOHCCertification?: (payload: {
    name: string;
    expiryDate: string;
    employeePhoto: File | null;
    certificatePhoto: File | null;
  }) => Promise<void>;
  onUpdateOHCCertification?: (
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
  ) => Promise<void>;
  onDeleteOHCCertification?: (certificationId: string, employeeName: string) => Promise<void>;
  onSetOHCApplied?: (certificationId: string, applied: boolean) => Promise<void>;
  foodSafetyCertifications?: FoodSafetyCertificationEntry[];
  onAddFoodSafetyCertification?: (payload: {
    name: string;
    employeeId?: string;
    certificateId: string;
    issueDate: string;
    expiryDate: string;
  }) => Promise<void>;
  onUpdateFoodSafetyCertification?: (
    certificationId: string,
    payload: {
      name: string;
      employeeId?: string;
      certificateId: string;
      issueDate: string;
      expiryDate: string;
    }
  ) => Promise<void>;
  onDeleteFoodSafetyCertification?: (certificationId: string, employeeName: string) => Promise<void>;
  onUpdateInvoice: (
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
  ) => Promise<void>;
  onApproveInvoice: (invoiceId: string, approvedDate: string) => Promise<void>;
  onOpenInvoiceAttachment: (path?: string, link?: string) => Promise<void> | void;
  onApproveTask: (id: string) => Promise<void>;
  onReturnForRevision: (id: string, note: string) => Promise<void>;
  onDeleteWork: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  // Assessments
  assessments?: Assessment[];
  assessmentSubmissions?: AssessmentSubmission[];
  loadingAssessments?: boolean;
  loadingAssessmentSubmissions?: boolean;
  onCreateAssessment?: (draft: AssessmentDraft) => Promise<{ id: string; code: string }>;
  onUpdateAssessment?: (id: string, draft: AssessmentDraft) => Promise<void>;
  onDeleteAssessment?: (id: string, title: string) => void;
  onToggleAssessmentActive?: (id: string, nextActive: boolean) => Promise<void>;
  onSoftDeleteSubmission?: (submissionId: string) => Promise<void>;
  // Reports
  reports?: Report[];
  loadingReports?: boolean;
  onCreateReport?: (
    draft: ReportDraft
  ) => Promise<{ id: string; reportNumber: string }>;
  onUpdateReport?: (id: string, draft: ReportDraft) => Promise<void>;
  onSoftDeleteReport?: (id: string, title: string) => void;
  showToast: (type: ToastType, message: string) => void;
};

function parseLocalDate(dateString: string) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysUntil(dateString: string) {
  const target = parseLocalDate(dateString);
  if (!target) return null;
  const today = startOfDay(new Date());
  const targetDay = startOfDay(target);
  const diffMs = targetDay.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getOHCStatus(expiryDate: string): OHCStatus {
  const days = getDaysUntil(expiryDate);
  if (days === null) return "Active";
  if (days < 0) return "Expired";
  if (days === 0) return "Expires Today";
  if (days <= 7) return "Expiring Soon";
  return "Active";
}

function getOHCBadgeStyle(status: OHCDisplayStatus): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  const base: React.CSSProperties = { borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 };
  if (status === "Applied") return { ...base,
    background: isDark ? "rgba(59,130,246,0.14)" : "#dbeafe",
    color: isDark ? "#60a5fa" : "#1e40af",
    border: isDark ? "1px solid rgba(59,130,246,0.3)" : "1px solid #bfdbfe",
  };
  if (status === "Expired") return { ...base,
    background: isDark ? "rgba(239,68,68,0.14)" : "#fee2e2",
    color: isDark ? "#f87171" : "#991b1b",
    border: isDark ? "1px solid rgba(239,68,68,0.3)" : "1px solid #fecaca",
  };
  if (status === "Expires Today") return { ...base,
    background: isDark ? "rgba(249,115,22,0.14)" : "#fff7ed",
    color: isDark ? "#fb923c" : "#9a3412",
    border: isDark ? "1px solid rgba(249,115,22,0.3)" : "1px solid #fdba74",
  };
  if (status === "Expiring Soon") return { ...base,
    background: isDark ? "rgba(245,158,11,0.14)" : "#fef3c7",
    color: isDark ? "#fbbf24" : "#92400e",
    border: isDark ? "1px solid rgba(245,158,11,0.3)" : "1px solid #fcd34d",
  };
  return { ...base,
    background: isDark ? "rgba(16,185,129,0.14)" : "#dcfce7",
    color: isDark ? "#34d399" : "#166534",
    border: isDark ? "1px solid rgba(16,185,129,0.3)" : "1px solid #86efac",
  };
}

function getOHCHint(expiryDate: string) {
  const days = getDaysUntil(expiryDate);
  if (days === null) return "No expiry date";
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires in 1 day";
  return `Expires in ${days} days`;
}

// ── Basic Food Safety Certificate — status + helpers ──
// Mirrors the OHC status model but uses a 30-day "Expiring Soon" window.
type FoodSafetyStatus = "Valid" | "Expiring Soon" | "Expired";

function getFoodSafetyStatus(expiryDate: string): FoodSafetyStatus {
  const days = getDaysUntil(expiryDate);
  if (days === null) return "Valid";
  if (days < 0) return "Expired";
  if (days <= 30) return "Expiring Soon";
  return "Valid";
}

function getFoodSafetyBadgeStyle(status: FoodSafetyStatus): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
    borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800,
  };
  if (status === "Expired") return { ...base,
    background: isDark ? "rgba(239,68,68,0.14)" : "#fee2e2",
    color: isDark ? "#f87171" : "#991b1b",
    border: `1px solid ${isDark ? "rgba(239,68,68,0.3)" : "#fecaca"}`,
  };
  if (status === "Expiring Soon") return { ...base,
    background: isDark ? "rgba(245,158,11,0.14)" : "#fef3c7",
    color: isDark ? "#fbbf24" : "#92400e",
    border: `1px solid ${isDark ? "rgba(245,158,11,0.3)" : "#fcd34d"}`,
  };
  return { ...base,
    background: isDark ? "rgba(16,185,129,0.14)" : "#dcfce7",
    color: isDark ? "#34d399" : "#166534",
    border: `1px solid ${isDark ? "rgba(16,185,129,0.3)" : "#86efac"}`,
  };
}

function getFoodSafetyStatusColor(status: FoodSafetyStatus) {
  return status === "Expired" ? "#ef4444" : status === "Expiring Soon" ? "#f59e0b" : "#10b981";
}

function getFoodSafetyDaysLabel(expiryDate: string) {
  const days = getDaysUntil(expiryDate);
  if (days === null) return "—";
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function formatFoodSafetyDate(dateString: string) {
  const d = parseLocalDate(dateString);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatFoodSafetyUpdated(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatFilesLabel(files: File[]) {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files.length} files selected`;
}

function mergeFiles(existingFiles: File[], newFiles: File[]) {
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

function formatMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getInvoiceBadgeStyle(status: InvoiceStatus): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", padding: "4px 10px",
    borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap",
  };
  if (status === "Paid") return { ...base,
    background: isDark ? "rgba(16,185,129,0.14)" : "#dcfce7",
    color: isDark ? "#34d399" : "#166534",
    border: `1px solid ${isDark ? "rgba(16,185,129,0.3)" : "#86efac"}`,
  };
  if (status === "Approved") return { ...base,
    background: isDark ? "rgba(59,130,246,0.14)" : "#dbeafe",
    color: isDark ? "#60a5fa" : "#1d4ed8",
    border: `1px solid ${isDark ? "rgba(59,130,246,0.3)" : "#bfdbfe"}`,
  };
  return { ...base,
    background: isDark ? "rgba(245,158,11,0.14)" : "#fef3c7",
    color: isDark ? "#fbbf24" : "#92400e",
    border: `1px solid ${isDark ? "rgba(245,158,11,0.3)" : "#fcd34d"}`,
  };
}

function invoiceIconBtn(theme: ReturnType<typeof getThemePalette>): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 8,
    border: `1px solid ${theme.cardBorder}`,
    background: theme.fileCardBg, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, transition: "all 0.15s ease", flexShrink: 0,
  };
}

function invoiceNeedsReview(item: InvoiceItem) {
  return item.status === "Pending Review";
}

function matchesInvoiceSearch(item: InvoiceItem, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;

  return (
    item.supplierName.toLowerCase().includes(normalizedSearch) ||
    item.employeeName.toLowerCase().includes(normalizedSearch) ||
    item.status.toLowerCase().includes(normalizedSearch) ||
    item.dateReceived.toLowerCase().includes(normalizedSearch) ||
    item.dateApproved.toLowerCase().includes(normalizedSearch)
  );
}

function matchesInvoiceFilters(
  item: InvoiceItem,
  supplierFilter: string,
  statusFilter: string,
  fromDate: string,
  toDate: string
) {
  const supplierOk = supplierFilter.trim()
    ? item.supplierName.toLowerCase().includes(supplierFilter.trim().toLowerCase())
    : true;

  const statusOk = statusFilter === "All" ? true : item.status === statusFilter;
  const fromOk = fromDate ? item.dateReceived >= fromDate : true;
  const toOk = toDate ? item.dateReceived <= toDate : true;

  return supplierOk && statusOk && fromOk && toOk;
}

function SelectedFilesPreview({
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

function BirthdayHeroCard({
  birthdays,
  onOpenPhoto,
}: {
  birthdays: BirthdayEntry[];
  onOpenPhoto: (name: string, image: string) => void;
}) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const visible = birthdays.slice(0, 3);
  const extraCount = birthdays.length - visible.length;

  const summaryText =
    birthdays.length === 1
      ? `${birthdays[0].name} has a birthday today! 🎉`
      : birthdays.length === 2
      ? `${birthdays[0].name} and ${birthdays[1].name} have birthdays today! 🎉`
      : `${visible.map((item) => item.name).join(", ")}${
          extraCount > 0 ? ` and ${extraCount} others` : ""
        } have birthdays today! 🎉`;

  return (
    <div
      style={{
        marginTop: 18,
        borderRadius: 22,
        background: isDark
          ? theme.cardBackground
          : "linear-gradient(135deg, #fff7ed 0%, #ffffff 35%, #fdf2f8 100%)",
        border: `1px solid ${isDark ? theme.cardBorder : "#fde68a"}`,
        padding: 16,
        boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          color: theme.title,
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        <span>🎂</span>
        <span>Birthdays Today</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {visible.map((item) => (
          <div
            key={item.id}
            style={{
              position: "relative",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                padding: 3,
                background: "linear-gradient(135deg, #fca5a5 0%, #c4b5fd 50%, #fde68a 100%)",
                boxShadow: "0 10px 22px rgba(244,114,182,0.22)",
                cursor: item.photoLink ? "pointer" : "default",
              }}
              onClick={() => {
                if (item.photoLink) {
                  onOpenPhoto(item.name, item.photoLink);
                }
              }}
            >
              <img
                src={item.photoLink || "/eihg-logo.jpeg"}
                alt={item.name}
                width={68}
                height={68}
                loading="lazy" decoding="async"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "50%",
                  background: "#fff",
                }}
              />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.mutedText, marginTop: 6 }}>
              {item.name}
            </div>
          </div>
        ))}

        {extraCount > 0 && (
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: isDark ? theme.fileCardBg : "#ffffff",
              border: "2px dashed #c4b5fd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 900,
              color: theme.title,
            }}
          >
            +{extraCount}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 15,
          lineHeight: 1.7,
          color: theme.mutedText,
          fontWeight: 600,
        }}
      >
        {summaryText}
      </div>
    </div>
  );
}

function OHCRenewalCard({
  items,
  onOpenEmployeePhoto,
  onOpenCertificate,
}: {
  items: OHCCertificationEntry[];
  onOpenEmployeePhoto: (name: string, image: string) => void;
  onOpenCertificate: (name: string, image: string) => void;
}) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const visible = items;

  return (
    <div
      style={{
        marginTop: 18,
        borderRadius: 22,
        background: isDark
          ? theme.cardBackground
          : "linear-gradient(135deg, #eff6ff 0%, #ffffff 35%, #fff7ed 100%)",
        border: `1px solid ${isDark ? theme.cardBorder : "#bfdbfe"}`,
        padding: 16,
        boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          color: theme.title,
          fontWeight: 800,
          fontSize: 18,
        }}
      >
        <span>📄</span>
        <span>OHC Renewal Alert</span>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          maxHeight: 260,
          overflowY: "scroll",
          paddingRight: 6,
          scrollbarWidth: "thin",
          scrollbarColor: "#94a3b8 transparent",
        }}
      >
        {visible.map((item) => {
          const status = getOHCDisplayStatus(item.expiryDate, item.applied);

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                background: isDark ? theme.fileCardBg : "#ffffff",
                border: `1px solid ${isDark ? theme.cardBorder : "#e5e7eb"}`,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={item.employeePhotoLink || "/eihg-logo.jpeg"}
                  alt={item.name}
                  width={54}
                  height={54}
                  loading="lazy" decoding="async"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    objectFit: "cover",
                    background: "#f3f4f6",
                    cursor: item.employeePhotoLink ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                  onClick={() => {
                    if (item.employeePhotoLink) {
                      onOpenEmployeePhoto(item.name, item.employeePhotoLink);
                    }
                  }}
                />

                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: theme.title }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 4 }}>
                    {getOHCHint(item.expiryDate)}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8, justifyItems: "end", flexShrink: 0 }}>
                <span style={getOHCBadgeStyle(status)}>{status}</span>

                {item.certificatePhotoLink && (
                  <button
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: `1px solid ${isDark ? theme.cardBorder : "#d1d5db"}`,
                      background: isDark ? theme.fileCardBg : "#ffffff",
                      color: theme.title,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    onClick={() => onOpenCertificate(item.name, item.certificatePhotoLink || "")}
                  >
                    View
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoiceReviewCard({
  item,
  onEdit,
  onApprove,
  onOpenAttachment,
}: {
  item: InvoiceItem;
  onEdit: (item: InvoiceItem) => void;
  onApprove: (item: InvoiceItem) => void;
  onOpenAttachment: (path?: string, link?: string) => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = getThemePalette();
  const isMobile = useIsMobile();

  const accentColor =
    item.status === "Paid" ? "#10b981"
    : item.status === "Approved" ? "#3b82f6"
    : "#f59e0b";

  const actionButtons = (
    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
      {item.status === "Pending Review" && (
        <button title="Approve" style={{ ...invoiceIconBtn(theme), background: "rgba(16,185,129,0.14)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }} onClick={() => onApprove(item)}>✓</button>
      )}
      {(item.attachmentPath || item.attachmentLink) && (
        <button title="View Attachment" style={invoiceIconBtn(theme)} onClick={() => onOpenAttachment(item.attachmentPath, item.attachmentLink)}>📎</button>
      )}
      <button title="Edit" style={invoiceIconBtn(theme)} onClick={() => onEdit(item)}>✏️</button>
      <button title={expanded ? "Collapse" : "Expand"} style={{ ...invoiceIconBtn(theme), fontSize: 11, color: theme.subtleText }} onClick={() => setExpanded(!expanded)}>{expanded ? "▲" : "▼"}</button>
    </div>
  );

  return (
    <div style={{
      background: theme.cardBackground,
      borderTop: `1px solid ${theme.cardBorder}`,
      borderRight: `1px solid ${theme.cardBorder}`,
      borderBottom: `1px solid ${theme.cardBorder}`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 12,
      overflow: "hidden",
      transition: "box-shadow 0.15s ease",
    }}>
      {isMobile ? (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${accentColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🧾</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.supplierName}</div>
              {item.customerName && (
                <div style={{ fontSize: 11, color: theme.subtleText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Customer: {item.customerName}</div>
              )}
            </div>
            <span style={getInvoiceBadgeStyle(item.status)}>{item.status}</span>
          </div>
          <div style={{ fontSize: 12, color: theme.subtleText, marginBottom: 8, paddingLeft: 42 }}>
            👤 {item.employeeName}{item.dateReceived ? ` · ${item.dateReceived}` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 42 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>AED {formatMoney(item.totalAmount)}</div>
            {actionButtons}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${accentColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧾</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.supplierName}</div>
            {item.customerName && (
              <div style={{ fontSize: 11, color: theme.subtleText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Customer: {item.customerName}</div>
            )}
            <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
              👤 {item.employeeName}{item.dateReceived ? ` · Received: ${item.dateReceived}` : ""}
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: theme.title, flexShrink: 0 }}>AED {formatMoney(item.totalAmount)}</div>
          <span style={getInvoiceBadgeStyle(item.status)}>{item.status}</span>
          {actionButtons}
        </div>
      )}

      {expanded && (
        <div style={{
          borderTop: `1px solid ${theme.cardBorder}`,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          background: theme.softCardBackground,
        }}>
          {[
            { label: "Employee", value: item.employeeName },
            { label: "Date Received", value: item.dateReceived || "—" },
            { label: "Date Approved", value: item.dateApproved || "—" },
            { label: "Attachment", value: item.attachmentName || "None" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontSize: 13, color: theme.title }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function notifItemStyle(theme: ReturnType<typeof getThemePalette>): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    border: `1px solid ${theme.cardBorder}`,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.18s ease",
  };
}

export default function AdminDashboard({
  currentUser,
  works,
  employees,
  assignedTasks,
  attendance,
  birthdays,
  birthdayCardSettings,
  onSaveBirthdayCardSettings,
  ohcCertifications = [],
  foodSafetyCertifications = [],
  invoices,
  worksHasMore = false,
  tasksHasMore = false,
  attendanceHasMore = false,
  invoicesHasMore = false,
  onLoadMoreWorks,
  onLoadMoreTasks,
  onLoadMoreAttendance,
  onLoadMoreInvoices,
  onLogout,
  onUpdateStatus,
  onUpdateAttendanceStatus,
  onDeleteAttendance,
  onAssignTask,
  onAddBirthday,
  onUpdateBirthdayPhoto,
  onDeleteBirthday,
  onAddOHCCertification,
  onUpdateOHCCertification,
  onDeleteOHCCertification,
  onSetOHCApplied,
  onAddFoodSafetyCertification,
  onUpdateFoodSafetyCertification,
  onDeleteFoodSafetyCertification,
  onUpdateInvoice,
  onApproveInvoice,
  onOpenInvoiceAttachment,
  onApproveTask,
  onReturnForRevision,
  onDeleteWork,
  onDeleteTask,
  assessments = [],
  assessmentSubmissions = [],
  loadingAssessments = false,
  loadingAssessmentSubmissions = false,
  onCreateAssessment,
  onUpdateAssessment,
  onDeleteAssessment,
  onToggleAssessmentActive,
  onSoftDeleteSubmission,
  reports = [],
  loadingReports = false,
  onCreateReport,
  onUpdateReport,
  onSoftDeleteReport,
  showToast,
}: AdminDashboardProps) {
  const theme = getThemePalette();

  const tabScrollAreaStyle: React.CSSProperties = {
    maxHeight: "calc(100vh - 260px)",
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 8,
    scrollbarWidth: "thin",
    scrollbarColor: "#94a3b8 transparent",
  };

  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);

  const [activeTab, setActiveTab] = useState<DashboardTab>("dashboard");
  const [hrSubTab, setHrSubTab] = useState<HRSubTab>("attendance");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [employeeProfileTab, setEmployeeProfileTab] =
    useState<EmployeeProfileTab>("overview");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [empAttFilter, setEmpAttFilter] = useState<"All" | "Present" | "Absent">("All");
  const [reviewApprovedSearch, setReviewApprovedSearch] = useState("");
  const [reviewApprovedTypeFilter, setReviewApprovedTypeFilter] = useState<"All" | "Tasks" | "Works">("All");
  const [reviewApprovedExpandedId, setReviewApprovedExpandedId] = useState<string | null>(null);
  const [empApprovedSearch, setEmpApprovedSearch] = useState("");
  const [empApprovedTypeFilter, setEmpApprovedTypeFilter] = useState<"All" | "Tasks" | "Works">("All");
  const [empApprovedExpandedId, setEmpApprovedExpandedId] = useState<string | null>(null);
  const [ohcSearch, setOhcSearch] = useState("");
  const [bdSearch, setBdSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("All");
  const [invoiceFromDate, setInvoiceFromDate] = useState("");
  const [invoiceToDate, setInvoiceToDate] = useState("");
  const [editingInvoice, setEditingInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);

  const [invoiceForm, setInvoiceForm] = useState({
    supplierName: "",
    customerName: "",
    dateReceived: "",
    dateApproved: "",
    totalAmount: "",
    status: "Approved" as InvoiceStatus,
  });

  const [showBirthdayMenu, setShowBirthdayMenu] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [cardPerson, setCardPerson] = useState<BirthdayPerson | null>(null);
  const [showCardSettings, setShowCardSettings] = useState(false);
  // Replace-photo for an existing birthday entry.
  const bdPhotoInputRef = useRef<HTMLInputElement>(null);
  const bdPhotoTargetId = useRef<string | null>(null);
  const [bdPhotoUploadingId, setBdPhotoUploadingId] = useState<string | null>(null);

  const handleBirthdayPhotoPick = async (file: File | null) => {
    const id = bdPhotoTargetId.current;
    bdPhotoTargetId.current = null;
    if (!file || !id) return;
    if (!file.type.startsWith("image/")) {
      showToast("error", "Please choose an image file.");
      return;
    }
    setBdPhotoUploadingId(id);
    try {
      await onUpdateBirthdayPhoto(id, file);
      showToast("success", "Photo updated.");
    } catch (e) {
      showToast(
        "error",
        e instanceof Error ? e.message : "Could not update the photo."
      );
    } finally {
      setBdPhotoUploadingId(null);
    }
  };
  const [showManageBirthdaysModal, setShowManageBirthdaysModal] = useState(false);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [birthdayPhoto, setBirthdayPhoto] = useState<File | null>(null);

  const [ohcFormOpen, setOhcFormOpen] = useState(false);
  const [ohcSaving, setOhcSaving] = useState(false);
  const [ohcApplying, setOhcApplying] = useState(false);
  const [editingOHC, setEditingOHC] = useState<OHCCertificationEntry | null>(null);
  const [ohcEmployeePhoto, setOhcEmployeePhoto] = useState<File | null>(null);
  const [ohcCertificatePhoto, setOhcCertificatePhoto] = useState<File | null>(null);

  const [reportRange, setReportRange] = useState<ReportDateRange>({ from: "", to: "" });
  const [selectedTaskFiles, setSelectedTaskFiles] = useState<File[]>([]);
  const [birthdayForm, setBirthdayForm] = useState<{
    name: string;
    birthday: string;
    photoName: string;
    gender: "" | "male" | "female";
  }>({
    name: "",
    birthday: "",
    photoName: "",
    gender: "",
  });

  const [ohcPreview, setOhcPreview] = useState<{
    title: string;
    image: string;
  } | null>(null);

  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`profilePhoto_${currentUser.uid}`);
    if (saved) setProfilePhotoPreview(saved);
  }, [currentUser.uid]);

  const [birthdayPreview, setBirthdayPreview] = useState<{
    title: string;
    image: string;
  } | null>(null);

  const [assignForm, setAssignForm] = useState({
    title: "",
    description: "",
    attachmentName: "",
    deadline: "",
  });

  const [ohcForm, setOhcForm] = useState({
    name: "",
    expiryDate: "",
    employeePhotoName: "",
    certificatePhotoName: "",
    currentEmployeePhotoPath: "",
    currentEmployeePhotoLink: "",
    currentCertificatePhotoPath: "",
    currentCertificatePhotoLink: "",
  });

  // ── Basic Food Safety Certificate Monitoring — state ──
  const [fsSearch, setFsSearch] = useState("");
  const [fsCertSearch, setFsCertSearch] = useState("");
  const [fsStatusFilter, setFsStatusFilter] = useState<"All" | FoodSafetyStatus>("All");
  const [fsSort, setFsSort] = useState<"expiry" | "name">("expiry");
  const [fsFormOpen, setFsFormOpen] = useState(false);
  const [fsSaving, setFsSaving] = useState(false);
  const [editingFS, setEditingFS] = useState<FoodSafetyCertificationEntry | null>(null);
  const [fsForm, setFsForm] = useState({
    name: "",
    employeeId: "",
    certificateId: "",
    issueDate: "",
    expiryDate: FOOD_SAFETY_DEFAULT_EXPIRY,
  });

  const now = new Date();
  const todayMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const todaysBirthdays = useMemo(() => {
    return birthdays.filter((item) => item.birthday?.slice(5, 10) === todayMonthDay);
  }, [birthdays, todayMonthDay]);

  const ohcRenewalAlerts = useMemo(() => {
    return ohcCertifications.filter((item) => {
      const status = getOHCStatus(item.expiryDate);
      return status === "Expired" || status === "Expires Today" || status === "Expiring Soon";
    });
  }, [ohcCertifications]);

  const activeOHC = useMemo(
    () => ohcCertifications.filter((item) => getOHCStatus(item.expiryDate) === "Active"),
    [ohcCertifications]
  );

  const expiringSoonOHCCerts = useMemo(
    () =>
      ohcCertifications.filter((item) => {
        const status = getOHCStatus(item.expiryDate);
        return status === "Expiring Soon" || status === "Expires Today";
      }),
    [ohcCertifications]
  );

  const expiredOHCCerts = useMemo(
    () => ohcCertifications.filter((item) => getOHCStatus(item.expiryDate) === "Expired"),
    [ohcCertifications]
  );

  const sortedOHC = useMemo(() => {
    return [...ohcCertifications]
      .filter(item => !ohcSearch.trim() || item.name.toLowerCase().includes(ohcSearch.trim().toLowerCase()))
      .sort((a, b) => {
        const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ta - tb;
      });
  }, [ohcCertifications, ohcSearch]);

  // ── Basic Food Safety Certificate Monitoring — derived data ──
  const fsRenewalAlerts = useMemo(
    () =>
      foodSafetyCertifications.filter((item) => {
        const status = getFoodSafetyStatus(item.expiryDate);
        return status === "Expired" || status === "Expiring Soon";
      }),
    [foodSafetyCertifications]
  );

  const validFS = useMemo(
    () => foodSafetyCertifications.filter((item) => getFoodSafetyStatus(item.expiryDate) === "Valid"),
    [foodSafetyCertifications]
  );

  const expiringSoonFS = useMemo(
    () => foodSafetyCertifications.filter((item) => getFoodSafetyStatus(item.expiryDate) === "Expiring Soon"),
    [foodSafetyCertifications]
  );

  const expiredFS = useMemo(
    () => foodSafetyCertifications.filter((item) => getFoodSafetyStatus(item.expiryDate) === "Expired"),
    [foodSafetyCertifications]
  );

  const filteredSortedFS = useMemo(() => {
    const nameQuery = fsSearch.trim().toLowerCase();
    const certQuery = fsCertSearch.trim().toLowerCase();
    return foodSafetyCertifications
      .filter((item) => {
        if (nameQuery && !item.name.toLowerCase().includes(nameQuery)) return false;
        if (certQuery && !(item.certificateId || "").toLowerCase().includes(certQuery)) return false;
        if (fsStatusFilter !== "All" && getFoodSafetyStatus(item.expiryDate) !== fsStatusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (fsSort === "name") return a.name.localeCompare(b.name);
        const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return ta - tb;
      });
  }, [foodSafetyCertifications, fsSearch, fsCertSearch, fsStatusFilter, fsSort]);

  const bdDaysUntil = (bStr: string): number => {
    if (!bStr) return 999;
    const today = new Date();
    const bday = new Date(bStr);
    if (isNaN(bday.getTime())) return 999;
    const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    const diff = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
    return diff >= 0 ? diff : Math.round((new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate()).getTime() - today.getTime()) / 86400000);
  };

  const sortedBirthdays = useMemo(() =>
    [...birthdays]
      .filter(b => !bdSearch.trim() || b.name.toLowerCase().includes(bdSearch.trim().toLowerCase()))
      .sort((a, b) => bdDaysUntil(a.birthday) - bdDaysUntil(b.birthday)),
  [birthdays, bdSearch]);

  const employeeList   = useMemo(() => employees.filter((e) => e.role === "employee"),    [employees]);
  const activeWorks    = useMemo(() => works.filter((w) => !w.isDeleted),                 [works]);
  const activeTasksAll = useMemo(() => assignedTasks.filter((t) => !t.isDeleted),         [assignedTasks]);
  const activeInvoices = useMemo(() => invoices.filter((item) => !item.isDeleted),        [invoices]);

  const filteredInvoices = useMemo(() => {
    return activeInvoices.filter(
      (item) =>
        matchesInvoiceSearch(item, invoiceSearch) &&
        matchesInvoiceFilters(
          item,
          invoiceSupplierFilter,
          invoiceStatusFilter,
          invoiceFromDate,
          invoiceToDate
        )
    );
  }, [
    activeInvoices,
    invoiceSearch,
    invoiceSupplierFilter,
    invoiceStatusFilter,
    invoiceFromDate,
    invoiceToDate,
  ]);

  const invoiceReviewItems = useMemo(
    () => filteredInvoices.filter((item) => invoiceNeedsReview(item)),
    [filteredInvoices]
  );

  const invoiceApprovedItems = useMemo(
    () => filteredInvoices.filter((item) => item.status === "Approved"),
    [filteredInvoices]
  );

  const invoicePaidItems = useMemo(
    () => filteredInvoices.filter((item) => item.status === "Paid"),
    [filteredInvoices]
  );

  const invoiceGrandTotal = useMemo(
    () => filteredInvoices.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
    [filteredInvoices]
  );

  const pendingReviewWorks = activeWorks.filter((w) => {
    const text = search.toLowerCase();
    const matchesSearch =
      w.employeeName.toLowerCase().includes(text) ||
      w.title.toLowerCase().includes(text) ||
      w.category.toLowerCase().includes(text);

    const matchesDepartment = department === "All" || w.department === department;

    return w.status === "Pending Review" && matchesSearch && matchesDepartment;
  });

  const pendingReviewTasks = activeTasksAll.filter((task) => {
    const text = search.toLowerCase();
    const matchesSearch =
      task.employeeName.toLowerCase().includes(text) ||
      task.title.toLowerCase().includes(text) ||
      task.description.toLowerCase().includes(text);

    const employeeDepartment =
      employees.find((e) => e.uid === task.employeeUid)?.department || "General";

    const matchesDepartment = department === "All" || employeeDepartment === department;

    return task.status === "Submitted" && matchesSearch && matchesDepartment;
  });

  const assignedTasksOnly = activeTasksAll.filter(
    (t) =>
      t.status === "Assigned" || t.status === "In Progress" || t.status === "Needs Revision"
  );
  const approvedTasksOnly = activeTasksAll.filter((t) => t.status === "Approved");
  const approvedWorks = activeWorks.filter((w) => w.status === "Approved");

  const approvedCount = approvedWorks.length + approvedTasksOnly.length;
  const pendingCount = pendingReviewWorks.length + pendingReviewTasks.length;

  const pendingAttendanceOnly = attendance.filter((record) => record.status === "Pending");

  const filteredAttendance = pendingAttendanceOnly.filter((record) =>
    record.employeeName.toLowerCase().includes(attendanceSearch.toLowerCase())
  );

  const pendingAttendanceCount = pendingAttendanceOnly.length;

  const selectedEmployeeWorks = selectedEmployee
    ? activeWorks.filter(
        (w) =>
          w.employeeUid === selectedEmployee.uid ||
          w.employeeEmail?.toLowerCase() === selectedEmployee.email.toLowerCase()
      )
    : [];

  const selectedEmployeeTasks = selectedEmployee
    ? activeTasksAll.filter(
        (task) =>
          task.employeeUid === selectedEmployee.uid ||
          task.employeeEmail.toLowerCase() === selectedEmployee.email.toLowerCase()
      )
    : [];

  const selectedEmployeeApprovedWorks = selectedEmployeeWorks.filter(
    (item) => item.status === "Approved"
  );

  const selectedEmployeePendingWorks = selectedEmployeeWorks.filter(
    (item) => item.status !== "Approved"
  );

  const selectedEmployeeApprovedTasks = selectedEmployeeTasks.filter(
    (task) => task.status === "Approved"
  );

  const selectedEmployeeNonApprovedTasks = selectedEmployeeTasks.filter(
    (task) => task.status !== "Approved"
  );

  const selectedEmployeeReviewedAttendance = selectedEmployee
    ? attendance.filter(
        (record) =>
          record.status !== "Pending" &&
          (record.employeeUid === selectedEmployee.uid ||
            record.employeeEmail?.toLowerCase() === selectedEmployee.email.toLowerCase())
      )
    : [];

  const selectedEmployeeReport = selectedEmployee
    ? getEmployeeReportData(selectedEmployee, activeWorks, activeTasksAll, attendance, reportRange)
    : null;

  const recentSubmittedTasks = useMemo(
    () => activeTasksAll.filter((t) => t.status === "Submitted").slice(0, 5),
    [activeTasksAll]
  );

  const recentPendingWorks = useMemo(
    () => activeWorks.filter((w) => w.status === "Pending Review").slice(0, 5),
    [activeWorks]
  );

  const resetOHCForm = () => {
    setOhcForm({
      name: "",
      expiryDate: "",
      employeePhotoName: "",
      certificatePhotoName: "",
      currentEmployeePhotoPath: "",
      currentEmployeePhotoLink: "",
      currentCertificatePhotoPath: "",
      currentCertificatePhotoLink: "",
    });
    setOhcEmployeePhoto(null);
    setOhcCertificatePhoto(null);
    setEditingOHC(null);
  };

  const resetInvoiceForm = () => {
    setInvoiceForm({
      supplierName: "",
      customerName: "",
      dateReceived: "",
      dateApproved: "",
      totalAmount: "",
      status: "Approved",
    });
    setInvoiceFile(null);
    setEditingInvoice(null);
  };

  const openEditInvoiceForm = (item: InvoiceItem) => {
    setEditingInvoice(item);
    setInvoiceForm({
      supplierName: item.supplierName || "",
      customerName: item.customerName || "",
      dateReceived: item.dateReceived || "",
      dateApproved: item.dateApproved || "",
      totalAmount: String(item.totalAmount ?? ""),
      status: item.status || "Approved",
    });
    setInvoiceFile(null);
    setInvoiceFormOpen(true);
  };

  const handleApproveInvoice = async (item: InvoiceItem) => {
    try {
      const approvedDate = item.dateApproved || new Date().toISOString().slice(0, 10);
      await onApproveInvoice(item.id, approvedDate);
      showToast("success", "Invoice approved successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error approving invoice.");
    }
  };

  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;

    if (!invoiceForm.supplierName || !invoiceForm.dateReceived || !invoiceForm.totalAmount) {
      showToast("error", "Please complete the required invoice fields.");
      return;
    }

    const parsedAmount = Number(invoiceForm.totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast("error", "Please enter a valid total amount.");
      return;
    }

    try {
      setInvoiceSaving(true);
      await onUpdateInvoice(editingInvoice.id, {
        supplierName: invoiceForm.supplierName,
        customerName: invoiceForm.customerName,
        dateReceived: invoiceForm.dateReceived,
        dateApproved: invoiceForm.dateApproved,
        totalAmount: parsedAmount,
        status: invoiceForm.status,
        selectedFile: invoiceFile,
        currentAttachmentPath: editingInvoice.attachmentPath,
        currentAttachmentLink: editingInvoice.attachmentLink,
        currentAttachmentName: editingInvoice.attachmentName,
        currentAttachmentType: editingInvoice.attachmentType,
      });
      setInvoiceFormOpen(false);
      resetInvoiceForm();
      showToast("success", "Invoice updated successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error updating invoice.");
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handlePrintInvoiceSummary = () => {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) return;

    const paidTotal = invoicePaidItems.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const approvedTotal = invoiceApprovedItems.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const activeFilters = [
      invoiceSupplierFilter ? `Supplier: ${escHtml(invoiceSupplierFilter)}` : "",
      invoiceStatusFilter !== "All" ? `Status: ${escHtml(invoiceStatusFilter)}` : "",
      invoiceFromDate ? `From: ${escHtml(invoiceFromDate)}` : "",
      invoiceToDate ? `To: ${escHtml(invoiceToDate)}` : "",
      invoiceSearch ? `Search: ${escHtml(invoiceSearch)}` : "",
    ].filter(Boolean);

    popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Invoice Report — EIHG</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f9fafb}
    .page{max-width:1060px;margin:0 auto;padding:40px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #0f1c35;margin-bottom:26px}
    .brand-box{display:flex;align-items:center;gap:14px}
    .brand-icon{width:54px;height:54px;background:linear-gradient(145deg,#0f1c35,#1b2a4a);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #F0C040;flex-shrink:0}
    .brand-title{font-size:19px;font-weight:900;color:#0f1c35}
    .brand-sub{font-size:11px;color:#6b7280;margin-top:2px;font-weight:500}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    .tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
    .tile{border-radius:12px;padding:16px 10px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:24px;font-weight:900;line-height:1}
    .tile-sub{font-size:11px;margin-top:4px;opacity:.85}
    .tile-total{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8}
    .tile-pending{background:#fef3c7;border:1px solid #fde68a;color:#92400e}
    .tile-approved{background:#dbeafe;border:1px solid #bfdbfe;color:#1e40af}
    .tile-paid{background:#dcfce7;border:1px solid #bbf7d0;color:#166534}
    .tile-amount{background:#0f1c35;border:1px solid #1b2a4a;color:#F0C040}
    .filter-bar{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 16px;margin-bottom:22px;font-size:12px;color:#64748b;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
    .filter-bar strong{color:#374151}
    .section-title{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#0f1c35;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #0f1c35;display:flex;align-items:center;gap:6px}
    table{width:100%;border-collapse:collapse;margin-bottom:26px;font-size:13px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
    thead tr{background:#0f1c35}
    thead th{padding:11px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.05em;color:#F0C040}
    thead th:last-child{text-align:right}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody tr:nth-child(odd){background:#fff}
    tbody td{padding:9px 12px;border-bottom:1px solid #f1f5f9;color:#374151;vertical-align:middle}
    .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800}
    .badge-paid{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
    .badge-approved{background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}
    .badge-pending{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
    .amount-cell{font-weight:700;color:#1e293b;text-align:right}
    .totals-row td{background:#0f1c35;color:#F0C040;font-weight:800;padding:11px 12px}
    .totals-row td:last-child{text-align:right}
    .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}table{box-shadow:none}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#0f1c35,#1b2a4a);color:#F0C040;cursor:pointer;font-size:13px;font-weight:700">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1e293b;cursor:pointer;font-size:13px;font-weight:700">🖨 Print</button>
  <span style="margin-left:4px;font-size:11px;color:#9ca3af">This bar is hidden when printing</span>
</div>
<div class="page">
  <div class="header">
    <div class="brand-box">
      <div class="brand-icon">
        <span style="color:#F0C040;font-size:13px;font-weight:900;letter-spacing:0.06em;line-height:1">EIHG</span>
        <span style="color:#c9a520;font-size:7px;font-weight:700;letter-spacing:0.18em;line-height:1;margin-top:3px">PORTAL</span>
      </div>
      <div>
        <div class="brand-title">Emirates International Holdings Group</div>
        <div class="brand-sub">Invoice Report · Admin Review</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>Admin:</strong> ${escHtml(currentUser.name)}<br/>
      <strong>Printed:</strong> ${new Date().toLocaleString()}<br/>
      <strong>Report ID:</strong> ADM-INV-${Date.now().toString().slice(-6)}
    </div>
  </div>

  <div class="tiles">
    <div class="tile tile-total">
      <div class="tile-label">Total</div>
      <div class="tile-value">${filteredInvoices.length}</div>
      <div class="tile-sub">invoices</div>
    </div>
    <div class="tile tile-pending">
      <div class="tile-label">Pending</div>
      <div class="tile-value">${invoiceReviewItems.length}</div>
      <div class="tile-sub">needs review</div>
    </div>
    <div class="tile tile-approved">
      <div class="tile-label">Approved</div>
      <div class="tile-value">${invoiceApprovedItems.length}</div>
      <div class="tile-sub">AED ${formatMoney(approvedTotal)}</div>
    </div>
    <div class="tile tile-paid">
      <div class="tile-label">Paid</div>
      <div class="tile-value">${invoicePaidItems.length}</div>
      <div class="tile-sub">AED ${formatMoney(paidTotal)}</div>
    </div>
    <div class="tile tile-amount">
      <div class="tile-label" style="color:#c9a520">Grand Total</div>
      <div class="tile-value" style="font-size:13px;margin-top:4px">AED</div>
      <div class="tile-sub" style="font-size:14px;font-weight:900;opacity:1">${formatMoney(invoiceGrandTotal)}</div>
    </div>
  </div>

  ${activeFilters.length > 0 ? `<div class="filter-bar">🔍 <strong>Active Filters:</strong> ${activeFilters.map(f => `<span style="background:#e2e8f0;padding:2px 10px;border-radius:999px;font-weight:600">${f}</span>`).join("")}</div>` : ""}

  <div class="section-title">📋 Invoice Details</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Employee</th>
        <th>Supplier</th>
        <th>Date Received</th>
        <th>Date Approved</th>
        <th>Attachment</th>
        <th>Status</th>
        <th style="text-align:right">Amount (AED)</th>
      </tr>
    </thead>
    <tbody>
      ${filteredInvoices.length > 0 ? filteredInvoices.map((item, idx) => `
      <tr>
        <td style="color:#9ca3af;font-size:12px;text-align:center">${idx + 1}</td>
        <td style="font-weight:700;color:#1e293b">${escHtml(item.employeeName)}</td>
        <td style="color:#374151">${escHtml(item.supplierName)}</td>
        <td style="color:#6b7280;font-size:12px">${escHtml(item.dateReceived || "—")}</td>
        <td style="color:#6b7280;font-size:12px">${escHtml(item.dateApproved || "—")}</td>
        <td style="color:#9ca3af;font-size:11px">${escHtml(item.attachmentName || "—")}</td>
        <td><span class="badge badge-${item.status === "Paid" ? "paid" : item.status === "Approved" ? "approved" : "pending"}">${escHtml(item.status)}</span></td>
        <td class="amount-cell">${formatMoney(item.totalAmount)}</td>
      </tr>`).join("") : `<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:24px;font-style:italic">No invoices match the current filters</td></tr>`}
      <tr class="totals-row">
        <td colspan="7" style="text-align:right;letter-spacing:0.04em">GRAND TOTAL</td>
        <td>AED ${formatMoney(invoiceGrandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Emirates International Holdings Group — Confidential · Finance Department</span>
    <span>Generated: ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`);

    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handlePrintOHCReport = () => {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) return;

    const sorted = [...ohcCertifications].sort((a, b) => {
      const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return ta - tb;
    });

    const total         = sorted.length;
    const activeCount   = sorted.filter(i => getOHCDisplayStatus(i.expiryDate, i.applied) === "Active").length;
    const soonCount     = sorted.filter(i => { const s = getOHCDisplayStatus(i.expiryDate, i.applied); return s === "Expiring Soon" || s === "Expires Today"; }).length;
    const expiredCount  = sorted.filter(i => getOHCDisplayStatus(i.expiryDate, i.applied) === "Expired").length;
    const appliedCount  = sorted.filter(i => getOHCDisplayStatus(i.expiryDate, i.applied) === "Applied").length;

    const statusColor = (s: OHCDisplayStatus) =>
      s === "Applied" ? "#1e40af" : s === "Expired" ? "#dc2626" : s === "Expires Today" ? "#ea580c" : s === "Expiring Soon" ? "#d97706" : "#16a34a";
    const statusBg = (s: OHCDisplayStatus) =>
      s === "Applied" ? "#dbeafe" : s === "Expired" ? "#fef2f2" : s === "Expires Today" ? "#fff7ed" : s === "Expiring Soon" ? "#fffbeb" : "#f0fdf4";

    const rows = sorted.map((item, idx) => {
      const status   = getOHCDisplayStatus(item.expiryDate, item.applied);
      const hint     = status === "Applied" ? "Renewal in progress" : getOHCHint(item.expiryDate);
      const sc       = statusColor(status);
      const sb       = statusBg(status);
      const empPhotoUrl = safeUrl(item.employeePhotoLink);
      const certPhotoUrl = safeUrl(item.certificatePhotoLink);
      const photo    = empPhotoUrl
        ? `<img src="${empPhotoUrl}" width="44" height="44" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ${sc}40;display:block;margin:0 auto" onerror="this.outerHTML='<div style=width:44px;height:44px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto>👤</div>'" />`
        : `<div style="width:44px;height:44px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto">👤</div>`;
      const cert     = certPhotoUrl
        ? `<img src="${certPhotoUrl}" style="width:56px;height:38px;border-radius:6px;object-fit:cover;border:1px solid #e5e7eb;display:block;margin:0 auto" onerror="this.outerHTML='<span style=color:#d1d5db;font-size:11px>—</span>'" />`
        : `<span style="color:#d1d5db;font-size:11px">—</span>`;
      const rowBg    = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `<tr style="background:${rowBg}">
        <td style="text-align:center;color:#9ca3af;font-size:11px;padding:8px 6px">${idx + 1}</td>
        <td style="padding:8px 10px;text-align:center">${photo}</td>
        <td style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b">${escHtml(item.name)}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#374151;white-space:nowrap">${escHtml(item.expiryDate || "—")}</td>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280">${escHtml(hint)}</td>
        <td style="padding:8px 12px;text-align:center">
          <span style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:800;color:${sc};background:${sb};border:1px solid ${sc}30">${escHtml(status)}</span>
        </td>
        <td style="padding:8px 10px;text-align:center">${cert}</td>
      </tr>`;
    }).join("");

    popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>OHC Certifications Report — EIHG</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f9fafb}
    .page{max-width:1060px;margin:0 auto;padding:40px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #0f1c35;margin-bottom:24px}
    .brand-box{display:flex;align-items:center;gap:14px}
    .brand-icon{width:52px;height:52px;background:linear-gradient(145deg,#0f1c35,#1b2a4a);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #F0C040;flex-shrink:0}
    .brand-title{font-size:19px;font-weight:900;color:#0f1c35;letter-spacing:-0.01em}
    .brand-sub{font-size:11px;color:#6b7280;margin-top:2px;font-weight:500}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
    .tile{border-radius:12px;padding:16px 12px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:28px;font-weight:900;line-height:1}
    table{width:100%;border-collapse:collapse;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.06);border-radius:10px;overflow:hidden}
    thead tr{background:#0f1c35}
    thead th{padding:11px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.05em;color:#F0C040}
    thead th:first-child{text-align:center}
    tbody td{border-bottom:1px solid #e5e7eb;vertical-align:middle}
    .footer{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}table{box-shadow:none}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#0f1c35,#1b2a4a);color:#F0C040;cursor:pointer;font-size:13px;font-weight:700">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1e293b;cursor:pointer;font-size:13px;font-weight:700">🖨 Print</button>
  <span style="margin-left:4px;font-size:11px;color:#9ca3af">Wait for photos to load before printing</span>
</div>
<div class="page">
  <div class="header">
    <div class="brand-box">
      <div class="brand-icon">
        <span style="color:#F0C040;font-size:13px;font-weight:900;letter-spacing:0.06em;line-height:1">EIHG</span>
        <span style="color:#c9a520;font-size:7px;font-weight:700;letter-spacing:0.18em;line-height:1;margin-top:3px">PORTAL</span>
      </div>
      <div>
        <div class="brand-title">Emirates International Holdings Group</div>
        <div class="brand-sub">OHC Certifications — Full Report · Sorted by Expiry Date</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>Printed by:</strong> ${escHtml(currentUser.name)}<br/>
      <strong>Date:</strong> ${new Date().toLocaleString()}<br/>
      <strong>Total Records:</strong> ${total}
    </div>
  </div>

  <div class="tiles" style="${appliedCount > 0 ? "grid-template-columns:repeat(5,1fr)" : ""}">
    <div class="tile" style="background:#f0fdf4;border:1px solid #bbf7d0">
      <div class="tile-label" style="color:#166534">Active</div>
      <div class="tile-value" style="color:#16a34a">${activeCount}</div>
    </div>
    <div class="tile" style="background:#fffbeb;border:1px solid #fde68a">
      <div class="tile-label" style="color:#92400e">Expiring Soon</div>
      <div class="tile-value" style="color:#d97706">${soonCount}</div>
    </div>
    <div class="tile" style="background:#fef2f2;border:1px solid #fecaca">
      <div class="tile-label" style="color:#991b1b">Expired</div>
      <div class="tile-value" style="color:#dc2626">${expiredCount}</div>
    </div>
    ${appliedCount > 0 ? `<div class="tile" style="background:#dbeafe;border:1px solid #bfdbfe">
      <div class="tile-label" style="color:#1e40af">Applied</div>
      <div class="tile-value" style="color:#1d4ed8">${appliedCount}</div>
    </div>` : ""}
    <div class="tile" style="background:#eff6ff;border:1px solid #bfdbfe">
      <div class="tile-label" style="color:#1e40af">Total</div>
      <div class="tile-value" style="color:#2563eb">${total}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center">#</th>
        <th style="width:60px;text-align:center">Photo</th>
        <th>Employee Name</th>
        <th style="width:115px">Expiry Date</th>
        <th style="width:130px">Remaining</th>
        <th style="width:120px;text-align:center">Status</th>
        <th style="width:72px;text-align:center">Certificate</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span>Emirates International Holdings Group — Confidential Document</span>
    <span>Generated: ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`);
    popup.document.close();
    setTimeout(() => popup.focus(), 100);
  };

  const handlePrintBirthdayReport = () => {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) return;

    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate  = today.getDate();

    const calcDaysUntil = (bStr: string): number => {
      if (!bStr) return 999;
      const bday = new Date(bStr);
      if (isNaN(bday.getTime())) return 999;
      const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const diff = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
      return diff >= 0 ? diff : Math.round((new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate()).getTime() - today.getTime()) / 86400000);
    };

    const calcAge = (bStr: string): string => {
      if (!bStr) return "—";
      const bday = new Date(bStr);
      if (isNaN(bday.getTime())) return "—";
      let age = today.getFullYear() - bday.getFullYear();
      if (today.getMonth() < bday.getMonth() || (today.getMonth() === bday.getMonth() && today.getDate() < bday.getDate())) age--;
      return String(age);
    };

    const formatBirthday = (bStr: string): string => {
      if (!bStr) return "—";
      const bday = new Date(bStr);
      if (isNaN(bday.getTime())) return bStr;
      return bday.toLocaleDateString("en-GB", { day: "2-digit", month: "long" });
    };

    const sorted = [...birthdays].sort((a, b) => calcDaysUntil(a.birthday) - calcDaysUntil(b.birthday));
    const todayCount    = sorted.filter(b => { const d = new Date(b.birthday); return !isNaN(d.getTime()) && d.getMonth() === todayMonth && d.getDate() === todayDate; }).length;
    const nextSevenDays = sorted.filter(b => calcDaysUntil(b.birthday) <= 7).length;
    const monthNames    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const nextUpcoming  = sorted.find(b => { const d = new Date(b.birthday); return !isNaN(d.getTime()); });
    const tileMonth     = nextUpcoming ? new Date(nextUpcoming.birthday).getMonth() : todayMonth;
    const tileMonthName = monthNames[tileMonth];
    const thisMonthCount = sorted.filter(b => { const d = new Date(b.birthday); return !isNaN(d.getTime()) && d.getMonth() === tileMonth; }).length;

    const rows = sorted.map((item, idx) => {
      const days     = calcDaysUntil(item.birthday);
      const age      = calcAge(item.birthday);
      const isToday  = days === 0;
      const isSoon   = days > 0 && days <= 7;
      const pillColor = isToday ? "#db2777" : isSoon ? "#d97706" : "#6366f1";
      const pillBg    = isToday ? "#fdf2f8" : isSoon ? "#fffbeb" : "#f5f3ff";
      const pillText  = isToday ? "🎂 Today!" : `in ${days}d`;
      const photoUrl  = safeUrl(item.photoLink);
      const photo     = photoUrl
        ? `<img src="${photoUrl}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid ${pillColor}40;display:block;margin:0 auto" onerror="this.outerHTML='<div style=width:46px;height:46px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto>🎂</div>'" />`
        : `<div style="width:46px;height:46px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto">🎂</div>`;
      const rowBg = isToday ? "#fff0f8" : idx % 2 === 0 ? "#ffffff" : "#f9fafb";
      const border = isToday ? "border-left:3px solid #db2777" : isSoon ? "border-left:3px solid #f59e0b" : "";
      return `<tr style="background:${rowBg};${border}">
        <td style="padding:8px 10px;text-align:center;color:#9ca3af;font-size:11px">${idx + 1}</td>
        <td style="padding:8px 10px;text-align:center">${photo}</td>
        <td style="padding:8px 14px;font-weight:700;font-size:13px;color:#1e293b">${escHtml(item.name)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600">${escHtml(formatBirthday(item.birthday))}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:center">${escHtml(age)} yrs</td>
        <td style="padding:8px 12px;text-align:center">
          <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:800;color:${pillColor};background:${pillBg};border:1px solid ${pillColor}30">${escHtml(pillText)}</span>
        </td>
      </tr>`;
    }).join("");

    popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Staff Birthdays Report — EIHG</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f9fafb}
    .page{max-width:1000px;margin:0 auto;padding:40px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #0f1c35;margin-bottom:26px}
    .brand-box{display:flex;align-items:center;gap:14px}
    .brand-icon{width:54px;height:54px;background:linear-gradient(145deg,#0f1c35,#1b2a4a);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #F0C040;flex-shrink:0}
    .brand-title{font-size:19px;font-weight:900;color:#0f1c35}
    .brand-sub{font-size:11px;color:#6b7280;margin-top:2px;font-weight:500}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
    .tile{border-radius:12px;padding:16px 14px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:28px;font-weight:900;line-height:1}
    .legend{display:flex;gap:20px;margin-bottom:18px;font-size:12px;color:#6b7280;flex-wrap:wrap}
    .legend-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
    table{width:100%;border-collapse:collapse;font-size:13px;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.07)}
    thead tr{background:#0f1c35}
    thead th{padding:11px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.05em;color:#F0C040}
    thead th:first-child,thead th:last-child{text-align:center}
    tbody td{border-bottom:1px solid #f1f5f9;vertical-align:middle}
    .footer{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}table{box-shadow:none}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#0f1c35,#1b2a4a);color:#F0C040;cursor:pointer;font-size:13px;font-weight:700">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1e293b;cursor:pointer;font-size:13px;font-weight:700">🖨 Print</button>
  <span style="margin-left:4px;font-size:11px;color:#9ca3af">Wait for photos to load before printing</span>
</div>
<div class="page">

  <div class="header">
    <div class="brand-box">
      <div class="brand-icon">
        <span style="color:#F0C040;font-size:14px;font-weight:900;letter-spacing:0.06em;line-height:1">EIHG</span>
        <span style="color:#c9a520;font-size:8px;font-weight:700;letter-spacing:0.18em;margin-top:3px">PORTAL</span>
      </div>
      <div>
        <div class="brand-title">Emirates International Holdings Group</div>
        <div class="brand-sub">Staff Birthdays — Full Report · Sorted by Upcoming Birthday</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>Printed by:</strong> ${escHtml(currentUser.name)}<br/>
      <strong>Date:</strong> ${today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}<br/>
      <strong>Total Staff:</strong> ${sorted.length}
    </div>
  </div>

  <div class="tiles">
    <div class="tile" style="background:#f5f3ff;border:1px solid #ddd6fe">
      <div class="tile-label" style="color:#6d28d9">Total Staff</div>
      <div class="tile-value" style="color:#7c3aed">${sorted.length}</div>
    </div>
    <div class="tile" style="background:#fdf2f8;border:1px solid #fbcfe8">
      <div class="tile-label" style="color:#9d174d">Today 🎂</div>
      <div class="tile-value" style="color:#db2777">${todayCount}</div>
    </div>
    <div class="tile" style="background:#fffbeb;border:1px solid #fde68a">
      <div class="tile-label" style="color:#92400e">Next 7 Days</div>
      <div class="tile-value" style="color:#d97706">${nextSevenDays}</div>
    </div>
    <div class="tile" style="background:#eff6ff;border:1px solid #bfdbfe">
      <div class="tile-label" style="color:#1e40af">${tileMonthName}</div>
      <div class="tile-value" style="color:#2563eb">${thisMonthCount}</div>
    </div>
  </div>

  <div class="legend">
    <span><span class="legend-dot" style="background:#db2777"></span>Today's birthday</span>
    <span><span class="legend-dot" style="background:#f59e0b"></span>Within 7 days</span>
    <span><span class="legend-dot" style="background:#6366f1"></span>Upcoming</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center">#</th>
        <th style="width:60px;text-align:center">Photo</th>
        <th>Employee Name</th>
        <th style="width:130px">Birthday</th>
        <th style="width:80px;text-align:center">Age</th>
        <th style="width:110px;text-align:center">Countdown</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span>Emirates International Holdings Group — Confidential Document</span>
    <span>Generated: ${today.toLocaleString()}</span>
  </div>
</div>
</body>
</html>`);
    popup.document.close();
    setTimeout(() => popup.focus(), 100);
  };

  const openAddOHCForm = () => {
    resetOHCForm();
    setOhcFormOpen(true);
  };

  const openEditOHCForm = (item: OHCCertificationEntry) => {
    setEditingOHC(item);
    setOhcEmployeePhoto(null);
    setOhcCertificatePhoto(null);
    setOhcForm({
      name: item.name,
      expiryDate: item.expiryDate,
      employeePhotoName: "",
      certificatePhotoName: "",
      currentEmployeePhotoPath: item.employeePhotoPath || "",
      currentEmployeePhotoLink: item.employeePhotoLink || "",
      currentCertificatePhotoPath: item.certificatePhotoPath || "",
      currentCertificatePhotoLink: item.certificatePhotoLink || "",
    });
    setOhcFormOpen(true);
  };

  const handleSaveOHC = async () => {
    if (!ohcForm.name || !ohcForm.expiryDate) {
      showToast("error", "Please enter the employee name and expiry date.");
      return;
    }

    try {
      setOhcSaving(true);

      if (editingOHC && onUpdateOHCCertification) {
        await onUpdateOHCCertification(editingOHC.id, {
          name: ohcForm.name,
          expiryDate: ohcForm.expiryDate,
          employeePhoto: ohcEmployeePhoto,
          certificatePhoto: ohcCertificatePhoto,
          currentEmployeePhotoPath: ohcForm.currentEmployeePhotoPath,
          currentEmployeePhotoLink: ohcForm.currentEmployeePhotoLink,
          currentCertificatePhotoPath: ohcForm.currentCertificatePhotoPath,
          currentCertificatePhotoLink: ohcForm.currentCertificatePhotoLink,
        });
        showToast("success", "OHC certificate updated successfully.");
      } else if (!editingOHC && onAddOHCCertification) {
        await onAddOHCCertification({
          name: ohcForm.name,
          expiryDate: ohcForm.expiryDate,
          employeePhoto: ohcEmployeePhoto,
          certificatePhoto: ohcCertificatePhoto,
        });
        showToast("success", "OHC certificate added successfully.");
      }

      setOhcFormOpen(false);
      resetOHCForm();
    } catch (error) {
      console.error(error);
      showToast("error", "Error saving OHC certificate.");
    } finally {
      setOhcSaving(false);
    }
  };

  const handleDeleteOHCInsideForm = async () => {
    if (!editingOHC || !onDeleteOHCCertification) return;

    setOhcFormOpen(false);
    await onDeleteOHCCertification(editingOHC.id, editingOHC.name);
    resetOHCForm();
  };

  // ── Basic Food Safety Certificate Monitoring — actions ──
  const resetFSForm = () => {
    setFsForm({
      name: "",
      employeeId: "",
      certificateId: "",
      issueDate: "",
      expiryDate: FOOD_SAFETY_DEFAULT_EXPIRY,
    });
    setEditingFS(null);
  };

  const openAddFSForm = () => {
    resetFSForm();
    setFsFormOpen(true);
  };

  const openEditFSForm = (item: FoodSafetyCertificationEntry) => {
    setEditingFS(item);
    setFsForm({
      name: item.name,
      employeeId: item.employeeId || "",
      certificateId: item.certificateId || "",
      issueDate: item.issueDate || "",
      expiryDate: item.expiryDate || FOOD_SAFETY_DEFAULT_EXPIRY,
    });
    setFsFormOpen(true);
  };

  const handleSaveFS = async () => {
    if (!fsForm.name.trim() || !fsForm.certificateId.trim() || !fsForm.expiryDate) {
      showToast("error", "Please enter the staff name, certificate ID and expiry date.");
      return;
    }

    try {
      setFsSaving(true);
      const payload = {
        name: fsForm.name.trim(),
        employeeId: fsForm.employeeId.trim(),
        certificateId: fsForm.certificateId.trim(),
        issueDate: fsForm.issueDate,
        expiryDate: fsForm.expiryDate,
      };

      if (editingFS && onUpdateFoodSafetyCertification) {
        await onUpdateFoodSafetyCertification(editingFS.id, payload);
        showToast("success", "Food Safety certificate updated successfully.");
      } else if (!editingFS && onAddFoodSafetyCertification) {
        await onAddFoodSafetyCertification(payload);
        showToast("success", "Food Safety certificate added successfully.");
      }

      setFsFormOpen(false);
      resetFSForm();
    } catch (error) {
      console.error(error);
      showToast("error", "Error saving Food Safety certificate.");
    } finally {
      setFsSaving(false);
    }
  };

  const handleDeleteFSInsideForm = async () => {
    if (!editingFS || !onDeleteFoodSafetyCertification) return;
    setFsFormOpen(false);
    await onDeleteFoodSafetyCertification(editingFS.id, editingFS.name);
    resetFSForm();
  };

  const handleExportFSExcel = () => {
    const sorted = [...filteredSortedFS];
    const csvCell = (value: string | number) => {
      const s = String(value ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "#", "Staff Name", "Employee ID", "Certificate ID", "Issue Date",
      "Expiry Date", "Status", "Days Remaining", "Last Updated",
    ];
    const lines = [header.map(csvCell).join(",")];
    sorted.forEach((item, idx) => {
      lines.push([
        idx + 1,
        item.name,
        item.employeeId || "",
        item.certificateId || "",
        item.issueDate || "",
        item.expiryDate || "",
        getFoodSafetyStatus(item.expiryDate),
        getFoodSafetyDaysLabel(item.expiryDate),
        formatFoodSafetyUpdated(item.updatedAt),
      ].map(csvCell).join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `basic-food-safety-certificates-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrintFSReport = () => {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) return;

    const sorted = [...foodSafetyCertifications].sort((a, b) => {
      const ta = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const tb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return ta - tb;
    });

    const total        = sorted.length;
    const validCount   = sorted.filter(i => getFoodSafetyStatus(i.expiryDate) === "Valid").length;
    const soonCount    = sorted.filter(i => getFoodSafetyStatus(i.expiryDate) === "Expiring Soon").length;
    const expiredCount = sorted.filter(i => getFoodSafetyStatus(i.expiryDate) === "Expired").length;

    const statusColor = (s: FoodSafetyStatus) => s === "Expired" ? "#dc2626" : s === "Expiring Soon" ? "#d97706" : "#16a34a";
    const statusBg    = (s: FoodSafetyStatus) => s === "Expired" ? "#fef2f2" : s === "Expiring Soon" ? "#fffbeb" : "#f0fdf4";

    const rows = sorted.map((item, idx) => {
      const status = getFoodSafetyStatus(item.expiryDate);
      const sc = statusColor(status);
      const sb = statusBg(status);
      const rowBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `<tr style="background:${rowBg}">
        <td style="text-align:center;color:#9ca3af;font-size:11px;padding:8px 6px">${idx + 1}</td>
        <td style="padding:8px 12px;font-weight:700;font-size:13px;color:#1e293b">${escHtml(item.name)}</td>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280">${escHtml(item.employeeId || "—")}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;font-weight:600">${escHtml(item.certificateId || "—")}</td>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280;white-space:nowrap">${escHtml(formatFoodSafetyDate(item.issueDate))}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#374151;white-space:nowrap">${escHtml(formatFoodSafetyDate(item.expiryDate))}</td>
        <td style="padding:8px 12px;text-align:center">
          <span style="display:inline-block;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:800;color:${sc};background:${sb};border:1px solid ${sc}30">${escHtml(status)}</span>
        </td>
        <td style="padding:8px 12px;font-size:12px;color:#6b7280;white-space:nowrap">${escHtml(getFoodSafetyDaysLabel(item.expiryDate))}</td>
      </tr>`;
    }).join("");

    popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Basic Food Safety Certificates Report — EIHG</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f9fafb}
    .page{max-width:1060px;margin:0 auto;padding:40px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:3px solid #0f1c35;margin-bottom:24px}
    .brand-box{display:flex;align-items:center;gap:14px}
    .brand-icon{width:52px;height:52px;background:linear-gradient(145deg,#0f1c35,#1b2a4a);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #F0C040;flex-shrink:0}
    .brand-title{font-size:19px;font-weight:900;color:#0f1c35;letter-spacing:-0.01em}
    .brand-sub{font-size:11px;color:#6b7280;margin-top:2px;font-weight:500}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
    .tile{border-radius:12px;padding:16px 12px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:28px;font-weight:900;line-height:1}
    table{width:100%;border-collapse:collapse;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,0.06);border-radius:10px;overflow:hidden}
    thead tr{background:#0f1c35}
    thead th{padding:11px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.05em;color:#F0C040}
    thead th:first-child{text-align:center}
    tbody td{border-bottom:1px solid #e5e7eb;vertical-align:middle}
    .footer{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}table{box-shadow:none}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#0f1c35,#1b2a4a);color:#F0C040;cursor:pointer;font-size:13px;font-weight:700">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1e293b;cursor:pointer;font-size:13px;font-weight:700">🖨 Print / Save as PDF</button>
</div>
<div class="page">
  <div class="header">
    <div class="brand-box">
      <div class="brand-icon">
        <span style="color:#F0C040;font-size:13px;font-weight:900;letter-spacing:0.06em;line-height:1">EIHG</span>
        <span style="color:#c9a520;font-size:7px;font-weight:700;letter-spacing:0.18em;line-height:1;margin-top:3px">PORTAL</span>
      </div>
      <div>
        <div class="brand-title">Emirates International Holdings Group</div>
        <div class="brand-sub">Basic Food Safety Certificates — Full Report · Sorted by Expiry Date</div>
      </div>
    </div>
    <div class="report-meta">
      <strong>Printed by:</strong> ${escHtml(currentUser.name)}<br/>
      <strong>Date:</strong> ${new Date().toLocaleString()}<br/>
      <strong>Total Records:</strong> ${total}
    </div>
  </div>

  <div class="tiles">
    <div class="tile" style="background:#f0fdf4;border:1px solid #bbf7d0">
      <div class="tile-label" style="color:#166534">Valid</div>
      <div class="tile-value" style="color:#16a34a">${validCount}</div>
    </div>
    <div class="tile" style="background:#fffbeb;border:1px solid #fde68a">
      <div class="tile-label" style="color:#92400e">Expiring Soon</div>
      <div class="tile-value" style="color:#d97706">${soonCount}</div>
    </div>
    <div class="tile" style="background:#fef2f2;border:1px solid #fecaca">
      <div class="tile-label" style="color:#991b1b">Expired</div>
      <div class="tile-value" style="color:#dc2626">${expiredCount}</div>
    </div>
    <div class="tile" style="background:#eff6ff;border:1px solid #bfdbfe">
      <div class="tile-label" style="color:#1e40af">Total</div>
      <div class="tile-value" style="color:#2563eb">${total}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center">#</th>
        <th>Staff Name</th>
        <th style="width:110px">Employee ID</th>
        <th style="width:130px">Certificate ID</th>
        <th style="width:110px">Issue Date</th>
        <th style="width:110px">Expiry Date</th>
        <th style="width:120px;text-align:center">Status</th>
        <th style="width:140px">Days Remaining</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <span>Emirates International Holdings Group — Confidential Document</span>
    <span>Generated: ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`);
    popup.document.close();
    setTimeout(() => popup.focus(), 100);
  };

  const handleAssignTask = async () => {
    if (!selectedEmployee || !assignForm.title) {
      showToast("error", "Please select an employee and fill the task title.");
      return;
    }

    try {
      setAssigning(true);
      await onAssignTask({
        employeeUid: selectedEmployee.uid,
        employeeName: selectedEmployee.name,
        employeeEmail: selectedEmployee.email,
        title: assignForm.title,
        description: assignForm.description,
        selectedFiles: selectedTaskFiles,
        deadline: assignForm.deadline,
      });

      setAssignForm({
        title: "",
        description: "",
        attachmentName: "",
        deadline: "",
      });

      setSelectedTaskFiles([]);
      setEmployeeProfileTab("tasks");
      showToast("success", "Task assigned successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error assigning task.");
    } finally {
      setAssigning(false);
    }
  };

  const handleAddBirthday = async () => {
    if (!birthdayForm.name || !birthdayForm.birthday) {
      showToast("error", "Please enter the employee name and birthday date.");
      return;
    }

    try {
      setBirthdaySaving(true);
      await onAddBirthday({
        name: birthdayForm.name,
        birthday: birthdayForm.birthday,
        photo: birthdayPhoto,
        gender: birthdayForm.gender || undefined,
      });

      setBirthdayForm({
        name: "",
        birthday: "",
        photoName: "",
        gender: "",
      });
      setBirthdayPhoto(null);
      setShowBirthdayModal(false);
      setShowBirthdayMenu(false);
      showToast("success", "Birthday added successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error adding birthday.");
    } finally {
      setBirthdaySaving(false);
    }
  };

  const pageTitles: Record<DashboardTab, string> = {
    dashboard: "Dashboard",
    review: "Review",
    employees: "Employees",
    hr: "HR",
    invoices: "Invoices",
    assessments: "Assessments",
    reports: "Reports",
  };

  return (
    <div style={dashboardWrapperStyle()}>

      {/* ── Notifications panel ── */}
      {showNotifications && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: isMobile ? 0 : (sidebarCollapsed ? 72 : 240),
            width: isMobile ? "100%" : 340,
            height: "100vh",
            background: theme.cardBackground,
            borderRight: `1px solid ${theme.cardBorder}`,
            zIndex: 60,
            boxShadow: "4px 0 24px rgba(0,0,0,0.14)",
            overflowY: "auto",
            animation: "slideInNotif 0.2s ease",
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.title }}>🔔 Notifications</div>
            <button
              onClick={() => setShowNotifications(false)}
              style={{ border: "none", background: "transparent", color: theme.subtleText, cursor: "pointer", fontSize: 20, fontWeight: 700 }}
            >×</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {pendingCount === 0 && pendingAttendanceCount === 0 && invoiceReviewItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: theme.subtleText, fontSize: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
                All caught up — no pending actions.
              </div>
            ) : (
              <>
                {pendingReviewTasks.length > 0 && (
                  <button onClick={() => { setActiveTab("review"); setReviewFilter("pending"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(99,102,241,0.08)" }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{pendingReviewTasks.length} submitted task{pendingReviewTasks.length > 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Waiting for review</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#6366f1", fontWeight: 800 }}>→</span>
                  </button>
                )}
                {pendingReviewWorks.length > 0 && (
                  <button onClick={() => { setActiveTab("review"); setReviewFilter("pending"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(99,102,241,0.08)" }}>
                    <span style={{ fontSize: 20 }}>📁</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{pendingReviewWorks.length} pending work record{pendingReviewWorks.length > 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Waiting for review</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#6366f1", fontWeight: 800 }}>→</span>
                  </button>
                )}
                {pendingAttendanceCount > 0 && (
                  <button onClick={() => { setActiveTab("hr"); setHrSubTab("attendance"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(245,158,11,0.08)" }}>
                    <span style={{ fontSize: 20 }}>🕐</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{pendingAttendanceCount} attendance record{pendingAttendanceCount > 1 ? "s" : ""}</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Pending approval</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#f59e0b", fontWeight: 800 }}>→</span>
                  </button>
                )}
                {invoiceReviewItems.length > 0 && (
                  <button onClick={() => { setActiveTab("invoices"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(16,185,129,0.08)" }}>
                    <span style={{ fontSize: 20 }}>💰</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{invoiceReviewItems.length} invoice{invoiceReviewItems.length > 1 ? "s" : ""} need review</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Pending or overdue</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#10b981", fontWeight: 800 }}>→</span>
                  </button>
                )}
                {ohcRenewalAlerts.length > 0 && (
                  <button onClick={() => { setActiveTab("hr"); setHrSubTab("ohc"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(239,68,68,0.08)" }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{ohcRenewalAlerts.length} OHC cert{ohcRenewalAlerts.length > 1 ? "s" : ""} expiring</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Expired or expiring soon</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#ef4444", fontWeight: 800 }}>→</span>
                  </button>
                )}
                {fsRenewalAlerts.length > 0 && (
                  <button onClick={() => { setActiveTab("hr"); setHrSubTab("foodSafety"); setShowNotifications(false); }}
                    style={{ ...notifItemStyle(theme), background: "rgba(14,165,233,0.08)" }}>
                    <span style={{ fontSize: 20 }}>🥗</span>
                    <div>
                      <div style={{ fontWeight: 700, color: theme.title, fontSize: 13 }}>{fsRenewalAlerts.length} Food Safety cert{fsRenewalAlerts.length > 1 ? "s" : ""} expiring</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>Expired or expiring within 30 days</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#0ea5e9", fontWeight: 800 }}>→</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {showNotifications && (
        <div onClick={() => setShowNotifications(false)} style={{ position: "fixed", inset: 0, zIndex: 55 }} />
      )}

      {/* ── Sidebar ── */}
      <aside className="portal-sidebar" style={{
        ...sidebarStyle(),
        width: sidebarCollapsed ? 72 : 240,
        minWidth: sidebarCollapsed ? 72 : 240,
        padding: sidebarCollapsed ? "20px 8px" : "20px 12px",
        transition: "width 0.22s ease, min-width 0.22s ease, padding 0.22s ease",
        overflow: "hidden",
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            position: "absolute",
            top: 16,
            right: sidebarCollapsed ? 12 : 10,
            width: 26,
            height: 26,
            borderRadius: 8,
            border: `1px solid ${theme.cardBorder}`,
            background: theme.cardBackground,
            color: theme.subtleText,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            zIndex: 1,
          }}
        >
          {sidebarCollapsed ? "›" : "‹"}
        </button>

        {/* Profile section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: sidebarCollapsed ? "4px 0 16px 0" : "4px 4px 20px 4px",
            borderBottom: `1px solid ${theme.cardBorder}`,
            marginBottom: 12,
            gap: 8,
            marginTop: 24,
          }}
        >
          <div style={{ position: "relative" }}>
            {profilePhotoPreview ? (
              <Image
                src={profilePhotoPreview}
                alt="Profile"
                width={sidebarCollapsed ? 44 : 68}
                height={sidebarCollapsed ? 44 : 68}
                style={{
                  width: sidebarCollapsed ? 44 : 68,
                  height: sidebarCollapsed ? 44 : 68,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `2.5px solid ${theme.cardBorder}`,
                  display: "block",
                  transition: "width 0.22s ease, height 0.22s ease",
                }}
              />
            ) : (
              <AvatarInitials name={currentUser.name} size={sidebarCollapsed ? 44 : 68} />
            )}
            {!sidebarCollapsed && (
              <button
                onClick={() => profilePhotoInputRef.current?.click()}
                title="Change photo"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: theme.cardBackground,
                  border: `1.5px solid ${theme.cardBorder}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  padding: 0,
                }}
              >
                📷
              </button>
            )}
            <input
              type="file"
              accept="image/*"
              ref={profilePhotoInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const dataUrl = ev.target?.result as string;
                  setProfilePhotoPreview(dataUrl);
                  localStorage.setItem(`profilePhoto_${currentUser.uid}`, dataUrl);
                };
                reader.readAsDataURL(file);
              }}
            />
          </div>

          {!sidebarCollapsed && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.title, lineHeight: 1.4 }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>Admin</div>
            </div>
          )}
        </div>

        {/* Notifications bell */}
        {!sidebarCollapsed && (
          <button
            onClick={() => setShowNotifications(v => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 12,
              border: `1px solid ${showNotifications ? "#6366f1" : theme.cardBorder}`,
              background: showNotifications ? "rgba(99,102,241,0.08)" : "transparent",
              color: showNotifications ? "#6366f1" : theme.mutedText,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
              position: "relative",
            }}
          >
            <span style={{ fontSize: 16 }}>🔔</span>
            <span>Notifications</span>
            {(pendingCount + pendingAttendanceCount + invoiceReviewItems.length) > 0 && (
              <span style={{
                marginLeft: "auto",
                background: "#ef4444",
                color: "#fff",
                borderRadius: 999,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 800,
              }}>
                {pendingCount + pendingAttendanceCount + invoiceReviewItems.length}
              </span>
            )}
          </button>
        )}
        {sidebarCollapsed && (
          <button
            onClick={() => setShowNotifications(v => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 0",
              borderRadius: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 18,
              marginBottom: 6,
              position: "relative",
            }}
          >
            🔔
            {(pendingCount + pendingAttendanceCount + invoiceReviewItems.length) > 0 && (
              <span style={{
                position: "absolute",
                top: 2,
                right: 6,
                background: "#ef4444",
                color: "#fff",
                borderRadius: 999,
                padding: "0 4px",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: "16px",
              }}>
                {pendingCount + pendingAttendanceCount + invoiceReviewItems.length}
              </span>
            )}
          </button>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          {(
            [
              { id: "dashboard",   icon: "📊", label: "Dashboard",   badge: 0 },
              { id: "review",      icon: "📋", label: "Review",      badge: pendingCount },
              { id: "employees",   icon: "👥", label: "Employees",   badge: 0 },
              { id: "hr",          icon: "🏢", label: "HR",          badge: pendingAttendanceCount },
              { id: "invoices",    icon: "💰", label: "Invoices",    badge: invoiceReviewItems.length },
              { id: "assessments", icon: "📝", label: "Assessments", badge: 0 },
              { id: "reports",     icon: "📑", label: "Reports",     badge: 0 },
            ] as { id: DashboardTab; icon: string; label: string; badge: number }[]
          ).map(({ id, icon, label, badge }) => (
            <button
              key={id}
              style={{
                ...navItemStyle(activeTab === id),
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                padding: sidebarCollapsed ? "10px 0" : "10px 14px",
              }}
              onClick={() => setActiveTab(id)}
              title={sidebarCollapsed ? label : undefined}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {!sidebarCollapsed && <span>{label}</span>}
              {!sidebarCollapsed && badge > 0 && (
                <span style={navBadgeStyle(activeTab === id)}>{badge}</span>
              )}
              {sidebarCollapsed && badge > 0 && (
                <span style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "0 4px",
                  fontSize: 9,
                  fontWeight: 800,
                  lineHeight: "14px",
                }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div
          style={{
            borderTop: `1px solid ${theme.cardBorder}`,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {!sidebarCollapsed && (
            <div style={{ marginTop: 8, padding: "0 4px" }}>
              <div style={{ fontSize: 12, color: theme.subtleText, marginBottom: 4 }}>
                {currentUser.name}
              </div>
              <button
                style={{
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: 12,
                  border: `1px solid ${theme.cardBorder}`,
                  background: "transparent",
                  color: theme.mutedText,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "left",
                }}
                onClick={onLogout}
              >
                ← Logout
              </button>
            </div>
          )}
          {sidebarCollapsed && (
            <button
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 12,
                border: "none",
                background: "transparent",
                color: theme.mutedText,
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={onLogout}
              title="Logout"
            >
              ←
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="portal-content" style={{
        ...sidebarContentStyle(),
        marginLeft: isMobile ? 0 : (sidebarCollapsed ? 72 : 240),
        transition: "margin-left 0.22s ease",
      }}>

        {/* Page header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <h1
              className="page-header-title"
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: theme.title,
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              {pageTitles[activeTab]}
            </h1>
            <div style={{ fontSize: 14, color: theme.subtleText, marginTop: 4 }}>
              Welcome back, {currentUser.name}
            </div>
          </div>

          {/* Logout — visible only on mobile */}
          <button
            className="mobile-logout-btn"
            onClick={onLogout}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: `1px solid ${theme.cardBorder}`,
              background: theme.cardBackground,
              color: theme.mutedText,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ← Logout
          </button>

        </div>


        {/* Tab content with smooth fade-in animation */}
        <div key={activeTab} style={{ animation: "fadeInTab 0.18s ease" }}>


        {activeTab === "dashboard" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 20 }}>

              {/* ── Stats strip ── */}
              <div className="stat-grid-main" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Total Employees",    value: employeeList.length,          color: "#6366f1", icon: "👥", hint: "Active staff" },
                  { label: "Pending Review",      value: pendingCount,                 color: "#f59e0b", icon: "⏳", hint: "Tasks & works" },
                  { label: "Total Approved",      value: approvedCount,                color: "#22c55e", icon: "✅", hint: "This period" },
                  { label: "Pending Attendance",  value: pendingAttendanceCount,       color: "#3b82f6", icon: "🕐", hint: "Awaiting review" },
                  { label: "OHC Alerts",          value: ohcRenewalAlerts.length,      color: "#ef4444", icon: "⚕️", hint: "Expiring certs" },
                  { label: "Invoices Due",        value: invoiceReviewItems.length,    color: "#8b5cf6", icon: "🧾", hint: "Need review" },
                ].map(s => (
                  <div key={s.label} style={{
                    background: theme.cardBackground,
                    borderTop: `3px solid ${s.color}`,
                    borderLeft: `1px solid ${theme.cardBorder}`,
                    borderRight: `1px solid ${theme.cardBorder}`,
                    borderBottom: `1px solid ${theme.cardBorder}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    display: "flex", alignItems: "center", gap: 14,
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: `${s.color}18`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: theme.title, marginTop: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 1 }}>{s.hint}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Quick Actions ── */}
              <div style={{
                background: theme.cardBackground,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.subtleText, marginRight: 4 }}>Quick Actions:</span>
                {[
                  { label: "Review Queue", tab: "review" as DashboardTab,    icon: "📋", color: "#f59e0b", badge: pendingCount },
                  { label: "Employees",    tab: "employees" as DashboardTab, icon: "👥", color: "#6366f1", badge: 0 },
                  { label: "HR",           tab: "hr" as DashboardTab,        icon: "⚕️", color: "#ef4444", badge: ohcRenewalAlerts.length + fsRenewalAlerts.length + todaysBirthdays.length },
                  { label: "Invoices",     tab: "invoices" as DashboardTab,  icon: "🧾", color: "#8b5cf6", badge: invoiceReviewItems.length },
                ].map(({ label, tab, icon, color, badge }) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 16px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${theme.cardBorder}`,
                      background: theme.softCardBackground,
                      color: theme.mutedText, fontSize: 13, fontWeight: 700,
                      position: "relative",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    {badge > 0 && (
                      <span style={{
                        background: color, color: "#fff",
                        borderRadius: 999, fontSize: 10, fontWeight: 800,
                        padding: "1px 6px", marginLeft: 2,
                      }}>{badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── OHC Renewal Alerts ── */}
              {ohcRenewalAlerts.length > 0 && (
                <OHCRenewalCard
                  items={ohcRenewalAlerts}
                  onOpenEmployeePhoto={(name, image) => setOhcPreview({ title: `${name} - Employee Photo`, image })}
                  onOpenCertificate={(name, image) => setOhcPreview({ title: `${name} - Certificate`, image })}
                />
              )}

              {/* ── Birthday Hero Card ── */}
              {todaysBirthdays.length > 0 && (
                <BirthdayHeroCard
                  birthdays={todaysBirthdays}
                  onOpenPhoto={(name, image) => setBirthdayPreview({ title: `${name} - Birthday Photo`, image })}
                />
              )}

              {/* ── 2-column: Submitted Tasks + Pending Works ── */}
              <div className="two-col-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Submitted Tasks */}
                <div style={{
                  background: theme.cardBackground,
                  border: `1px solid ${theme.cardBorder}`,
                  borderLeft: "4px solid #f59e0b",
                  borderRadius: 12, overflow: "hidden",
                  boxShadow: theme.cardShadow,
                }}>
                  <div style={{
                    padding: "13px 18px", borderBottom: `1px solid ${theme.cardBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "#f59e0b18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📋</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: theme.title }}>Submitted Tasks</div>
                        <div style={{ fontSize: 11, color: theme.subtleText }}>Latest {recentSubmittedTasks.length} awaiting review</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setActiveTab("review"); setReviewFilter("pending"); }}
                      style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "#f59e0b14", border: "1px solid #f59e0b30", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                    >
                      View All →
                    </button>
                  </div>
                  <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                    {recentSubmittedTasks.length > 0 ? (
                      recentSubmittedTasks.map((task) => (
                        <TaskCard key={task.id} task={task} isAdmin={true} onApproveTask={onApproveTask} onReturnForRevision={onReturnForRevision} onDeleteTask={onDeleteTask} showToast={showToast} />
                      ))
                    ) : (
                      <div style={{ padding: "24px 16px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>📋</div>
                        <div style={{ fontWeight: 600, color: theme.mutedText, fontSize: 13 }}>No Submitted Tasks</div>
                        <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 3 }}>Submitted tasks will appear here for review.</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending Works */}
                <div style={{
                  background: theme.cardBackground,
                  border: `1px solid ${theme.cardBorder}`,
                  borderLeft: "4px solid #f97316",
                  borderRadius: 12, overflow: "hidden",
                  boxShadow: theme.cardShadow,
                }}>
                  <div style={{
                    padding: "13px 18px", borderBottom: `1px solid ${theme.cardBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "#f9731618", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📁</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: theme.title }}>Pending Work Records</div>
                        <div style={{ fontSize: 11, color: theme.subtleText }}>Latest {recentPendingWorks.length} pending review</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setActiveTab("review"); setReviewFilter("pending"); }}
                      style={{ fontSize: 11, fontWeight: 700, color: "#f97316", background: "#f9731614", border: "1px solid #f9731630", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                    >
                      View All →
                    </button>
                  </div>
                  <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                    {recentPendingWorks.length > 0 ? (
                      recentPendingWorks.map((item) => (
                        <WorkCard key={item.id} item={item} isAdmin={true} onUpdateStatus={onUpdateStatus} onDeleteWork={onDeleteWork} />
                      ))
                    ) : (
                      <div style={{ padding: "24px 16px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>📁</div>
                        <div style={{ fontWeight: 600, color: theme.mutedText, fontSize: 13 }}>No Pending Records</div>
                        <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 3 }}>Pending work records will appear here.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Invoices Needing Review ── */}
              <div style={{
                background: theme.cardBackground,
                border: `1px solid ${theme.cardBorder}`,
                borderLeft: "4px solid #8b5cf6",
                borderRadius: 12, overflow: "hidden",
                boxShadow: theme.cardShadow,
              }}>
                <div style={{
                  padding: "13px 18px", borderBottom: `1px solid ${theme.cardBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "#8b5cf618", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🧾</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: theme.title }}>Invoices Needing Review</div>
                      <div style={{ fontSize: 11, color: theme.subtleText }}>{invoiceReviewItems.length} invoice{invoiceReviewItems.length !== 1 ? "s" : ""} pending</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("invoices")}
                    style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", background: "#8b5cf614", border: "1px solid #8b5cf630", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                  >
                    View All →
                  </button>
                </div>
                <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                  {invoiceReviewItems.length > 0 ? (
                    invoiceReviewItems.slice(0, 5).map((item) => (
                      <InvoiceReviewCard
                        key={item.id}
                        item={item}
                        onEdit={openEditInvoiceForm}
                        onApprove={handleApproveInvoice}
                        onOpenAttachment={onOpenInvoiceAttachment}
                      />
                    ))
                  ) : (
                    <div style={{ padding: "24px 16px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                      <div style={{ fontSize: 26, marginBottom: 6 }}>🧾</div>
                      <div style={{ fontWeight: 600, color: theme.mutedText, fontSize: 13 }}>No Invoices Pending</div>
                      <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 3 }}>Invoices with Pending Review status will appear here.</div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === "review" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 20 }}>

              {/* Tab switcher as stat tiles */}
              <div className="review-filter-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {([
                  { key: "pending", label: "Pending Review", count: pendingCount, icon: "⏳", color: "#f59e0b", bg: "#f59e0b" },
                  { key: "active",  label: "Active Tasks",   count: assignedTasksOnly.length, icon: "🔵", color: "#3b82f6", bg: "#3b82f6" },
                  { key: "approved",label: "Approved",       count: approvedCount, icon: "✅", color: "#22c55e", bg: "#22c55e" },
                ] as { key: ReviewFilter; label: string; count: number; icon: string; color: string; bg: string }[]).map(tab => {
                  const isActive = reviewFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setReviewFilter(tab.key)}
                      style={{
                        background: isActive ? `linear-gradient(135deg, ${tab.color}18, ${tab.color}10)` : theme.cardBackground,
                        border: isActive ? `2px solid ${tab.color}` : `1px solid ${theme.cardBorder}`,
                        borderRadius: 14,
                        padding: "14px 18px",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex", alignItems: "center", gap: 12,
                        transition: "all 0.15s ease",
                        boxShadow: isActive ? `0 4px 16px ${tab.color}22` : "none",
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: isActive ? `${tab.color}22` : theme.softCardBackground,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                      }}>{tab.icon}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: isActive ? tab.color : theme.title, lineHeight: 1 }}>{tab.count}</div>
                        <div style={{ fontSize: 12, color: isActive ? tab.color : theme.subtleText, marginTop: 3, fontWeight: isActive ? 700 : 500 }}>{tab.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Search + department filter */}
              <div className="review-search-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <input
                  style={inputStyle()}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍  Search by employee, title, or category…"
                />
                <select
                  style={inputStyle()}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="All">All departments</option>
                  <option value="Operations">Operations</option>
                  <option value="HR">HR</option>
                  <option value="Safety">Safety</option>
                  <option value="Admin">Admin</option>
                  <option value="Management">Management</option>
                  <option value="General">General</option>
                </select>
              </div>

              {/* ── Pending Review ── */}
              {reviewFilter === "pending" && (
                <div style={{ display: "grid", gap: 16 }}>

                  {/* Bulk toolbar */}
                  {(pendingReviewTasks.length > 0 || pendingReviewWorks.length > 0) && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "12px 16px", borderRadius: 12,
                      background: bulkSelectionMode ? "rgba(99,102,241,0.07)" : theme.softCardBackground,
                      border: `1px solid ${bulkSelectionMode ? "#6366f1" : theme.cardBorder}`,
                    }}>
                      <button
                        onClick={() => { setBulkSelectionMode(v => !v); setBulkSelected(new Set()); }}
                        style={{
                          padding: "6px 16px", borderRadius: 8,
                          border: bulkSelectionMode ? "none" : `1px solid ${theme.cardBorder}`,
                          background: bulkSelectionMode ? "linear-gradient(135deg,#6366f1,#4f46e5)" : theme.cardBackground,
                          color: bulkSelectionMode ? "#fff" : theme.mutedText,
                          cursor: "pointer", fontSize: 13, fontWeight: 700,
                        }}
                      >
                        {bulkSelectionMode ? "✕ Cancel" : "☑ Bulk Select"}
                      </button>
                      {bulkSelectionMode && (
                        <>
                          <button
                            onClick={() => {
                              const allIds = new Set([
                                ...pendingReviewTasks.map(t => t.id),
                                ...pendingReviewWorks.map(w => w.id),
                              ]);
                              setBulkSelected(bulkSelected.size === allIds.size ? new Set() : allIds);
                            }}
                            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                          >
                            {bulkSelected.size === (pendingReviewTasks.length + pendingReviewWorks.length) ? "Deselect All" : "Select All"}
                          </button>
                          {bulkSelected.size > 0 && (
                            <button
                              onClick={async () => {
                                const taskIds = pendingReviewTasks.filter(t => bulkSelected.has(t.id)).map(t => t.id);
                                const workIds = pendingReviewWorks.filter(w => bulkSelected.has(w.id)).map(w => w.id);
                                await Promise.all([
                                  ...taskIds.map(id => onApproveTask(id)),
                                  ...workIds.map(id => onUpdateStatus(id, "Approved")),
                                ]);
                                setBulkSelected(new Set());
                                setBulkSelectionMode(false);
                                showToast("success", `Approved ${bulkSelected.size} item(s).`);
                              }}
                              style={{
                                padding: "6px 16px", borderRadius: 8, border: "none",
                                background: "linear-gradient(135deg,#10b981,#059669)",
                                color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700,
                              }}
                            >
                              ✓ Approve {bulkSelected.size} selected
                            </button>
                          )}
                          <span style={{ fontSize: 12, color: theme.subtleText }}>
                            {bulkSelected.size} / {pendingReviewTasks.length + pendingReviewWorks.length} selected
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Submitted Tasks */}
                  <div style={{
                    background: theme.cardBackground,
                    border: `1px solid ${theme.cardBorder}`,
                    borderLeft: "4px solid #f59e0b",
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{
                      padding: "14px 20px", borderBottom: `1px solid ${theme.cardBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f59e0b18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📋</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: theme.title }}>Submitted Tasks</div>
                          <div style={{ fontSize: 11, color: theme.subtleText }}>{pendingReviewTasks.length} awaiting approval</div>
                        </div>
                      </div>
                      <div style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{pendingReviewTasks.length}</div>
                    </div>
                    <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
                      {pendingReviewTasks.length > 0 ? (
                        pendingReviewTasks.map((task) => (
                          <div key={task.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            {bulkSelectionMode && (
                              <input
                                type="checkbox"
                                checked={bulkSelected.has(task.id)}
                                onChange={(e) => {
                                  const next = new Set(bulkSelected);
                                  if (e.target.checked) next.add(task.id); else next.delete(task.id);
                                  setBulkSelected(next);
                                }}
                                style={{ marginTop: 18, width: 16, height: 16, cursor: "pointer", accentColor: "#6366f1" }}
                              />
                            )}
                            <div style={{ flex: 1 }}>
                              <TaskCard task={task} isAdmin={true} onApproveTask={onApproveTask} onReturnForRevision={onReturnForRevision} onDeleteTask={onDeleteTask} showToast={showToast} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "28px 20px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                          <div style={{ fontWeight: 600, color: theme.mutedText, marginBottom: 4 }}>No Submitted Tasks</div>
                          <div style={{ fontSize: 13, color: theme.subtleText }}>No submitted tasks match your search.</div>
                        </div>
                      )}
                      {tasksHasMore && (
                        <div style={{ textAlign: "center", paddingTop: 8 }}>
                          <button onClick={onLoadMoreTasks} style={{ padding: "8px 24px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            Load More Tasks
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pending Work Records */}
                  <div style={{
                    background: theme.cardBackground,
                    border: `1px solid ${theme.cardBorder}`,
                    borderLeft: "4px solid #f97316",
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{
                      padding: "14px 20px", borderBottom: `1px solid ${theme.cardBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f9731618", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📁</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: theme.title }}>Pending Work Records</div>
                          <div style={{ fontSize: 11, color: theme.subtleText }}>{pendingReviewWorks.length} record{pendingReviewWorks.length !== 1 ? "s" : ""} pending review</div>
                        </div>
                      </div>
                      <div style={{ background: "#f9731618", color: "#f97316", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{pendingReviewWorks.length}</div>
                    </div>
                    <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
                      {pendingReviewWorks.length > 0 ? (
                        pendingReviewWorks.map((item) => (
                          <div key={item.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            {bulkSelectionMode && (
                              <input
                                type="checkbox"
                                checked={bulkSelected.has(item.id)}
                                onChange={(e) => {
                                  const next = new Set(bulkSelected);
                                  if (e.target.checked) next.add(item.id); else next.delete(item.id);
                                  setBulkSelected(next);
                                }}
                                style={{ marginTop: 18, width: 16, height: 16, cursor: "pointer", accentColor: "#6366f1" }}
                              />
                            )}
                            <div style={{ flex: 1 }}>
                              <WorkCard item={item} isAdmin={true} onUpdateStatus={onUpdateStatus} onDeleteWork={onDeleteWork} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: "28px 20px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                          <div style={{ fontWeight: 600, color: theme.mutedText, marginBottom: 4 }}>No Pending Records</div>
                          <div style={{ fontSize: 13, color: theme.subtleText }}>No pending records match your search.</div>
                        </div>
                      )}
                      {worksHasMore && (
                        <div style={{ textAlign: "center", paddingTop: 8 }}>
                          <button onClick={onLoadMoreWorks} style={{ padding: "8px 24px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            Load More Works
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Active Tasks ── */}
              {reviewFilter === "active" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{
                    background: theme.cardBackground,
                    border: `1px solid ${theme.cardBorder}`,
                    borderLeft: "4px solid #3b82f6",
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{
                      padding: "14px 20px", borderBottom: `1px solid ${theme.cardBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#3b82f618", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔵</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: theme.title }}>Active Tasks</div>
                          <div style={{ fontSize: 11, color: theme.subtleText }}>{assignedTasksOnly.length} task{assignedTasksOnly.length !== 1 ? "s" : ""} in progress</div>
                        </div>
                      </div>
                      <div style={{ background: "#3b82f618", color: "#3b82f6", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{assignedTasksOnly.length}</div>
                    </div>
                    <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
                      {assignedTasksOnly.length > 0 ? (
                        assignedTasksOnly.map((task) => (
                          <TaskCard key={task.id} task={task} isAdmin={true} onReturnForRevision={onReturnForRevision} onDeleteTask={onDeleteTask} showToast={showToast} />
                        ))
                      ) : (
                        <div style={{ padding: "28px 20px", textAlign: "center", background: theme.softCardBackground, borderRadius: 10, border: `1px dashed ${theme.cardBorder}` }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>🔵</div>
                          <div style={{ fontWeight: 600, color: theme.mutedText, marginBottom: 4 }}>No Active Tasks</div>
                          <div style={{ fontSize: 13, color: theme.subtleText }}>Assigned and in-progress tasks will appear here.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Approved ── */}
              {reviewFilter === "approved" && (() => {
                const allRows = [
                  ...approvedTasksOnly.map((t) => ({ type: "task" as const, id: t.id, title: t.title, sub: t.deadline ? `Deadline: ${t.deadline}` : "No deadline", date: t.deadline || "", item: t })),
                  ...approvedWorks.map((w) => ({ type: "work" as const, id: w.id, title: w.title, sub: w.category || "—", date: w.date || "", item: w })),
                ].sort((a, b) => b.date.localeCompare(a.date));
                const q = reviewApprovedSearch.trim().toLowerCase();
                const filtered = allRows.filter((row) => {
                  const matchSearch = !q || row.title.toLowerCase().includes(q) || row.sub.toLowerCase().includes(q);
                  const matchType = reviewApprovedTypeFilter === "All" || (reviewApprovedTypeFilter === "Tasks" && row.type === "task") || (reviewApprovedTypeFilter === "Works" && row.type === "work");
                  return matchSearch && matchType;
                });
                return (
                  <div style={{ display: "grid", gap: 16 }}>

                    {/* Stats strip */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { label: "Approved Tasks", value: approvedTasksOnly.length, color: "#22c55e", icon: "✅" },
                        { label: "Approved Works", value: approvedWorks.length, color: "#10b981", icon: "🏆" },
                        { label: "Total Approved", value: approvedCount, color: "#6366f1", icon: "⭐" },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: theme.cardBackground,
                          borderTop: `3px solid ${s.color}`,
                          borderLeft: `1px solid ${theme.cardBorder}`,
                          borderRight: `1px solid ${theme.cardBorder}`,
                          borderBottom: `1px solid ${theme.cardBorder}`,
                          borderRadius: 12, padding: "12px 16px",
                          display: "flex", alignItems: "center", gap: 10,
                        }}>
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{s.icon}</div>
                          <div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>{s.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Search + filter bar */}
                    <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                      <input
                        style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.title, fontSize: 13, outline: "none" }}
                        placeholder="🔍  Search by title or category…"
                        value={reviewApprovedSearch}
                        onChange={(e) => setReviewApprovedSearch(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["All", "Tasks", "Works"] as const).map((f) => (
                          <button key={f} onClick={() => setReviewApprovedTypeFilter(f)} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${reviewApprovedTypeFilter === f ? "#6366f1" : theme.cardBorder}`, background: reviewApprovedTypeFilter === f ? "#6366f114" : theme.softCardBackground, color: reviewApprovedTypeFilter === f ? "#6366f1" : theme.mutedText }}>{f}</button>
                        ))}
                      </div>
                      {(reviewApprovedSearch || reviewApprovedTypeFilter !== "All") && (
                        <button onClick={() => { setReviewApprovedSearch(""); setReviewApprovedTypeFilter("All"); }} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.subtleText, fontWeight: 600 }}>✕ Clear</button>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: theme.subtleText, whiteSpace: "nowrap" as const }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Table */}
                    <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden", boxShadow: theme.cardShadow }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px", gap: 12, padding: "9px 16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}` }}>
                        {["Title & Details", "Type", "Date", ""].map((h) => (
                          <div key={h} style={{ fontSize: 10, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{h}</div>
                        ))}
                      </div>
                      {filtered.length === 0 ? (
                        <div style={{ padding: "36px 16px" }}><EmptyState icon="✅" title="No results" description="No approved items match your current filter." /></div>
                      ) : (
                        filtered.map((row, i) => {
                          const isExp = reviewApprovedExpandedId === row.id;
                          const tc = row.type === "task" ? "#3b82f6" : "#10b981";
                          return (
                            <React.Fragment key={row.id}>
                              <div
                                style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px", alignItems: "center", gap: 12, padding: "11px 16px", background: isExp ? `${tc}08` : i % 2 !== 0 ? theme.fileCardBg : "transparent", borderBottom: `1px solid ${theme.cardBorder}`, cursor: "pointer", transition: "background 0.12s ease" }}
                                onClick={() => setReviewApprovedExpandedId(isExp ? null : row.id)}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${tc}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{row.type === "task" ? "📋" : "📁"}</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.title}</div>
                                    <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.sub}</div>
                                  </div>
                                </div>
                                <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${tc}14`, color: tc, border: `1px solid ${tc}30`, whiteSpace: "nowrap" as const }}>{row.type === "task" ? "Task" : "Work"}</span>
                                <div style={{ fontSize: 12, color: theme.mutedText }}>{row.date || "—"}</div>
                                <button style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${isExp ? tc + "40" : theme.cardBorder}`, background: isExp ? `${tc}14` : theme.softCardBackground, color: isExp ? tc : theme.subtleText, whiteSpace: "nowrap" as const }}
                                  onClick={(e) => { e.stopPropagation(); setReviewApprovedExpandedId(isExp ? null : row.id); }}
                                >{isExp ? "▲ Close" : "▼ Details"}</button>
                              </div>
                              {isExp && (
                                <div style={{ padding: "16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}`, borderLeft: `3px solid ${tc}` }}>
                                  {row.type === "task"
                                    ? <TaskCard task={row.item} isAdmin={true} onDeleteTask={onDeleteTask} showToast={showToast} detailsOnly={true} />
                                    : <WorkCard item={row.item} isAdmin={true} onDeleteWork={onDeleteWork} detailsOnly={true} />
                                  }
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {activeTab === "employees" && !selectedEmployee && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 16 }}>

              {/* Stats strip */}
              <div className="stat-grid-main" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "Total Employees", value: employeeList.length, color: "#6366f1", icon: "👥" },
                  { label: "Total Tasks", value: activeTasksAll.filter(t => !t.isDeleted).length, color: "#3b82f6", icon: "📋" },
                  { label: "Total Works", value: activeWorks.length, color: "#10b981", icon: "🔨" },
                  { label: "Pending Attendance", value: pendingAttendanceCount, color: "#f59e0b", icon: "🕐" },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, borderLeft: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Search bar */}
              <div style={{ ...cardStyle(), padding: "12px 16px" }}>
                <input
                  style={inputStyle()}
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder="🔍  Search by name, position, or department…"
                />
              </div>

              {/* Employee grid */}
              {employeeList.length === 0 ? (
                <EmptyState icon="👥" title="No employees found" description="Add employees to the system to manage their tasks, works, and attendance." />
              ) : (
                <div className="employee-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {employeeList
                    .filter(e => !employeeSearch.trim() || [e.name, e.position, e.department].some(f => f.toLowerCase().includes(employeeSearch.trim().toLowerCase())))
                    .map(employee => {
                      const empTasks = activeTasksAll.filter(t => t.employeeUid === employee.uid || t.employeeEmail.toLowerCase() === employee.email.toLowerCase());
                      const empWorks = activeWorks.filter(w => w.employeeUid === employee.uid || w.employeeEmail?.toLowerCase() === employee.email.toLowerCase());
                      const empApproved = empTasks.filter(t => t.status === "Approved").length + empWorks.filter(w => w.status === "Approved").length;
                      return (
                        <div
                          key={employee.uid}
                          onClick={() => { setSelectedEmployee(employee); setEmployeeProfileTab("overview"); }}
                          style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: "16px", cursor: "pointer", transition: "all 0.15s ease" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                            {employee.profilePhotoUrl ? (
                              <Image
                                src={employee.profilePhotoUrl}
                                alt={employee.name}
                                width={48}
                                height={48}
                                style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                              />
                            ) : (
                              <AvatarInitials name={employee.name} size={48} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{employee.name}</div>
                              <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{employee.position}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: theme.subtleText, marginBottom: 10, padding: "5px 10px", background: theme.softCardBackground, borderRadius: 8 }}>
                            🏢 {employee.department}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                            {[
                              { label: "Tasks", value: empTasks.length, color: "#3b82f6" },
                              { label: "Works", value: empWorks.length, color: "#10b981" },
                              { label: "Approved", value: empApproved, color: "#6366f1" },
                            ].map(({ label, value, color }) => (
                              <div key={label} style={{ textAlign: "center", padding: "6px 4px", background: `${color}10`, borderRadius: 8 }}>
                                <div style={{ fontSize: 15, fontWeight: 900, color }}>{value}</div>
                                <div style={{ fontSize: 10, color: theme.subtleText, fontWeight: 600 }}>{label}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: "#6366f1", fontWeight: 700, textAlign: "right" }}>View Profile →</div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "employees" && selectedEmployee && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 16 }}>

              {/* Profile header card */}
              <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 16, overflow: "hidden" }}>
                {/* Gradient banner */}
                <div style={{ height: 6, background: "linear-gradient(90deg, #6366f1, #3b82f6, #10b981)" }} />
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
                    {selectedEmployee.profilePhotoUrl ? (
                      <Image
                        src={selectedEmployee.profilePhotoUrl}
                        alt={selectedEmployee.name}
                        width={72}
                        height={72}
                        style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "3px solid rgba(99,102,241,0.3)" }}
                      />
                    ) : (
                      <AvatarInitials name={selectedEmployee.name} size={72} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: theme.title }}>{selectedEmployee.name}</div>
                      <div style={{ fontSize: 14, color: theme.subtleText, marginTop: 3 }}>{selectedEmployee.position} · {selectedEmployee.department}</div>
                      <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>✉ {selectedEmployee.email}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {[
                          { label: "Tasks", value: selectedEmployeeTasks.length, color: "#3b82f6" },
                          { label: "Works", value: selectedEmployeeWorks.length, color: "#10b981" },
                          { label: "Approved", value: selectedEmployeeApprovedTasks.length + selectedEmployeeApprovedWorks.length, color: "#6366f1" },
                          { label: "Attendance", value: selectedEmployeeReviewedAttendance.length, color: "#f59e0b" },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ padding: "5px 12px", background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 14, fontWeight: 900, color }}>{value}</span>
                            <span style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600 }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="emp-profile-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button style={buttonStyle(false)} onClick={() => { setSelectedEmployee(null); setEmployeeProfileTab("overview"); setEmployeeSearch(""); }}>← Back</button>
                      <button style={buttonStyle(true)} onClick={() => setEmployeeProfileTab("assign")}>+ Assign Task</button>
                      {selectedEmployeeReport && (
                        <button style={buttonStyle(false)} onClick={() => {
                          const empWords = selectedEmployee.name.toLowerCase().split(" ");
                          const matched = birthdays.find(b => { const bw = b.name.toLowerCase().split(" "); return empWords.filter(w => bw.includes(w)).length >= 2; });
                          downloadEmployeeReportAsPrintPage(selectedEmployee, selectedEmployeeReport, reportRange, matched?.photoLink || undefined);
                        }}>🖨 Print Report</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profile sub-tabs */}
                <div style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: "0 24px", display: "flex", gap: 0, overflowX: "auto" }}>
                  {([
                    { id: "overview", icon: "📊", label: "Overview" },
                    { id: "assign",   icon: "➕", label: "Assign Task" },
                    { id: "tasks",    icon: "📋", label: `Tasks (${selectedEmployeeNonApprovedTasks.length})` },
                    { id: "works",    icon: "🔨", label: `Works (${selectedEmployeePendingWorks.length})` },
                    { id: "approved", icon: "✅", label: `Approved (${selectedEmployeeApprovedTasks.length + selectedEmployeeApprovedWorks.length})` },
                    { id: "attendance", icon: "🕐", label: `Attendance (${selectedEmployeeReviewedAttendance.length})` },
                  ] as { id: EmployeeProfileTab; icon: string; label: string }[]).map(({ id, icon, label }) => (
                    <button key={id} onClick={() => setEmployeeProfileTab(id)} style={{
                      padding: "12px 16px", border: "none", borderBottom: employeeProfileTab === id ? "2px solid #6366f1" : "2px solid transparent",
                      background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: employeeProfileTab === id ? 800 : 500,
                      color: employeeProfileTab === id ? "#6366f1" : theme.mutedText, whiteSpace: "nowrap", transition: "all 0.15s ease",
                    }}>{icon} {label}</button>
                  ))}
                </div>
              </div>

              {/* ── Overview ── */}
              {employeeProfileTab === "overview" && (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* Info grid */}
                  <div style={{ ...cardStyle(), padding: "18px 22px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Employee Information</div>
                    <div className="emp-info-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
                      {[
                        { label: "Full Name", value: selectedEmployee.name },
                        { label: "Department", value: selectedEmployee.department },
                        { label: "Position", value: selectedEmployee.position },
                        { label: "Email", value: selectedEmployee.email },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ padding: "10px 14px", background: theme.softCardBackground, borderRadius: 10 }}>
                          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: theme.title }}>{value || "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stat tiles */}
                  <div className="emp-stat-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "Total Tasks", value: selectedEmployeeTasks.length, color: "#3b82f6" },
                      { label: "Total Works", value: selectedEmployeeWorks.length, color: "#10b981" },
                      { label: "Approved", value: selectedEmployeeApprovedTasks.length + selectedEmployeeApprovedWorks.length, color: "#6366f1" },
                      { label: "Attendance", value: selectedEmployeeReviewedAttendance.length, color: "#f59e0b" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, borderLeft: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Report date range */}
                  <div style={{ ...cardStyle(), padding: "18px 22px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Report Date Range</div>
                    <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>From</label>
                        <input type="date" style={inputStyle()} value={reportRange.from} onChange={(e) => setReportRange((prev) => ({ ...prev, from: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>To</label>
                        <input type="date" style={inputStyle()} value={reportRange.to} onChange={(e) => setReportRange((prev) => ({ ...prev, to: e.target.value }))} />
                      </div>
                    </div>
                    {selectedEmployeeReport && (
                      <div style={{ fontSize: 13, color: theme.mutedText, lineHeight: 1.8, padding: "10px 14px", background: theme.softCardBackground, borderRadius: 10 }}>
                        {selectedEmployeeReport.summary}
                      </div>
                    )}
                    {selectedEmployeeReport && (
                      <div style={{ marginTop: 12 }}>
                        <button style={buttonStyle(true)} onClick={() => {
                          const empWords = selectedEmployee.name.toLowerCase().split(" ");
                          const matched = birthdays.find(b => { const bw = b.name.toLowerCase().split(" "); return empWords.filter(w => bw.includes(w)).length >= 2; });
                          downloadEmployeeReportAsPrintPage(selectedEmployee, selectedEmployeeReport, reportRange, matched?.photoLink || undefined);
                        }}>
                          🖨 Print HR Report
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Assign Task ── */}
              {employeeProfileTab === "assign" && (
                <div style={{ ...cardStyle(), padding: "20px 24px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Assign New Task to {selectedEmployee.name}</div>
                  <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Task Title</label>
                      <input style={inputStyle()} value={assignForm.title} onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })} placeholder="Enter task title" />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deadline</label>
                      <input type="date" style={inputStyle()} value={assignForm.deadline} onChange={(e) => setAssignForm({ ...assignForm, deadline: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Attachments</label>
                      <input style={inputStyle()} value={assignForm.attachmentName} readOnly placeholder="No files selected" />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Upload Files</label>
                      <input type="file" multiple style={inputStyle()} onChange={(e) => { const files = Array.from(e.target.files || []); setSelectedTaskFiles((prev) => { const merged = mergeFiles(prev, files); setAssignForm((current) => ({ ...current, attachmentName: formatFilesLabel(merged) })); return merged; }); e.currentTarget.value = ""; }} />
                      <SelectedFilesPreview files={selectedTaskFiles} onRemove={(index) => { setSelectedTaskFiles((prev) => { const updated = prev.filter((_, i) => i !== index); setAssignForm((current) => ({ ...current, attachmentName: formatFilesLabel(updated) })); return updated; }); }} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</label>
                      <textarea style={{ ...inputStyle(), minHeight: 100, resize: "vertical" }} value={assignForm.description} onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })} placeholder="Task details and instructions…" />
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button style={{ ...buttonStyle(true), opacity: assigning ? 0.7 : 1 }} onClick={handleAssignTask} disabled={assigning}>
                      {assigning ? "Assigning…" : "Assign Task"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tasks ── */}
              {employeeProfileTab === "tasks" && (
                <div style={cardStyle()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Active & Pending Tasks</div>
                      <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>{selectedEmployeeNonApprovedTasks.length} task{selectedEmployeeNonApprovedTasks.length !== 1 ? "s" : ""} in progress</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedEmployeeNonApprovedTasks.length > 0 ? selectedEmployeeNonApprovedTasks.map((task) => (
                      <TaskCard key={task.id} task={task} isAdmin={true} onApproveTask={onApproveTask} onReturnForRevision={onReturnForRevision} onDeleteTask={onDeleteTask} showToast={showToast} />
                    )) : <EmptyState icon="📋" title="No active tasks" description="All tasks for this employee are approved or deleted." />}
                  </div>
                </div>
              )}

              {/* ── Works ── */}
              {employeeProfileTab === "works" && (
                <div style={cardStyle()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Pending Works</div>
                      <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>{selectedEmployeePendingWorks.length} work{selectedEmployeePendingWorks.length !== 1 ? "s" : ""} pending review</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {selectedEmployeePendingWorks.length > 0 ? selectedEmployeePendingWorks.map((item) => (
                      <WorkCard key={item.id} item={item} isAdmin={true} onUpdateStatus={onUpdateStatus} onDeleteWork={onDeleteWork} />
                    )) : <EmptyState icon="🔨" title="No pending works" description="All work records for this employee have been reviewed." />}
                  </div>
                </div>
              )}

              {/* ── Approved ── */}
              {employeeProfileTab === "approved" && (() => {
                const allRows = [
                  ...selectedEmployeeApprovedTasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, sub: t.deadline ? `Deadline: ${t.deadline}` : "No deadline", date: t.deadline || "", item: t })),
                  ...selectedEmployeeApprovedWorks.map((w) => ({ type: "work" as const, id: w.id, title: w.title, sub: w.category || "—", date: w.date || "", item: w })),
                ].sort((a, b) => b.date.localeCompare(a.date));
                const q = empApprovedSearch.trim().toLowerCase();
                const filtered = allRows.filter((row) => {
                  const matchSearch = !q || row.title.toLowerCase().includes(q) || row.sub.toLowerCase().includes(q);
                  const matchType = empApprovedTypeFilter === "All" || (empApprovedTypeFilter === "Tasks" && row.type === "task") || (empApprovedTypeFilter === "Works" && row.type === "work");
                  return matchSearch && matchType;
                });
                return (
                  <div style={{ display: "grid", gap: 14 }}>

                    {/* Stats strip */}
                    <div className="stat-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { label: "Approved Tasks", value: selectedEmployeeApprovedTasks.length, color: "#22c55e", icon: "✅" },
                        { label: "Approved Works", value: selectedEmployeeApprovedWorks.length, color: "#10b981", icon: "🏆" },
                        { label: "Total Approved", value: selectedEmployeeApprovedTasks.length + selectedEmployeeApprovedWorks.length, color: "#6366f1", icon: "⭐" },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: theme.cardBackground,
                          borderTop: `3px solid ${s.color}`,
                          borderLeft: `1px solid ${theme.cardBorder}`,
                          borderRight: `1px solid ${theme.cardBorder}`,
                          borderBottom: `1px solid ${theme.cardBorder}`,
                          borderRadius: 12, padding: "12px 16px",
                          display: "flex", alignItems: "center", gap: 10,
                        }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{s.icon}</div>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>{s.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Search + filter bar */}
                    <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                      <input
                        style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.title, fontSize: 13, outline: "none" }}
                        placeholder="🔍  Search by title or category…"
                        value={empApprovedSearch}
                        onChange={(e) => setEmpApprovedSearch(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["All", "Tasks", "Works"] as const).map((f) => (
                          <button key={f} onClick={() => setEmpApprovedTypeFilter(f)} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${empApprovedTypeFilter === f ? "#6366f1" : theme.cardBorder}`, background: empApprovedTypeFilter === f ? "#6366f114" : theme.softCardBackground, color: empApprovedTypeFilter === f ? "#6366f1" : theme.mutedText }}>{f}</button>
                        ))}
                      </div>
                      {(empApprovedSearch || empApprovedTypeFilter !== "All") && (
                        <button onClick={() => { setEmpApprovedSearch(""); setEmpApprovedTypeFilter("All"); }} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.subtleText, fontWeight: 600 }}>✕ Clear</button>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: theme.subtleText, whiteSpace: "nowrap" as const }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Table */}
                    <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden", boxShadow: theme.cardShadow }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px", gap: 12, padding: "9px 16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}` }}>
                        {["Title & Details", "Type", "Date", ""].map((h) => (
                          <div key={h} style={{ fontSize: 10, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{h}</div>
                        ))}
                      </div>
                      {filtered.length === 0 ? (
                        <div style={{ padding: "36px 16px" }}><EmptyState icon="✅" title="No results" description="No approved items match your current filter." /></div>
                      ) : (
                        filtered.map((row, i) => {
                          const isExp = empApprovedExpandedId === row.id;
                          const tc = row.type === "task" ? "#3b82f6" : "#10b981";
                          return (
                            <React.Fragment key={row.id}>
                              <div
                                style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px", alignItems: "center", gap: 12, padding: "11px 16px", background: isExp ? `${tc}08` : i % 2 !== 0 ? theme.fileCardBg : "transparent", borderBottom: `1px solid ${theme.cardBorder}`, cursor: "pointer", transition: "background 0.12s ease" }}
                                onClick={() => setEmpApprovedExpandedId(isExp ? null : row.id)}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${tc}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{row.type === "task" ? "📋" : "📁"}</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.title}</div>
                                    <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.sub}</div>
                                  </div>
                                </div>
                                <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${tc}14`, color: tc, border: `1px solid ${tc}30`, whiteSpace: "nowrap" as const }}>{row.type === "task" ? "Task" : "Work"}</span>
                                <div style={{ fontSize: 12, color: theme.mutedText }}>{row.date || "—"}</div>
                                <button style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${isExp ? tc + "40" : theme.cardBorder}`, background: isExp ? `${tc}14` : theme.softCardBackground, color: isExp ? tc : theme.subtleText, whiteSpace: "nowrap" as const }}
                                  onClick={(e) => { e.stopPropagation(); setEmpApprovedExpandedId(isExp ? null : row.id); }}
                                >{isExp ? "▲ Close" : "▼ Details"}</button>
                              </div>
                              {isExp && (
                                <div style={{ padding: "16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}`, borderLeft: `3px solid ${tc}` }}>
                                  {row.type === "task"
                                    ? <TaskCard task={row.item} isAdmin={true} onDeleteTask={onDeleteTask} showToast={showToast} detailsOnly={true} />
                                    : <WorkCard item={row.item} isAdmin={true} onDeleteWork={onDeleteWork} detailsOnly={true} />
                                  }
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Attendance History ── */}
              {employeeProfileTab === "attendance" && (() => {
                const presentRecs = selectedEmployeeReviewedAttendance.filter(r => r.status === "Present");
                const absentRecs  = selectedEmployeeReviewedAttendance.filter(r => r.status === "Absent");
                const filtered = empAttFilter === "All"
                  ? [...selectedEmployeeReviewedAttendance].sort((a, b) => b.date.localeCompare(a.date))
                  : empAttFilter === "Present"
                    ? [...presentRecs].sort((a, b) => b.date.localeCompare(a.date))
                    : [...absentRecs].sort((a, b) => b.date.localeCompare(a.date));

                const attendanceRate = selectedEmployeeReviewedAttendance.length > 0
                  ? Math.round((presentRecs.length / selectedEmployeeReviewedAttendance.length) * 100)
                  : 0;

                return (
                  <div style={{ display: "grid", gap: 16 }}>

                    {/* Stats strip */}
                    <div className="emp-att-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {[
                        { label: "Total Records", value: selectedEmployeeReviewedAttendance.length, color: "#6366f1", icon: "📋" },
                        { label: "Present",        value: presentRecs.length,                       color: "#22c55e", icon: "✅" },
                        { label: "Absent",         value: absentRecs.length,                        color: "#ef4444", icon: "❌" },
                        { label: "Attendance Rate",value: `${attendanceRate}%`,                     color: attendanceRate >= 80 ? "#22c55e" : attendanceRate >= 60 ? "#f59e0b" : "#ef4444", icon: "📊" },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: theme.cardBackground,
                          borderTop: `3px solid ${s.color}`,
                          borderLeft: `1px solid ${theme.cardBorder}`,
                          borderRight: `1px solid ${theme.cardBorder}`,
                          borderBottom: `1px solid ${theme.cardBorder}`,
                          borderRadius: 12,
                          padding: "14px 16px",
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontSize: 24, fontWeight: 900, color: s.color as string, lineHeight: 1 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Filter bar */}
                    <div style={{
                      background: theme.cardBackground,
                      border: `1px solid ${theme.cardBorder}`,
                      borderRadius: 12,
                      padding: "10px 14px",
                      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    }}>
                      <span style={{ fontSize: 12, color: theme.subtleText, fontWeight: 600, marginRight: 4 }}>Filter:</span>
                      {(["All", "Present", "Absent"] as const).map(f => {
                        const fColor = f === "Present" ? "#22c55e" : f === "Absent" ? "#ef4444" : "#6366f1";
                        const isActive = empAttFilter === f;
                        return (
                          <button key={f} onClick={() => setEmpAttFilter(f)} style={{
                            padding: "5px 16px", borderRadius: 999, cursor: "pointer",
                            border: isActive ? "none" : `1px solid ${theme.cardBorder}`,
                            background: isActive ? fColor : theme.softCardBackground,
                            color: isActive ? "#fff" : theme.mutedText,
                            fontSize: 12, fontWeight: 700,
                            transition: "all 0.15s ease",
                          }}>
                            {f}
                            <span style={{ marginLeft: 6, opacity: 0.8, fontSize: 11 }}>
                              ({f === "All" ? selectedEmployeeReviewedAttendance.length : f === "Present" ? presentRecs.length : absentRecs.length})
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Attendance display: cards on mobile, table on desktop */}
                    {isMobile ? (
                      /* ── Mobile: one card per record ── */
                      <div style={{ display: "grid", gap: 10 }}>
                        {filtered.length > 0 ? filtered.map((record) => {
                          const isPending = record.status === "Pending";
                          const isPresent = record.status === "Present";
                          const statusColor = isPresent ? "#22c55e" : isPending ? "#f59e0b" : "#ef4444";
                          return (
                            <div key={record.id} style={{
                              background: theme.cardBackground,
                              border: `1px solid ${theme.cardBorder}`,
                              borderLeft: `4px solid ${statusColor}`,
                              borderRadius: 12,
                              padding: "14px 16px",
                              display: "grid",
                              gap: 12,
                              boxShadow: theme.cardShadow,
                            }}>
                              {/* Date + status badge */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>{record.date}</div>
                                <span style={{
                                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                                  background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40`,
                                  flexShrink: 0,
                                }}>{record.status}</span>
                              </div>
                              {/* Check In / Check Out */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div style={{ background: theme.softCardBackground, borderRadius: 10, padding: "10px 12px", border: `1px solid ${theme.cardBorder}` }}>
                                  <div style={{ fontSize: 10, color: theme.subtleText, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>Check In</div>
                                  <div style={{ fontSize: 13, color: theme.mutedText, fontWeight: 600 }}>{record.checkIn ? formatDateTime(record.checkIn) : "—"}</div>
                                </div>
                                <div style={{ background: theme.softCardBackground, borderRadius: 10, padding: "10px 12px", border: `1px solid ${theme.cardBorder}` }}>
                                  <div style={{ fontSize: 10, color: theme.subtleText, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>Check Out</div>
                                  <div style={{ fontSize: 13, color: theme.mutedText, fontWeight: 600 }}>{record.checkOut ? formatDateTime(record.checkOut) : "—"}</div>
                                </div>
                              </div>
                              {/* Change Status + Delete */}
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <select
                                  value={record.status}
                                  onChange={(e) => onUpdateAttendanceStatus(record.id, e.target.value as AttendanceStatus)}
                                  style={{
                                    flex: 1, padding: "9px 10px", borderRadius: 10,
                                    border: `1px solid ${theme.cardBorder}`,
                                    background: theme.softCardBackground,
                                    color: theme.mutedText, fontSize: 16, cursor: "pointer", outline: "none",
                                  }}
                                >
                                  <option value="Pending">Pending</option>
                                  <option value="Present">Present</option>
                                  <option value="Absent">Absent</option>
                                </select>
                                <button
                                  onClick={() => onDeleteAttendance(record)}
                                  title="Delete"
                                  style={{
                                    width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                                    border: `1px solid ${theme.cardBorder}`,
                                    background: theme.softCardBackground,
                                    color: "#ef4444", cursor: "pointer", fontSize: 16,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                >🗑</button>
                              </div>
                            </div>
                          );
                        }) : (
                          <div style={{ padding: "36px 20px", textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>🕐</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: theme.mutedText, marginBottom: 6 }}>
                              {empAttFilter === "All" ? "No Attendance Records" : `No ${empAttFilter} Records`}
                            </div>
                            <div style={{ fontSize: 13, color: theme.subtleText }}>
                              {empAttFilter === "All" ? "Reviewed attendance records will appear here." : `No ${empAttFilter.toLowerCase()} records found.`}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* ── Desktop: table layout ── */
                      <div style={{
                        background: theme.cardBackground,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 12,
                        overflow: "hidden",
                        boxShadow: theme.cardShadow,
                      }}>
                        <div style={{
                          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px 140px 44px",
                          gap: 0, padding: "10px 16px",
                          background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}`,
                        }}>
                          {["Date", "Check In", "Check Out", "Status", "Change Status", ""].map(h => (
                            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: theme.subtleText, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
                          ))}
                        </div>
                        {filtered.length > 0 ? filtered.map((record, idx) => {
                          const isPresent = record.status === "Present";
                          const rowBg = idx % 2 === 0 ? theme.cardBackground : theme.softCardBackground;
                          return (
                            <div key={record.id} style={{
                              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 100px 140px 44px",
                              gap: 0, padding: "11px 16px", background: rowBg,
                              borderBottom: `1px solid ${theme.cardBorder}`, alignItems: "center",
                            }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: theme.title }}>{record.date}</div>
                              <div style={{ fontSize: 13, color: theme.mutedText }}>{record.checkIn ? formatDateTime(record.checkIn) : <span style={{ color: theme.subtleText }}>—</span>}</div>
                              <div style={{ fontSize: 13, color: theme.mutedText }}>{record.checkOut ? formatDateTime(record.checkOut) : <span style={{ color: theme.subtleText }}>—</span>}</div>
                              <div>
                                <span style={{
                                  display: "inline-block", padding: "3px 10px", borderRadius: 999,
                                  fontSize: 11, fontWeight: 700,
                                  background: isPresent ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)",
                                  color: isPresent ? "#22c55e" : "#ef4444",
                                  border: `1px solid ${isPresent ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                                }}>{record.status}</span>
                              </div>
                              <select
                                value={record.status}
                                onChange={(e) => onUpdateAttendanceStatus(record.id, e.target.value as AttendanceStatus)}
                                style={{ padding: "4px 8px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.mutedText, fontSize: 12, cursor: "pointer", outline: "none" }}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Present">Present</option>
                                <option value="Absent">Absent</option>
                              </select>
                              <button
                                onClick={() => onDeleteAttendance(record)} title="Delete record"
                                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: "#ef4444", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                              >🗑</button>
                            </div>
                          );
                        }) : (
                          <div style={{ padding: "36px 20px", textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>🕐</div>
                            <div style={{ fontWeight: 700, fontSize: 15, color: theme.mutedText, marginBottom: 6 }}>
                              {empAttFilter === "All" ? "No Attendance Records" : `No ${empAttFilter} Records`}
                            </div>
                            <div style={{ fontSize: 13, color: theme.subtleText }}>
                              {empAttFilter === "All" ? "Reviewed attendance records will appear here." : `No ${empAttFilter.toLowerCase()} records found for this employee.`}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {activeTab === "hr" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 16 }}>

              {/* HR overview tiles — double as tab switcher */}
              <div className="hr-overview-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {([
                  { id: "attendance" as HRSubTab, icon: "🕐", label: "Pending Attendance", value: pendingAttendanceCount, color: "#f59e0b" },
                  { id: "ohc"        as HRSubTab, icon: "⚕️", label: "OHC Alerts",          value: expiringSoonOHCCerts.length + expiredOHCCerts.length, color: "#ef4444" },
                  { id: "foodSafety" as HRSubTab, icon: "🥗", label: "Food Safety Alerts",  value: expiringSoonFS.length + expiredFS.length, color: "#0ea5e9" },
                  { id: "birthdays"  as HRSubTab, icon: "🎂", label: "Birthdays",            value: birthdays.length,       color: "#ec4899" },
                ] as { id: HRSubTab; icon: string; label: string; value: number; color: string }[]).map(({ id, icon, label, value, color }) => (
                  <button key={id} onClick={() => setHrSubTab(id)} style={{
                    background: hrSubTab === id ? `${color}14` : theme.cardBackground,
                    borderTop: `3px solid ${color}`,
                    borderLeft: `1px solid ${hrSubTab === id ? color : theme.cardBorder}`,
                    borderRight: `1px solid ${hrSubTab === id ? color : theme.cardBorder}`,
                    borderBottom: `1px solid ${hrSubTab === id ? color : theme.cardBorder}`,
                    borderRadius: 12, padding: "14px 16px",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s ease",
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                  </button>
                ))}
              </div>

              {/* ── Attendance ── */}
              {hrSubTab === "attendance" && (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Pending Records", value: pendingAttendanceCount, hint: "Awaiting admin review", color: "#f59e0b" },
                      { label: "Employees Waiting", value: new Set(pendingAttendanceOnly.map(r => r.employeeUid)).size, hint: "Unique employees", color: "#3b82f6" },
                    ].map(({ label, value, hint, color }) => (
                      <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, borderLeft: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                        <div style={{ fontSize: 11, color: theme.subtleText }}>{hint}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ ...cardStyle(), padding: "14px 18px" }}>
                    <input
                      style={inputStyle()}
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                      placeholder="🔍  Search by employee name…"
                    />
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {filteredAttendance.length > 0 ? (
                      filteredAttendance.map((record) => (
                        <AttendanceCard
                          key={record.id}
                          record={record}
                          isAdmin={true}
                          onUpdateAttendanceStatus={onUpdateAttendanceStatus}
                          onDeleteAttendance={onDeleteAttendance}
                        />
                      ))
                    ) : (
                      <EmptyState icon="✅" title="No pending attendance" description="All submitted attendance has been reviewed." />
                    )}
                    {attendanceHasMore && (
                      <div style={{ textAlign: "center", paddingTop: 8 }}>
                        <button onClick={onLoadMoreAttendance} style={{ padding: "8px 24px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                          Load More Records
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── OHC Certifications ── */}
              {hrSubTab === "ohc" && (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* OHC stats strip */}
                  <div className="ohc-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "Total",         value: ohcCertifications.length, color: "#6366f1" },
                      { label: "Active",        value: activeOHC.length,         color: "#10b981" },
                      { label: "Expiring Soon", value: expiringSoonOHCCerts.length, color: "#f59e0b" },
                      { label: "Expired",       value: expiredOHCCerts.length,   color: "#ef4444" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, borderLeft: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Search + Add + Print */}
                  <div className="ohc-action-bar" style={{ ...cardStyle(), padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      style={{ ...inputStyle(), flex: 1, minWidth: 0 }}
                      value={ohcSearch}
                      onChange={e => setOhcSearch(e.target.value)}
                      placeholder="🔍  Search by employee name…"
                    />
                    <button style={buttonStyle(false)} onClick={handlePrintOHCReport}>🖨 Print Report</button>
                    <button style={buttonStyle(true)} onClick={openAddOHCForm}>+ Add Certificate</button>
                  </div>

                  {/* OHC Cards */}
                  <div style={{ display: "grid", gap: 10 }}>
                    {sortedOHC.length > 0 ? sortedOHC.map(item => {
                      const status = getOHCDisplayStatus(item.expiryDate, item.applied);
                      const accentColor = status === "Applied" ? "#3b82f6" : status === "Expired" ? "#ef4444" : status === "Expires Today" ? "#f97316" : status === "Expiring Soon" ? "#f59e0b" : "#10b981";
                      return (
                        <div key={item.id} style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, borderLeft: `4px solid ${accentColor}`, overflow: "hidden", contentVisibility: "auto", containIntrinsicSize: "70px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                            {/* Employee photo */}
                            <img
                              src={item.employeePhotoLink || "/eihg-logo.jpeg"}
                              alt={item.name} width={44} height={44}
                              loading="lazy" decoding="async"
                              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: item.employeePhotoLink ? "pointer" : "default", border: `2px solid ${accentColor}30` }}
                              onClick={() => item.employeePhotoLink && setOhcPreview({ title: `${item.name} — Employee Photo`, image: item.employeePhotoLink })}
                            />

                            {/* Name + expiry */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                              <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
                                Expires: <strong style={{ color: accentColor }}>{item.expiryDate || "—"}</strong>
                                {item.expiryDate && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {getOHCHint(item.expiryDate)}</span>}
                              </div>
                            </div>

                            {/* Certificate thumbnail */}
                            <img
                              src={item.certificatePhotoLink || "/eihg-logo.jpeg"}
                              alt="cert" width={58} height={40}
                              loading="lazy" decoding="async"
                              style={{ width: 58, height: 40, borderRadius: 8, objectFit: "cover", border: `1px solid ${theme.cardBorder}`, flexShrink: 0, cursor: item.certificatePhotoLink ? "pointer" : "default" }}
                              onClick={() => item.certificatePhotoLink && setOhcPreview({ title: `${item.name} — Certificate`, image: item.certificatePhotoLink })}
                            />

                            {/* Status badge */}
                            <span style={getOHCBadgeStyle(status)}>{status}</span>

                            {/* Icon buttons */}
                            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                              {item.employeePhotoLink && (
                                <button title="View Employee Photo" style={invoiceIconBtn(theme)} onClick={() => setOhcPreview({ title: `${item.name} — Employee Photo`, image: item.employeePhotoLink! })}>👤</button>
                              )}
                              {item.certificatePhotoLink && (
                                <button title="View Certificate" style={invoiceIconBtn(theme)} onClick={() => setOhcPreview({ title: `${item.name} — Certificate`, image: item.certificatePhotoLink! })}>🖼</button>
                              )}
                              <button title="Edit" style={invoiceIconBtn(theme)} onClick={() => openEditOHCForm(item)}>✏️</button>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                      <EmptyState icon="⚕️" title="No OHC certificates" description={ohcSearch ? "No results for your search." : "Add certificates to track renewals and expiry alerts."} />
                    )}
                  </div>
                </div>
              )}

              {/* ── Basic Food Safety Certificate Monitoring ── */}
              {hrSubTab === "foodSafety" && (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* Summary cards */}
                  <div className="fs-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "Total Certificates", value: foodSafetyCertifications.length, color: "#6366f1" },
                      { label: "Valid",              value: validFS.length,                 color: "#10b981" },
                      { label: "Expiring Soon",      value: expiringSoonFS.length,          color: "#f59e0b" },
                      { label: "Expired",            value: expiredFS.length,               color: "#ef4444" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, borderLeft: `1px solid ${theme.cardBorder}`, borderRight: `1px solid ${theme.cardBorder}`, borderBottom: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Renewal alert banner (in-app notification) */}
                  {fsRenewalAlerts.length > 0 && (
                    <div style={{ borderRadius: 14, border: `1px solid ${theme.cardBorder}`, borderLeft: "4px solid #f59e0b", background: theme.softCardBackground, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>⚠️</span>
                      <div style={{ fontSize: 13, color: theme.title, fontWeight: 700 }}>
                        {fsRenewalAlerts.length} Food Safety certificate{fsRenewalAlerts.length > 1 ? "s" : ""} need attention
                        <span style={{ fontWeight: 500, color: theme.subtleText, marginLeft: 6 }}>· expiring within 30 days or already expired</span>
                      </div>
                    </div>
                  )}

                  {/* Search + filters + actions */}
                  <div className="fs-action-bar" style={{ ...cardStyle(), padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      style={{ ...inputStyle(), flex: "1 1 180px", minWidth: 0 }}
                      value={fsSearch}
                      onChange={e => setFsSearch(e.target.value)}
                      placeholder="🔍  Search staff name…"
                    />
                    <input
                      style={{ ...inputStyle(), flex: "1 1 160px", minWidth: 0 }}
                      value={fsCertSearch}
                      onChange={e => setFsCertSearch(e.target.value)}
                      placeholder="🔍  Search certificate ID…"
                    />
                    <select style={{ ...inputStyle(), flex: "0 1 150px", minWidth: 0 }} value={fsStatusFilter} onChange={e => setFsStatusFilter(e.target.value as "All" | FoodSafetyStatus)}>
                      <option value="All">All statuses</option>
                      <option value="Valid">Valid</option>
                      <option value="Expiring Soon">Expiring Soon</option>
                      <option value="Expired">Expired</option>
                    </select>
                    <select style={{ ...inputStyle(), flex: "0 1 160px", minWidth: 0 }} value={fsSort} onChange={e => setFsSort(e.target.value as "expiry" | "name")}>
                      <option value="expiry">Sort by expiry date</option>
                      <option value="name">Sort alphabetically</option>
                    </select>
                    <button style={buttonStyle(false)} onClick={handlePrintFSReport}>🖨 PDF</button>
                    <button style={buttonStyle(false)} onClick={handleExportFSExcel}>📊 Excel</button>
                    <button style={buttonStyle(true)} onClick={openAddFSForm}>+ Add Certificate</button>
                  </div>

                  {/* Desktop table */}
                  {filteredSortedFS.length > 0 ? (
                    <>
                      <div className="fs-table-desktop" style={{ ...cardStyle(), padding: 0, overflow: "hidden" }}>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: theme.softCardBackground }}>
                                {["Staff Name", "Employee ID", "Certificate ID", "Issue Date", "Expiry Date", "Status", "Days Remaining", "Last Updated", "Actions"].map((h) => (
                                  <th key={h} style={{ textAlign: h === "Status" || h === "Actions" ? "center" : "left", padding: "11px 14px", fontSize: 11, fontWeight: 700, color: theme.subtleText, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderBottom: `1px solid ${theme.cardBorder}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSortedFS.map((item) => {
                                const status = getFoodSafetyStatus(item.expiryDate);
                                const accent = getFoodSafetyStatusColor(status);
                                return (
                                  <tr key={item.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                                    <td style={{ padding: "10px 14px", fontWeight: 700, color: theme.title, whiteSpace: "nowrap" }}>{item.name}</td>
                                    <td style={{ padding: "10px 14px", color: theme.mutedText }}>{item.employeeId || "—"}</td>
                                    <td style={{ padding: "10px 14px", color: theme.mutedText, fontWeight: 600 }}>{item.certificateId || "—"}</td>
                                    <td style={{ padding: "10px 14px", color: theme.mutedText, whiteSpace: "nowrap" }}>{formatFoodSafetyDate(item.issueDate)}</td>
                                    <td style={{ padding: "10px 14px", color: accent, fontWeight: 700, whiteSpace: "nowrap" }}>{formatFoodSafetyDate(item.expiryDate)}</td>
                                    <td style={{ padding: "10px 14px", textAlign: "center" }}><span style={getFoodSafetyBadgeStyle(status)}>{status}</span></td>
                                    <td style={{ padding: "10px 14px", color: status === "Expired" ? "#ef4444" : theme.mutedText, whiteSpace: "nowrap", fontWeight: status === "Valid" ? 400 : 600 }}>{getFoodSafetyDaysLabel(item.expiryDate)}</td>
                                    <td style={{ padding: "10px 14px", color: theme.subtleText, whiteSpace: "nowrap" }}>{formatFoodSafetyUpdated(item.updatedAt)}</td>
                                    <td style={{ padding: "10px 14px" }}>
                                      <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                                        <button title="Edit" style={invoiceIconBtn(theme)} onClick={() => openEditFSForm(item)}>✏️</button>
                                        <button title="Delete" style={invoiceIconBtn(theme)} onClick={() => onDeleteFoodSafetyCertification?.(item.id, item.name)}>🗑</button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Mobile cards */}
                      <div className="fs-cards-mobile" style={{ display: "none", gap: 10 }}>
                        {filteredSortedFS.map((item) => {
                          const status = getFoodSafetyStatus(item.expiryDate);
                          const accent = getFoodSafetyStatusColor(status);
                          return (
                            <div key={item.id} style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderLeft: `4px solid ${accent}`, borderRadius: 12, padding: "12px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>{item.name}</div>
                                  <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
                                    Cert {item.certificateId || "—"}{item.employeeId ? ` · ID ${item.employeeId}` : ""}
                                  </div>
                                </div>
                                <span style={getFoodSafetyBadgeStyle(status)}>{status}</span>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontSize: 12, color: theme.mutedText }}>
                                <div>Issued: <strong style={{ color: theme.title }}>{formatFoodSafetyDate(item.issueDate)}</strong></div>
                                <div>Expires: <strong style={{ color: accent }}>{formatFoodSafetyDate(item.expiryDate)}</strong></div>
                                <div>{getFoodSafetyDaysLabel(item.expiryDate)}</div>
                                <div>Updated: {formatFoodSafetyUpdated(item.updatedAt)}</div>
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button style={{ ...buttonStyle(false), flex: 1 }} onClick={() => openEditFSForm(item)}>✏️ Edit</button>
                                <button style={{ ...buttonStyle(false), flex: 1 }} onClick={() => onDeleteFoodSafetyCertification?.(item.id, item.name)}>🗑 Delete</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <EmptyState icon="🥗" title="No Food Safety certificates" description={(fsSearch || fsCertSearch || fsStatusFilter !== "All") ? "No results for your search or filter." : "Add certificates to track renewals and expiry alerts."} />
                  )}
                </div>
              )}

              {/* ── Birthdays ── */}
              {hrSubTab === "birthdays" && (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* Header + search + add + print */}
                  <div style={{ ...cardStyle(), padding: "12px 16px" }}>
                    <div className="birthday-header">
                      <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>🎂 Birthdays</div>
                      <span style={{ fontSize: 12, color: theme.subtleText }}>{sortedBirthdays.length} records</span>
                      <div style={{ flex: 1 }} />
                      <button className="birthday-print-btn" style={buttonStyle(false)} onClick={() => setShowCardSettings(true)} title="Birthday card settings">⚙ Card Settings</button>
                      <button className="birthday-print-btn" style={buttonStyle(false)} onClick={handlePrintBirthdayReport}>🖨 Print Report</button>
                      <button className="birthday-add-btn" style={buttonStyle(true)} onClick={() => setShowBirthdayModal(true)}>+ Add Birthday</button>
                    </div>
                    <input
                      style={inputStyle()}
                      value={bdSearch}
                      onChange={e => setBdSearch(e.target.value)}
                      placeholder="🔍  Search by employee name…"
                    />
                  </div>

                  {/* Hidden input for replacing an entry's photo */}
                  <input
                    ref={bdPhotoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleBirthdayPhotoPick(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />

                  {/* Birthday cards grid */}
                  {sortedBirthdays.length > 0 ? (
                    <div className="birthday-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {sortedBirthdays.map(item => {
                        const daysLeft = bdDaysUntil(item.birthday);
                        const isToday = daysLeft === 0;
                        const isSoon = daysLeft > 0 && daysLeft <= 7;
                        const pillColor = isToday ? "#ec4899" : isSoon ? "#f59e0b" : "#6366f1";
                        const pillBg = isToday ? "rgba(236,72,153,0.12)" : isSoon ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.10)";
                        const pillText = isToday ? "🎂 Today!" : `🎂 in ${daysLeft}d`;
                        return (
                          <div key={item.id} style={{
                            background: theme.cardBackground,
                            border: `1px solid ${isToday ? "#ec4899" : theme.cardBorder}`,
                            borderRadius: 14,
                            padding: "14px 14px 12px",
                            display: "flex", flexDirection: "column", gap: 10,
                            boxShadow: isToday ? "0 0 0 2px rgba(236,72,153,0.2)" : "none",
                            contentVisibility: "auto",
                            containIntrinsicSize: "120px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {item.photoLink ? (
                                <img
                                  src={item.photoLink} alt={item.name} width={46} height={46}
                                  loading="lazy" decoding="async"
                                  style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: "pointer", border: `2px solid ${pillColor}40` }}
                                  onClick={() => setBirthdayPreview({ title: `${item.name} — Birthday Photo`, image: item.photoLink! })}
                                />
                              ) : (
                                <AvatarInitials name={item.name} size={46} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                                <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>{item.birthday || "No date set"}</div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: pillColor, background: pillBg, border: `1px solid ${pillColor}30`, borderRadius: 999, padding: "3px 10px" }}>
                                {pillText}
                              </span>
                              <div style={{ display: "flex", gap: 5 }}>
                                <button
                                  title="Create greeting card"
                                  style={{ ...invoiceIconBtn(theme), color: "#ec4899" }}
                                  onClick={() => {
                                    // Pull the employee's photo from the same
                                    // source the Employees pages use
                                    // (profilePhotoUrl), matched by name. Fall
                                    // back to the birthday entry's own photo.
                                    const emp = employees.find(
                                      (e) =>
                                        e.name.trim().toLowerCase() ===
                                        item.name.trim().toLowerCase()
                                    );
                                    setCardPerson({
                                      name: item.name,
                                      birthday: item.birthday,
                                      photoUrl:
                                        item.photoLink ||
                                        emp?.profilePhotoUrl ||
                                        undefined,
                                      gender: item.gender ?? emp?.gender,
                                    });
                                  }}
                                >🎉</button>
                                <button
                                  title={item.photoLink ? "Change photo (upload higher quality)" : "Upload photo"}
                                  disabled={bdPhotoUploadingId === item.id}
                                  style={{
                                    ...invoiceIconBtn(theme),
                                    color: "#6366f1",
                                    opacity: bdPhotoUploadingId === item.id ? 0.5 : 1,
                                    cursor: bdPhotoUploadingId === item.id ? "progress" : "pointer",
                                  }}
                                  onClick={() => {
                                    bdPhotoTargetId.current = item.id;
                                    bdPhotoInputRef.current?.click();
                                  }}
                                >{bdPhotoUploadingId === item.id ? "⏳" : "📷"}</button>
                                {item.photoLink && (
                                  <button title="View Photo" style={invoiceIconBtn(theme)} onClick={() => setBirthdayPreview({ title: `${item.name} — Birthday Photo`, image: item.photoLink! })}>🖼</button>
                                )}
                                <button
                                  title="Delete"
                                  style={{ ...invoiceIconBtn(theme), color: "#ef4444" }}
                                  onClick={() => onDeleteBirthday(item.id, item.name)}
                                >🗑</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState icon="🎂" title="No birthdays added yet" description={bdSearch ? "No results for your search." : "Click '+ Add Birthday' to add the first entry."} />
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 20 }}>

              {/* Stats strip */}
              <div className="invoice-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {[
                  { label: "Total", value: filteredInvoices.length, color: "#3b82f6", icon: "🧾" },
                  { label: "Pending", value: invoiceReviewItems.length, color: "#f59e0b", icon: "⏳" },
                  { label: "Approved", value: invoiceApprovedItems.length, color: "#3b82f6", icon: "✅" },
                  { label: "Paid", value: invoicePaidItems.length, color: "#10b981", icon: "💰" },
                  { label: "Grand Total", value: `AED ${formatMoney(invoiceGrandTotal)}`, color: "#8b5cf6", icon: "📊" },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} style={{
                    background: theme.cardBackground,
                    borderTop: `3px solid ${color}`,
                    borderLeft: `1px solid ${theme.cardBorder}`,
                    borderRight: `1px solid ${theme.cardBorder}`,
                    borderBottom: `1px solid ${theme.cardBorder}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: typeof value === "string" ? 14 : 26, fontWeight: 900, color: color, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Filter bar */}
              <div style={{ ...cardStyle(), padding: "14px 18px" }}>
                <div className="invoice-filter-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <input
                    style={inputStyle()}
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="🔍  Search supplier, employee, or date…"
                  />
                  <input
                    style={inputStyle()}
                    value={invoiceSupplierFilter}
                    onChange={(e) => setInvoiceSupplierFilter(e.target.value)}
                    placeholder="Supplier"
                  />
                  <select style={inputStyle()} value={invoiceStatusFilter} onChange={(e) => setInvoiceStatusFilter(e.target.value)}>
                    <option value="All">All Status</option>
                    <option value="Approved">Approved</option>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <input type="date" style={inputStyle()} value={invoiceFromDate} onChange={(e) => setInvoiceFromDate(e.target.value)} />
                  <input type="date" style={inputStyle()} value={invoiceToDate} onChange={(e) => setInvoiceToDate(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={buttonStyle(true)} onClick={handlePrintInvoiceSummary}>🖨 Print Report</button>
                  <button style={buttonStyle(false)} onClick={() => { setInvoiceSearch(""); setInvoiceSupplierFilter(""); setInvoiceStatusFilter("All"); setInvoiceFromDate(""); setInvoiceToDate(""); }}>
                    ✕ Reset Filters
                  </button>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: theme.subtleText }}>
                    Showing <strong style={{ color: theme.title }}>{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Needs Review section */}
              {invoiceReviewItems.length > 0 && (
                <div style={{ ...cardStyle(), borderLeft: "4px solid #f59e0b" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Needs Review</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>
                        {invoiceReviewItems.length} invoice{invoiceReviewItems.length !== 1 ? "s" : ""} pending admin approval
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {invoiceReviewItems.map((item) => (
                      <InvoiceReviewCard
                        key={item.id}
                        item={item}
                        onEdit={openEditInvoiceForm}
                        onApprove={handleApproveInvoice}
                        onOpenAttachment={onOpenInvoiceAttachment}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Invoices */}
              <div style={cardStyle()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>All Invoices</div>
                    <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
                      {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} · Total: <strong style={{ color: "#8b5cf6" }}>AED {formatMoney(invoiceGrandTotal)}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredInvoices.length > 0 ? (
                    filteredInvoices.map((item) => (
                      <InvoiceReviewCard
                        key={item.id}
                        item={item}
                        onEdit={openEditInvoiceForm}
                        onApprove={handleApproveInvoice}
                        onOpenAttachment={onOpenInvoiceAttachment}
                      />
                    ))
                  ) : (
                    <EmptyState title="No invoices found" description="Try changing the filters or search text." />
                  )}
                  {invoicesHasMore && (
                    <div style={{ textAlign: "center", paddingTop: 8 }}>
                      <button onClick={onLoadMoreInvoices} style={{ padding: "8px 24px", borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        Load More Invoices
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === "assessments" && (
          <AdminAssessments
            assessments={assessments}
            submissions={assessmentSubmissions}
            loadingAssessments={loadingAssessments}
            loadingSubmissions={loadingAssessmentSubmissions}
            onCreateAssessment={async (draft) => {
              if (!onCreateAssessment) {
                throw new Error("Assessment creation is not wired up.");
              }
              return onCreateAssessment(draft);
            }}
            onUpdateAssessment={async (id, draft) => {
              if (!onUpdateAssessment) {
                throw new Error("Assessment update is not wired up.");
              }
              return onUpdateAssessment(id, draft);
            }}
            onDeleteAssessment={(id, title) => {
              if (!onDeleteAssessment) {
                showToast("error", "Assessment deletion is not wired up.");
                return;
              }
              onDeleteAssessment(id, title);
            }}
            onToggleAssessmentActive={async (id, nextActive) => {
              if (!onToggleAssessmentActive) {
                throw new Error("Assessment status update is not wired up.");
              }
              return onToggleAssessmentActive(id, nextActive);
            }}
            onSoftDeleteSubmission={async (submissionId) => {
              if (!onSoftDeleteSubmission) {
                throw new Error("Submission delete is not wired up.");
              }
              return onSoftDeleteSubmission(submissionId);
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "reports" && (
          <AdminReports
            reports={reports}
            loading={loadingReports}
            currentUserName={currentUser.name}
            onCreateReport={async (draft) => {
              if (!onCreateReport) {
                throw new Error("Report creation is not wired up.");
              }
              return onCreateReport(draft);
            }}
            onUpdateReport={async (id, draft) => {
              if (!onUpdateReport) {
                throw new Error("Report update is not wired up.");
              }
              return onUpdateReport(id, draft);
            }}
            onSoftDeleteReport={(id, title) => {
              if (!onSoftDeleteReport) {
                showToast("error", "Report deletion is not wired up.");
                return;
              }
              onSoftDeleteReport(id, title);
            }}
            showToast={showToast}
          />
        )}

        {invoiceFormOpen && (
          <div style={{
            position: "fixed", inset: 0,
            background: theme.modalOverlay,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2400, padding: 20,
          }}>
            <div style={{ ...cardStyle(), maxWidth: 640, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0 }}>
              <div style={{
                padding: "18px 24px",
                borderBottom: `1px solid ${theme.cardBorder}`,
                display: "flex", alignItems: "center", gap: 12,
                background: theme.softCardBackground,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧾</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>Edit Invoice</div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>Update invoice details and status</div>
                </div>
              </div>

              <div style={{ padding: "20px 24px" }}>
                <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Supplier Name</label>
                    <input style={inputStyle()} value={invoiceForm.supplierName} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, supplierName: e.target.value }))} />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer Name</label>
                    <input style={inputStyle()} value={invoiceForm.customerName} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, customerName: e.target.value }))} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Amount (AED)</label>
                    <input type="number" min="0" step="0.01" style={inputStyle()} value={invoiceForm.totalAmount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, totalAmount: e.target.value }))} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
                    <select style={inputStyle()} value={invoiceForm.status} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, status: e.target.value as InvoiceStatus }))}>
                      <option value="Approved">Approved</option>
                      <option value="Pending Review">Pending Review</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date Received</label>
                    <input type="date" style={inputStyle()} value={invoiceForm.dateReceived} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dateReceived: e.target.value }))} />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date Approved</label>
                    <input type="date" style={inputStyle()} value={invoiceForm.dateApproved} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dateApproved: e.target.value }))} />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Replace Attachment</label>
                    <input type="file" style={inputStyle()} onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
                    {invoiceFile && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#3b82f6", display: "flex", alignItems: "center", gap: 4 }}>📎 {invoiceFile.name}</div>
                    )}
                    {!invoiceFile && editingInvoice?.attachmentName && (
                      <div style={{ marginTop: 6, fontSize: 12, color: theme.subtleText, display: "flex", alignItems: "center", gap: 4 }}>📎 Current: {editingInvoice.attachmentName}</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{
                padding: "14px 24px",
                borderTop: `1px solid ${theme.cardBorder}`,
                display: "flex", justifyContent: "flex-end", gap: 10,
                background: theme.softCardBackground,
              }}>
                <button style={buttonStyle(false)} onClick={() => { setInvoiceFormOpen(false); resetInvoiceForm(); }} disabled={invoiceSaving}>Cancel</button>
                <button style={{ ...buttonStyle(true), opacity: invoiceSaving ? 0.7 : 1 }} onClick={handleSaveInvoice} disabled={invoiceSaving}>
                  {invoiceSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showBirthdayModal && (
          <div style={{ position: "fixed", inset: 0, background: theme.modalOverlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
            <div style={{ ...cardStyle(), maxWidth: 480, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0 }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 12, background: theme.softCardBackground }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(236,72,153,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎂</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>Add Birthday</div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>Add an employee birthday to track</div>
                </div>
              </div>

              <div style={{ padding: "20px 24px", display: "grid", gap: 14 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee Name</label>
                  <input style={inputStyle()} value={birthdayForm.name} onChange={(e) => setBirthdayForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter employee name" />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Birthday Date</label>
                  <input type="date" style={inputStyle()} value={birthdayForm.birthday} onChange={(e) => setBirthdayForm((prev) => ({ ...prev, birthday: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gender (optional)</label>
                  <select
                    style={inputStyle()}
                    value={birthdayForm.gender}
                    onChange={(e) => setBirthdayForm((prev) => ({ ...prev, gender: e.target.value as "" | "male" | "female" }))}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Photo (optional)</label>
                  <input type="file" accept="image/*" style={inputStyle()} onChange={(e) => { const f = e.target.files?.[0] || null; setBirthdayPhoto(f); setBirthdayForm((prev) => ({ ...prev, photoName: f ? f.name : "" })); }} />
                  {birthdayForm.photoName && <div style={{ marginTop: 6, fontSize: 12, color: "#ec4899", display: "flex", alignItems: "center", gap: 4 }}>🖼 {birthdayForm.photoName}</div>}
                </div>
              </div>

              <div style={{ padding: "14px 24px", borderTop: `1px solid ${theme.cardBorder}`, display: "flex", justifyContent: "flex-end", gap: 10, background: theme.softCardBackground }}>
                <button style={buttonStyle(false)} onClick={() => { setShowBirthdayModal(false); setBirthdayPhoto(null); setBirthdayForm({ name: "", birthday: "", photoName: "", gender: "" }); }} disabled={birthdaySaving}>Cancel</button>
                <button style={{ ...buttonStyle(true), opacity: birthdaySaving ? 0.7 : 1 }} onClick={handleAddBirthday} disabled={birthdaySaving}>
                  {birthdaySaving ? "Saving…" : "Save Birthday"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showManageBirthdaysModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: theme.modalOverlay,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
              padding: 20,
            }}
          >
            <div style={{ ...cardStyle(), maxWidth: 720, width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 900, color: theme.title }}>
                  Manage Birthdays
                </div>

                <button
                  style={buttonStyle(false)}
                  onClick={() => setShowManageBirthdaysModal(false)}
                >
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gap: 12, maxHeight: "60vh", overflowY: "auto" }}>
                {birthdays.length > 0 ? (
                  birthdays.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 14,
                        border: `1px solid ${theme.cardBorder}`,
                        borderRadius: 16,
                        padding: 12,
                        background: theme.cardBackground,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Image
                          src={item.photoLink || "/eihg-logo.jpeg"}
                          alt={item.name}
                          width={52}
                          height={52}
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: "50%",
                            objectFit: "cover",
                            background: theme.fileCardBg,
                            cursor: item.photoLink ? "pointer" : "default",
                          }}
                          onClick={() => {
                            if (item.photoLink) {
                              setBirthdayPreview({
                                title: `${item.name} - Birthday Photo`,
                                image: item.photoLink,
                              });
                            }
                          }}
                        />

                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: theme.title }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 4 }}>
                            {item.birthday || "No date"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {item.photoLink && (
                          <button
                            style={smallButtonStyle()}
                            onClick={() =>
                              setBirthdayPreview({
                                title: `${item.name} - Birthday Photo`,
                                image: item.photoLink || "",
                              })
                            }
                          >
                            View Photo
                          </button>
                        )}

                        <button
                          style={dangerButtonStyle()}
                          onClick={() => {
                            setShowManageBirthdaysModal(false);
                            onDeleteBirthday(item.id, item.name);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No birthdays added"
                    description="Birthday entries added by admin will appear here."
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {ohcFormOpen && (
          <div style={{ position: "fixed", inset: 0, background: theme.modalOverlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2200, padding: 20 }}>
            <div style={{ ...cardStyle(), maxWidth: 580, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0 }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 12, background: theme.softCardBackground }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚕️</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>{editingOHC ? "Edit Certificate" : "Add OHC Certificate"}</div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>{editingOHC ? "Update certificate details" : "Add a new OHC certification record"}</div>
                </div>
              </div>

              <div className="form-2col" style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee Name</label>
                  <input style={inputStyle()} value={ohcForm.name} onChange={(e) => setOhcForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter employee name" />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Certificate Expiry Date</label>
                  <input type="date" style={inputStyle()} value={ohcForm.expiryDate} onChange={(e) => setOhcForm((prev) => ({ ...prev, expiryDate: e.target.value }))} />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee Photo</label>
                  <input type="file" accept="image/*" style={inputStyle()} onChange={(e) => { const f = e.target.files?.[0] || null; setOhcEmployeePhoto(f); setOhcForm((prev) => ({ ...prev, employeePhotoName: f ? f.name : "" })); }} />
                  {(ohcForm.employeePhotoName || ohcForm.currentEmployeePhotoPath) && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6366f1", display: "flex", alignItems: "center", gap: 4 }}>👤 {ohcForm.employeePhotoName || "Current photo kept"}</div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Certificate Photo</label>
                  <input type="file" accept="image/*" style={inputStyle()} onChange={(e) => { const f = e.target.files?.[0] || null; setOhcCertificatePhoto(f); setOhcForm((prev) => ({ ...prev, certificatePhotoName: f ? f.name : "" })); }} />
                  {(ohcForm.certificatePhotoName || ohcForm.currentCertificatePhotoPath) && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#6366f1", display: "flex", alignItems: "center", gap: 4 }}>🖼 {ohcForm.certificatePhotoName || "Current cert kept"}</div>
                  )}
                </div>

                {editingOHC && onSetOHCApplied && getOHCStatus(editingOHC.expiryDate) === "Expired" && (
                  <div style={{ gridColumn: "1 / -1", marginTop: 4, padding: "12px 14px", borderRadius: 12, border: `1px solid ${editingOHC.applied ? "#bfdbfe" : theme.cardBorder}`, background: editingOHC.applied ? "rgba(59,130,246,0.08)" : theme.softCardBackground, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Renewal Status</div>
                      <div style={{ fontSize: 13, color: theme.title, fontWeight: 600 }}>
                        {editingOHC.applied
                          ? "Marked as Applied — renewal is in progress."
                          : "Certificate is Expired. Mark as Applied if a renewal request has been submitted."}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={ohcApplying}
                      style={{
                        ...buttonStyle(!editingOHC.applied),
                        background: editingOHC.applied ? "transparent" : "#3b82f6",
                        color: editingOHC.applied ? "#3b82f6" : "#fff",
                        border: `1px solid #3b82f6`,
                        opacity: ohcApplying ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        if (!editingOHC || !onSetOHCApplied) return;
                        const next = !editingOHC.applied;
                        try {
                          setOhcApplying(true);
                          await onSetOHCApplied(editingOHC.id, next);
                          setEditingOHC({ ...editingOHC, applied: next });
                          showToast("success", next ? "Marked as Applied." : "Applied status removed.");
                        } catch (error) {
                          console.error(error);
                          showToast("error", "Could not update Applied status.");
                        } finally {
                          setOhcApplying(false);
                        }
                      }}
                    >
                      {ohcApplying ? "Saving…" : editingOHC.applied ? "↩ Remove Applied" : "📨 Mark as Applied"}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 24px", borderTop: `1px solid ${theme.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: theme.softCardBackground }}>
                <div>{editingOHC && <button style={dangerButtonStyle()} onClick={handleDeleteOHCInsideForm}>🗑 Delete</button>}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={buttonStyle(false)} onClick={() => { setOhcFormOpen(false); resetOHCForm(); }} disabled={ohcSaving}>Cancel</button>
                  <button style={{ ...buttonStyle(true), opacity: ohcSaving ? 0.7 : 1 }} onClick={handleSaveOHC} disabled={ohcSaving}>
                    {ohcSaving ? "Saving…" : editingOHC ? "Save Changes" : "Add Certificate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {fsFormOpen && (
          <div style={{ position: "fixed", inset: 0, background: theme.modalOverlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2200, padding: 20 }}>
            <div style={{ ...cardStyle(), maxWidth: 580, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0 }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 12, background: theme.softCardBackground }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(14,165,233,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🥗</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>{editingFS ? "Edit Certificate" : "Add Food Safety Certificate"}</div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>{editingFS ? "Update certificate details" : "Add a new Basic Food Safety certification record"}</div>
                </div>
              </div>

              <div className="form-2col" style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Staff Name *</label>
                  <input style={inputStyle()} value={fsForm.name} onChange={(e) => setFsForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter staff name" />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee ID</label>
                  <input style={inputStyle()} value={fsForm.employeeId} onChange={(e) => setFsForm((prev) => ({ ...prev, employeeId: e.target.value }))} placeholder="Optional" />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Certificate ID *</label>
                  <input style={inputStyle()} value={fsForm.certificateId} onChange={(e) => setFsForm((prev) => ({ ...prev, certificateId: e.target.value }))} placeholder="e.g. FS-0000" />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Issue Date</label>
                  <input type="date" style={inputStyle()} value={fsForm.issueDate} onChange={(e) => setFsForm((prev) => ({ ...prev, issueDate: e.target.value }))} />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Expiry Date *</label>
                  <input type="date" style={inputStyle()} value={fsForm.expiryDate} onChange={(e) => setFsForm((prev) => ({ ...prev, expiryDate: e.target.value }))} />
                  <div style={{ marginTop: 6, fontSize: 11, color: theme.subtleText }}>Default 02 Jul 2028 — change if needed.</div>
                </div>
              </div>

              <div style={{ padding: "14px 24px", borderTop: `1px solid ${theme.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: theme.softCardBackground }}>
                <div>{editingFS && <button style={dangerButtonStyle()} onClick={handleDeleteFSInsideForm}>🗑 Delete</button>}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={buttonStyle(false)} onClick={() => { setFsFormOpen(false); resetFSForm(); }} disabled={fsSaving}>Cancel</button>
                  <button style={{ ...buttonStyle(true), opacity: fsSaving ? 0.7 : 1 }} onClick={handleSaveFS} disabled={fsSaving}>
                    {fsSaving ? "Saving…" : editingFS ? "Save Changes" : "Add Certificate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ohcPreview && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: theme.modalOverlay,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2500,
              padding: 20,
            }}
            onClick={() => setOhcPreview(null)}
          >
            <div
              style={{
                ...cardStyle(),
                maxWidth: "90vw",
                maxHeight: "90vh",
                width: "auto",
                padding: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>
                  {ohcPreview.title}
                </div>

                <button
                  style={buttonStyle(false)}
                  onClick={() => setOhcPreview(null)}
                >
                  Close
                </button>
              </div>

              <Image
                src={ohcPreview.image}
                alt={ohcPreview.title}
                width={1200}
                height={900}
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  width: "auto",
                  height: "auto",
                  borderRadius: 14,
                  display: "block",
                  margin: "0 auto",
                  background: theme.fileCardBg,
                  border: `1px solid ${theme.cardBorder}`,
                }}
              />
            </div>
          </div>
        )}

        {birthdayPreview && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: theme.modalOverlay,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2500,
              padding: 20,
            }}
            onClick={() => setBirthdayPreview(null)}
          >
            <div
              style={{
                ...cardStyle(),
                maxWidth: "90vw",
                maxHeight: "90vh",
                width: "auto",
                padding: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>
                  {birthdayPreview.title}
                </div>

                <button
                  style={buttonStyle(false)}
                  onClick={() => setBirthdayPreview(null)}
                >
                  Close
                </button>
              </div>

              <Image
                src={birthdayPreview.image}
                alt={birthdayPreview.title}
                width={1200}
                height={900}
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  width: "auto",
                  height: "auto",
                  borderRadius: 14,
                  display: "block",
                  margin: "0 auto",
                  background: theme.fileCardBg,
                  border: `1px solid ${theme.cardBorder}`,
                }}
              />
            </div>
          </div>
        )}

        {cardPerson && (
          <BirthdayCardModal
            person={cardPerson}
            settings={birthdayCardSettings}
            onClose={() => setCardPerson(null)}
            showToast={showToast}
          />
        )}

        {showCardSettings && (
          <BirthdayCardSettingsModal
            settings={birthdayCardSettings}
            onSave={onSaveBirthdayCardSettings}
            onClose={() => setShowCardSettings(false)}
            showToast={showToast}
          />
        )}
        </div>{/* end animation wrapper */}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as DashboardTab)}
        tabs={[
          // Primary row — most-used (always visible in bar)
          { id: "dashboard",   label: "Home",        icon: "📊" },
          { id: "review",      label: "Review",      icon: "🔍", badge: pendingCount },
          { id: "assessments", label: "Assessments", icon: "📝" },
          { id: "reports",     label: "Reports",     icon: "📑" },
          // Secondary — surfaced via "More" sheet
          { id: "employees",   label: "Employees",   icon: "👥" },
          { id: "hr",          label: "HR",          icon: "⚕️",  badge: pendingAttendanceCount },
          { id: "invoices",    label: "Invoices",    icon: "💰", badge: invoiceReviewItems.length },
        ]}
      />
    </div>
  );
}