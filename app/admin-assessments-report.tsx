"use client";

import React, { useMemo, useState } from "react";
import {
  Assessment,
  AssessmentSubmission,
  buttonStyle,
  cardStyle,
  EmptyState,
  escHtml,
  getThemeMode,
  getThemePalette,
  smallButtonStyle,
  softCardStyle,
  StatBox,
  SkeletonCard,
} from "./portal-utils";

// ── Computed types ────────────────────────────────────────────────────
type PerQuestionStat = {
  questionId: string;
  index: number;
  text: string;
  attempts: number;
  correct: number;
  correctRate: number; // 0-100
};

type PerParticipantStat = {
  nameKey: string; // normalized
  displayName: string;
  branch: string;
  attempts: number;
  bestPct: number;
  bestStatus: "Pass" | "Fail";
  lastSubmittedAt: string;
};

type PerAssessmentReport = {
  assessment: Assessment;
  submissions: AssessmentSubmission[];
  totalSubmissions: number;
  uniqueParticipants: number;
  averagePct: number;
  passCount: number;
  failCount: number;
  passRate: number;
  highestPct: number;
  lowestPct: number;
  perQuestion: PerQuestionStat[];
  perParticipant: PerParticipantStat[];
};

type AdminAssessmentsReportProps = {
  assessments: Assessment[];
  submissions: AssessmentSubmission[];
  loading: boolean;
  onClose: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────
function fmtDateTime(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeAverage(sum: number, count: number): number {
  return count === 0 ? 0 : Math.round((sum / count) * 10) / 10;
}

function computeReport(
  assessments: Assessment[],
  submissions: AssessmentSubmission[]
): PerAssessmentReport[] {
  const liveSubs = submissions.filter((s) => s.deleted !== true);
  const subsByAssessment = new Map<string, AssessmentSubmission[]>();
  for (const s of liveSubs) {
    const arr = subsByAssessment.get(s.assessmentId) || [];
    arr.push(s);
    subsByAssessment.set(s.assessmentId, arr);
  }

  return assessments.map((assessment) => {
    const subs = subsByAssessment.get(assessment.id) || [];
    const totalSubmissions = subs.length;

    const sumPct = subs.reduce((acc, s) => acc + s.percentage, 0);
    const averagePct = safeAverage(sumPct, totalSubmissions);
    const passCount = subs.filter((s) => s.status === "Pass").length;
    const failCount = totalSubmissions - passCount;
    const passRate =
      totalSubmissions === 0 ? 0 : Math.round((passCount / totalSubmissions) * 100);
    const highestPct =
      totalSubmissions === 0
        ? 0
        : subs.reduce((max, s) => (s.percentage > max ? s.percentage : max), 0);
    const lowestPct =
      totalSubmissions === 0
        ? 0
        : subs.reduce(
            (min, s) => (s.percentage < min ? s.percentage : min),
            100
          );

    // Per-question stats
    const perQuestion: PerQuestionStat[] = assessment.questions.map(
      (q, qIdx) => {
        let attempts = 0;
        let correct = 0;
        for (const s of subs) {
          if (s.answers && qIdx < s.answers.length) {
            attempts++;
            const correctAns =
              s.correctAnswers && qIdx < s.correctAnswers.length
                ? s.correctAnswers[qIdx]
                : q.correctAnswerIndex;
            if (s.answers[qIdx] === correctAns) correct++;
          }
        }
        return {
          questionId: q.id,
          index: qIdx,
          text: q.text,
          attempts,
          correct,
          correctRate:
            attempts === 0 ? 0 : Math.round((correct / attempts) * 100),
        };
      }
    );

    // Per-participant stats (group by normalized name, take best score)
    const byName = new Map<string, AssessmentSubmission[]>();
    for (const s of subs) {
      const key = s.participantNameNormalized || s.participantName.toLowerCase();
      const arr = byName.get(key) || [];
      arr.push(s);
      byName.set(key, arr);
    }
    const perParticipant: PerParticipantStat[] = [];
    for (const [key, arr] of byName.entries()) {
      arr.sort((a, b) => (a.submittedAt > b.submittedAt ? -1 : 1));
      const best = arr.reduce((max, s) =>
        s.percentage > max.percentage ? s : max
      );
      perParticipant.push({
        nameKey: key,
        displayName: best.participantName,
        branch: best.branch || "—",
        attempts: arr.length,
        bestPct: best.percentage,
        bestStatus: best.status,
        lastSubmittedAt: arr[0].submittedAt,
      });
    }
    perParticipant.sort((a, b) => b.bestPct - a.bestPct);

    const uniqueParticipants = byName.size;

    return {
      assessment,
      submissions: subs,
      totalSubmissions,
      uniqueParticipants,
      averagePct,
      passCount,
      failCount,
      passRate,
      highestPct,
      lowestPct,
      perQuestion,
      perParticipant,
    };
  });
}

// ── Main component ─────────────────────────────────────────────────────
export default function AdminAssessmentsReport({
  assessments,
  submissions,
  loading,
  onClose,
}: AdminAssessmentsReportProps) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const report = useMemo(
    () => computeReport(assessments, submissions),
    [assessments, submissions]
  );

  const overall = useMemo(() => {
    const totalAssessments = report.length;
    const totalSubmissions = report.reduce(
      (n, r) => n + r.totalSubmissions,
      0
    );
    // Unique participants across ALL assessments (deduplicate by normalized name)
    const allNames = new Set<string>();
    for (const r of report) {
      for (const p of r.perParticipant) allNames.add(p.nameKey);
    }
    const totalUnique = allNames.size;
    const totalPasses = report.reduce((n, r) => n + r.passCount, 0);
    // Overall average across all submissions
    let sumPct = 0;
    let count = 0;
    for (const r of report) {
      for (const s of r.submissions) {
        sumPct += s.percentage;
        count++;
      }
    }
    const overallAvg = safeAverage(sumPct, count);
    const overallPassRate =
      count === 0 ? 0 : Math.round((totalPasses / count) * 100);

    return {
      totalAssessments,
      totalSubmissions,
      totalUnique,
      overallAvg,
      overallPassRate,
    };
  }, [report]);

  const generatedAt = useMemo(
    () =>
      new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  const toggle = (id: string) =>
    setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // ── Loading / empty ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <Header onClose={onClose} disabled />
        <SkeletonCard rows={4} />
        <SkeletonCard rows={6} />
        <SkeletonCard rows={6} />
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <Header onClose={onClose} disabled />
        <EmptyState
          icon="📊"
          title="No assessments to report on"
          description="Create an assessment first, then come back to view the full report."
        />
      </div>
    );
  }

  const hasAnySubmissions = overall.totalSubmissions > 0;

  return (
    <div style={{ display: "grid", gap: 18 }} className="full-report-root">
      <Header
        onClose={onClose}
        onPrint={() => printFullReport(report, overall, generatedAt)}
        onCsv={() => downloadCsv(report)}
        canExport={hasAnySubmissions}
      />

      {/* Title card */}
      <div
        style={{
          ...cardStyle(),
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(79,70,229,0.05) 100%)",
          borderColor: isDark ? "rgba(99,102,241,0.3)" : "#c7d2fe",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.18em",
            color: "#6366f1",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          ✦ Executive Report
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: theme.title,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
          className="full-report-title"
        >
          Full Assessments Report
        </div>
        <div
          style={{
            fontSize: 13,
            color: theme.subtleText,
            marginTop: 6,
          }}
        >
          Generated {generatedAt} · {overall.totalAssessments} assessment
          {overall.totalAssessments === 1 ? "" : "s"} · {overall.totalSubmissions}{" "}
          submission{overall.totalSubmissions === 1 ? "" : "s"}
        </div>
      </div>

      {/* Overall stats */}
      <div
        className="full-report-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        <StatBox
          title="Assessments"
          value={overall.totalAssessments}
          hint="Total in system"
        />
        <StatBox
          title="Participants"
          value={overall.totalUnique}
          hint="Unique employees"
        />
        <StatBox
          title="Submissions"
          value={overall.totalSubmissions}
          hint="Across all attempts"
        />
        <StatBox
          title="Average score"
          value={hasAnySubmissions ? `${overall.overallAvg}%` : "—"}
          hint="Overall mean"
        />
        <StatBox
          title="Pass rate"
          value={hasAnySubmissions ? `${overall.overallPassRate}%` : "—"}
          hint="Pass / Total"
        />
      </div>

      {!hasAnySubmissions && (
        <div style={{ ...cardStyle(), background: theme.softCardBackground }}>
          <div
            style={{
              fontSize: 14,
              color: theme.subtleText,
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            No submissions yet across any assessment. The breakdown below shows
            structure only.
          </div>
        </div>
      )}

      {/* Per-assessment breakdown */}
      <div style={{ display: "grid", gap: 14 }}>
        {report.map((r) => (
          <AssessmentSection
            key={r.assessment.id}
            row={r}
            expanded={!!expanded[r.assessment.id]}
            onToggle={() => toggle(r.assessment.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Sub: Header bar ───────────────────────────────────────────────────
function Header({
  onClose,
  onPrint,
  onCsv,
  canExport,
  disabled,
}: {
  onClose: () => void;
  onPrint?: () => void;
  onCsv?: () => void;
  canExport?: boolean;
  disabled?: boolean;
}) {
  const theme = getThemePalette();
  return (
    <div
      className="full-report-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={onClose}
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
        ← Back to Assessments
      </button>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        className="full-report-actions"
      >
        <button
          onClick={onCsv}
          disabled={disabled || !canExport}
          style={{
            ...buttonStyle(false),
            opacity: disabled || !canExport ? 0.55 : 1,
            cursor: disabled || !canExport ? "not-allowed" : "pointer",
          }}
          title={canExport ? "Export all submissions to CSV" : "No data yet"}
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={onPrint}
          disabled={disabled}
          style={{
            ...buttonStyle(true),
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff",
            boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          🖨 Print Report
        </button>
      </div>
    </div>
  );
}

// ── Sub: per-assessment section card ───────────────────────────────────
function AssessmentSection({
  row,
  expanded,
  onToggle,
}: {
  row: PerAssessmentReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const a = row.assessment;
  const hasData = row.totalSubmissions > 0;

  const avgColor =
    row.averagePct >= a.passingPercentage
      ? "#10b981"
      : row.averagePct >= a.passingPercentage * 0.7
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div style={cardStyle()}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
        className="assessment-section-head"
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: theme.subtleText,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Section · {a.code}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: theme.title,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
            }}
          >
            {a.title}
          </div>
          {a.description && (
            <div
              style={{
                fontSize: 12,
                color: theme.subtleText,
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {a.description}
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          style={{
            ...smallButtonStyle(),
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          {expanded ? "▲ Collapse" : "▼ Details"}
        </button>
      </div>

      {/* Stats row */}
      <div
        className="assessment-section-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <MiniStat label="Participants" value={row.uniqueParticipants} />
        <MiniStat label="Submissions" value={row.totalSubmissions} />
        <MiniStat
          label="Average"
          value={hasData ? `${row.averagePct}%` : "—"}
          accent={avgColor}
        />
        <MiniStat
          label="Pass rate"
          value={hasData ? `${row.passRate}%` : "—"}
          hint={hasData ? `${row.passCount}/${row.totalSubmissions}` : ""}
        />
        <MiniStat
          label="Highest"
          value={hasData ? `${row.highestPct}%` : "—"}
        />
        <MiniStat
          label="Lowest"
          value={hasData ? `${row.lowestPct}%` : "—"}
        />
      </div>

      {/* Average bar */}
      {hasData && (
        <div style={{ marginBottom: expanded ? 14 : 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: theme.subtleText,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            <span>Average score vs passing threshold ({a.passingPercentage}%)</span>
            <span style={{ color: avgColor }}>{row.averagePct}%</span>
          </div>
          <div
            style={{
              position: "relative",
              height: 10,
              background: isDark ? "#1f2937" : "#f1f5f9",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(row.averagePct, 100)}%`,
                background: avgColor,
                borderRadius: 999,
                transition: "width 0.4s ease",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: -2,
                bottom: -2,
                left: `${Math.min(a.passingPercentage, 100)}%`,
                width: 2,
                background: theme.title,
                opacity: 0.5,
              }}
              title={`Passing: ${a.passingPercentage}%`}
            />
          </div>
        </div>
      )}

      {/* Expanded: per-question + per-participant */}
      {expanded && (
        <div style={{ display: "grid", gap: 16, marginTop: 6 }}>
          {/* Per-question correct rate */}
          {row.perQuestion.length > 0 && (
            <div>
              <SubSectionTitle text="Per-question correct rate" />
              <div style={{ display: "grid", gap: 8 }}>
                {row.perQuestion.map((q) => {
                  const color =
                    q.correctRate >= 80
                      ? "#10b981"
                      : q.correctRate >= 50
                      ? "#f59e0b"
                      : "#ef4444";
                  return (
                    <div
                      key={q.questionId}
                      style={{
                        ...softCardStyle(),
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          marginBottom: 6,
                          alignItems: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            color: theme.title,
                            fontWeight: 700,
                            lineHeight: 1.4,
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              color: theme.subtleText,
                              fontWeight: 800,
                              marginRight: 6,
                            }}
                          >
                            Q{q.index + 1}.
                          </span>
                          {q.text || "(no text)"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {q.correctRate}%
                        </div>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: isDark ? "#1f2937" : "#f1f5f9",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${q.correctRate}%`,
                            background: color,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.subtleText,
                          marginTop: 4,
                        }}
                      >
                        {q.correct} correct / {q.attempts} attempt
                        {q.attempts === 1 ? "" : "s"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-participant */}
          {row.perParticipant.length > 0 ? (
            <div>
              <SubSectionTitle
                text={`Participants (${row.perParticipant.length})`}
              />
              {/* Desktop table */}
              <div
                className="participants-table-desktop"
                style={{
                  ...cardStyle(),
                  padding: 0,
                  overflowX: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: isDark ? "#0f172a" : "#f9fafb",
                        color: theme.mutedText,
                      }}
                    >
                      <th style={th}>#</th>
                      <th style={th}>Name</th>
                      <th style={th}>Branch</th>
                      <th style={th}>Attempts</th>
                      <th style={th}>Best %</th>
                      <th style={th}>Status</th>
                      <th style={th}>Last submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.perParticipant.map((p, idx) => (
                      <tr
                        key={p.nameKey}
                        style={{
                          borderTop: `1px solid ${theme.cardBorder}`,
                        }}
                      >
                        <td style={td}>{idx + 1}</td>
                        <td style={td}>
                          <div
                            style={{ fontWeight: 700, color: theme.title }}
                          >
                            {p.displayName}
                          </div>
                        </td>
                        <td style={td}>{p.branch}</td>
                        <td style={td}>{p.attempts}</td>
                        <td style={td}>
                          <strong>{p.bestPct}%</strong>
                        </td>
                        <td style={td}>
                          <StatusPill status={p.bestStatus} />
                        </td>
                        <td style={td}>{fmtDateTime(p.lastSubmittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div
                className="participants-cards-mobile"
                style={{ display: "none", gap: 8 }}
              >
                {row.perParticipant.map((p, idx) => (
                  <div
                    key={p.nameKey}
                    style={{
                      ...softCardStyle(),
                      padding: 14,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          color: theme.title,
                          fontSize: 14,
                        }}
                      >
                        #{idx + 1} · {p.displayName}
                      </div>
                      <StatusPill status={p.bestStatus} />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 12,
                        color: theme.subtleText,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Branch
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: theme.title,
                            marginTop: 2,
                          }}
                        >
                          {p.branch}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Best score
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            color: theme.title,
                            fontWeight: 900,
                            marginTop: 2,
                          }}
                        >
                          {p.bestPct}%
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Attempts
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: theme.title,
                            marginTop: 2,
                          }}
                        >
                          {p.attempts}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Last
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: theme.title,
                            marginTop: 2,
                          }}
                        >
                          {fmtDateTime(p.lastSubmittedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <SubSectionTitle text="Participants" />
              <EmptyState
                icon="👥"
                title="No participants yet"
                description="No employee has submitted this assessment."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────
function MiniStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        ...softCardStyle(),
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: theme.subtleText,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: accent || theme.title,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: theme.subtleText }}>{hint}</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "Pass" | "Fail" }) {
  const isDark = getThemeMode() === "dark";
  const ok = status === "Pass";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: ok
          ? isDark
            ? "rgba(16,185,129,0.14)"
            : "#dcfce7"
          : isDark
          ? "rgba(239,68,68,0.14)"
          : "#fee2e2",
        color: ok
          ? isDark
            ? "#34d399"
            : "#166534"
          : isDark
          ? "#f87171"
          : "#991b1b",
      }}
    >
      {status}
    </span>
  );
}

function SubSectionTitle({ text }: { text: string }) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 900,
        color: theme.subtleText,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 10,
      }}
    >
      {text}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

// ── CSV export ─────────────────────────────────────────────────────────
function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(report: PerAssessmentReport[]) {
  const rows: string[] = [];
  rows.push(
    [
      "Assessment Title",
      "Code",
      "Participant",
      "Branch",
      "Attempt",
      "Score",
      "Total",
      "Percentage",
      "Status",
      "Submitted At",
    ].join(",")
  );
  for (const r of report) {
    for (const s of r.submissions) {
      rows.push(
        [
          csvEscape(r.assessment.title),
          csvEscape(r.assessment.code),
          csvEscape(s.participantName),
          csvEscape(s.branch || ""),
          csvEscape(s.attemptNumber),
          csvEscape(s.score),
          csvEscape(s.totalQuestions),
          csvEscape(s.percentage),
          csvEscape(s.status),
          csvEscape(s.submittedAt),
        ].join(",")
      );
    }
  }

  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(["﻿" + rows.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `assessments-report-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Print: isolated popup with formal letterhead + tables ──────────────
function printFullReport(
  report: PerAssessmentReport[],
  overall: {
    totalAssessments: number;
    totalSubmissions: number;
    totalUnique: number;
    overallAvg: number;
    overallPassRate: number;
  },
  generatedAt: string
) {
  if (typeof window === "undefined") return;

  const sectionsHtml = report
    .map((r) => {
      const a = r.assessment;
      const hasData = r.totalSubmissions > 0;
      const avgColor =
        r.averagePct >= a.passingPercentage
          ? "#10b981"
          : r.averagePct >= a.passingPercentage * 0.7
          ? "#f59e0b"
          : "#ef4444";

      const partRows = r.perParticipant
        .map(
          (p, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escHtml(p.displayName)}</strong></td>
            <td>${escHtml(p.branch)}</td>
            <td>${p.attempts}</td>
            <td><strong>${p.bestPct}%</strong></td>
            <td><span class="pill ${
              p.bestStatus === "Pass" ? "pill-ok" : "pill-bad"
            }">${escHtml(p.bestStatus)}</span></td>
            <td>${escHtml(fmtDateTime(p.lastSubmittedAt))}</td>
          </tr>
        `
        )
        .join("");

      const questionsHtml = r.perQuestion
        .map(
          (q) => `
          <div class="q-row">
            <div class="q-row-head">
              <div class="q-text"><span class="q-no">Q${q.index + 1}.</span> ${escHtml(q.text) || "(no text)"}</div>
              <div class="q-pct">${q.correctRate}%</div>
            </div>
            <div class="q-bar"><div class="q-fill" style="width:${q.correctRate}%; background:${
            q.correctRate >= 80
              ? "#10b981"
              : q.correctRate >= 50
              ? "#f59e0b"
              : "#ef4444"
          }"></div></div>
            <div class="q-meta">${q.correct} correct / ${q.attempts} attempt${
            q.attempts === 1 ? "" : "s"
          }</div>
          </div>
        `
        )
        .join("");

      return `
        <section class="sec">
          <header class="sec-head">
            <div class="sec-tag">SECTION · ${escHtml(a.code)}</div>
            <h2 class="sec-title">${escHtml(a.title)}</h2>
            ${a.description ? `<div class="sec-desc">${escHtml(a.description)}</div>` : ""}
          </header>

          <div class="mini-grid">
            <div class="mini"><div class="mini-k">Participants</div><div class="mini-v">${r.uniqueParticipants}</div></div>
            <div class="mini"><div class="mini-k">Submissions</div><div class="mini-v">${r.totalSubmissions}</div></div>
            <div class="mini"><div class="mini-k">Average</div><div class="mini-v" style="color:${avgColor}">${
        hasData ? r.averagePct + "%" : "—"
      }</div></div>
            <div class="mini"><div class="mini-k">Pass rate</div><div class="mini-v">${
              hasData ? r.passRate + "%" : "—"
            }</div></div>
            <div class="mini"><div class="mini-k">Highest</div><div class="mini-v">${
              hasData ? r.highestPct + "%" : "—"
            }</div></div>
            <div class="mini"><div class="mini-k">Lowest</div><div class="mini-v">${
              hasData ? r.lowestPct + "%" : "—"
            }</div></div>
          </div>

          ${
            hasData
              ? `
            <div class="bar-wrap">
              <div class="bar-label">Average vs passing (${a.passingPercentage}%)</div>
              <div class="bar"><div class="bar-fill" style="width:${Math.min(
                r.averagePct,
                100
              )}%; background:${avgColor}"></div></div>
            </div>
          `
              : ""
          }

          ${
            r.perQuestion.length > 0
              ? `
            <div class="sub-title">Per-question correct rate</div>
            <div class="q-list">${questionsHtml}</div>
          `
              : ""
          }

          ${
            r.perParticipant.length > 0
              ? `
            <div class="sub-title">Participants (${r.perParticipant.length})</div>
            <table class="part-table">
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Branch</th><th>Attempts</th>
                  <th>Best %</th><th>Status</th><th>Last submitted</th>
                </tr>
              </thead>
              <tbody>${partRows}</tbody>
            </table>
          `
              : `<div class="sub-title">Participants</div>
                 <div class="empty">No participants yet.</div>`
          }
        </section>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Full Assessments Report — ${escHtml(generatedAt)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    margin: 0;
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
  .tag {
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
  .meta {
    font-size: 11px;
    color: #64748b;
    margin-top: 8px;
  }
  .overall {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 22px;
  }
  .overall .k {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .overall .v { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px; }
  .sec {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 16px;
    background: #ffffff;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sec-head { margin-bottom: 12px; }
  .sec-tag {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #64748b;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .sec-title {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.01em;
  }
  .sec-desc { font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.5; }
  .mini-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    margin-bottom: 10px;
  }
  .mini {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px;
  }
  .mini-k {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .mini-v { font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 2px; }
  .bar-wrap { margin: 6px 0 14px 0; }
  .bar-label { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
  .bar {
    height: 8px;
    background: #f1f5f9;
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 999px; }
  .sub-title {
    font-size: 11px;
    font-weight: 900;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 14px 0 6px 0;
    border-left: 3px solid #4338ca;
    padding-left: 8px;
  }
  .q-row { background: #f8fafc; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
  .q-row-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
  .q-no { color: #64748b; font-weight: 800; margin-right: 4px; }
  .q-text { font-size: 11px; color: #0f172a; line-height: 1.4; flex: 1; }
  .q-pct { font-size: 11px; font-weight: 800; white-space: nowrap; }
  .q-bar { height: 5px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin: 4px 0; }
  .q-fill { height: 100%; border-radius: 999px; }
  .q-meta { font-size: 9px; color: #64748b; }
  .part-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .part-table th {
    text-align: left;
    padding: 7px 8px;
    background: #f1f5f9;
    color: #475569;
    font-weight: 800;
    border-bottom: 1px solid #e2e8f0;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .part-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: #0f172a;
  }
  .pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 800;
    border: 1px solid transparent;
  }
  .pill-ok { background: #dcfce7; color: #166534; border-color: #86efac; }
  .pill-bad { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
  .empty { font-size: 11px; color: #64748b; padding: 8px; background: #f8fafc; border-radius: 6px; }
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
      <div class="tag">✦ OFFICIAL DOCUMENT ✦</div>
      <div class="brand-1">EMIRATES INTERNATIONAL HOLDING GROUP</div>
      <div class="brand-2">Philippine Supermarket</div>
      <div class="doc-title">FULL ASSESSMENTS REPORT</div>
      <div class="meta">Generated ${escHtml(generatedAt)}</div>
    </div>

    <div class="overall">
      <div><div class="k">Assessments</div><div class="v">${overall.totalAssessments}</div></div>
      <div><div class="k">Participants</div><div class="v">${overall.totalUnique}</div></div>
      <div><div class="k">Submissions</div><div class="v">${overall.totalSubmissions}</div></div>
      <div><div class="k">Average score</div><div class="v">${
        overall.totalSubmissions ? overall.overallAvg + "%" : "—"
      }</div></div>
      <div><div class="k">Pass rate</div><div class="v">${
        overall.totalSubmissions ? overall.overallPassRate + "%" : "—"
      }</div></div>
    </div>

    ${sectionsHtml}

    <div class="footer">
      <div>Confidential · Internal use</div>
      <div>Emirates International Holding Group © ${new Date().getFullYear()}</div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 300);
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
