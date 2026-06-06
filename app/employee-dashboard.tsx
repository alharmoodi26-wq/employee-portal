"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { auth } from "./lib/firebase";
import {
  AssignedTask,
  AttendanceCard,
  AttendanceRecord,
  AvatarInitials,
  buttonStyle,
  cardStyle,
  dangerButtonStyle,
  dashboardWrapperStyle,
  Employee,
  EmptyState,
  formatDateTime,
  getTodayDateString,
  getThemeMode,
  getThemePalette,
  inputStyle,
  navBadgeStyle,
  navItemStyle,
  SectionTitle,
  sidebarContentStyle,
  sidebarStyle,
  smallButtonStyle,
  StatBox,
  TaskCard,
  ToastType,
  WorkCard,
  WorkItem,
  SelectedFilesPreview,
  useIsMobile,
  MobileBottomNav,
  escHtml,
  uploadFilesToStorage,
} from "./portal-utils";

type InvoiceStatus = "Approved" | "Pending Review" | "Paid";

type ExtractionStatus = "ready_for_review" | "pending_review" | "failed" | "duplicate";

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

type EmployeeTab =
  | "dashboard"
  | "tasks"
  | "works"
  | "attendance"
  | "approved"
  | "invoices";

type EmployeeDashboardProps = {
  currentUser: Employee;
  works: WorkItem[];
  assignedTasks: AssignedTask[];
  attendance: AttendanceRecord[];
  invoices: InvoiceItem[];
  onAddWork: (newWork: {
    title: string;
    category: string;
    date: string;
    notes: string;
    selectedFiles: File[];
  }) => Promise<void>;
  onAddInvoice: (newInvoice: {
    supplierName: string;
    customerName: string;
    dateReceived: string;
    dateApproved: string;
    totalAmount: number;
    status: InvoiceStatus;
    selectedFile: File | null;
  }) => Promise<void>;
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
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
  onOpenInvoiceAttachment: (path?: string, link?: string) => Promise<void> | void;
  onBulkAddInvoices: (
    extracted: BulkExtractedInvoice[],
    attachment: { path: string; name: string; type: string; totalPages: number }
  ) => Promise<{
    batchId: string;
    summary: { ready: number; pending: number; duplicate: number; failed: number };
  }>;
  onArchiveInvoice: (invoiceId: string) => Promise<void>;
  onClearExtractionStatus: (invoiceId: string) => Promise<void>;
  onSubmitTask: (id: string, submittedNotes: string, submittedFiles: File[]) => Promise<void>;
  onCheckIn: () => Promise<void>;
  onCheckOut: (attendanceId: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onUpdateProfilePhoto: (file: File) => Promise<void>;
  showToast: (type: ToastType, message: string) => void;
};

function getInvoiceBadgeStyle(status: InvoiceStatus): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
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
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${theme.cardBorder}`,
    background: theme.fileCardBg,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    transition: "all 0.15s ease",
    flexShrink: 0,
  };
}

function formatMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function invoiceNeedsReview(item: InvoiceItem) {
  if (item.status === "Approved" || item.status === "Paid") return false;
  if (item.status === "Pending Review") return true;

  if (!item.dateReceived || !item.dateApproved) return false;

  const diff = getDaysBetweenDates(item.dateReceived, item.dateApproved);
  return diff !== null && diff >= 4;
}

function matchesInvoiceSearch(item: InvoiceItem, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;

  return (
    item.supplierName.toLowerCase().includes(normalizedSearch) ||
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

function ExtractionStatusBadge({ status }: { status?: ExtractionStatus }) {
  if (!status) return null;
  const map: Record<ExtractionStatus, { label: string; bg: string; color: string }> = {
    ready_for_review: { label: "✓ Ready", bg: "#dcfce7", color: "#166534" },
    pending_review: { label: "⚠ Needs Review", bg: "#fef3c7", color: "#92400e" },
    failed: { label: "✗ Failed", bg: "#fee2e2", color: "#991b1b" },
    duplicate: { label: "⚡ Duplicate", bg: "#ffedd5", color: "#9a3412" },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function InvoiceCard({
  item,
  onDeleteInvoice,
  onOpenInvoiceAttachment,
  onEdit,
}: {
  item: InvoiceItem;
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
  onOpenInvoiceAttachment: (path?: string, link?: string) => Promise<void> | void;
  onEdit: (item: InvoiceItem) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const theme = getThemePalette();
  const isMobile = useIsMobile();

  const accentColor =
    item.status === "Paid" ? "#10b981"
    : item.status === "Approved" ? "#3b82f6"
    : "#f59e0b";

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await onDeleteInvoice(item.id);
    } finally {
      setDeleting(false);
    }
  };

  const actionButtons = (
    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
      {(item.attachmentPath || item.attachmentLink) && (
        <button title="View Attachment" style={invoiceIconBtn(theme)} onClick={() => onOpenInvoiceAttachment(item.attachmentPath, item.attachmentLink)}>📎</button>
      )}
      <button title="Edit" style={invoiceIconBtn(theme)} onClick={() => onEdit(item)}>✏️</button>
      <button title="Delete" style={{ ...invoiceIconBtn(theme), color: "#ef4444", opacity: deleting ? 0.6 : 1 }} onClick={handleDelete} disabled={deleting}>{deleting ? "…" : "🗑"}</button>
      <button title={expanded ? "Collapse" : "Expand"} style={{ ...invoiceIconBtn(theme), fontSize: 11, color: theme.subtleText }} onClick={() => setExpanded(!expanded)}>{expanded ? "▲" : "▼"}</button>
    </div>
  );

  return (
    <div style={{
      background: theme.cardBackground,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: 12,
      borderLeft: `4px solid ${accentColor}`,
      overflow: "hidden",
      transition: "box-shadow 0.15s ease",
    }}>
      {isMobile ? (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${accentColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🧾</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.supplierName || "(no supplier)"}</div>
                <ExtractionStatusBadge status={item.extractionStatus} />
              </div>
              {item.customerName && (
                <div style={{ fontSize: 11, color: theme.subtleText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Customer: {item.customerName}</div>
              )}
            </div>
            <span style={getInvoiceBadgeStyle(item.status)}>{item.status}</span>
          </div>
          <div style={{ fontSize: 12, color: theme.subtleText, marginBottom: 8, paddingLeft: 42 }}>
            Received: {item.dateReceived || "—"}{item.dateApproved ? ` · Approved: ${item.dateApproved}` : ""}
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.supplierName || "(no supplier)"}</div>
              <ExtractionStatusBadge status={item.extractionStatus} />
            </div>
            {item.customerName && (
              <div style={{ fontSize: 11, color: theme.subtleText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Customer: {item.customerName}</div>
            )}
            <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
              Received: {item.dateReceived || "—"}{item.dateApproved ? ` · Approved: ${item.dateApproved}` : ""}
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
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          background: theme.softCardBackground,
        }}>
          {[
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

export default function EmployeeDashboard({
  currentUser,
  works,
  assignedTasks,
  attendance,
  invoices,
  onAddWork,
  onAddInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onOpenInvoiceAttachment,
  onBulkAddInvoices,
  onArchiveInvoice,
  onClearExtractionStatus,
  onSubmitTask,
  onCheckIn,
  onCheckOut,
  onLogout,
  onUpdateProfilePhoto,
  showToast,
}: EmployeeDashboardProps) {
  const isMobile = useIsMobile();
  const myWorks = useMemo(() => works.filter((w) => !w.isDeleted), [works]);
  const myTasks = useMemo(() => assignedTasks.filter((t) => !t.isDeleted), [assignedTasks]);
  const myAttendance = useMemo(() => attendance, [attendance]);
  const myInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !invoice.isDeleted &&
          (invoice.employeeUid === currentUser.uid ||
            invoice.employeeEmail?.toLowerCase() === currentUser.email.toLowerCase())
      ),
    [invoices, currentUser.uid, currentUser.email]
  );

  const todayAttendance = useMemo(() => {
    const today = getTodayDateString();
    return myAttendance.find((record) => record.date === today) || null;
  }, [myAttendance]);

  const approvedWorks = useMemo(() => myWorks.filter((w) => w.status === "Approved"), [myWorks]);
  const nonApprovedWorks = useMemo(() => myWorks.filter((w) => w.status !== "Approved"), [myWorks]);

  const activeTasks = useMemo(
    () =>
      myTasks.filter(
        (task) =>
          task.status === "Assigned" ||
          task.status === "In Progress" ||
          task.status === "Needs Revision"
      ),
    [myTasks]
  );

  const submittedTasks = useMemo(
    () => myTasks.filter((task) => task.status === "Submitted"),
    [myTasks]
  );

  const approvedTasks = useMemo(
    () => myTasks.filter((task) => task.status === "Approved"),
    [myTasks]
  );

  const approvedAllRows = useMemo(() => {
    const tasks = approvedTasks.map((t) => ({
      type: "task" as const, id: t.id, title: t.title,
      sub: t.deadline ? `Deadline: ${t.deadline}` : "No deadline",
      date: t.deadline || "", item: t,
    }));
    const works = approvedWorks.map((w) => ({
      type: "work" as const, id: w.id, title: w.title,
      sub: w.category || "—",
      date: w.date || "", item: w,
    }));
    return [...tasks, ...works].sort((a, b) => b.date.localeCompare(a.date));
  }, [approvedTasks, approvedWorks]);

  const pendingAttendance = useMemo(
    () => myAttendance.filter((record) => record.status === "Pending"),
    [myAttendance]
  );

  const reviewedAttendance = useMemo(
    () => myAttendance.filter((record) => record.status !== "Pending"),
    [myAttendance]
  );

  const theme = getThemePalette();

  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser.profilePhotoUrl) {
      setProfilePhotoPreview(currentUser.profilePhotoUrl);
    } else {
      const saved = localStorage.getItem(`profilePhoto_${currentUser.uid}`);
      if (saved) setProfilePhotoPreview(saved);
    }
  }, [currentUser.uid, currentUser.profilePhotoUrl]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [activeTab, setActiveTab] = useState<EmployeeTab>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceItem | null>(null);

  const [approvedSearch, setApprovedSearch] = useState("");
  const [approvedTypeFilter, setApprovedTypeFilter] = useState<"All" | "Tasks" | "Works">("All");
  const [expandedApprovedId, setExpandedApprovedId] = useState<string | null>(null);

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("All");
  const [invoiceFromDate, setInvoiceFromDate] = useState("");
  const [invoiceToDate, setInvoiceToDate] = useState("");
  const [invoiceSourceFilter, setInvoiceSourceFilter] = useState<"all" | "bulk" | "manual">("all");

  type BulkStep = "upload" | "processing" | "summary" | "review";
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<BulkStep>("upload");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string>("");
  const [bulkBatchId, setBulkBatchId] = useState<string>("");
  const [bulkSummary, setBulkSummary] = useState<{
    ready: number;
    pending: number;
    duplicate: number;
    failed: number;
  } | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  const resetBulk = () => {
    setBulkStep("upload");
    setBulkFile(null);
    setBulkProgress("");
    setBulkBatchId("");
    setBulkSummary(null);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  };

  const handleBulkScan = async () => {
    if (!bulkFile) return;
    if (bulkStep === "processing") return;

    try {
      setBulkStep("processing");

      setBulkProgress("Uploading PDF…");
      const uploaded = await uploadFilesToStorage("invoice-files", currentUser.uid, [bulkFile]);
      const attachment = {
        path: uploaded[0]?.path ?? "",
        name: uploaded[0]?.name ?? bulkFile.name,
        type: uploaded[0]?.type ?? "application/pdf",
        totalPages: 0,
      };

      setBulkProgress("Extracting invoices…");
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Please sign in again.");

      const fd = new FormData();
      fd.append("file", bulkFile);
      const res = await fetch("/api/invoices/extract-bulk", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("حدث خطأ أثناء قراءة الفاتورة. يرجى المحاولة مرة أخرى.");
      }
      console.log("[bulk-scan] response", res.status, data);

      if (!res.ok) {
        const code = typeof data?.code === "string" ? data.code : "";
        if (res.status === 429 || code === "quota_exceeded") {
          throw new Error("تم الوصول إلى حد استخدام Gemini مؤقتًا. يرجى المحاولة بعد دقيقة.");
        }
        if (code === "file_invalid") {
          throw new Error("نوع الملف أو حجمه غير مدعوم. يرجى رفع PDF بحجم مناسب.");
        }
        throw new Error("حدث خطأ أثناء قراءة الفاتورة. يرجى المحاولة مرة أخرى.");
      }

      const extracted = (Array.isArray(data.invoices) ? data.invoices : []) as BulkExtractedInvoice[];
      if (extracted.length === 0) {
        showToast("error", "No invoices detected in the PDF.");
        setBulkStep("upload");
        return;
      }

      setBulkProgress(`Creating ${extracted.length} invoice records…`);
      const result = await onBulkAddInvoices(extracted, attachment);
      setBulkBatchId(result.batchId);
      setBulkSummary(result.summary);
      setBulkStep("summary");
      showToast("success", `${extracted.length} invoice(s) processed.`);
    } catch (error) {
      console.error("[bulk-scan] error", error);
      showToast("error", error instanceof Error ? error.message : "Bulk scan failed.");
      setBulkStep("upload");
    }
  };

  const [selectedWorkFiles, setSelectedWorkFiles] = useState<File[]>([]);
  const [selectedInvoiceFile, setSelectedInvoiceFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "",
    date: getTodayDateString(),
    notes: "",
  });

  const [invoiceForm, setInvoiceForm] = useState({
    supplierName: "",
    customerName: "",
    dateReceived: getTodayDateString(),
    dateApproved: "",
    totalAmount: "",
    status: "Approved" as InvoiceStatus,
  });

  const [scanLoading, setScanLoading] = useState(false);
  const [scanConfidence, setScanConfidence] = useState<Record<string, number> | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const handleScanInvoice = async (file: File) => {
    if (!file) return;
    if (scanLoading) return; // prevent concurrent scans
    setScanLoading(true);
    setScanConfidence(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast("error", "Please sign in again.");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("حدث خطأ أثناء قراءة الفاتورة. يرجى المحاولة مرة أخرى.");
      }
      console.log("[scan] response", res.status, data);

      if (!res.ok) {
        const code = typeof data?.code === "string" ? data.code : "";

        if (res.status === 429 || code === "quota_exceeded") {
          throw new Error(
            "تم الوصول إلى حد استخدام Gemini مؤقتًا. يرجى المحاولة بعد دقيقة."
          );
        }
        if (code === "file_invalid") {
          throw new Error(
            "نوع الملف أو حجمه غير مدعوم. يرجى رفع صورة JPG/PNG أو PDF بحجم مناسب."
          );
        }
        if (res.status === 401 || code === "unauthorized") {
          throw new Error("Please sign in again.");
        }
        if (code === "server_misconfigured") {
          throw new Error(
            "حدث خطأ أثناء قراءة الفاتورة. يرجى المحاولة مرة أخرى."
          );
        }
        // Any other 500 / extraction_failed
        throw new Error("حدث خطأ أثناء قراءة الفاتورة. يرجى المحاولة مرة أخرى.");
      }

      const supplierName = typeof data.supplier_name === "string" ? data.supplier_name : "";
      const customerName = typeof data.customer_name === "string" ? data.customer_name : "";
      const totalAmount = typeof data.total_amount === "number" ? data.total_amount : null;
      const invoiceDate =
        typeof data.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.invoice_date)
          ? data.invoice_date
          : "";
      const stampDate =
        typeof data.stamp_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.stamp_date)
          ? data.stamp_date
          : "";

      const filledCount =
        (supplierName ? 1 : 0) +
        (customerName ? 1 : 0) +
        (totalAmount !== null ? 1 : 0) +
        (invoiceDate ? 1 : 0) +
        (stampDate ? 1 : 0);

      if (filledCount === 0) {
        showToast(
          "error",
          "Could not read any data from the invoice. Try a clearer photo or enter the fields manually."
        );
        setSelectedInvoiceFile(file);
        return;
      }

      setInvoiceForm((prev) => ({
        ...prev,
        supplierName: supplierName || prev.supplierName,
        customerName: customerName || prev.customerName,
        totalAmount: totalAmount !== null ? String(totalAmount) : prev.totalAmount,
        dateReceived: invoiceDate || prev.dateReceived,   // top-of-invoice date
        dateApproved: stampDate || prev.dateApproved,     // stamp date (GRN / Received / Approved)
      }));
      setScanConfidence(
        data.confidence && typeof data.confidence === "object"
          ? (data.confidence as Record<string, number>)
          : null
      );
      setSelectedInvoiceFile(file);

      const warnings: string[] = Array.isArray(data.warnings)
        ? (data.warnings as unknown[]).filter((w): w is string => typeof w === "string")
        : [];
      const summary = [
        supplierName && `Supplier: ${supplierName}`,
        totalAmount !== null && `Total: ${totalAmount}`,
      ]
        .filter(Boolean)
        .join(" · ");

      if (warnings.length > 0) {
        showToast("error", warnings[0]);
      } else {
        showToast(
          "success",
          summary
            ? `Read ${filledCount} field${filledCount === 1 ? "" : "s"}. ${summary}`
            : `Read ${filledCount} field${filledCount === 1 ? "" : "s"}. Please review.`
        );
      }
    } catch (error) {
      console.error("[scan] error", error);
      showToast("error", error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setScanLoading(false);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  const tabScrollAreaStyle: React.CSSProperties = {
    maxHeight: "calc(100vh - 260px)",
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 8,
    scrollbarWidth: "thin",
    scrollbarColor: "#94a3b8 transparent",
  };

  const filteredInvoices = useMemo(() => {
    return myInvoices.filter((item) => {
      // Hide failed/duplicate from main list — they only show in batch review
      if (item.extractionStatus === "failed" || item.extractionStatus === "duplicate") return false;
      // Hide archived
      if (item.archived) return false;
      // Source filter
      if (invoiceSourceFilter === "bulk" && !item.sourceBatchId) return false;
      if (invoiceSourceFilter === "manual" && item.sourceBatchId) return false;

      return (
        matchesInvoiceSearch(item, invoiceSearch) &&
        matchesInvoiceFilters(
          item,
          invoiceSupplierFilter,
          invoiceStatusFilter,
          invoiceFromDate,
          invoiceToDate
        )
      );
    });
  }, [
    myInvoices,
    invoiceSearch,
    invoiceSupplierFilter,
    invoiceStatusFilter,
    invoiceFromDate,
    invoiceToDate,
    invoiceSourceFilter,
  ]);

  const batchInvoices = useMemo(
    () => (bulkBatchId ? myInvoices.filter((i) => i.sourceBatchId === bulkBatchId) : []),
    [myInvoices, bulkBatchId]
  );

  const invoiceTotalAmount = useMemo(
    () => filteredInvoices.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
    [filteredInvoices]
  );

  const pendingReviewInvoices = useMemo(
    () => filteredInvoices.filter((item) => item.status === "Pending Review"),
    [filteredInvoices]
  );

  const approvedInvoiceItems = useMemo(
    () => filteredInvoices.filter((item) => item.status === "Approved"),
    [filteredInvoices]
  );

  const paidInvoices = useMemo(
    () => filteredInvoices.filter((item) => item.status === "Paid"),
    [filteredInvoices]
  );

  const needsReviewInvoices = useMemo(
    () => filteredInvoices.filter((item) => invoiceNeedsReview(item)),
    [filteredInvoices]
  );

  const resetInvoiceForm = () => {
    setInvoiceForm({
      supplierName: "",
      customerName: "",
      dateReceived: getTodayDateString(),
      dateApproved: "",
      totalAmount: "",
      status: "Approved",
    });
    setSelectedInvoiceFile(null);
    setEditingInvoice(null);
    setScanConfidence(null);
  };

  const openEditInvoice = (item: InvoiceItem) => {
    setEditingInvoice(item);
    setInvoiceForm({
      supplierName: item.supplierName || "",
      customerName: item.customerName || "",
      dateReceived: item.dateReceived || getTodayDateString(),
      dateApproved: item.dateApproved || "",
      totalAmount: String(item.totalAmount ?? ""),
      status: item.status === "Paid" ? "Paid" : "Approved",
    });
    setSelectedInvoiceFile(null);
    setShowInvoiceForm(true);
    setActiveTab("invoices");
  };

  const handleAddWork = async () => {
    if (!form.title || !form.category || !form.date) {
      showToast("error", "Please complete the required work fields.");
      return;
    }

    try {
      setSaving(true);

      await onAddWork({
        title: form.title,
        category: form.category,
        date: form.date,
        notes: form.notes,
        selectedFiles: selectedWorkFiles,
      });

      setForm({
        title: "",
        category: "",
        date: getTodayDateString(),
        notes: "",
      });
      setSelectedWorkFiles([]);
      setShowForm(false);
      showToast("success", "Work added successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error adding work.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInvoice = async () => {
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

      if (editingInvoice) {
        await onUpdateInvoice(editingInvoice.id, {
          supplierName: invoiceForm.supplierName,
          customerName: invoiceForm.customerName,
          dateReceived: invoiceForm.dateReceived,
          dateApproved: invoiceForm.dateApproved,
          totalAmount: parsedAmount,
          status: invoiceForm.status,
          selectedFile: selectedInvoiceFile,
          currentAttachmentPath: editingInvoice.attachmentPath,
          currentAttachmentLink: editingInvoice.attachmentLink,
          currentAttachmentName: editingInvoice.attachmentName,
          currentAttachmentType: editingInvoice.attachmentType,
        });
        // If this was a bulk-extracted invoice, clear extractionStatus so it leaves the review queue
        if (editingInvoice.extractionStatus && editingInvoice.extractionStatus !== "duplicate" && editingInvoice.extractionStatus !== "failed") {
          await onClearExtractionStatus(editingInvoice.id);
        }
        showToast("success", "Invoice updated successfully.");
      } else {
        await onAddInvoice({
          supplierName: invoiceForm.supplierName,
          customerName: invoiceForm.customerName,
          dateReceived: invoiceForm.dateReceived,
          dateApproved: invoiceForm.dateApproved,
          totalAmount: parsedAmount,
          status: invoiceForm.status,
          selectedFile: selectedInvoiceFile,
        });
        showToast("success", "Invoice added successfully.");
      }

      resetInvoiceForm();
      setShowInvoiceForm(false);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error && error.message
        ? error.message
        : (editingInvoice ? "Error updating invoice." : "Error adding invoice.");
      showToast("error", message);
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handlePrintInvoiceSummary = () => {
    const popup = window.open("", "_blank", "width=1100,height=900");
    if (!popup) return;

    const paidItems = filteredInvoices.filter(i => i.status === "Paid");
    const approvedItems = filteredInvoices.filter(i => i.status === "Approved");
    const pendingItems = filteredInvoices.filter(i => i.status === "Pending Review");
    const paidTotal = paidItems.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    const approvedTotal = approvedItems.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
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
  <title>Invoice Report — ${escHtml(currentUser.name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#f9fafb}
    .page{max-width:960px;margin:0 auto;padding:40px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #e5e7eb;margin-bottom:26px}
    .company{font-size:20px;font-weight:900;color:#1e293b}
    .company-sub{font-size:12px;color:#6b7280;margin-top:3px}
    .report-meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.9}
    .report-meta strong{color:#374151}
    .tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:26px}
    .tile{border-radius:10px;padding:14px 10px;text-align:center}
    .tile-label{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px}
    .tile-value{font-size:22px;font-weight:900}
    .tile-sub{font-size:11px;margin-top:3px;opacity:.8}
    .tile-total{background:#eff6ff;color:#1d4ed8}
    .tile-pending{background:#fef3c7;color:#92400e}
    .tile-approved{background:#dbeafe;color:#1d4ed8}
    .tile-paid{background:#dcfce7;color:#166534}
    .tile-amount{background:#f3e8ff;color:#7c3aed}
    .filter-bar{background:#f3f4f6;border-radius:8px;padding:9px 14px;margin-bottom:22px;font-size:12px;color:#6b7280;display:flex;gap:16px;flex-wrap:wrap}
    .filter-bar strong{color:#374151}
    .section-title{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#374151;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
    table{width:100%;border-collapse:collapse;margin-bottom:26px;font-size:13px}
    thead tr{background:#1e293b;color:#fff}
    thead th{padding:10px 12px;text-align:left;font-weight:700;font-size:11px;letter-spacing:.04em}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody tr:nth-child(odd){background:#fff}
    tbody td{padding:9px 12px;border-bottom:1px solid #e5e7eb;color:#374151}
    .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800}
    .badge-paid{background:#dcfce7;color:#166534}
    .badge-approved{background:#dbeafe;color:#1d4ed8}
    .badge-pending{background:#fef3c7;color:#92400e}
    .amount-cell{font-weight:700;color:#1e293b;text-align:right}
    .totals-row td{background:#1e293b;color:#fff;font-weight:800;padding:10px 12px;font-size:13px}
    .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    .no-print{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:8px;padding:10px 20px;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
    @media print{body{background:#fff}.page{padding:20px}.no-print{display:none!important}}
  </style>
</head>
<body>
<div class="no-print">
  <button onclick="window.close()" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;cursor:pointer;font-size:13px;font-weight:700">← Back to Portal</button>
  <button onclick="window.print()" style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#1e293b;cursor:pointer;font-size:13px;font-weight:700">🖨 Print</button>
  <span style="margin-left:4px;font-size:11px;color:#9ca3af">This button is hidden when printing</span>
</div>
<div class="page">
  <div class="header">
    <div>
      <div class="company">Emirates International Holdings Group</div>
      <div class="company-sub">Employee Invoice Report</div>
    </div>
    <div class="report-meta">
      <strong>Employee:</strong> ${escHtml(currentUser.name)}<br/>
      <strong>Department:</strong> ${escHtml(currentUser.department)}<br/>
      <strong>Printed:</strong> ${new Date().toLocaleString()}<br/>
      <strong>Report ID:</strong> INV-${Date.now().toString().slice(-6)}
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
      <div class="tile-value">${pendingItems.length}</div>
      <div class="tile-sub">awaiting review</div>
    </div>
    <div class="tile tile-approved">
      <div class="tile-label">Approved</div>
      <div class="tile-value">${approvedItems.length}</div>
      <div class="tile-sub">AED ${formatMoney(approvedTotal)}</div>
    </div>
    <div class="tile tile-paid">
      <div class="tile-label">Paid</div>
      <div class="tile-value">${paidItems.length}</div>
      <div class="tile-sub">AED ${formatMoney(paidTotal)}</div>
    </div>
    <div class="tile tile-amount">
      <div class="tile-label">Grand Total</div>
      <div class="tile-value" style="font-size:15px">AED</div>
      <div class="tile-sub" style="font-size:13px;font-weight:800">${formatMoney(invoiceTotalAmount)}</div>
    </div>
  </div>

  ${activeFilters.length > 0 ? `<div class="filter-bar">${activeFilters.map(f => `<span><strong>${f.split(":")[0]}:</strong> ${f.split(":").slice(1).join(":").trim()}</span>`).join("")}</div>` : ""}

  <div class="section-title">Invoice Details</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Supplier Name</th>
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
        <td style="color:#9ca3af;font-size:12px">${idx + 1}</td>
        <td style="font-weight:600">${escHtml(item.supplierName)}</td>
        <td>${escHtml(item.dateReceived || "—")}</td>
        <td>${escHtml(item.dateApproved || "—")}</td>
        <td style="color:#6b7280;font-size:12px">${escHtml(item.attachmentName || "—")}</td>
        <td><span class="badge badge-${item.status === "Paid" ? "paid" : item.status === "Approved" ? "approved" : "pending"}">${escHtml(item.status)}</span></td>
        <td class="amount-cell">${formatMoney(item.totalAmount)}</td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">No invoices found</td></tr>`}
      <tr class="totals-row">
        <td colspan="6" style="text-align:right">Grand Total</td>
        <td style="text-align:right">AED ${formatMoney(invoiceTotalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Emirates International Holdings Group — Confidential</span>
    <span>Generated by Employee Portal · ${new Date().toLocaleDateString()}</span>
  </div>
</div>
</body>
</html>`);

    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleCheckIn = async () => {
    try {
      setAttendanceLoading(true);
      await onCheckIn();
      showToast("success", "Check in completed successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", error instanceof Error ? error.message : "Error during check in.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todayAttendance) return;

    try {
      setAttendanceLoading(true);
      await onCheckOut(todayAttendance.id);
      showToast("success", "Check out completed successfully.");
    } catch (error) {
      console.error(error);
      showToast("error", "Error during check out.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const calendarDays = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ day: number | null; record?: AttendanceRecord }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const record = myAttendance.find((a) => a.date === dateStr);
      cells.push({ day: d, record });
    }
    return cells;
  }, [calendarMonth, myAttendance]);

  const activityFeed = useMemo(() => {
    type FeedItem = { date: string; title: string; status: string; icon: string; tab: EmployeeTab };
    const items: FeedItem[] = [
      ...myWorks.slice(0, 6).map((w) => ({ date: w.date, title: w.title, status: w.status, icon: "📁", tab: "works" as EmployeeTab })),
      ...myTasks.slice(0, 6).map((t) => ({ date: t.deadline || "", title: t.title, status: t.status, icon: "📋", tab: "tasks" as EmployeeTab })),
      ...myAttendance.slice(0, 6).map((a) => ({ date: a.date, title: `Attendance — ${a.date}`, status: a.status, icon: "🕐", tab: "attendance" as EmployeeTab })),
    ];
    return items.filter((i) => i.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [myWorks, myTasks, myAttendance]);

  const pageTitles: Record<EmployeeTab, string> = {
    dashboard:  "Dashboard",
    tasks:      "My Tasks",
    works:      "My Works",
    attendance: "Attendance",
    approved:   "Approved",
    invoices:   "My Invoices",
  };

  return (
    <div style={dashboardWrapperStyle()}>

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
                onUpdateProfilePhoto(file).catch(console.error);
              }}
            />
          </div>

          {!sidebarCollapsed && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.title, lineHeight: 1.4 }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>
                {currentUser.position || "Employee"}
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          {(
            [
              { id: "dashboard",  icon: "📊", label: "Dashboard",  badge: 0 },
              { id: "tasks",      icon: "📋", label: "Tasks",      badge: activeTasks.length },
              { id: "works",      icon: "📁", label: "Works",      badge: nonApprovedWorks.length },
              { id: "attendance", icon: "🕐", label: "Attendance", badge: pendingAttendance.length },
              { id: "approved",   icon: "✅", label: "Approved",   badge: 0 },
              { id: "invoices",   icon: "💰", label: "Invoices",   badge: needsReviewInvoices.length },
            ] as { id: EmployeeTab; icon: string; label: string; badge: number }[]
          ).map(({ id, icon, label, badge }) => (
            <button
              key={id}
              style={{
                ...navItemStyle(activeTab === id),
                justifyContent: sidebarCollapsed ? "center" : "flex-start",
                padding: sidebarCollapsed ? "10px 0" : "10px 14px",
                position: "relative",
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
                  top: 6, right: 6,
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
            gap: 8,
          }}
        >
          {/* Check In / Out quick action */}
          {!sidebarCollapsed && (
            <div style={{ padding: "0 4px" }}>
              {!todayAttendance ? (
                <button
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#fff",
                    cursor: attendanceLoading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    opacity: attendanceLoading ? 0.7 : 1,
                  }}
                  onClick={handleCheckIn}
                  disabled={attendanceLoading}
                >
                  {attendanceLoading ? "Checking In..." : "✓ Check In"}
                </button>
              ) : !todayAttendance.checkOut ? (
                <button
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                    color: "#fff",
                    cursor: attendanceLoading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    opacity: attendanceLoading ? 0.7 : 1,
                  }}
                  onClick={handleCheckOut}
                  disabled={attendanceLoading}
                >
                  {attendanceLoading ? "Checking Out..." : "◷ Check Out"}
                </button>
              ) : (
                <div
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    borderRadius: 12,
                    background: theme.fileCardBg,
                    color: theme.subtleText,
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  ✓ Attendance Done
                </div>
              )}
            </div>
          )}
          {sidebarCollapsed && (
            <button
              title={!todayAttendance ? "Check In" : !todayAttendance.checkOut ? "Check Out" : "Attendance Done"}
              onClick={!todayAttendance ? handleCheckIn : !todayAttendance.checkOut ? handleCheckOut : undefined}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 12,
                border: "none",
                background: !todayAttendance
                  ? "linear-gradient(135deg,#10b981,#059669)"
                  : !todayAttendance.checkOut
                  ? "linear-gradient(135deg,#f59e0b,#d97706)"
                  : theme.fileCardBg,
                color: (!todayAttendance || !todayAttendance.checkOut) ? "#fff" : theme.subtleText,
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!todayAttendance ? "✓" : !todayAttendance.checkOut ? "◷" : "✓"}
            </button>
          )}

          {/* User + Logout */}
          {!sidebarCollapsed && (
            <div style={{ padding: "0 4px" }}>
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
              title="Logout"
              onClick={onLogout}
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
            <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 4 }}>
              {currentUser.department} · {currentUser.position}
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

          {activeTab === "works" && (
            <button style={buttonStyle(true)} onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? "✕ Close Form" : "+ Add Work"}
            </button>
          )}

          {activeTab === "invoices" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={{ ...buttonStyle(false), whiteSpace: "nowrap" }}
                onClick={() => {
                  resetBulk();
                  setBulkOpen(true);
                }}
              >
                📚 Bulk Scan PDF
              </button>
              <button
                style={buttonStyle(true)}
                onClick={() => {
                  resetInvoiceForm();
                  setShowInvoiceForm(true);
                }}
              >
                + Add Invoice
              </button>
            </div>
          )}
        </div>

        {/* Tab content with smooth fade-in */}
        <div key={activeTab} style={{ animation: "fadeInTab 0.18s ease" }}>

        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 20 }}>

              {/* Stats strip */}
              <div className="stat-grid-main" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {[
                  { label: "My Works",     value: myWorks.length,                             color: "#6366f1", icon: "📁", hint: "Total submitted" },
                  { label: "Active Tasks", value: activeTasks.length,                          color: "#3b82f6", icon: "⚡", hint: "In progress" },
                  { label: "Approved",     value: approvedTasks.length + approvedWorks.length, color: "#10b981", icon: "✅", hint: "Tasks + Works" },
                  { label: "Attendance",   value: myAttendance.length,                         color: "#f59e0b", icon: "🕐", hint: "Total records" },
                  { label: "Invoices",     value: myInvoices.length,                           color: "#8b5cf6", icon: "💰", hint: "All invoices" },
                ].map(({ label, value, color, icon, hint }) => (
                  <div key={label} style={{
                    background: theme.cardBackground,
                    borderTop: `3px solid ${color}`,
                    borderLeft: `1px solid ${theme.cardBorder}`,
                    borderRight: `1px solid ${theme.cardBorder}`,
                    borderBottom: `1px solid ${theme.cardBorder}`,
                    borderRadius: 12,
                    padding: "14px 16px",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText }}>{hint}</div>
                  </div>
                ))}
              </div>

              {/* Today Attendance widget */}
              {(() => {
                const attColor = todayAttendance?.status === "Present" ? "#10b981"
                  : todayAttendance?.status === "Absent" ? "#ef4444"
                  : todayAttendance ? "#f59e0b"
                  : "#6b7280";
                return (
                  <div style={{
                    background: theme.cardBackground,
                    borderTop: `3px solid ${attColor}`,
                    borderLeft: `1px solid ${theme.cardBorder}`,
                    borderRight: `1px solid ${theme.cardBorder}`,
                    borderBottom: `1px solid ${theme.cardBorder}`,
                    borderRadius: 12,
                    padding: "16px 20px",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${attColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🕐</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Today&apos;s Attendance</div>
                          <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
                            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                          </div>
                        </div>
                      </div>
                      {todayAttendance ? (
                        <span style={{
                          padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                          background: `${attColor}18`, color: attColor, border: `1px solid ${attColor}30`,
                        }}>{todayAttendance.status}</span>
                      ) : (
                        <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: theme.fileCardBg, color: theme.subtleText, border: `1px solid ${theme.cardBorder}` }}>No Record Yet</span>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[
                        { label: "Check In",  value: todayAttendance?.checkIn  ? formatDateTime(todayAttendance.checkIn)  : "—", icon: "→" },
                        { label: "Check Out", value: todayAttendance?.checkOut ? formatDateTime(todayAttendance.checkOut) : "—", icon: "←" },
                      ].map(({ label, value, icon }) => (
                        <div key={label} style={{ background: theme.softCardBackground, borderRadius: 10, padding: "10px 14px", border: `1px solid ${theme.cardBorder}` }}>
                          <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{icon} {label}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme.title }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Mobile-only Check In / Check Out action */}
                    {isMobile && (
                      <div style={{ marginTop: 12 }}>
                        {!todayAttendance ? (
                          <button
                            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", cursor: attendanceLoading ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, opacity: attendanceLoading ? 0.7 : 1, letterSpacing: "0.01em" }}
                            onClick={handleCheckIn}
                            disabled={attendanceLoading}
                          >
                            {attendanceLoading ? "Checking In…" : "✓  Check In"}
                          </button>
                        ) : !todayAttendance.checkOut ? (
                          <button
                            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", cursor: attendanceLoading ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, opacity: attendanceLoading ? 0.7 : 1, letterSpacing: "0.01em" }}
                            onClick={handleCheckOut}
                            disabled={attendanceLoading}
                          >
                            {attendanceLoading ? "Checking Out…" : "◷  Check Out"}
                          </button>
                        ) : (
                          <div style={{ width: "100%", padding: "12px 16px", borderRadius: 12, background: "#dcfce7", color: "#166534", fontSize: 14, fontWeight: 700, textAlign: "center" as const }}>
                            ✓  Attendance Recorded for Today
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 2-column: Active Tasks | Pending Works */}
              <div className="two-col-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Active Tasks column */}
                <div style={{
                  background: theme.cardBackground,
                  borderTop: `1px solid ${theme.cardBorder}`,
                  borderRight: `1px solid ${theme.cardBorder}`,
                  borderBottom: `1px solid ${theme.cardBorder}`,
                  borderLeft: "4px solid #3b82f6",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: theme.cardShadow,
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#3b82f618", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>Active Tasks</div>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#3b82f618", color: "#3b82f6" }}>{activeTasks.length}</span>
                    </div>
                    <button onClick={() => setActiveTab("tasks")} style={{ fontSize: 12, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>View All →</button>
                  </div>
                  <div className="task-work-scroll" style={{ padding: "12px 16px", display: "grid", gap: 10, maxHeight: 300, overflowY: "auto" }}>
                    {activeTasks.length > 0 ? activeTasks.slice(0, 5).map((task) => (
                      <TaskCard key={task.id} task={task} onSubmitTask={onSubmitTask} showToast={showToast} />
                    )) : (
                      <EmptyState icon="✅" title="No active tasks" description="Assigned and in-progress tasks will appear here." />
                    )}
                  </div>
                </div>

                {/* Pending Works column */}
                <div style={{
                  background: theme.cardBackground,
                  borderTop: `1px solid ${theme.cardBorder}`,
                  borderRight: `1px solid ${theme.cardBorder}`,
                  borderBottom: `1px solid ${theme.cardBorder}`,
                  borderLeft: "4px solid #f59e0b",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: theme.cardShadow,
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f59e0b18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📁</div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>Pending Works</div>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b" }}>{nonApprovedWorks.length}</span>
                    </div>
                    <button onClick={() => setActiveTab("works")} style={{ fontSize: 12, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}>View All →</button>
                  </div>
                  <div className="task-work-scroll" style={{ padding: "12px 16px", display: "grid", gap: 10, maxHeight: 300, overflowY: "auto" }}>
                    {nonApprovedWorks.length > 0 ? nonApprovedWorks.slice(0, 5).map((item) => (
                      <WorkCard key={item.id} item={item} />
                    )) : (
                      <EmptyState icon="🏆" title="No pending works" description="Pending and under-review works will appear here." />
                    )}
                  </div>
                </div>

              </div>

              {/* Activity Feed */}
              <div style={{
                background: theme.cardBackground,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: theme.cardShadow,
              }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🕐</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>Recent Activity</div>
                  <span style={{ fontSize: 12, color: theme.subtleText }}>· last 10 events</span>
                </div>
                <div style={{ padding: "0 16px" }}>
                  {activityFeed.length === 0 ? (
                    <div style={{ padding: "28px 0" }}>
                      <EmptyState icon="🕐" title="No recent activity" description="Your recent tasks, works, and attendance will appear here." />
                    </div>
                  ) : (
                    activityFeed.map((item, i) => {
                      const isDark = getThemeMode() === "dark";
                      const statusColors: Record<string, string> = {
                        Approved: "#34d399", Present: "#34d399",
                        "Pending Review": "#fbbf24", Pending: "#fbbf24", Assigned: "#fbbf24", "In Progress": "#fbbf24",
                        Submitted: "#60a5fa",
                        Absent: "#f87171", Overdue: "#f87171", "Missing Attachment": "#f87171", "Needs Revision": "#f87171",
                      };
                      const dotColor = statusColors[item.status] ?? (isDark ? "#6b7280" : "#9ca3af");
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "11px 0",
                          borderBottom: i < activityFeed.length - 1 ? `1px solid ${theme.cardBorder}` : "none",
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: `${dotColor}18`, border: `1.5px solid ${dotColor}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, flexShrink: 0,
                          }}>{item.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button onClick={() => setActiveTab(item.tab)} style={{
                              fontSize: 13, fontWeight: 700, color: theme.title,
                              background: "none", border: "none", cursor: "pointer", padding: 0,
                              textAlign: "left" as const, overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap" as const, maxWidth: "100%", display: "block",
                            }}>{item.title}</button>
                            <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 1 }}>{item.date}</div>
                          </div>
                          <span style={{
                            padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                            background: `${dotColor}18`, color: dotColor, border: `1px solid ${dotColor}44`,
                            flexShrink: 0, whiteSpace: "nowrap" as const,
                          }}>{item.status}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Tasks tab ── */}
        {activeTab === "tasks" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 16 }}>

              {/* Stats strip */}
              <div className="stat-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Active Tasks",    value: activeTasks.length,    color: "#3b82f6", icon: "⚡", hint: "Assigned / In Progress / Needs Revision" },
                  { label: "Submitted",        value: submittedTasks.length,  color: "#f59e0b", icon: "📤", hint: "Waiting for admin review" },
                  { label: "Total Tasks",      value: myTasks.length,         color: "#6366f1", icon: "📋", hint: "All assigned to you" },
                ].map(({ label, value, color, icon, hint }) => (
                  <div key={label} style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText }}>{hint}</div>
                  </div>
                ))}
              </div>

              {/* Active Tasks */}
              <div style={{ ...cardStyle(), borderLeft: "4px solid #3b82f6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Active Tasks</div>
                    <div style={{ fontSize: 12, color: theme.subtleText }}>{activeTasks.length} task{activeTasks.length !== 1 ? "s" : ""} require your attention</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {activeTasks.length > 0 ? activeTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onSubmitTask={onSubmitTask} showToast={showToast} />
                  )) : (
                    <EmptyState icon="✅" title="No active tasks" description="Assigned, in-progress, or revision tasks will appear here." />
                  )}
                </div>
              </div>

              {/* Submitted Tasks */}
              <div style={{ ...cardStyle(), borderLeft: "4px solid #f59e0b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>📤</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Submitted Tasks</div>
                    <div style={{ fontSize: 12, color: theme.subtleText }}>{submittedTasks.length} task{submittedTasks.length !== 1 ? "s" : ""} waiting for admin review</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {submittedTasks.length > 0 ? submittedTasks.map((task) => (
                    <TaskCard key={task.id} task={task} showToast={showToast} />
                  )) : (
                    <EmptyState icon="📤" title="No submitted tasks" description="Tasks you submit will appear here while awaiting review." />
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Works tab ── */}
        {activeTab === "works" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 16 }}>

              {/* Stats strip */}
              <div className="stat-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Total Works",    value: myWorks.length,          color: "#6366f1", icon: "🔨", hint: "Submitted" },
                  { label: "Pending Review", value: nonApprovedWorks.length,  color: "#f59e0b", icon: "⏳", hint: "Awaiting" },
                  { label: "Approved",       value: approvedWorks.length,     color: "#10b981", icon: "✅", hint: "Completed" },
                ].map(({ label, value, color, icon, hint }) => (
                  <div key={label} style={{ background: theme.cardBackground, borderTop: `3px solid ${color}`, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "14px 16px", boxShadow: theme.cardShadow }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
                    <div style={{ fontSize: 11, color: theme.subtleText }}>{hint}</div>
                  </div>
                ))}
              </div>

              {/* Add Work form */}
              {showForm && (
                <div style={{ ...cardStyle(), borderRadius: 16, overflow: "hidden", padding: 0 }}>
                  <div style={{ padding: "14px 20px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 12, background: theme.softCardBackground }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔨</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: theme.title }}>Add New Work</div>
                  </div>
                  <div style={{ padding: "18px 20px" }}>
                    <div className="form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Title</label>
                        <input style={inputStyle()} value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Enter work title" />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Category</label>
                        <input style={inputStyle()} value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Enter category" />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Date</label>
                        <input type="date" style={inputStyle()} value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Attachments</label>
                        <input
                          type="file"
                          multiple
                          style={inputStyle()}
                          onChange={(e) => {
                            const picked = Array.from(e.target.files || []);
                            setSelectedWorkFiles((prev) => [...prev, ...picked]);
                            e.target.value = "";
                          }}
                        />
                        <SelectedFilesPreview files={selectedWorkFiles} onRemove={(i) => setSelectedWorkFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Notes</label>
                        <textarea style={{ ...inputStyle(), minHeight: 90, resize: "vertical" as const }} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Write notes about the work…" />
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "12px 20px", borderTop: `1px solid ${theme.cardBorder}`, display: "flex", gap: 10, background: theme.softCardBackground }}>
                    <button style={{ ...buttonStyle(true), opacity: saving ? 0.7 : 1 }} onClick={handleAddWork} disabled={saving}>{saving ? "Saving…" : "Save Work"}</button>
                    <button style={buttonStyle(false)} onClick={() => { setShowForm(false); setForm({ title: "", category: "", date: getTodayDateString(), notes: "" }); setSelectedWorkFiles([]); }} disabled={saving}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Works list */}
              <div style={{ ...cardStyle(), padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔨</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Your Works</div>
                    <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 1 }}>{myWorks.length} total · {approvedWorks.length} approved</div>
                  </div>
                </div>
                <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                  {myWorks.length > 0 ? myWorks.map((item) => (
                    <WorkCard key={item.id} item={item} />
                  )) : (
                    <EmptyState icon="🔨" title="No works yet" description='Click "+ Add Work" to submit your first work record.' />
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Attendance tab ── */}
        {activeTab === "attendance" && (() => {
          const presentCount = myAttendance.filter(r => r.status === "Present").length;
          const absentCount  = myAttendance.filter(r => r.status === "Absent").length;
          const attRate = reviewedAttendance.length > 0 ? Math.round((presentCount / reviewedAttendance.length) * 100) : 0;
          return (
            <div className="tab-scroll-area" style={tabScrollAreaStyle}>
              <div style={{ display: "grid", gap: 16 }}>

                {/* Stats strip */}
                <div className="stat-grid-5col" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                  {[
                    { label: "Present",   value: presentCount,             color: "#10b981", icon: "✅" },
                    { label: "Absent",    value: absentCount,              color: "#ef4444", icon: "❌" },
                    { label: "Pending",   value: pendingAttendance.length, color: "#f59e0b", icon: "⏳" },
                    { label: "Att. Rate", value: `${attRate}%`,            color: "#6366f1", icon: "📊" },
                    { label: "Total",     value: myAttendance.length,      color: "#8b5cf6", icon: "📅" },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} style={{
                      background: theme.cardBackground,
                      borderTop: `3px solid ${color}`,
                      borderLeft: `1px solid ${theme.cardBorder}`,
                      borderRight: `1px solid ${theme.cardBorder}`,
                      borderBottom: `1px solid ${theme.cardBorder}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                      boxShadow: theme.cardShadow,
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
                      <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: typeof value === "string" ? 22 : 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Calendar toggle bar */}
                <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                    <button
                      onClick={() => setCalendarView(v => !v)}
                      style={{
                        padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.18s ease",
                        border: calendarView ? "none" : `1px solid ${theme.cardBorder}`,
                        background: calendarView ? "linear-gradient(135deg,#6366f1,#4f46e5)" : theme.softCardBackground,
                        color: calendarView ? "#fff" : theme.mutedText,
                      }}
                    >📅 {calendarView ? "Hide Calendar" : "Show Calendar"}</button>
                    {calendarView && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
                        <button onClick={() => { const [y, m] = calendarMonth.split("-").map(Number); setCalendarMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`); }}
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>‹</button>
                        <span style={{ fontSize: 14, fontWeight: 800, color: theme.title, minWidth: 130, textAlign: "center" as const }}>
                          {new Date(calendarMonth + "-01").toLocaleString("en-US", { month: "long", year: "numeric" })}
                        </span>
                        <button onClick={() => { const [y, m] = calendarMonth.split("-").map(Number); setCalendarMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`); }}
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${theme.cardBorder}`, background: theme.cardBackground, color: theme.mutedText, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>›</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Calendar grid */}
                {calendarView && (
                  <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 10 }}>
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                        <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: theme.subtleText, padding: "4px 0", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                      {calendarDays.map((cell, i) => {
                        const dotColor = !cell.record ? undefined : cell.record.status === "Present" ? "#10b981" : cell.record.status === "Absent" ? "#ef4444" : "#f59e0b";
                        return (
                          <div key={i} style={{
                            minHeight: 44, borderRadius: 10,
                            border: cell.day ? `1px solid ${dotColor ? dotColor + "40" : theme.cardBorder}` : "none",
                            background: dotColor ? `${dotColor}14` : cell.day ? theme.fileCardBg : "transparent",
                            display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 3, padding: "4px 2px",
                          }}>
                            {cell.day && (
                              <>
                                <span style={{ fontSize: 12, fontWeight: 700, color: dotColor ?? theme.mutedText }}>{cell.day}</span>
                                {dotColor && <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} />}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" as const, paddingTop: 10, borderTop: `1px solid ${theme.cardBorder}` }}>
                      {[["#10b981","Present"],["#ef4444","Absent"],["#f59e0b","Pending"]].map(([c, l]) => (
                        <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.mutedText }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />{l}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Attendance — compact rows */}
                {pendingAttendance.length > 0 && (
                  <div style={{
                    background: theme.cardBackground,
                    borderTop: `1px solid ${theme.cardBorder}`,
                    borderRight: `1px solid ${theme.cardBorder}`,
                    borderBottom: `1px solid ${theme.cardBorder}`,
                    borderLeft: "4px solid #f59e0b",
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: theme.cardShadow,
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>⏳</span>
                      <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>Pending Review</div>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#f59e0b18", color: "#f59e0b" }}>{pendingAttendance.length}</span>
                      <span style={{ fontSize: 12, color: theme.subtleText }}>awaiting admin review</span>
                    </div>
                    <div style={{ padding: "0 16px" }}>
                      {pendingAttendance.map((record, i) => (
                        <div key={record.id} style={{
                          display: "grid",
                          gridTemplateColumns: "110px 1fr 1fr auto",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: i < pendingAttendance.length - 1 ? `1px solid ${theme.cardBorder}` : "none",
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: theme.title }}>{record.date}</div>
                          <div style={{ fontSize: 12, color: theme.mutedText }}>
                            <span style={{ color: theme.subtleText, fontWeight: 600, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>IN </span>
                            {record.checkIn ? formatDateTime(record.checkIn) : "—"}
                          </div>
                          <div style={{ fontSize: 12, color: theme.mutedText }}>
                            <span style={{ color: theme.subtleText, fontWeight: 600, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>OUT </span>
                            {record.checkOut ? formatDateTime(record.checkOut) : "—"}
                          </div>
                          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: "#f59e0b18", color: "#f59e0b", border: "1px solid #f59e0b30", whiteSpace: "nowrap" as const }}>Pending</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attendance History — compact table */}
                <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden", boxShadow: theme.cardShadow }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📅</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: theme.title }}>Attendance History</div>
                    <span style={{ fontSize: 12, color: theme.subtleText }}>· {reviewedAttendance.length} record{reviewedAttendance.length !== 1 ? "s" : ""}</span>
                  </div>
                  {reviewedAttendance.length > 0 ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr auto", gap: 12, padding: "8px 16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}` }}>
                        {["Date","Check In","Check Out","Status"].map(h => (
                          <div key={h} style={{ fontSize: 10, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{h}</div>
                        ))}
                      </div>
                      <div style={{ padding: "0 16px" }}>
                        {reviewedAttendance.map((record, i) => {
                          const sc = record.status === "Present" ? "#10b981" : record.status === "Absent" ? "#ef4444" : "#f59e0b";
                          return (
                            <div key={record.id} style={{
                              display: "grid",
                              gridTemplateColumns: "110px 1fr 1fr auto",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 0",
                              background: i % 2 !== 0 ? theme.fileCardBg : "transparent",
                              borderBottom: i < reviewedAttendance.length - 1 ? `1px solid ${theme.cardBorder}` : "none",
                            }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: theme.title }}>{record.date}</div>
                              <div style={{ fontSize: 12, color: theme.mutedText }}>{record.checkIn ? formatDateTime(record.checkIn) : "—"}</div>
                              <div style={{ fontSize: 12, color: theme.mutedText }}>{record.checkOut ? formatDateTime(record.checkOut) : "—"}</div>
                              <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: `${sc}18`, color: sc, border: `1px solid ${sc}30`, whiteSpace: "nowrap" as const }}>{record.status}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: "28px 16px" }}>
                      <EmptyState icon="📅" title="No attendance history" description="Reviewed attendance records will appear here." />
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })()}

        {/* ── Approved tab ── */}
        {activeTab === "approved" && (() => {
          const filtered = approvedAllRows.filter((row) => {
            const q = approvedSearch.trim().toLowerCase();
            const matchSearch = !q || row.title.toLowerCase().includes(q) || row.sub.toLowerCase().includes(q);
            const matchType = approvedTypeFilter === "All"
              || (approvedTypeFilter === "Tasks" && row.type === "task")
              || (approvedTypeFilter === "Works" && row.type === "work");
            return matchSearch && matchType;
          });
          return (
            <div className="tab-scroll-area" style={tabScrollAreaStyle}>
              <div style={{ display: "grid", gap: 16 }}>

                {/* Stats strip */}
                <div className="stat-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  {[
                    { label: "Approved Tasks", value: approvedTasks.length, color: "#22c55e", icon: "✅" },
                    { label: "Approved Works", value: approvedWorks.length, color: "#10b981", icon: "🏆" },
                    { label: "Total Approved", value: approvedTasks.length + approvedWorks.length, color: "#6366f1", icon: "⭐" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      background: theme.cardBackground,
                      borderTop: `3px solid ${s.color}`,
                      borderLeft: `1px solid ${theme.cardBorder}`,
                      borderRight: `1px solid ${theme.cardBorder}`,
                      borderBottom: `1px solid ${theme.cardBorder}`,
                      borderRadius: 12, padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 12,
                      boxShadow: theme.cardShadow,
                    }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{s.icon}</div>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Search + type filter bar */}
                <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                  <input
                    style={{
                      flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8,
                      border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground,
                      color: theme.title, fontSize: 13, outline: "none",
                    }}
                    placeholder="🔍  Search by title or category…"
                    value={approvedSearch}
                    onChange={(e) => setApprovedSearch(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["All", "Tasks", "Works"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setApprovedTypeFilter(f)}
                        style={{
                          padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${approvedTypeFilter === f ? "#6366f1" : theme.cardBorder}`,
                          background: approvedTypeFilter === f ? "#6366f114" : theme.softCardBackground,
                          color: approvedTypeFilter === f ? "#6366f1" : theme.mutedText,
                        }}
                      >{f}</button>
                    ))}
                  </div>
                  {(approvedSearch || approvedTypeFilter !== "All") && (
                    <button
                      onClick={() => { setApprovedSearch(""); setApprovedTypeFilter("All"); }}
                      style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${theme.cardBorder}`, background: theme.softCardBackground, color: theme.subtleText, fontWeight: 600 }}
                    >✕ Clear</button>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: theme.subtleText, whiteSpace: "nowrap" as const }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Table */}
                <div style={{ background: theme.cardBackground, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, overflow: "hidden", boxShadow: theme.cardShadow }}>

                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 100px", gap: 12, padding: "9px 16px", background: theme.softCardBackground, borderBottom: `1px solid ${theme.cardBorder}` }}>
                    {["Title & Details", "Type", "Date", ""].map((h) => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 800, color: theme.subtleText, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{h}</div>
                    ))}
                  </div>

                  {filtered.length === 0 ? (
                    <div style={{ padding: "36px 16px" }}>
                      <EmptyState icon="✅" title="No results" description="No approved items match your current filter." />
                    </div>
                  ) : (
                    filtered.map((row, i) => {
                      const isExpanded = expandedApprovedId === row.id;
                      const typeColor = row.type === "task" ? "#3b82f6" : "#10b981";
                      return (
                        <React.Fragment key={row.id}>
                          {/* Row */}
                          <div style={{
                            display: "grid", gridTemplateColumns: "1fr 90px 120px 100px",
                            alignItems: "center", gap: 12, padding: "11px 16px",
                            background: isExpanded ? `${typeColor}08` : i % 2 !== 0 ? theme.fileCardBg : "transparent",
                            borderBottom: `1px solid ${theme.cardBorder}`,
                            cursor: "pointer",
                            transition: "background 0.12s ease",
                          }}
                          onClick={() => setExpandedApprovedId(isExpanded ? null : row.id)}
                          >
                            {/* Title */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${typeColor}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                                {row.type === "task" ? "📋" : "📁"}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: theme.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.title}</div>
                                <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{row.sub}</div>
                              </div>
                            </div>

                            {/* Type badge */}
                            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${typeColor}14`, color: typeColor, border: `1px solid ${typeColor}30`, whiteSpace: "nowrap" as const }}>
                              {row.type === "task" ? "Task" : "Work"}
                            </span>

                            {/* Date */}
                            <div style={{ fontSize: 12, color: theme.mutedText }}>{row.date || "—"}</div>

                            {/* Toggle button */}
                            <button style={{
                              padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${isExpanded ? typeColor + "40" : theme.cardBorder}`,
                              background: isExpanded ? `${typeColor}14` : theme.softCardBackground,
                              color: isExpanded ? typeColor : theme.subtleText,
                              whiteSpace: "nowrap" as const,
                            }}
                            onClick={(e) => { e.stopPropagation(); setExpandedApprovedId(isExpanded ? null : row.id); }}
                            >
                              {isExpanded ? "▲ Close" : "▼ Details"}
                            </button>
                          </div>

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <div style={{
                              padding: "16px",
                              background: theme.softCardBackground,
                              borderBottom: `1px solid ${theme.cardBorder}`,
                              borderLeft: `3px solid ${typeColor}`,
                            }}>
                              {row.type === "task"
                                ? <TaskCard task={row.item} showToast={showToast} detailsOnly={true} />
                                : <WorkCard item={row.item} detailsOnly={true} />
                              }
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

              </div>
            </div>
          );
        })()}

        {/* ── Invoices tab ── */}
        {activeTab === "invoices" && (
          <div className="tab-scroll-area" style={tabScrollAreaStyle}>
            <div style={{ display: "grid", gap: 20 }}>

              {/* Stats strip */}
              <div className="invoice-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {[
                  { label: "Total", value: filteredInvoices.length, color: "#3b82f6", bg: theme.cardBackground, icon: "🧾" },
                  { label: "Pending", value: pendingReviewInvoices.length, color: "#f59e0b", bg: theme.cardBackground, icon: "⏳" },
                  { label: "Approved", value: approvedInvoiceItems.length, color: "#3b82f6", bg: theme.cardBackground, icon: "✅" },
                  { label: "Paid", value: paidInvoices.length, color: "#10b981", bg: theme.cardBackground, icon: "💰" },
                  { label: "Grand Total", value: `AED ${formatMoney(invoiceTotalAmount)}`, color: "#8b5cf6", bg: theme.cardBackground, icon: "📊" },
                ].map(({ label, value, color, bg, icon }) => (
                  <div key={label} style={{
                    background: bg,
                    border: `1px solid ${theme.cardBorder}`,
                    borderTop: `3px solid ${color}`,
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
                    placeholder="🔍  Search supplier or date…"
                  />
                  <input
                    style={inputStyle()}
                    value={invoiceSupplierFilter}
                    onChange={(e) => setInvoiceSupplierFilter(e.target.value)}
                    placeholder="Supplier"
                  />
                  <select
                    style={inputStyle()}
                    value={invoiceStatusFilter}
                    onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  >
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
                  <button
                    style={buttonStyle(false)}
                    onClick={() => {
                      setInvoiceSearch("");
                      setInvoiceSupplierFilter("");
                      setInvoiceStatusFilter("All");
                      setInvoiceFromDate("");
                      setInvoiceToDate("");
                    }}
                  >✕ Reset Filters</button>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: theme.subtleText }}>
                    Showing <strong style={{ color: theme.title }}>{filteredInvoices.length}</strong> invoice{filteredInvoices.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Needs Review section */}
              {needsReviewInvoices.length > 0 && (
                <div style={{
                  ...cardStyle(),
                  borderLeft: "4px solid #f59e0b",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>Needs Review</div>
                      <div style={{ fontSize: 12, color: theme.subtleText }}>
                        {needsReviewInvoices.length} invoice{needsReviewInvoices.length !== 1 ? "s" : ""} require attention
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {needsReviewInvoices.map((item) => (
                      <InvoiceCard
                        key={item.id}
                        item={item}
                        onDeleteInvoice={onDeleteInvoice}
                        onOpenInvoiceAttachment={onOpenInvoiceAttachment}
                        onEdit={openEditInvoice}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Invoices */}
              <div style={cardStyle()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: theme.title }}>My Invoices</div>
                    <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
                      {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""} · Total: <strong style={{ color: "#8b5cf6" }}>AED {formatMoney(invoiceTotalAmount)}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredInvoices.length > 0 ? (
                    filteredInvoices.map((item) => (
                      <InvoiceCard
                        key={item.id}
                        item={item}
                        onDeleteInvoice={onDeleteInvoice}
                        onOpenInvoiceAttachment={onOpenInvoiceAttachment}
                        onEdit={openEditInvoice}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="No invoices found"
                      description="Try changing the filters or add a new invoice."
                    />
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Invoice form modal ── */}
        {showInvoiceForm && (
          <div style={{
            position: "fixed", inset: 0,
            background: theme.modalOverlay,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2000, padding: 20,
          }}>
            <div style={{ ...cardStyle(), maxWidth: 640, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0 }}>
              {/* Modal header */}
              <div style={{
                padding: "18px 24px",
                borderBottom: `1px solid ${theme.cardBorder}`,
                display: "flex", alignItems: "center", gap: 12,
                background: theme.softCardBackground,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(59,130,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧾</div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>{editingInvoice ? "Edit Invoice" : "New Invoice"}</div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>{editingInvoice ? "Update invoice details" : "Fill in the invoice details below"}</div>
                </div>
              </div>

              {/* Form body */}
              <div style={{ padding: "20px 24px" }}>
                {!editingInvoice && (
                  <div style={{
                    marginBottom: 14, padding: "12px 14px", borderRadius: 12,
                    background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.08))",
                    border: `1px dashed ${theme.cardBorder}`,
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: theme.title }}>📷 Scan Invoice with AI</div>
                      <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>
                        Upload a photo or PDF — fields will be filled automatically. Review before saving.
                      </div>
                    </div>
                    <input
                      ref={scanInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleScanInvoice(f);
                      }}
                    />
                    <button
                      type="button"
                      disabled={scanLoading}
                      style={{ ...buttonStyle(true), opacity: scanLoading ? 0.6 : 1, whiteSpace: "nowrap" }}
                      onClick={() => scanInputRef.current?.click()}
                    >
                      {scanLoading ? "Scanning…" : "📷 Scan Invoice"}
                    </button>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Supplier Name
                      {scanConfidence && typeof scanConfidence.supplier_name === "number" && scanConfidence.supplier_name < 0.85 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>⚠ Review</span>
                      )}
                    </label>
                    <input
                      style={inputStyle()}
                      value={invoiceForm.supplierName}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, supplierName: e.target.value }))}
                      placeholder="Enter supplier name"
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Customer Name
                      {scanConfidence && typeof scanConfidence.customer_name === "number" && scanConfidence.customer_name < 0.85 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>⚠ Review</span>
                      )}
                    </label>
                    <input
                      style={inputStyle()}
                      value={invoiceForm.customerName}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, customerName: e.target.value }))}
                      placeholder="Enter customer name"
                    />
                  </div>

                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Total Amount (AED)
                      {scanConfidence && typeof scanConfidence.total_amount === "number" && scanConfidence.total_amount < 0.85 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>⚠ Review</span>
                      )}
                    </label>
                    <input
                      type="number" min="0" step="0.01"
                      style={inputStyle()}
                      value={invoiceForm.totalAmount}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, totalAmount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
                    <select
                      style={inputStyle()}
                      value={invoiceForm.status}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, status: e.target.value as InvoiceStatus }))}
                    >
                      <option value="Approved">Approved</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Date Received
                      {scanConfidence && typeof scanConfidence.invoice_date === "number" && scanConfidence.invoice_date < 0.85 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>⚠ Review</span>
                      )}
                    </label>
                    <input
                      type="date" style={inputStyle()}
                      value={invoiceForm.dateReceived}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dateReceived: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Date Approved
                      {scanConfidence && typeof scanConfidence.stamp_date === "number" && scanConfidence.stamp_date < 0.85 && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "2px 6px", borderRadius: 999 }}>⚠ Review</span>
                      )}
                    </label>
                    <input
                      type="date" style={inputStyle()}
                      value={invoiceForm.dateApproved}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dateApproved: e.target.value }))}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {editingInvoice ? "Replace Attachment" : "Attachment"}
                    </label>
                    <input
                      type="file" style={inputStyle()}
                      onChange={(e) => setSelectedInvoiceFile(e.target.files?.[0] || null)}
                    />
                    {selectedInvoiceFile && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#3b82f6", display: "flex", alignItems: "center", gap: 4 }}>
                        📎 {selectedInvoiceFile.name}
                      </div>
                    )}
                    {!selectedInvoiceFile && editingInvoice?.attachmentName && (
                      <div style={{ marginTop: 6, fontSize: 12, color: theme.subtleText, display: "flex", alignItems: "center", gap: 4 }}>
                        📎 Current: {editingInvoice.attachmentName}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div style={{
                padding: "14px 24px",
                borderTop: `1px solid ${theme.cardBorder}`,
                display: "flex", justifyContent: "flex-end", gap: 10,
                background: theme.softCardBackground,
              }}>
                <button
                  style={buttonStyle(false)}
                  onClick={() => { setShowInvoiceForm(false); resetInvoiceForm(); }}
                  disabled={invoiceSaving}
                >Cancel</button>
                <button
                  style={{ ...buttonStyle(true), opacity: invoiceSaving ? 0.7 : 1 }}
                  onClick={handleSaveInvoice}
                  disabled={invoiceSaving}
                >{invoiceSaving ? "Saving…" : editingInvoice ? "Update Invoice" : "Save Invoice"}</button>
              </div>
            </div>
          </div>
        )}

        </div>{/* end animation wrapper */}

        {bulkOpen && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2100, padding: 20,
          }}>
            <div style={{ ...cardStyle(), maxWidth: 720, width: "100%", borderRadius: 18, overflow: "hidden", padding: 0, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 12, background: theme.softCardBackground }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📚</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: theme.title }}>
                    {bulkStep === "upload" && "Bulk Scan — Upload PDF"}
                    {bulkStep === "processing" && "Processing…"}
                    {bulkStep === "summary" && "Batch Summary"}
                    {bulkStep === "review" && "Batch Review"}
                  </div>
                  <div style={{ fontSize: 12, color: theme.subtleText }}>
                    {bulkStep === "upload" && "Upload a PDF that contains multiple invoices"}
                    {bulkStep === "processing" && "Hang on, this may take 30-60 seconds"}
                    {bulkStep === "summary" && "Here is what we extracted"}
                    {bulkStep === "review" && "Review each invoice from this batch"}
                  </div>
                </div>
                {bulkStep !== "processing" && (
                  <button
                    style={{ ...buttonStyle(false), padding: "6px 12px" }}
                    onClick={() => { setBulkOpen(false); resetBulk(); }}
                  >Close</button>
                )}
              </div>

              <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
                {bulkStep === "upload" && (
                  <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, color: theme.mutedText, textTransform: "uppercase", letterSpacing: "0.05em" }}>PDF File (up to 25 MB)</label>
                    <input
                      ref={bulkInputRef}
                      type="file"
                      accept="application/pdf"
                      style={inputStyle()}
                      onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                    />
                    {bulkFile && (
                      <div style={{ marginTop: 10, fontSize: 12, color: theme.subtleText }}>
                        📎 {bulkFile.name} · {(bulkFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                    <div style={{ marginTop: 20, padding: 12, background: theme.softCardBackground, borderRadius: 10, fontSize: 12, color: theme.subtleText, lineHeight: 1.6 }}>
                      <strong style={{ color: theme.title }}>How it works:</strong><br/>
                      1. Upload a single PDF that contains multiple invoices.<br/>
                      2. AI detects each invoice and extracts fields.<br/>
                      3. You review each extracted invoice before final approval.<br/>
                      4. Duplicates and failed invoices are kept for history.
                    </div>
                    <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button
                        style={{ ...buttonStyle(true), opacity: bulkFile ? 1 : 0.6 }}
                        onClick={handleBulkScan}
                        disabled={!bulkFile}
                      >📚 Start Scan</button>
                    </div>
                  </div>
                )}

                {bulkStep === "processing" && (
                  <div style={{ padding: "40px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 14 }}>⏳</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.title }}>{bulkProgress}</div>
                    <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 6 }}>Please don&apos;t close this window.</div>
                  </div>
                )}

                {bulkStep === "summary" && bulkSummary && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                      <div style={{ padding: 14, background: "#dcfce7", borderRadius: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#166534" }}>{bulkSummary.ready}</div>
                        <div style={{ fontSize: 10, color: "#166534", fontWeight: 800, textTransform: "uppercase" }}>Ready</div>
                      </div>
                      <div style={{ padding: 14, background: "#fef3c7", borderRadius: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#92400e" }}>{bulkSummary.pending}</div>
                        <div style={{ fontSize: 10, color: "#92400e", fontWeight: 800, textTransform: "uppercase" }}>Pending</div>
                      </div>
                      <div style={{ padding: 14, background: "#ffedd5", borderRadius: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#9a3412" }}>{bulkSummary.duplicate}</div>
                        <div style={{ fontSize: 10, color: "#9a3412", fontWeight: 800, textTransform: "uppercase" }}>Duplicate</div>
                      </div>
                      <div style={{ padding: 14, background: "#fee2e2", borderRadius: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#991b1b" }}>{bulkSummary.failed}</div>
                        <div style={{ fontSize: 10, color: "#991b1b", fontWeight: 800, textTransform: "uppercase" }}>Failed</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button style={buttonStyle(false)} onClick={() => { setBulkOpen(false); resetBulk(); }}>Close</button>
                      <button style={buttonStyle(true)} onClick={() => setBulkStep("review")}>View Batch Review →</button>
                    </div>
                  </div>
                )}

                {bulkStep === "review" && (
                  <div>
                    <div style={{ marginBottom: 12, fontSize: 12, color: theme.subtleText }}>
                      {batchInvoices.length} invoice(s) in this batch · Click ✏️ to review/edit
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {batchInvoices.map((inv) => (
                        <div key={inv.id} style={{ padding: "10px 12px", border: `1px solid ${theme.cardBorder}`, borderRadius: 10, background: theme.cardBackground }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <ExtractionStatusBadge status={inv.extractionStatus} />
                            <div style={{ fontWeight: 700, fontSize: 13, color: theme.title, flex: 1, minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.supplierName || "(no supplier)"}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: theme.title }}>AED {formatMoney(inv.totalAmount)}</div>
                            <div style={{ display: "flex", gap: 4 }}>
                              {(inv.attachmentPath || inv.attachmentLink) && (
                                <button title="View PDF" style={invoiceIconBtn(theme)} onClick={() => onOpenInvoiceAttachment(inv.attachmentPath, inv.attachmentLink)}>📎</button>
                              )}
                              {inv.extractionStatus !== "duplicate" && (
                                <button title="Edit / Review" style={invoiceIconBtn(theme)} onClick={() => {
                                  openEditInvoice(inv);
                                  setBulkOpen(false);
                                }}>✏️</button>
                              )}
                              {(inv.extractionStatus === "failed" || inv.extractionStatus === "duplicate") && (
                                <button title="Archive (hide from history)" style={{ ...invoiceIconBtn(theme), color: "#6b7280" }} onClick={async () => {
                                  await onArchiveInvoice(inv.id);
                                  showToast("success", "Archived.");
                                }}>📦</button>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: theme.subtleText }}>
                            Pages {inv.attachmentPageStart ?? "?"}-{inv.attachmentPageEnd ?? "?"} · Date: {inv.dateReceived || "—"}
                            {inv.invoiceNumber ? ` · #${inv.invoiceNumber}` : ""}
                          </div>
                          {inv.reviewReasons && inv.reviewReasons.length > 0 && (
                            <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 11, color: "#92400e", listStyle: "disc" }}>
                              {inv.reviewReasons.map((r, idx) => <li key={idx}>{r}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as EmployeeTab)}
        tabs={[
          { id: "dashboard", label: "Home",       icon: "🏠" },
          { id: "tasks",     label: "Tasks",      icon: "✅", badge: activeTasks.length },
          { id: "works",     label: "Works",      icon: "📁" },
          { id: "attendance",label: "Attend",     icon: "📅" },
          { id: "invoices",  label: "Invoices",   icon: "💰" },
        ]}
      />
    </div>
  );
}