"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Report,
  ReportPriority,
  ReportStatus,
  REPORT_BRANCHES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  buttonStyle,
  cardStyle,
  dangerButtonStyle,
  EmptyState,
  escHtml,
  formatDateTime,
  getObservationImages,
  getThemeMode,
  getThemePalette,
  inputStyle,
  selectStyle,
  smallButtonStyle,
  softCardStyle,
  StatBox,
  SkeletonCard,
  ToastType,
} from "./portal-utils";

// ── Draft types passed back to page.tsx for persistence ────────────────
// A single image inside an observation draft. Existing (already-stored) images
// carry their storage `existingPath`; freshly picked images carry the local
// `file` plus a blob preview `url`.
export type ReportDraftImage = {
  id: string;
  url: string;
  existingPath?: string;
  file?: File;
};

export type ReportObservationDraft = {
  id: string;
  description: string;
  recommendation: string;
  priority: ReportPriority;
  images: ReportDraftImage[];
};

export type ReportDraft = {
  title: string;
  branchName: string;
  visitDate: string;
  preparedBy: string;
  status: ReportStatus;
  priority: ReportPriority;
  observations: ReportObservationDraft[];
};

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; reportId: string }
  | { kind: "view"; reportId: string };

type AdminReportsProps = {
  reports: Report[];
  loading: boolean;
  currentUserName: string;
  onCreateReport: (
    draft: ReportDraft
  ) => Promise<{ id: string; reportNumber: string }>;
  onUpdateReport: (id: string, draft: ReportDraft) => Promise<void>;
  onSoftDeleteReport: (id: string, title: string) => void;
  showToast: (type: ToastType, message: string) => void;
};

// ── Badges ──────────────────────────────────────────────────────────────
function priorityBadgeStyle(p: ReportPriority): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
    letterSpacing: "0.02em",
  };
  if (p === "Critical")
    return {
      ...base,
      background: isDark ? "rgba(220,38,38,0.16)" : "#fee2e2",
      color: isDark ? "#fca5a5" : "#991b1b",
      border: `1px solid ${isDark ? "rgba(220,38,38,0.35)" : "#fecaca"}`,
    };
  if (p === "High")
    return {
      ...base,
      background: isDark ? "rgba(249,115,22,0.16)" : "#ffedd5",
      color: isDark ? "#fb923c" : "#9a3412",
      border: `1px solid ${isDark ? "rgba(249,115,22,0.35)" : "#fed7aa"}`,
    };
  if (p === "Medium")
    return {
      ...base,
      background: isDark ? "rgba(245,158,11,0.16)" : "#fef3c7",
      color: isDark ? "#fbbf24" : "#92400e",
      border: `1px solid ${isDark ? "rgba(245,158,11,0.35)" : "#fcd34d"}`,
    };
  return {
    ...base,
    background: isDark ? "rgba(16,185,129,0.16)" : "#dcfce7",
    color: isDark ? "#34d399" : "#166534",
    border: `1px solid ${isDark ? "rgba(16,185,129,0.35)" : "#86efac"}`,
  };
}

function statusBadgeStyle(s: ReportStatus): React.CSSProperties {
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
  if (s === "Approved" || s === "Closed")
    return {
      ...base,
      background: isDark ? "rgba(16,185,129,0.16)" : "#dcfce7",
      color: isDark ? "#34d399" : "#166534",
      border: `1px solid ${isDark ? "rgba(16,185,129,0.35)" : "#86efac"}`,
    };
  if (s === "Action Required")
    return {
      ...base,
      background: isDark ? "rgba(239,68,68,0.16)" : "#fee2e2",
      color: isDark ? "#f87171" : "#991b1b",
      border: `1px solid ${isDark ? "rgba(239,68,68,0.35)" : "#fecaca"}`,
    };
  if (s === "Under Review" || s === "Submitted")
    return {
      ...base,
      background: isDark ? "rgba(59,130,246,0.16)" : "#dbeafe",
      color: isDark ? "#60a5fa" : "#1d4ed8",
      border: `1px solid ${isDark ? "rgba(59,130,246,0.35)" : "#bfdbfe"}`,
    };
  return {
    ...base,
    background: isDark ? "rgba(100,116,139,0.18)" : "#f1f5f9",
    color: isDark ? "#cbd5e1" : "#475569",
    border: `1px solid ${isDark ? "rgba(100,116,139,0.35)" : "#e2e8f0"}`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────
function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyDraft(preparedBy: string): ReportDraft {
  return {
    title: "",
    branchName: REPORT_BRANCHES[0],
    visitDate: todayIso(),
    preparedBy,
    status: "Draft",
    priority: "Medium",
    observations: [
      {
        id: uuid(),
        description: "",
        recommendation: "",
        priority: "Medium",
        images: [],
      },
    ],
  };
}

function reportToDraft(r: Report): ReportDraft {
  return {
    title: r.title,
    branchName: r.branchName,
    visitDate: r.visitDate,
    preparedBy: r.preparedBy,
    status: r.status,
    priority: r.priority,
    observations: r.observations.map((o) => ({
      id: o.id,
      description: o.description,
      recommendation: o.recommendation,
      priority: o.priority,
      images: getObservationImages(o).map((im) => ({
        id: uuid(),
        url: im.url,
        existingPath: im.path,
      })),
    })),
  };
}

function getCoverImage(r: Report): string | undefined {
  for (const obs of r.observations) {
    const imgs = getObservationImages(obs);
    if (imgs[0]?.url) return imgs[0].url;
  }
  return undefined;
}

function matchesSearch(r: Report, q: string) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    r.title.toLowerCase().includes(needle) ||
    r.reportNumber.toLowerCase().includes(needle) ||
    r.branchName.toLowerCase().includes(needle) ||
    r.preparedBy.toLowerCase().includes(needle)
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function AdminReports({
  reports,
  loading,
  currentUserName,
  onCreateReport,
  onUpdateReport,
  onSoftDeleteReport,
  showToast,
}: AdminReportsProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const theme = getThemePalette();

  // filters
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const liveReports = useMemo(
    () => reports.filter((r) => r.deleted !== true),
    [reports]
  );

  const filtered = useMemo(() => {
    return liveReports.filter((r) => {
      if (!matchesSearch(r, search)) return false;
      if (branchFilter !== "All" && r.branchName !== branchFilter) return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (dateFrom && r.visitDate < dateFrom) return false;
      if (dateTo && r.visitDate > dateTo) return false;
      return true;
    });
  }, [liveReports, search, branchFilter, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = liveReports.filter((r) => {
      if (!r.visitDate) return false;
      const [y, m] = r.visitDate.split("-").map(Number);
      return y === now.getFullYear() && m === now.getMonth() + 1;
    }).length;
    const highOrCritical = liveReports.filter(
      (r) => r.priority === "High" || r.priority === "Critical"
    ).length;
    const drafts = liveReports.filter((r) => r.status === "Draft").length;
    return { total: liveReports.length, thisMonth, highOrCritical, drafts };
  }, [liveReports]);

  const selectedReport: Report | null = useMemo(() => {
    if (mode.kind === "view" || mode.kind === "edit") {
      return reports.find((r) => r.id === mode.reportId) ?? null;
    }
    return null;
  }, [mode, reports]);

  // ── List view ─────────────────────────────────────────────────────────
  if (mode.kind === "list") {
    return (
      <div style={{ display: "grid", gap: 22 }}>
        {/* Header + New */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: theme.subtleText,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Field Visit Reports
            </div>
            <div
              style={{
                fontSize: 14,
                color: theme.mutedText,
                maxWidth: 560,
              }}
            >
              Document branch visits, observations, and corrective actions —
              ready to print on an official EIHG letterhead.
            </div>
          </div>
          <button
            onClick={() => setMode({ kind: "create" })}
            style={{
              ...buttonStyle(true),
              background:
                "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#fff",
              boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
              fontSize: 14,
              padding: "11px 18px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
            New Report
          </button>
        </div>

        {/* Stats */}
        <div
          className="stat-grid-3col"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          <StatBox
            title="Total Reports"
            value={stats.total}
            hint="All non-deleted"
          />
          <StatBox
            title="This Month"
            value={stats.thisMonth}
            hint="Visits this month"
          />
          <StatBox
            title="High / Critical"
            value={stats.highOrCritical}
            hint="Need attention"
          />
          <StatBox
            title="Drafts"
            value={stats.drafts}
            hint="Not yet submitted"
          />
        </div>

        {/* Filters */}
        <div style={{ ...cardStyle(), padding: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
              gap: 10,
            }}
            className="reports-filter-grid"
          >
            <input
              placeholder="🔍 Search by title, RPT-number, branch, preparer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle(), padding: "10px 12px" }}
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              style={{ ...selectStyle(), padding: "10px 10px" }}
            >
              <option value="All">All branches</option>
              {REPORT_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...selectStyle(), padding: "10px 10px" }}
            >
              <option value="All">All statuses</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ ...inputStyle(), padding: "10px 12px" }}
              title="Visit date from"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ ...inputStyle(), padding: "10px 12px" }}
              title="Visit date to"
            />
          </div>
          {(search ||
            branchFilter !== "All" ||
            statusFilter !== "All" ||
            dateFrom ||
            dateTo) && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 10,
                fontSize: 12,
                color: theme.subtleText,
              }}
            >
              <span>
                Showing <b>{filtered.length}</b> of {liveReports.length}{" "}
                report{liveReports.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => {
                  setSearch("");
                  setBranchFilter("All");
                  setStatusFilter("All");
                  setDateFrom("");
                  setDateTo("");
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#6366f1",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 14,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} rows={4} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📑"
            title={
              liveReports.length === 0
                ? "No reports yet"
                : "No reports match these filters"
            }
            description={
              liveReports.length === 0
                ? 'Create your first field visit report — click "New Report" above.'
                : "Try adjusting search, branch, status, or date range."
            }
          />
        ) : (
          <div
            className="reports-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {filtered.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onView={() => setMode({ kind: "view", reportId: r.id })}
                onEdit={() => setMode({ kind: "edit", reportId: r.id })}
                onDelete={() => onSoftDeleteReport(r.id, r.title)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Create / Edit ─────────────────────────────────────────────────────
  if (mode.kind === "create" || mode.kind === "edit") {
    const editing = mode.kind === "edit" ? selectedReport : null;
    return (
      <ReportForm
        key={editing?.id ?? "new"}
        initial={
          editing
            ? reportToDraft(editing)
            : emptyDraft(currentUserName)
        }
        editingReportNumber={editing?.reportNumber}
        onCancel={() => setMode({ kind: "list" })}
        onSave={async (draft) => {
          try {
            if (editing) {
              await onUpdateReport(editing.id, draft);
              showToast("success", `Report ${editing.reportNumber} updated.`);
              setMode({ kind: "view", reportId: editing.id });
            } else {
              const result = await onCreateReport(draft);
              showToast(
                "success",
                `Report ${result.reportNumber} created.`
              );
              setMode({ kind: "view", reportId: result.id });
            }
          } catch (err) {
            console.error(err);
            const msg =
              err instanceof Error ? err.message : "Could not save report.";
            showToast("error", msg);
          }
        }}
        showToast={showToast}
      />
    );
  }

  // ── View / Print ──────────────────────────────────────────────────────
  if (mode.kind === "view") {
    if (!selectedReport) {
      return (
        <div>
          <button
            style={smallButtonStyle()}
            onClick={() => setMode({ kind: "list" })}
          >
            ← Back to reports
          </button>
          <div style={{ marginTop: 18 }}>
            <EmptyState
              icon="❓"
              title="Report not found"
              description="It may have been deleted."
            />
          </div>
        </div>
      );
    }
    return (
      <ReportDetail
        report={selectedReport}
        onBack={() => setMode({ kind: "list" })}
        onEdit={() => setMode({ kind: "edit", reportId: selectedReport.id })}
        onDelete={() =>
          onSoftDeleteReport(selectedReport.id, selectedReport.title)
        }
      />
    );
  }

  return null;
}

// ── Report card (list grid) ────────────────────────────────────────────
function ReportCard({
  report,
  onView,
  onEdit,
  onDelete,
}: {
  report: Report;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = getThemePalette();
  const cover = getCoverImage(report);
  const obsCount = report.observations.length;

  return (
    <div
      style={{
        ...cardStyle(),
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 22px 44px rgba(15,23,42,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = theme.cardShadow;
      }}
    >
      {/* Cover */}
      <div
        onClick={onView}
        style={{
          height: 160,
          position: "relative",
          cursor: "pointer",
          background: cover
            ? "#0f172a"
            : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {cover ? (
          <Image
            src={cover}
            alt={report.title}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            style={{ objectFit: "cover" }}
            unoptimized
          />
        ) : (
          <div
            style={{
              color: "#fff",
              fontSize: 38,
              fontWeight: 900,
              opacity: 0.55,
              letterSpacing: "-0.04em",
            }}
          >
            📑
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "rgba(15,23,42,0.78)",
            color: "#fff",
            padding: "3px 9px",
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.05em",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {report.reportNumber}
        </div>
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "flex",
            gap: 6,
          }}
        >
          <span style={priorityBadgeStyle(report.priority)}>
            {report.priority}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 16, display: "grid", gap: 8, flex: 1 }}>
        <div
          onClick={onView}
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: theme.title,
            cursor: "pointer",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {report.title || "(Untitled report)"}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: theme.subtleText,
          }}
        >
          <span>🏬 {report.branchName}</span>
          <span style={statusBadgeStyle(report.status)}>{report.status}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: theme.subtleText,
          }}
        >
          <span>📅 {report.visitDate || "—"}</span>
          <span>
            {obsCount} observation{obsCount === 1 ? "" : "s"}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: theme.subtleText,
            marginTop: 2,
          }}
        >
          By {report.preparedBy} • {formatDateTime(report.createdAt) || "—"}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 6,
          padding: "12px 14px",
          borderTop: `1px solid ${theme.cardBorder}`,
          background: theme.softCardBackground,
        }}
      >
        <button
          onClick={onView}
          style={{ ...smallButtonStyle(), padding: "7px 6px", fontSize: 12 }}
          title="View"
        >
          👁
        </button>
        <button
          onClick={onEdit}
          style={{ ...smallButtonStyle(), padding: "7px 6px", fontSize: 12 }}
          title="Edit"
        >
          ✏️
        </button>
        <button
          onClick={() => printReport(report)}
          style={{ ...smallButtonStyle(), padding: "7px 6px", fontSize: 12 }}
          title="Print"
        >
          🖨
        </button>
        <button
          onClick={onDelete}
          style={{
            ...dangerButtonStyle(),
            padding: "7px 6px",
            fontSize: 12,
          }}
          title="Delete"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// ── Create/Edit form ───────────────────────────────────────────────────
function ReportForm({
  initial,
  editingReportNumber,
  onCancel,
  onSave,
  showToast,
}: {
  initial: ReportDraft;
  editingReportNumber?: string;
  onCancel: () => void;
  onSave: (draft: ReportDraft) => Promise<void>;
  showToast: (type: ToastType, message: string) => void;
}) {
  const theme = getThemePalette();
  const [draft, setDraft] = useState<ReportDraft>(initial);
  const [saving, setSaving] = useState(false);
  // Fullscreen viewer for the images of a single observation while editing.
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    index: number;
  } | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  // Track blob: preview URLs we created so we can revoke them on unmount.
  const createdBlobs = useRef<Set<string>>(new Set());

  const revokeBlob = (url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      createdBlobs.current.delete(url);
    }
  };

  // Cleanup any remaining blob URLs on unmount
  useEffect(() => {
    const blobs = createdBlobs.current;
    return () => {
      for (const url of blobs) URL.revokeObjectURL(url);
      blobs.clear();
    };
  }, []);

  const update = <K extends keyof ReportDraft>(
    key: K,
    value: ReportDraft[K]
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const updateObs = (id: string, patch: Partial<ReportObservationDraft>) =>
    setDraft((d) => ({
      ...d,
      observations: d.observations.map((o) =>
        o.id === id ? { ...o, ...patch } : o
      ),
    }));

  const addObservation = () =>
    setDraft((d) => ({
      ...d,
      observations: [
        ...d.observations,
        {
          id: uuid(),
          description: "",
          recommendation: "",
          priority: "Medium",
          images: [],
        },
      ],
    }));

  const removeObservation = (id: string) => {
    setDraft((d) => {
      const target = d.observations.find((o) => o.id === id);
      if (target) {
        for (const img of target.images) revokeBlob(img.url);
      }
      return {
        ...d,
        observations: d.observations.filter((o) => o.id !== id),
      };
    });
  };

  // Append one or more newly picked images to an observation.
  const onAddImages = (obsId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: ReportDraftImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        showToast("error", `"${file.name}" is not an image — skipped.`);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        showToast("error", `"${file.name}" is larger than 8 MB — skipped.`);
        continue;
      }
      const url = URL.createObjectURL(file);
      createdBlobs.current.add(url);
      accepted.push({ id: uuid(), url, file });
    }
    if (accepted.length === 0) return;
    setDraft((d) => ({
      ...d,
      observations: d.observations.map((o) =>
        o.id === obsId ? { ...o, images: [...o.images, ...accepted] } : o
      ),
    }));
  };

  const onRemoveImage = (obsId: string, imageId: string) => {
    setDraft((d) => ({
      ...d,
      observations: d.observations.map((o) => {
        if (o.id !== obsId) return o;
        const removed = o.images.find((im) => im.id === imageId);
        if (removed) revokeBlob(removed.url);
        return { ...o, images: o.images.filter((im) => im.id !== imageId) };
      }),
    }));
  };

  const validate = (): string | null => {
    if (!draft.title.trim()) return "Report title is required.";
    if (!draft.branchName.trim()) return "Branch is required.";
    if (!draft.visitDate) return "Visit date is required.";
    if (!draft.preparedBy.trim()) return "Prepared By is required.";
    if (draft.observations.length === 0)
      return "Add at least one observation.";
    for (let i = 0; i < draft.observations.length; i++) {
      const o = draft.observations[i];
      if (!o.description.trim())
        return `Observation #${i + 1}: description is required.`;
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      showToast("error", err);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <button
            onClick={onCancel}
            style={{
              border: "none",
              background: "transparent",
              color: theme.subtleText,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              padding: 0,
              marginBottom: 8,
            }}
          >
            ← Back to reports
          </button>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: theme.title,
              letterSpacing: "-0.02em",
            }}
          >
            {editingReportNumber
              ? `Edit ${editingReportNumber}`
              : "New Field Visit Report"}
          </div>
          <div style={{ fontSize: 13, color: theme.mutedText, marginTop: 4 }}>
            {editingReportNumber
              ? "Update the report details and observations."
              : "A report number will be assigned automatically once saved."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{ ...buttonStyle(false), opacity: saving ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              ...buttonStyle(true),
              background:
                "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#fff",
              boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving
              ? "Saving…"
              : editingReportNumber
              ? "Save changes"
              : "Save report"}
          </button>
        </div>
      </div>

      {/* Section 1 — Report details */}
      <div style={{ ...cardStyle() }}>
        <SectionHeader title="Report details" icon="📋" />
        <div
          className="form-2col"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <Field label="Report title" gridSpan>
            <input
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Weekly Field Visit — Karama Branch"
              style={inputStyle()}
            />
          </Field>
          <Field label="Branch">
            <select
              value={draft.branchName}
              onChange={(e) => update("branchName", e.target.value)}
              style={inputStyle()}
            >
              {REPORT_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of visit">
            <input
              type="date"
              value={draft.visitDate}
              onChange={(e) => update("visitDate", e.target.value)}
              style={inputStyle()}
            />
          </Field>
          <Field label="Prepared by">
            <input
              value={draft.preparedBy}
              onChange={(e) => update("preparedBy", e.target.value)}
              placeholder="Full name"
              style={inputStyle()}
            />
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) =>
                update("status", e.target.value as ReportStatus)
              }
              style={inputStyle()}
            >
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Overall priority" gridSpan>
            <select
              value={draft.priority}
              onChange={(e) =>
                update("priority", e.target.value as ReportPriority)
              }
              style={inputStyle()}
            >
              {REPORT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Section 2 — Observations */}
      <div style={{ ...cardStyle() }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <SectionHeader
            title={`Observations (${draft.observations.length})`}
            icon="🔍"
            noMargin
          />
          <button
            onClick={addObservation}
            style={{
              ...smallButtonStyle(),
              padding: "8px 14px",
              fontSize: 13,
              borderColor: "#6366f1",
              color: "#6366f1",
              fontWeight: 700,
            }}
          >
            + Add Observation
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {draft.observations.map((obs, idx) => (
            <div
              key={obs.id}
              style={{
                ...softCardStyle(),
                padding: 16,
                border: `1px solid ${theme.cardBorder}`,
                display: "grid",
                gap: 12,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: theme.title,
                  }}
                >
                  Observation #{idx + 1}
                </div>
                {draft.observations.length > 1 && (
                  <button
                    onClick={() => removeObservation(obs.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Fields */}
              <textarea
                value={obs.description}
                onChange={(e) =>
                  updateObs(obs.id, { description: e.target.value })
                }
                placeholder="Describe what you observed…"
                rows={3}
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
              <textarea
                value={obs.recommendation}
                onChange={(e) =>
                  updateObs(obs.id, { recommendation: e.target.value })
                }
                placeholder="Recommended action / corrective measure…"
                rows={3}
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: theme.subtleText,
                    fontWeight: 700,
                  }}
                >
                  Priority
                </span>
                <select
                  value={obs.priority}
                  onChange={(e) =>
                    updateObs(obs.id, {
                      priority: e.target.value as ReportPriority,
                    })
                  }
                  style={{ ...selectStyle(), width: "auto", flex: 1 }}
                >
                  {REPORT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <span style={priorityBadgeStyle(obs.priority)}>
                  {obs.priority}
                </span>
              </div>

              {/* Photos gallery */}
              <div style={{ display: "grid", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: theme.subtleText,
                    fontWeight: 700,
                  }}
                >
                  Photos{obs.images.length > 0 ? ` (${obs.images.length})` : ""}
                </span>
                <input
                  ref={(el) => {
                    fileInputs.current[obs.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    onAddImages(obs.id, e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="report-photo-grid">
                  {obs.images.map((img, imgIdx) => (
                    <div
                      key={img.id}
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#0f172a",
                        border: `1px solid ${theme.cardBorder}`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`Observation ${idx + 1} photo ${imgIdx + 1}`}
                        onClick={() =>
                          setLightbox({
                            urls: obs.images.map((im) => im.url),
                            index: imgIdx,
                          })
                        }
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                          cursor: "zoom-in",
                        }}
                      />
                      <button
                        onClick={() => onRemoveImage(obs.id, img.id)}
                        title="Remove photo"
                        style={{
                          position: "absolute",
                          top: 5,
                          right: 5,
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          border: "none",
                          background: "rgba(220,38,38,0.9)",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {/* Add tile */}
                  <button
                    onClick={() => fileInputs.current[obs.id]?.click()}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 12,
                      border: `2px dashed ${theme.cardBorder}`,
                      background: theme.inputBg,
                      color: theme.subtleText,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#6366f1";
                      e.currentTarget.style.color = "#6366f1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = theme.cardBorder;
                      e.currentTarget.style.color = theme.subtleText;
                    }}
                  >
                    <span style={{ fontSize: 24 }}>📷</span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {obs.images.length > 0 ? "Add more" : "Add photos"}
                    </span>
                  </button>
                </div>
                <span style={{ fontSize: 10, color: theme.subtleText }}>
                  JPG / PNG • up to 8 MB each • select multiple at once
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addObservation}
          style={{
            width: "100%",
            marginTop: 14,
            padding: "12px 16px",
            borderRadius: 14,
            border: `2px dashed ${theme.cardBorder}`,
            background: "transparent",
            color: theme.subtleText,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#6366f1";
            e.currentTarget.style.color = "#6366f1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme.cardBorder;
            e.currentTarget.style.color = theme.subtleText;
          }}
        >
          + Add Observation
        </button>
      </div>

      {/* Sticky bottom actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          paddingTop: 4,
        }}
      >
        <button
          onClick={onCancel}
          disabled={saving}
          style={{ ...buttonStyle(false), opacity: saving ? 0.6 : 1 }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          style={{
            ...buttonStyle(true),
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff",
            boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving
            ? "Saving…"
            : editingReportNumber
            ? "Save changes"
            : "Save report"}
        </button>
      </div>

      {lightbox && (
        <ImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ── Fullscreen image viewer ────────────────────────────────────────────
function ImageLightbox({
  urls,
  index,
  onIndex,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const count = urls.length;
  const safeIndex = Math.max(0, Math.min(index, count - 1));
  const go = (delta: number) => onIndex((safeIndex + delta + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && count > 1) go(1);
      else if (e.key === "ArrowLeft" && count > 1) go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, count]);

  if (count === 0) return null;

  const arrowStyle = (side: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    [side]: "max(12px, env(safe-area-inset-" + side + "))",
    top: "50%",
    transform: "translateY(-50%)",
    width: 46,
    height: 46,
    borderRadius: 999,
    border: "none",
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 22,
    fontWeight: 800,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(4px)",
  });

  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        background: "rgba(8,12,22,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        animation: "lightboxFade 0.18s ease",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        title="Close"
        style={{
          position: "absolute",
          top: "max(14px, env(safe-area-inset-top))",
          right: "max(14px, env(safe-area-inset-right))",
          width: 42,
          height: 42,
          borderRadius: 999,
          border: "none",
          background: "rgba(255,255,255,0.14)",
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ✕
      </button>

      {count > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            style={arrowStyle("left")}
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            style={arrowStyle("right")}
          >
            ›
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[safeIndex]}
        alt={`Photo ${safeIndex + 1} of ${count}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      />

      {count > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "max(16px, env(safe-area-inset-bottom))",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "5px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.14)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            backdropFilter: "blur(4px)",
          }}
        >
          {safeIndex + 1} / {count}
        </div>
      )}
    </div>
  );
}

// ── Detail view (official letterhead) ──────────────────────────────────
function ReportDetail({
  report,
  onBack,
  onEdit,
  onDelete,
}: {
  report: Report;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = getThemePalette();
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    index: number;
  } | null>(null);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Toolbar (hidden in print) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onBack}
          style={{
            border: "none",
            background: "transparent",
            color: theme.subtleText,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            padding: 0,
          }}
        >
          ← Back to reports
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={smallButtonStyle()}>
            ✏️ Edit
          </button>
          <button
            onClick={() => printReport(report)}
            style={{
              ...buttonStyle(true),
              background:
                "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#fff",
              boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
              padding: "10px 16px",
              fontSize: 13,
            }}
          >
            🖨 Print Report
          </button>
          <button onClick={onDelete} style={dangerButtonStyle()}>
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Official report container */}
      <div
        id="report-print-area"
        style={{
          ...cardStyle(),
          padding: 0,
          overflow: "hidden",
          background: "#ffffff",
          color: "#0f172a",
        }}
      >
        {/* Letterhead */}
        <div
          style={{
            padding: "28px 32px 22px 32px",
            borderBottom: "3px double #1e293b",
            textAlign: "center",
            background:
              "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.3em",
              color: "#64748b",
              marginBottom: 6,
            }}
          >
            ✦ OFFICIAL DOCUMENT ✦
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "0.06em",
              lineHeight: 1.2,
            }}
          >
            EMIRATES INTERNATIONAL HOLDING GROUP
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#4338ca",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            Philippine Supermarket
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 16,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "0.18em",
              padding: "8px 16px",
              borderTop: "1px solid #cbd5e1",
              borderBottom: "1px solid #cbd5e1",
              display: "inline-block",
            }}
          >
            FIELD VISIT REPORT
          </div>
        </div>

        {/* Info grid */}
        <div
          style={{
            padding: "24px 32px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            borderBottom: "1px solid #e2e8f0",
            background: "#fafafa",
          }}
          className="report-info-grid"
        >
          <InfoBlock label="Report No." value={report.reportNumber} mono />
          <InfoBlock label="Branch" value={report.branchName} />
          <InfoBlock label="Date of Visit" value={report.visitDate} />
          <InfoBlock label="Prepared By" value={report.preparedBy} />
          <InfoBlock label="Status" value={report.status} statusValue />
          <InfoBlock
            label="Overall Priority"
            value={report.priority}
            priorityValue
          />
          <InfoBlock
            label="Title"
            value={report.title}
            wide
          />
        </div>

        {/* Observations */}
        <div style={{ padding: "26px 32px 30px 32px" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "0.08em",
              borderLeft: "4px solid #4338ca",
              paddingLeft: 10,
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            Observations &amp; Findings
          </div>

          {report.observations.length === 0 ? (
            <div
              style={{
                padding: 18,
                background: "#f8fafc",
                borderRadius: 12,
                color: "#64748b",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              No observations recorded.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {report.observations.map((o, idx) => (
                <div
                  key={o.id}
                  className="report-observation-print"
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#ffffff",
                    boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 16px",
                      background: "#f1f5f9",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: "#0f172a",
                        letterSpacing: "0.06em",
                      }}
                    >
                      OBSERVATION #{String(idx + 1).padStart(2, "0")}
                    </div>
                    <span style={priorityBadgeStyle(o.priority)}>
                      {o.priority} Priority
                    </span>
                  </div>

                  {(() => {
                    const imgs = getObservationImages(o);
                    if (imgs.length === 0) return null;
                    const urls = imgs.map((im) => im.url);
                    return (
                      <div
                        className="report-print-gallery"
                        style={{
                          background: "#f8fafc",
                          padding: 16,
                          borderBottom: "1px solid #e2e8f0",
                          display: "grid",
                          gap: 12,
                          gridTemplateColumns:
                            imgs.length === 1
                              ? "1fr"
                              : "repeat(auto-fill, minmax(150px, 1fr))",
                        }}
                      >
                        {imgs.map((im, imgIdx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={imgIdx}
                            src={im.url}
                            alt={`Observation ${idx + 1} photo ${imgIdx + 1}`}
                            onClick={() =>
                              setLightbox({ urls, index: imgIdx })
                            }
                            style={{
                              width: "100%",
                              maxHeight: imgs.length === 1 ? 380 : 200,
                              borderRadius: 8,
                              border: "1px solid #e2e8f0",
                              objectFit: imgs.length === 1 ? "contain" : "cover",
                              background: "#ffffff",
                              cursor: "zoom-in",
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  <div style={{ padding: 16, display: "grid", gap: 14 }}>
                    <LabeledBlock label="Description" value={o.description} />
                    <LabeledBlock
                      label="Recommendation / Corrective Action"
                      value={o.recommendation}
                      accent
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "18px 32px 22px 32px",
            borderTop: "2px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "#475569",
            background: "#f8fafc",
          }}
          className="report-print-footer"
        >
          <div>
            Generated by {report.createdByName} •{" "}
            {formatDateTime(report.createdAt) || "—"}
          </div>
          <div>
            Emirates International Holding Group © {new Date().getFullYear()}
          </div>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onIndex={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// ── Small UI helpers ───────────────────────────────────────────────────
function SectionHeader({
  title,
  icon,
  noMargin,
}: {
  title: string;
  icon?: string;
  noMargin?: boolean;
}) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: noMargin ? 0 : 14,
      }}
    >
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: theme.title,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  gridSpan,
}: {
  label: string;
  children: React.ReactNode;
  gridSpan?: boolean;
}) {
  const theme = getThemePalette();
  return (
    <div style={gridSpan ? { gridColumn: "1 / -1" } : undefined}>
      <label
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 11,
          fontWeight: 800,
          color: theme.mutedText,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function InfoBlock({
  label,
  value,
  mono,
  wide,
  statusValue,
  priorityValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
  statusValue?: boolean;
  priorityValue?: boolean;
}) {
  return (
    <div style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {statusValue ? (
        <span style={statusBadgeStyle(value as ReportStatus)}>{value}</span>
      ) : priorityValue ? (
        <span style={priorityBadgeStyle(value as ReportPriority)}>
          {value}
        </span>
      ) : (
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#0f172a",
            fontFamily: mono
              ? "var(--font-geist-mono), monospace"
              : undefined,
            wordBreak: "break-word",
          }}
        >
          {value || "—"}
        </div>
      )}
    </div>
  );
}

function LabeledBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: accent ? "#4338ca" : "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#0f172a",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          background: accent ? "#eef2ff" : "transparent",
          padding: accent ? "10px 12px" : 0,
          borderRadius: accent ? 8 : 0,
          borderLeft: accent ? "3px solid #4338ca" : "none",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

// ── Print: opens a new window with isolated, A4-ready HTML ─────────────
function printReport(report: Report) {
  if (typeof window === "undefined") return;
  const year = new Date().getFullYear();

  const priorityColor = (p: ReportPriority) => {
    if (p === "Critical") return { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" };
    if (p === "High") return { bg: "#ffedd5", fg: "#9a3412", bd: "#fed7aa" };
    if (p === "Medium") return { bg: "#fef3c7", fg: "#92400e", bd: "#fcd34d" };
    return { bg: "#dcfce7", fg: "#166534", bd: "#86efac" };
  };
  const statusColor = (s: ReportStatus) => {
    if (s === "Approved" || s === "Closed")
      return { bg: "#dcfce7", fg: "#166534", bd: "#86efac" };
    if (s === "Action Required")
      return { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" };
    if (s === "Under Review" || s === "Submitted")
      return { bg: "#dbeafe", fg: "#1d4ed8", bd: "#bfdbfe" };
    return { bg: "#f1f5f9", fg: "#475569", bd: "#e2e8f0" };
  };

  const overallP = priorityColor(report.priority);
  const overallS = statusColor(report.status);

  const observationsHtml = report.observations
    .map((o, idx) => {
      const pc = priorityColor(o.priority);
      const imgs = getObservationImages(o);
      const img =
        imgs.length > 0
          ? `<div class="obs-img${imgs.length > 1 ? " obs-img-grid" : ""}">${imgs
              .map(
                (im, i) =>
                  `<img src="${escHtml(im.url)}" alt="Observation ${idx + 1} photo ${i + 1}" />`
              )
              .join("")}</div>`
          : "";
      return `
        <section class="obs">
          <header class="obs-head">
            <div class="obs-no">OBSERVATION #${String(idx + 1).padStart(2, "0")}</div>
            <span class="pill" style="background:${pc.bg};color:${pc.fg};border-color:${pc.bd}">${escHtml(o.priority)} Priority</span>
          </header>
          ${img}
          <div class="obs-body">
            <div class="lbl">Description</div>
            <div class="val">${escHtml(o.description).replace(/\n/g, "<br>")}</div>
            <div class="lbl lbl-accent">Recommendation / Corrective Action</div>
            <div class="val val-accent">${escHtml(o.recommendation).replace(/\n/g, "<br>") || "—"}</div>
          </div>
        </section>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(report.reportNumber)} — ${escHtml(report.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc { max-width: 780px; margin: 0 auto; padding: 0 4px; }
  .letterhead {
    text-align: center;
    border-bottom: 3px double #1e293b;
    padding: 6px 0 18px 0;
    margin-bottom: 18px;
  }
  .official-tag {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #64748b;
    margin-bottom: 6px;
  }
  .brand-1 {
    font-size: 22px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: 0.05em;
    line-height: 1.2;
  }
  .brand-2 {
    font-size: 14px;
    font-weight: 700;
    color: #4338ca;
    font-style: italic;
    margin-top: 4px;
  }
  .doc-title {
    margin-top: 14px;
    display: inline-block;
    font-size: 16px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: 0.18em;
    padding: 6px 14px;
    border-top: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
  }
  .info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 18px;
    padding: 14px 18px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    margin-bottom: 18px;
  }
  .info .wide { grid-column: 1 / -1; }
  .info .k {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 3px;
  }
  .info .v { font-size: 13px; font-weight: 700; color: #0f172a; }
  .info .v.mono { font-family: "Courier New", monospace; }
  .pill {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .section-title {
    font-size: 13px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: 0.08em;
    border-left: 4px solid #4338ca;
    padding-left: 10px;
    margin: 8px 0 14px 0;
    text-transform: uppercase;
  }
  .obs {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    margin-bottom: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .obs-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
  }
  .obs-no {
    font-size: 11px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: 0.06em;
  }
  .obs-img {
    background: #f8fafc;
    padding: 14px;
    border-bottom: 1px solid #e2e8f0;
    text-align: center;
  }
  .obs-img img {
    max-width: 100%;
    max-height: 360px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    object-fit: contain;
    background: #fff;
  }
  .obs-img-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .obs-img-grid img {
    width: 100%;
    max-height: 240px;
    object-fit: cover;
  }
  .obs-body { padding: 12px 16px; }
  .lbl {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 6px 0 4px 0;
  }
  .lbl-accent { color: #4338ca; }
  .val {
    font-size: 12px;
    color: #0f172a;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .val-accent {
    background: #eef2ff;
    padding: 8px 10px;
    border-radius: 6px;
    border-left: 3px solid #4338ca;
  }
  .footer {
    margin-top: 22px;
    border-top: 2px solid #1e293b;
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #475569;
  }
  @media print {
    body { background: #fff; }
    .doc { max-width: none; padding: 0; }
  }
</style>
</head>
<body>
  <div class="doc">
    <div class="letterhead">
      <div class="official-tag">✦ OFFICIAL DOCUMENT ✦</div>
      <div class="brand-1">EMIRATES INTERNATIONAL HOLDING GROUP</div>
      <div class="brand-2">Philippine Supermarket</div>
      <div class="doc-title">FIELD VISIT REPORT</div>
    </div>

    <div class="info">
      <div><div class="k">Report No.</div><div class="v mono">${escHtml(report.reportNumber)}</div></div>
      <div><div class="k">Branch</div><div class="v">${escHtml(report.branchName)}</div></div>
      <div><div class="k">Date of Visit</div><div class="v">${escHtml(report.visitDate)}</div></div>
      <div><div class="k">Prepared By</div><div class="v">${escHtml(report.preparedBy)}</div></div>
      <div><div class="k">Status</div><div class="v"><span class="pill" style="background:${overallS.bg};color:${overallS.fg};border-color:${overallS.bd}">${escHtml(report.status)}</span></div></div>
      <div><div class="k">Overall Priority</div><div class="v"><span class="pill" style="background:${overallP.bg};color:${overallP.fg};border-color:${overallP.bd}">${escHtml(report.priority)}</span></div></div>
      <div class="wide"><div class="k">Title</div><div class="v">${escHtml(report.title)}</div></div>
    </div>

    <div class="section-title">Observations &amp; Findings</div>
    ${observationsHtml || '<div style="padding:14px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:12px;text-align:center;">No observations recorded.</div>'}

    <div class="footer">
      <div>Generated by ${escHtml(report.createdByName)} • ${escHtml(formatDateTime(report.createdAt) || "—")}</div>
      <div>Emirates International Holding Group © ${year}</div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    alert("Please allow popups to print this report.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
