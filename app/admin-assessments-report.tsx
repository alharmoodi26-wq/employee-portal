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
  SkeletonCard,
} from "./portal-utils";

// ── Threshold the user named ("أقل من 70%") ───────────────────────────
const FOLLOWUP_THRESHOLD = 70;
// Below this, a question becomes a Training Focus Area.
const WEAK_QUESTION_THRESHOLD = 60;
// Min attempts before a question is statistically meaningful.
const WEAK_QUESTION_MIN_ATTEMPTS = 3;

// ── Domain types ──────────────────────────────────────────────────────
type AssessmentBadge =
  | "Excellent"
  | "Good"
  | "Needs Attention"
  | "No Data";

type PerQuestionStat = {
  questionId: string;
  index: number;
  text: string;
  attempts: number;
  correct: number;
  correctRate: number;
  assessmentTitle: string;
};

type PerParticipantStat = {
  nameKey: string;
  displayName: string;
  branch: string;
  attempts: number;
  bestPct: number;
  bestStatus: "Pass" | "Fail";
  lastSubmittedAt: string;
};

type AssessmentRow = {
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
  failedParticipants: number;
  badge: AssessmentBadge;
  perQuestion: PerQuestionStat[];
  perParticipant: PerParticipantStat[];
};

type FollowUpRow = {
  nameKey: string;
  displayName: string;
  branch: string;
  assessmentTitle: string;
  assessmentCode: string;
  bestPct: number;
  status: "Pass" | "Fail";
  lastSubmittedAt: string;
  action: string;
};

type BranchRow = {
  branch: string;
  participants: number;
  submissions: number;
  averagePct: number;
  passRate: number;
  failedParticipants: number;
};

type OverallStats = {
  totalAssessments: number;
  totalParticipants: number;
  totalSubmissions: number;
  overallAvg: number;
  overallPassRate: number;
  failedParticipantsCount: number;
  pendingSectionsCount: number;
  bestAssessment: AssessmentRow | null;
  worstAssessment: AssessmentRow | null;
  periodStart: string;
  periodEnd: string;
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

function fmtDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeAverage(sum: number, count: number): number {
  return count === 0 ? 0 : Math.round((sum / count) * 10) / 10;
}

function scoreColor(pct: number): string {
  if (pct >= 85) return "#10b981";
  if (pct >= FOLLOWUP_THRESHOLD) return "#f59e0b";
  return "#ef4444";
}

function badgeFor(row: {
  totalSubmissions: number;
  averagePct: number;
  passRate: number;
  passingPercentage: number;
}): AssessmentBadge {
  if (row.totalSubmissions === 0) return "No Data";
  if (row.averagePct >= 85 && row.passRate >= 90) return "Excellent";
  if (row.averagePct >= row.passingPercentage && row.passRate >= 70)
    return "Good";
  return "Needs Attention";
}

function shortenText(s: string, max: number): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ── Computation ───────────────────────────────────────────────────────
function buildReport(
  assessments: Assessment[],
  submissions: AssessmentSubmission[]
): {
  perAssessment: AssessmentRow[];
  followUp: FollowUpRow[];
  pending: Assessment[];
  branchRows: BranchRow[];
  weakQuestions: PerQuestionStat[];
  overall: OverallStats;
} {
  const liveSubs = submissions.filter((s) => s.deleted !== true);

  // group submissions by assessment
  const byAssessment = new Map<string, AssessmentSubmission[]>();
  for (const s of liveSubs) {
    const arr = byAssessment.get(s.assessmentId) || [];
    arr.push(s);
    byAssessment.set(s.assessmentId, arr);
  }

  const perAssessment: AssessmentRow[] = assessments.map((assessment) => {
    const subs = byAssessment.get(assessment.id) || [];
    const totalSubmissions = subs.length;
    const sumPct = subs.reduce((a, s) => a + s.percentage, 0);
    const averagePct = safeAverage(sumPct, totalSubmissions);
    const passCount = subs.filter((s) => s.status === "Pass").length;
    const failCount = totalSubmissions - passCount;
    const passRate =
      totalSubmissions === 0
        ? 0
        : Math.round((passCount / totalSubmissions) * 100);
    const highestPct = totalSubmissions
      ? subs.reduce((m, s) => (s.percentage > m ? s.percentage : m), 0)
      : 0;
    const lowestPct = totalSubmissions
      ? subs.reduce((m, s) => (s.percentage < m ? s.percentage : m), 100)
      : 0;

    // per question
    const perQuestion: PerQuestionStat[] = assessment.questions.map(
      (q, idx) => {
        let attempts = 0;
        let correct = 0;
        for (const s of subs) {
          if (s.answers && idx < s.answers.length) {
            attempts++;
            const expected =
              s.correctAnswers && idx < s.correctAnswers.length
                ? s.correctAnswers[idx]
                : q.correctAnswerIndex;
            if (s.answers[idx] === expected) correct++;
          }
        }
        return {
          questionId: q.id,
          index: idx,
          text: q.text,
          attempts,
          correct,
          correctRate:
            attempts === 0 ? 0 : Math.round((correct / attempts) * 100),
          assessmentTitle: assessment.title,
        };
      }
    );

    // per participant
    const byName = new Map<string, AssessmentSubmission[]>();
    for (const s of subs) {
      const key =
        s.participantNameNormalized || s.participantName.toLowerCase();
      const arr = byName.get(key) || [];
      arr.push(s);
      byName.set(key, arr);
    }
    const perParticipant: PerParticipantStat[] = [];
    for (const [key, arr] of byName.entries()) {
      arr.sort((a, b) => (a.submittedAt > b.submittedAt ? -1 : 1));
      const best = arr.reduce((m, s) =>
        s.percentage > m.percentage ? s : m
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

    const failedParticipants = perParticipant.filter(
      (p) => p.bestPct < FOLLOWUP_THRESHOLD || p.bestStatus === "Fail"
    ).length;

    const badge = badgeFor({
      totalSubmissions,
      averagePct,
      passRate,
      passingPercentage: assessment.passingPercentage,
    });

    return {
      assessment,
      submissions: subs,
      totalSubmissions,
      uniqueParticipants: byName.size,
      averagePct,
      passCount,
      failCount,
      passRate,
      highestPct,
      lowestPct,
      failedParticipants,
      badge,
      perQuestion,
      perParticipant,
    };
  });

  // Follow-up rows: best per (participant, assessment) where best < threshold
  const followUp: FollowUpRow[] = [];
  for (const row of perAssessment) {
    for (const p of row.perParticipant) {
      if (p.bestPct < FOLLOWUP_THRESHOLD || p.bestStatus === "Fail") {
        const remainingAttempts =
          row.assessment.maxAttempts -
          row.perParticipant.find((x) => x.nameKey === p.nameKey)!.attempts;
        const action =
          remainingAttempts > 0
            ? `Retake (${remainingAttempts} attempt${
                remainingAttempts === 1 ? "" : "s"
              } left)`
            : "Training required";
        followUp.push({
          nameKey: p.nameKey,
          displayName: p.displayName,
          branch: p.branch,
          assessmentTitle: row.assessment.title,
          assessmentCode: row.assessment.code,
          bestPct: p.bestPct,
          status: p.bestStatus,
          lastSubmittedAt: p.lastSubmittedAt,
          action,
        });
      }
    }
  }
  followUp.sort((a, b) => a.bestPct - b.bestPct);

  // Pending = assessments with zero unique participants
  const pending = perAssessment
    .filter((r) => r.uniqueParticipants === 0)
    .map((r) => r.assessment);

  // Branch comparison
  const branchMap = new Map<
    string,
    {
      subs: AssessmentSubmission[];
      participantKeys: Set<string>;
    }
  >();
  for (const s of liveSubs) {
    const branch = s.branch || "Unspecified";
    const entry = branchMap.get(branch) || {
      subs: [],
      participantKeys: new Set<string>(),
    };
    entry.subs.push(s);
    entry.participantKeys.add(
      `${s.participantNameNormalized || s.participantName.toLowerCase()}::${
        s.assessmentId
      }`
    );
    branchMap.set(branch, entry);
  }
  const branchRows: BranchRow[] = [];
  for (const [branch, entry] of branchMap.entries()) {
    if (branch === "Unspecified") continue; // skip legacy/empty
    const totalSubmissions = entry.subs.length;
    const sumPct = entry.subs.reduce((a, s) => a + s.percentage, 0);
    const avg = safeAverage(sumPct, totalSubmissions);
    const passes = entry.subs.filter((s) => s.status === "Pass").length;
    const passRate = totalSubmissions
      ? Math.round((passes / totalSubmissions) * 100)
      : 0;
    // failed participants per branch — distinct (name, assessment) pairs below threshold
    const failedPairs = new Set<string>();
    const bestByPair = new Map<string, number>();
    const statusByPair = new Map<string, "Pass" | "Fail">();
    for (const s of entry.subs) {
      const key = `${s.participantNameNormalized || s.participantName.toLowerCase()}::${s.assessmentId}`;
      const prev = bestByPair.get(key);
      if (prev === undefined || s.percentage > prev) {
        bestByPair.set(key, s.percentage);
        statusByPair.set(key, s.status);
      }
    }
    for (const [key, best] of bestByPair.entries()) {
      if (best < FOLLOWUP_THRESHOLD || statusByPair.get(key) === "Fail") {
        failedPairs.add(key);
      }
    }
    branchRows.push({
      branch,
      participants: entry.participantKeys.size,
      submissions: totalSubmissions,
      averagePct: avg,
      passRate,
      failedParticipants: failedPairs.size,
    });
  }
  branchRows.sort((a, b) => b.averagePct - a.averagePct);

  // Weak questions across all assessments (for Training Focus Areas)
  const allQuestions = perAssessment.flatMap((r) => r.perQuestion);
  const weakQuestions = allQuestions
    .filter(
      (q) =>
        q.attempts >= WEAK_QUESTION_MIN_ATTEMPTS &&
        q.correctRate < WEAK_QUESTION_THRESHOLD
    )
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5);

  // Overall stats
  const totalSubmissions = liveSubs.length;
  const allNames = new Set<string>();
  for (const r of perAssessment) {
    for (const p of r.perParticipant) allNames.add(p.nameKey);
  }
  const sumPctAll = liveSubs.reduce((a, s) => a + s.percentage, 0);
  const overallAvg = safeAverage(sumPctAll, totalSubmissions);
  const passes = liveSubs.filter((s) => s.status === "Pass").length;
  const overallPassRate = totalSubmissions
    ? Math.round((passes / totalSubmissions) * 100)
    : 0;

  const withData = perAssessment.filter((r) => r.totalSubmissions > 0);
  const bestAssessment =
    withData.length === 0
      ? null
      : withData.reduce((m, r) => (r.averagePct > m.averagePct ? r : m));
  const worstAssessment =
    withData.length === 0
      ? null
      : withData.reduce((m, r) => (r.averagePct < m.averagePct ? r : m));

  // Failed participants = unique people who fall under threshold in at least 1 assessment
  const failedNames = new Set<string>();
  for (const f of followUp) failedNames.add(f.nameKey);

  // Report period: span of submittedAt dates
  let periodStart = "";
  let periodEnd = "";
  for (const s of liveSubs) {
    if (!s.submittedAt) continue;
    if (!periodStart || s.submittedAt < periodStart) periodStart = s.submittedAt;
    if (!periodEnd || s.submittedAt > periodEnd) periodEnd = s.submittedAt;
  }

  const overall: OverallStats = {
    totalAssessments: assessments.length,
    totalParticipants: allNames.size,
    totalSubmissions,
    overallAvg,
    overallPassRate,
    failedParticipantsCount: failedNames.size,
    pendingSectionsCount: pending.length,
    bestAssessment,
    worstAssessment,
    periodStart,
    periodEnd,
  };

  return { perAssessment, followUp, pending, branchRows, weakQuestions, overall };
}

// ── Main component ────────────────────────────────────────────────────
export default function AdminAssessmentsReport({
  assessments,
  submissions,
  loading,
  onClose,
}: AdminAssessmentsReportProps) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const [showDetailedQuestions, setShowDetailedQuestions] = useState(false);

  const data = useMemo(
    () => buildReport(assessments, submissions),
    [assessments, submissions]
  );

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
          description="Create an assessment first, then come back to view the executive report."
        />
      </div>
    );
  }

  const hasAnySubmissions = data.overall.totalSubmissions > 0;

  return (
    <div style={{ display: "grid", gap: 22 }} className="full-report-root">
      <Header
        onClose={onClose}
        onPrint={() =>
          printFullReport(data, generatedAt, showDetailedQuestions)
        }
        onCsv={() => downloadCsv(data.perAssessment)}
        canExport={hasAnySubmissions}
      />

      {/* 1 ── COVER */}
      <CoverCard overall={data.overall} generatedAt={generatedAt} />

      {/* 2 ── EXECUTIVE SUMMARY */}
      <ExecutiveSummary
        overall={data.overall}
        followUpCount={data.followUp.length}
      />

      {/* 3 ── MANAGEMENT DASHBOARD */}
      <ManagementDashboard overall={data.overall} />

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
            No submissions yet — the sections below show structure only. Stats
            will populate once participants submit.
          </div>
        </div>
      )}

      {/* 4 ── ASSESSMENT SUMMARY CARDS */}
      <Section title="Assessment Summary" subtitle="At-a-glance status per assessment">
        <div
          className="assessment-summary-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {data.perAssessment.map((row) => (
            <AssessmentSummaryCard key={row.assessment.id} row={row} />
          ))}
        </div>
      </Section>

      {/* 5 ── FOLLOW-UP */}
      {data.followUp.length > 0 ? (
        <Section
          title="Participants Requiring Follow-Up"
          subtitle={`${data.followUp.length} record${
            data.followUp.length === 1 ? "" : "s"
          } below ${FOLLOWUP_THRESHOLD}% — recommended for retake or training`}
          accent="#ef4444"
        >
          <FollowUpTable rows={data.followUp} />
        </Section>
      ) : (
        <Section
          title="Participants Requiring Follow-Up"
          subtitle="No participants below threshold"
          accent="#10b981"
        >
          <PositiveNote>
            ✓ Every participant scored at or above {FOLLOWUP_THRESHOLD}%. No
            follow-up training needed at this time.
          </PositiveNote>
        </Section>
      )}

      {/* 6 ── PENDING ASSESSMENTS */}
      <Section
        title="Assessments Pending Participation"
        subtitle={
          data.pending.length === 0
            ? "All assessments have at least one participant"
            : `${data.pending.length} assessment${
                data.pending.length === 1 ? "" : "s"
              } awaiting submissions`
        }
        accent={data.pending.length > 0 ? "#f59e0b" : "#10b981"}
      >
        {data.pending.length === 0 ? (
          <PositiveNote>
            ✓ All {data.overall.totalAssessments} assessments are receiving
            submissions.
          </PositiveNote>
        ) : (
          <PendingAssessmentsList items={data.pending} />
        )}
      </Section>

      {/* 7 ── BRANCH COMPARISON */}
      {data.branchRows.length >= 2 && (
        <Section
          title="Branch Comparison"
          subtitle="Performance across Philippine Supermarket branches"
        >
          <BranchComparison rows={data.branchRows} />
        </Section>
      )}

      {/* 8 ── TRAINING FOCUS AREAS */}
      <Section
        title="Training Focus Areas"
        subtitle={
          data.weakQuestions.length === 0
            ? "No specific weak areas detected"
            : "Topics where additional reinforcement is recommended"
        }
        accent={data.weakQuestions.length > 0 ? "#f59e0b" : "#10b981"}
      >
        {data.weakQuestions.length === 0 ? (
          <PositiveNote>
            ✓ All assessed topics meet or exceed the {WEAK_QUESTION_THRESHOLD}%
            correctness threshold. No specific reinforcement needed.
          </PositiveNote>
        ) : (
          <TrainingFocusAreas items={data.weakQuestions} />
        )}
      </Section>

      {/* 9 ── PARTICIPANTS BY ASSESSMENT */}
      <Section
        title="Participants by Assessment"
        subtitle="Best score per participant, sorted highest to lowest"
      >
        <div style={{ display: "grid", gap: 14 }}>
          {data.perAssessment.map((row) => (
            <AssessmentParticipantsBlock key={row.assessment.id} row={row} />
          ))}
        </div>
      </Section>

      {/* 10 ── RECOMMENDED ACTIONS */}
      <Section
        title="Recommended Actions"
        subtitle="Suggested next steps based on the data above"
      >
        <RecommendedActions data={data} />
      </Section>

      {/* OPTIONAL — Detailed question analysis */}
      <div
        style={{
          ...cardStyle(),
          background: isDark
            ? "rgba(99,102,241,0.08)"
            : "rgba(99,102,241,0.04)",
          borderColor: isDark ? "rgba(99,102,241,0.3)" : "#c7d2fe",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: theme.title,
            }}
          >
            Detailed question analysis
          </div>
          <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 2 }}>
            Optional drill-down — per-question correct rates across every
            assessment. {showDetailedQuestions
              ? "Currently shown; included in printout."
              : "Hidden by default to keep the report concise."}
          </div>
        </div>
        <button
          onClick={() => setShowDetailedQuestions((v) => !v)}
          style={{
            ...smallButtonStyle(),
            background: showDetailedQuestions ? "#6366f1" : "transparent",
            color: showDetailedQuestions ? "#fff" : "#6366f1",
            borderColor: "#6366f1",
            fontWeight: 800,
          }}
        >
          {showDetailedQuestions
            ? "Hide question analysis"
            : "Show question analysis"}
        </button>
      </div>

      {showDetailedQuestions && (
        <Section
          title="Detailed Question Analysis"
          subtitle="Per-question correct rate across each assessment"
        >
          <div style={{ display: "grid", gap: 16 }}>
            {data.perAssessment
              .filter((r) => r.perQuestion.length > 0)
              .map((row) => (
                <DetailedQuestionAnalysis key={row.assessment.id} row={row} />
              ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────
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

// ── 1. COVER CARD ─────────────────────────────────────────────────────
function CoverCard({
  overall,
  generatedAt,
}: {
  overall: OverallStats;
  generatedAt: string;
}) {
  const period =
    overall.periodStart && overall.periodEnd
      ? `${fmtDate(overall.periodStart)} — ${fmtDate(overall.periodEnd)}`
      : null;

  return (
    <div
      style={{
        ...cardStyle(),
        background:
          "linear-gradient(135deg, #0f1c35 0%, #1e293b 55%, #312e81 100%)",
        color: "#f1f5f9",
        border: "1px solid rgba(99,102,241,0.4)",
        padding: "44px 36px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
      className="cover-card"
    >
      {/* Decorative top accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background:
            "linear-gradient(90deg, #f0c040 0%, #6366f1 50%, #f0c040 100%)",
        }}
      />
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.35em",
          color: "#f0c040",
          marginBottom: 10,
        }}
      >
        ✦ OFFICIAL EXECUTIVE REPORT ✦
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: "0.06em",
          color: "#ffffff",
          lineHeight: 1.2,
        }}
        className="cover-brand-1"
      >
        EMIRATES INTERNATIONAL HOLDING GROUP
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#c7d2fe",
          fontStyle: "italic",
          marginTop: 6,
        }}
      >
        Philippine Supermarket
      </div>

      <div
        style={{
          width: 60,
          height: 1,
          background: "rgba(240,192,64,0.6)",
          margin: "22px auto",
        }}
      />

      <div
        style={{
          fontSize: 20,
          fontWeight: 900,
          color: "#ffffff",
          letterSpacing: "0.22em",
          padding: "10px 22px",
          borderTop: "1px solid rgba(255,255,255,0.18)",
          borderBottom: "1px solid rgba(255,255,255,0.18)",
          display: "inline-block",
        }}
        className="cover-doc-title"
      >
        FULL ASSESSMENTS REPORT
      </div>

      <div
        style={{
          marginTop: 26,
          fontSize: 13,
          color: "#cbd5e1",
          lineHeight: 1.8,
        }}
      >
        <div>
          Generated <strong style={{ color: "#fff" }}>{generatedAt}</strong>
        </div>
        {period && (
          <div>
            Report Period <strong style={{ color: "#fff" }}>{period}</strong>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 22,
          display: "inline-block",
          padding: "5px 14px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.18em",
          color: "#f0c040",
          border: "1px solid rgba(240,192,64,0.5)",
          borderRadius: 999,
        }}
      >
        CONFIDENTIAL · INTERNAL USE
      </div>
    </div>
  );
}

// ── 2. EXECUTIVE SUMMARY ──────────────────────────────────────────────
function ExecutiveSummary({
  overall,
  followUpCount,
}: {
  overall: OverallStats;
  followUpCount: number;
}) {
  const theme = getThemePalette();
  const hasData = overall.totalSubmissions > 0;

  return (
    <Section
      title="Executive Summary"
      subtitle="Top-level findings at a glance"
    >
      <div
        style={{
          ...cardStyle(),
          padding: 22,
          background: theme.softCardBackground,
          display: "grid",
          gap: 14,
        }}
      >
        {hasData ? (
          <p
            style={{
              fontSize: 14,
              color: theme.title,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            Across <strong>{overall.totalAssessments}</strong> assessments,{" "}
            <strong>{overall.totalParticipants}</strong> employees submitted{" "}
            <strong>{overall.totalSubmissions}</strong> attempts. The overall
            average score is{" "}
            <strong style={{ color: scoreColor(overall.overallAvg) }}>
              {overall.overallAvg}%
            </strong>{" "}
            with a pass rate of <strong>{overall.overallPassRate}%</strong>.{" "}
            {followUpCount > 0 ? (
              <>
                <strong style={{ color: "#ef4444" }}>{followUpCount}</strong>{" "}
                record{followUpCount === 1 ? "" : "s"} require follow-up.
              </>
            ) : (
              <>No participants currently require follow-up.</>
            )}
          </p>
        ) : (
          <p
            style={{
              fontSize: 14,
              color: theme.subtleText,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            No submissions have been recorded yet. This report reflects only the
            structure of the {overall.totalAssessments} assessment
            {overall.totalAssessments === 1 ? "" : "s"} currently in the system.
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
          className="exec-summary-grid"
        >
          <SummaryBullet
            label="Best Performing Assessment"
            value={
              overall.bestAssessment
                ? overall.bestAssessment.assessment.title
                : "—"
            }
            hint={
              overall.bestAssessment
                ? `${overall.bestAssessment.averagePct}% average`
                : "No data yet"
            }
            tone="good"
          />
          <SummaryBullet
            label="Lowest Performing Assessment"
            value={
              overall.worstAssessment
                ? overall.worstAssessment.assessment.title
                : "—"
            }
            hint={
              overall.worstAssessment
                ? `${overall.worstAssessment.averagePct}% average`
                : "No data yet"
            }
            tone="bad"
          />
          <SummaryBullet
            label="Failed Participants"
            value={String(overall.failedParticipantsCount)}
            hint={
              overall.failedParticipantsCount === 0
                ? "No follow-up needed"
                : `Below ${FOLLOWUP_THRESHOLD}% threshold`
            }
            tone={overall.failedParticipantsCount === 0 ? "good" : "bad"}
          />
          <SummaryBullet
            label="Sections with No Participants"
            value={String(overall.pendingSectionsCount)}
            hint={
              overall.pendingSectionsCount === 0
                ? "All assessments engaged"
                : "Awaiting submissions"
            }
            tone={overall.pendingSectionsCount === 0 ? "good" : "warn"}
          />
        </div>
      </div>
    </Section>
  );
}

function SummaryBullet({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const theme = getThemePalette();
  const accent =
    tone === "good"
      ? "#10b981"
      : tone === "bad"
      ? "#ef4444"
      : tone === "warn"
      ? "#f59e0b"
      : theme.subtleText;
  return (
    <div
      style={{
        background: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: theme.subtleText,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: theme.title,
          marginTop: 4,
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: theme.subtleText, marginTop: 2 }}>
        {hint}
      </div>
    </div>
  );
}

// ── 3. MANAGEMENT DASHBOARD ───────────────────────────────────────────
function ManagementDashboard({ overall }: { overall: OverallStats }) {
  const hasData = overall.totalSubmissions > 0;
  return (
    <Section
      title="Management Dashboard"
      subtitle="Key performance indicators"
    >
      <div
        className="dashboard-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 12,
        }}
      >
        <DashTile icon="📋" label="Assessments" value={overall.totalAssessments} />
        <DashTile icon="👥" label="Participants" value={overall.totalParticipants} />
        <DashTile icon="✉️" label="Submissions" value={overall.totalSubmissions} />
        <DashTile
          icon="📈"
          label="Average"
          value={hasData ? `${overall.overallAvg}%` : "—"}
          accent={hasData ? scoreColor(overall.overallAvg) : undefined}
        />
        <DashTile
          icon="🎯"
          label="Pass Rate"
          value={hasData ? `${overall.overallPassRate}%` : "—"}
          accent={
            hasData
              ? overall.overallPassRate >= 80
                ? "#10b981"
                : overall.overallPassRate >= 60
                ? "#f59e0b"
                : "#ef4444"
              : undefined
          }
        />
        <DashTile
          icon="⚠️"
          label="Failed"
          value={overall.failedParticipantsCount}
          accent={overall.failedParticipantsCount === 0 ? "#10b981" : "#ef4444"}
        />
        <DashTile
          icon="⏳"
          label="Pending Sections"
          value={overall.pendingSectionsCount}
          accent={
            overall.pendingSectionsCount === 0 ? "#10b981" : "#f59e0b"
          }
        />
      </div>
    </Section>
  );
}

function DashTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  accent?: string;
}) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        ...cardStyle(),
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: theme.softCardBackground,
      }}
    >
      <div style={{ fontSize: 18, lineHeight: 1 }}>{icon}</div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: theme.subtleText,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginTop: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 900,
          color: accent || theme.title,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── 4. ASSESSMENT SUMMARY CARD ────────────────────────────────────────
function AssessmentSummaryCard({ row }: { row: AssessmentRow }) {
  const theme = getThemePalette();
  const badgeStyles = badgeColor(row.badge);
  const hasData = row.totalSubmissions > 0;

  return (
    <div
      style={{
        ...cardStyle(),
        padding: 18,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: theme.subtleText,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            {row.assessment.code}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: theme.title,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {row.assessment.title}
          </div>
        </div>
        <span
          style={{
            ...badgeStyles,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
          }}
        >
          {row.badge.toUpperCase()}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        <KV label="Participants" value={row.uniqueParticipants} />
        <KV label="Submissions" value={row.totalSubmissions} />
        <KV
          label="Average"
          value={hasData ? `${row.averagePct}%` : "—"}
          color={hasData ? scoreColor(row.averagePct) : undefined}
        />
        <KV
          label="Pass Rate"
          value={hasData ? `${row.passRate}%` : "—"}
          color={
            hasData
              ? row.passRate >= 80
                ? "#10b981"
                : row.passRate >= 60
                ? "#f59e0b"
                : "#ef4444"
              : undefined
          }
        />
        <KV
          label="Highest"
          value={hasData ? `${row.highestPct}%` : "—"}
          color={hasData ? "#10b981" : undefined}
        />
        <KV
          label="Lowest"
          value={hasData ? `${row.lowestPct}%` : "—"}
          color={hasData ? scoreColor(row.lowestPct) : undefined}
        />
      </div>

      {row.failedParticipants > 0 && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#ef4444",
            fontWeight: 700,
          }}
        >
          <span>Failed participants</span>
          <span>{row.failedParticipants}</span>
        </div>
      )}
    </div>
  );
}

function badgeColor(b: AssessmentBadge): React.CSSProperties {
  const isDark = getThemeMode() === "dark";
  if (b === "Excellent")
    return {
      background: isDark ? "rgba(16,185,129,0.16)" : "#dcfce7",
      color: isDark ? "#34d399" : "#166534",
      border: `1px solid ${isDark ? "rgba(16,185,129,0.35)" : "#86efac"}`,
    };
  if (b === "Good")
    return {
      background: isDark ? "rgba(59,130,246,0.16)" : "#dbeafe",
      color: isDark ? "#60a5fa" : "#1d4ed8",
      border: `1px solid ${isDark ? "rgba(59,130,246,0.35)" : "#bfdbfe"}`,
    };
  if (b === "Needs Attention")
    return {
      background: isDark ? "rgba(245,158,11,0.16)" : "#fef3c7",
      color: isDark ? "#fbbf24" : "#92400e",
      border: `1px solid ${isDark ? "rgba(245,158,11,0.35)" : "#fcd34d"}`,
    };
  return {
    background: isDark ? "rgba(100,116,139,0.18)" : "#f1f5f9",
    color: isDark ? "#cbd5e1" : "#475569",
    border: `1px solid ${isDark ? "rgba(100,116,139,0.35)" : "#e2e8f0"}`,
  };
}

function KV({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  const theme = getThemePalette();
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: theme.subtleText,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: color || theme.title,
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── 5. FOLLOW-UP TABLE ────────────────────────────────────────────────
function FollowUpTable({ rows }: { rows: FollowUpRow[] }) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";

  return (
    <>
      <div
        className="participants-table-desktop"
        style={{ ...cardStyle(), padding: 0, overflowX: "auto" }}
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
              <th style={th}>Employee</th>
              <th style={th}>Branch</th>
              <th style={th}>Assessment</th>
              <th style={th}>Best Score</th>
              <th style={th}>Last Submitted</th>
              <th style={th}>Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.nameKey}::${r.assessmentCode}`}
                style={{ borderTop: `1px solid ${theme.cardBorder}` }}
              >
                <td style={td}>
                  <div style={{ fontWeight: 700, color: theme.title }}>
                    {r.displayName}
                  </div>
                </td>
                <td style={td}>{r.branch}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.assessmentTitle}</div>
                  <div style={{ fontSize: 11, color: theme.subtleText }}>
                    {r.assessmentCode}
                  </div>
                </td>
                <td style={td}>
                  <ScorePill pct={r.bestPct} status={r.status} />
                </td>
                <td style={td}>{fmtDateTime(r.lastSubmittedAt)}</td>
                <td style={td}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: isDark
                        ? "rgba(99,102,241,0.16)"
                        : "#eef2ff",
                      color: isDark ? "#a5b4fc" : "#4338ca",
                      border: `1px solid ${isDark ? "rgba(99,102,241,0.35)" : "#c7d2fe"}`,
                    }}
                  >
                    {r.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="participants-cards-mobile"
        style={{ display: "none", gap: 8 }}
      >
        {rows.map((r) => (
          <div
            key={`${r.nameKey}::${r.assessmentCode}`}
            style={{
              ...softCardStyle(),
              padding: 14,
              display: "grid",
              gap: 8,
              borderLeft: "3px solid #ef4444",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: theme.title }}>
                  {r.displayName}
                </div>
                <div style={{ fontSize: 12, color: theme.subtleText }}>
                  {r.branch}
                </div>
              </div>
              <ScorePill pct={r.bestPct} status={r.status} />
            </div>
            <div style={{ fontSize: 12, color: theme.title }}>
              {r.assessmentTitle}
              <span style={{ color: theme.subtleText, marginLeft: 6 }}>
                · {r.assessmentCode}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: theme.subtleText,
              }}
            >
              Last: {fmtDateTime(r.lastSubmittedAt)}
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: isDark ? "rgba(99,102,241,0.16)" : "#eef2ff",
                color: isDark ? "#a5b4fc" : "#4338ca",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              → {r.action}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ScorePill({
  pct,
  status,
}: {
  pct: number;
  status: "Pass" | "Fail";
}) {
  const isDark = getThemeMode() === "dark";
  const color = scoreColor(pct);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background:
          status === "Pass"
            ? isDark
              ? "rgba(16,185,129,0.14)"
              : "#dcfce7"
            : isDark
            ? "rgba(239,68,68,0.14)"
            : "#fee2e2",
        color,
      }}
    >
      {pct}% · {status}
    </span>
  );
}

// ── 6. PENDING ASSESSMENTS LIST ───────────────────────────────────────
function PendingAssessmentsList({ items }: { items: Assessment[] }) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((a) => (
        <div
          key={a.id}
          style={{
            ...softCardStyle(),
            padding: 14,
            borderLeft: "3px solid #f59e0b",
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: theme.subtleText,
              textTransform: "uppercase",
            }}
          >
            {a.code}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: theme.title,
              lineHeight: 1.3,
            }}
          >
            {a.title}
          </div>
          <div style={{ fontSize: 11, color: theme.subtleText }}>
            Awaiting first submission
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 7. BRANCH COMPARISON ──────────────────────────────────────────────
function BranchComparison({ rows }: { rows: BranchRow[] }) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}
      className="branch-compare-grid"
    >
      {rows.map((r, idx) => {
        const leading = idx === 0;
        return (
          <div
            key={r.branch}
            style={{
              ...cardStyle(),
              padding: 18,
              border: `1px solid ${
                leading ? "rgba(16,185,129,0.4)" : theme.cardBorder
              }`,
              background: leading
                ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)"
                : undefined,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: theme.title,
                  letterSpacing: "-0.01em",
                }}
              >
                🏬 {r.branch}
              </div>
              {leading && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    background: "rgba(16,185,129,0.16)",
                    color: "#10b981",
                    padding: "3px 8px",
                    borderRadius: 999,
                    letterSpacing: "0.06em",
                  }}
                >
                  ✦ LEADING
                </span>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
              }}
            >
              <KV label="Participants" value={r.participants} />
              <KV label="Submissions" value={r.submissions} />
              <KV
                label="Average"
                value={`${r.averagePct}%`}
                color={scoreColor(r.averagePct)}
              />
              <KV
                label="Pass Rate"
                value={`${r.passRate}%`}
                color={
                  r.passRate >= 80
                    ? "#10b981"
                    : r.passRate >= 60
                    ? "#f59e0b"
                    : "#ef4444"
                }
              />
              <KV
                label="Failed"
                value={r.failedParticipants}
                color={r.failedParticipants === 0 ? "#10b981" : "#ef4444"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 8. TRAINING FOCUS AREAS ───────────────────────────────────────────
function TrainingFocusAreas({ items }: { items: PerQuestionStat[] }) {
  const theme = getThemePalette();
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((q, idx) => {
        const accent =
          q.correctRate >= 40 ? "#f59e0b" : "#ef4444";
        const sentence = `${shortenText(q.text, 140)} — only ${q.correctRate}% answered correctly. Reinforce this topic in upcoming training.`;
        return (
          <div
            key={q.questionId + idx}
            style={{
              ...softCardStyle(),
              padding: "14px 16px",
              borderLeft: `3px solid ${accent}`,
              display: "grid",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: theme.subtleText,
                textTransform: "uppercase",
              }}
            >
              Focus Area {idx + 1} · {q.assessmentTitle}
            </div>
            <div
              style={{
                fontSize: 13,
                color: theme.title,
                lineHeight: 1.55,
              }}
            >
              {sentence}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 9. PARTICIPANTS BLOCK (per assessment) ────────────────────────────
function AssessmentParticipantsBlock({ row }: { row: AssessmentRow }) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const badge = badgeColor(row.badge);

  return (
    <div style={{ ...cardStyle(), padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${theme.cardBorder}`,
          background: theme.softCardBackground,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: theme.subtleText,
              textTransform: "uppercase",
            }}
          >
            {row.assessment.code}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: theme.title,
              lineHeight: 1.3,
            }}
          >
            {row.assessment.title}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: theme.subtleText }}>
            {row.uniqueParticipants} participant
            {row.uniqueParticipants === 1 ? "" : "s"} · avg{" "}
            {row.totalSubmissions ? `${row.averagePct}%` : "—"}
          </span>
          <span
            style={{
              ...badge,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              whiteSpace: "nowrap",
              letterSpacing: "0.04em",
            }}
          >
            {row.badge.toUpperCase()}
          </span>
        </div>
      </div>

      {row.perParticipant.length === 0 ? (
        <div
          style={{
            padding: 22,
            textAlign: "center",
            color: theme.subtleText,
            fontSize: 13,
          }}
        >
          No participants yet.
        </div>
      ) : (
        <>
          <div
            className="participants-table-desktop"
            style={{ padding: 0, overflowX: "auto" }}
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
                  <th style={th}>Best Score</th>
                  <th style={th}>Status</th>
                  <th style={th}>Last Submitted</th>
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
                      <div style={{ fontWeight: 700, color: theme.title }}>
                        {p.displayName}
                      </div>
                    </td>
                    <td style={td}>{p.branch}</td>
                    <td style={td}>{p.attempts}</td>
                    <td style={td}>
                      <strong style={{ color: scoreColor(p.bestPct) }}>
                        {p.bestPct}%
                      </strong>
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

          <div
            className="participants-cards-mobile"
            style={{ display: "none", gap: 8, padding: 14 }}
          >
            {row.perParticipant.map((p, idx) => (
              <div
                key={p.nameKey}
                style={{
                  ...softCardStyle(),
                  padding: 12,
                  display: "grid",
                  gap: 6,
                  borderLeft: `3px solid ${scoreColor(p.bestPct)}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: theme.title,
                      fontSize: 13,
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
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <KV label="Branch" value={p.branch} />
                  <KV
                    label="Best"
                    value={`${p.bestPct}%`}
                    color={scoreColor(p.bestPct)}
                  />
                  <KV label="Attempts" value={p.attempts} />
                  <KV
                    label="Last"
                    value={fmtDate(p.lastSubmittedAt)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
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

// ── 10. RECOMMENDED ACTIONS ───────────────────────────────────────────
function RecommendedActions({
  data,
}: {
  data: {
    overall: OverallStats;
    followUp: FollowUpRow[];
    pending: Assessment[];
    weakQuestions: PerQuestionStat[];
    branchRows: BranchRow[];
  };
}) {
  const theme = getThemePalette();
  const actions: { tone: "good" | "warn" | "bad"; text: string }[] = [];

  if (data.followUp.length > 0) {
    actions.push({
      tone: "bad",
      text: `Schedule retakes or targeted training for ${data.followUp.length} record${data.followUp.length === 1 ? "" : "s"} below ${FOLLOWUP_THRESHOLD}%. Prioritize participants with zero remaining attempts.`,
    });
  }
  if (data.pending.length > 0) {
    actions.push({
      tone: "warn",
      text: `Share assessment links for ${data.pending.length} pending section${data.pending.length === 1 ? "" : "s"} with the relevant teams and set a target completion date.`,
    });
  }
  if (data.weakQuestions.length > 0) {
    actions.push({
      tone: "warn",
      text: `Incorporate the ${data.weakQuestions.length} training focus area${data.weakQuestions.length === 1 ? "" : "s"} above into the next training session or refresher briefing.`,
    });
  }
  if (data.branchRows.length >= 2) {
    const top = data.branchRows[0];
    const bottom = data.branchRows[data.branchRows.length - 1];
    const gap = top.averagePct - bottom.averagePct;
    if (gap >= 5) {
      actions.push({
        tone: "warn",
        text: `Branch performance gap of ${Math.round(gap)} points between ${top.branch} (${top.averagePct}%) and ${bottom.branch} (${bottom.averagePct}%). Consider knowledge-sharing between the two teams.`,
      });
    }
  }
  if (
    data.overall.totalSubmissions > 0 &&
    data.overall.overallPassRate >= 85 &&
    data.followUp.length === 0
  ) {
    actions.push({
      tone: "good",
      text: `Overall pass rate of ${data.overall.overallPassRate}% indicates strong readiness across the team. Maintain current training cadence.`,
    });
  }
  if (actions.length === 0) {
    actions.push({
      tone: "good",
      text: "All key indicators are within expected ranges. No immediate action required — continue to monitor for new submissions.",
    });
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {actions.map((a, idx) => {
        const accent =
          a.tone === "bad"
            ? "#ef4444"
            : a.tone === "warn"
            ? "#f59e0b"
            : "#10b981";
        const bg =
          a.tone === "bad"
            ? "rgba(239,68,68,0.06)"
            : a.tone === "warn"
            ? "rgba(245,158,11,0.06)"
            : "rgba(16,185,129,0.06)";
        return (
          <div
            key={idx}
            style={{
              ...softCardStyle(),
              padding: "14px 16px",
              borderLeft: `3px solid ${accent}`,
              background: bg,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 18,
                lineHeight: 1.2,
                color: accent,
              }}
            >
              {a.tone === "bad" ? "▲" : a.tone === "warn" ? "●" : "✓"}
            </div>
            <div
              style={{
                fontSize: 13,
                color: theme.title,
                lineHeight: 1.6,
                flex: 1,
              }}
            >
              {a.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Detailed question analysis (optional toggle) ──────────────────────
function DetailedQuestionAnalysis({ row }: { row: AssessmentRow }) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";

  return (
    <div style={cardStyle()}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: theme.title,
          marginBottom: 12,
        }}
      >
        {row.assessment.title}
        <span
          style={{
            fontSize: 11,
            color: theme.subtleText,
            fontWeight: 600,
            marginLeft: 8,
          }}
        >
          · {row.assessment.code}
        </span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {row.perQuestion.map((q) => {
          const color =
            q.correctRate >= 80
              ? "#10b981"
              : q.correctRate >= 50
              ? "#f59e0b"
              : "#ef4444";
          return (
            <div key={q.questionId} style={{ ...softCardStyle(), padding: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 4,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: theme.title,
                    lineHeight: 1.4,
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
                  {shortenText(q.text || "(no text)", 200)}
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
                  height: 5,
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Reusable: section title ───────────────────────────────────────────
function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  const theme = getThemePalette();
  return (
    <section className="exec-section" style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingBottom: 4,
          borderBottom: `1px solid ${theme.cardBorder}`,
        }}
      >
        <div
          style={{
            width: 4,
            height: 22,
            background: accent || "#6366f1",
            borderRadius: 4,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: theme.title,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 12,
                color: theme.subtleText,
                marginTop: 1,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function PositiveNote({ children }: { children: React.ReactNode }) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        ...softCardStyle(),
        padding: "14px 18px",
        borderLeft: "3px solid #10b981",
        background: "rgba(16,185,129,0.06)",
        fontSize: 13,
        color: theme.title,
        lineHeight: 1.6,
      }}
    >
      {children}
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

function downloadCsv(perAssessment: AssessmentRow[]) {
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
  for (const r of perAssessment) {
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

// ── Print (executive A4 layout) ───────────────────────────────────────
function printFullReport(
  data: ReturnType<typeof buildReport>,
  generatedAt: string,
  includeDetailed: boolean
) {
  if (typeof window === "undefined") return;
  const { overall, perAssessment, followUp, pending, branchRows, weakQuestions } =
    data;
  const hasData = overall.totalSubmissions > 0;
  const period =
    overall.periodStart && overall.periodEnd
      ? `${fmtDate(overall.periodStart)} — ${fmtDate(overall.periodEnd)}`
      : "";

  const badgeCss = (b: AssessmentBadge) => {
    if (b === "Excellent")
      return "background:#dcfce7;color:#166534;border-color:#86efac;";
    if (b === "Good")
      return "background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;";
    if (b === "Needs Attention")
      return "background:#fef3c7;color:#92400e;border-color:#fcd34d;";
    return "background:#f1f5f9;color:#475569;border-color:#e2e8f0;";
  };
  const scoreCss = (pct: number) => {
    const c = scoreColor(pct);
    return `color:${c};font-weight:800;`;
  };

  // 4. Assessment summary cards
  const summaryCards = perAssessment
    .map((r) => {
      const hasD = r.totalSubmissions > 0;
      return `
      <div class="sum-card">
        <div class="sum-head">
          <div>
            <div class="sum-code">${escHtml(r.assessment.code)}</div>
            <div class="sum-title">${escHtml(r.assessment.title)}</div>
          </div>
          <span class="badge" style="${badgeCss(r.badge)}">${escHtml(r.badge.toUpperCase())}</span>
        </div>
        <div class="sum-grid">
          <div><div class="kv-k">Participants</div><div class="kv-v">${r.uniqueParticipants}</div></div>
          <div><div class="kv-k">Submissions</div><div class="kv-v">${r.totalSubmissions}</div></div>
          <div><div class="kv-k">Average</div><div class="kv-v" style="${hasD ? scoreCss(r.averagePct) : ""}">${hasD ? r.averagePct + "%" : "—"}</div></div>
          <div><div class="kv-k">Pass Rate</div><div class="kv-v">${hasD ? r.passRate + "%" : "—"}</div></div>
          <div><div class="kv-k">Highest</div><div class="kv-v" style="${hasD ? "color:#10b981;font-weight:800;" : ""}">${hasD ? r.highestPct + "%" : "—"}</div></div>
          <div><div class="kv-k">Lowest</div><div class="kv-v" style="${hasD ? scoreCss(r.lowestPct) : ""}">${hasD ? r.lowestPct + "%" : "—"}</div></div>
        </div>
        ${r.failedParticipants > 0 ? `<div class="failed-strip">⚠ ${r.failedParticipants} failed participant${r.failedParticipants === 1 ? "" : "s"}</div>` : ""}
      </div>
    `;
    })
    .join("");

  // 5. Follow-up table
  const followUpRows = followUp
    .map(
      (r) => `
    <tr>
      <td><strong>${escHtml(r.displayName)}</strong></td>
      <td>${escHtml(r.branch)}</td>
      <td>${escHtml(r.assessmentTitle)}<br><span class="dim">${escHtml(r.assessmentCode)}</span></td>
      <td><span style="${scoreCss(r.bestPct)}">${r.bestPct}%</span> · ${escHtml(r.status)}</td>
      <td>${escHtml(fmtDateTime(r.lastSubmittedAt))}</td>
      <td><span class="pill pill-indigo">${escHtml(r.action)}</span></td>
    </tr>
  `
    )
    .join("");

  // 6. Pending assessments
  const pendingHtml =
    pending.length === 0
      ? `<div class="ok-note">✓ All ${overall.totalAssessments} assessments are receiving submissions.</div>`
      : `<div class="pending-grid">${pending
          .map(
            (a) => `
        <div class="pending-card">
          <div class="sum-code">${escHtml(a.code)}</div>
          <div class="pending-title">${escHtml(a.title)}</div>
          <div class="dim">Awaiting first submission</div>
        </div>
      `
          )
          .join("")}</div>`;

  // 7. Branch comparison
  const branchHtml =
    branchRows.length >= 2
      ? `
    <div class="branch-grid">
      ${branchRows
        .map((b, idx) => {
          const leading = idx === 0;
          return `
        <div class="branch-card${leading ? " branch-leading" : ""}">
          <div class="branch-head">
            <div class="branch-name">🏬 ${escHtml(b.branch)}</div>
            ${leading ? `<span class="badge" style="background:#dcfce7;color:#166534;border-color:#86efac;">✦ LEADING</span>` : ""}
          </div>
          <div class="sum-grid">
            <div><div class="kv-k">Participants</div><div class="kv-v">${b.participants}</div></div>
            <div><div class="kv-k">Submissions</div><div class="kv-v">${b.submissions}</div></div>
            <div><div class="kv-k">Average</div><div class="kv-v" style="${scoreCss(b.averagePct)}">${b.averagePct}%</div></div>
            <div><div class="kv-k">Pass Rate</div><div class="kv-v">${b.passRate}%</div></div>
            <div><div class="kv-k">Failed</div><div class="kv-v" style="color:${b.failedParticipants === 0 ? "#10b981" : "#ef4444"};font-weight:800;">${b.failedParticipants}</div></div>
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `
      : "";

  // 8. Training focus
  const focusHtml =
    weakQuestions.length === 0
      ? `<div class="ok-note">✓ All assessed topics meet or exceed the ${WEAK_QUESTION_THRESHOLD}% correctness threshold.</div>`
      : `<div class="focus-list">${weakQuestions
          .map(
            (q, i) => `
        <div class="focus-card">
          <div class="focus-tag">Focus Area ${i + 1} · ${escHtml(q.assessmentTitle)}</div>
          <div class="focus-text">${escHtml(shortenText(q.text, 160))} — only ${q.correctRate}% answered correctly. Reinforce this topic in upcoming training.</div>
        </div>
      `
          )
          .join("")}</div>`;

  // 9. Participants tables per assessment
  const participantsHtml = perAssessment
    .map((r) => {
      if (r.perParticipant.length === 0) {
        return `
        <div class="part-block">
          <div class="part-head">
            <div>
              <div class="sum-code">${escHtml(r.assessment.code)}</div>
              <div class="sum-title">${escHtml(r.assessment.title)}</div>
            </div>
            <span class="badge" style="${badgeCss(r.badge)}">${escHtml(r.badge.toUpperCase())}</span>
          </div>
          <div class="dim" style="padding:14px 18px;">No participants yet.</div>
        </div>
      `;
      }
      const rows = r.perParticipant
        .map(
          (p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escHtml(p.displayName)}</strong></td>
          <td>${escHtml(p.branch)}</td>
          <td>${p.attempts}</td>
          <td><span style="${scoreCss(p.bestPct)}">${p.bestPct}%</span></td>
          <td><span class="pill ${p.bestStatus === "Pass" ? "pill-ok" : "pill-bad"}">${escHtml(p.bestStatus)}</span></td>
          <td>${escHtml(fmtDateTime(p.lastSubmittedAt))}</td>
        </tr>
      `
        )
        .join("");
      return `
        <div class="part-block">
          <div class="part-head">
            <div>
              <div class="sum-code">${escHtml(r.assessment.code)}</div>
              <div class="sum-title">${escHtml(r.assessment.title)}</div>
            </div>
            <span class="badge" style="${badgeCss(r.badge)}">${escHtml(r.badge.toUpperCase())}</span>
          </div>
          <table class="part-table">
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Branch</th><th>Attempts</th>
                <th>Best</th><th>Status</th><th>Last Submitted</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    })
    .join("");

  // Recommended actions
  const recActions: { tone: string; text: string }[] = [];
  if (followUp.length > 0)
    recActions.push({
      tone: "bad",
      text: `Schedule retakes or targeted training for ${followUp.length} record${followUp.length === 1 ? "" : "s"} below ${FOLLOWUP_THRESHOLD}%.`,
    });
  if (pending.length > 0)
    recActions.push({
      tone: "warn",
      text: `Share assessment links for ${pending.length} pending section${pending.length === 1 ? "" : "s"} with the relevant teams.`,
    });
  if (weakQuestions.length > 0)
    recActions.push({
      tone: "warn",
      text: `Incorporate the ${weakQuestions.length} training focus area${weakQuestions.length === 1 ? "" : "s"} into the next training session.`,
    });
  if (branchRows.length >= 2) {
    const gap = branchRows[0].averagePct - branchRows[branchRows.length - 1].averagePct;
    if (gap >= 5)
      recActions.push({
        tone: "warn",
        text: `Branch performance gap of ${Math.round(gap)} points between ${branchRows[0].branch} and ${branchRows[branchRows.length - 1].branch}. Consider cross-branch knowledge sharing.`,
      });
  }
  if (hasData && overall.overallPassRate >= 85 && followUp.length === 0)
    recActions.push({
      tone: "good",
      text: `Overall pass rate of ${overall.overallPassRate}% indicates strong readiness. Maintain current training cadence.`,
    });
  if (recActions.length === 0)
    recActions.push({
      tone: "good",
      text: "All key indicators are within expected ranges.",
    });

  const recActionsHtml = recActions
    .map((a) => {
      const accent =
        a.tone === "bad" ? "#ef4444" : a.tone === "warn" ? "#f59e0b" : "#10b981";
      const bg =
        a.tone === "bad"
          ? "rgba(239,68,68,0.06)"
          : a.tone === "warn"
          ? "rgba(245,158,11,0.06)"
          : "rgba(16,185,129,0.06)";
      const sym = a.tone === "bad" ? "▲" : a.tone === "warn" ? "●" : "✓";
      return `<div class="rec" style="border-left-color:${accent};background:${bg};"><span class="rec-sym" style="color:${accent};">${sym}</span><span>${escHtml(a.text)}</span></div>`;
    })
    .join("");

  // Optional detailed question analysis
  const detailedHtml = includeDetailed
    ? `
    <div class="page-break"></div>
    <div class="sec-title">Detailed Question Analysis</div>
    <div class="dim" style="margin-bottom:10px;">Per-question correct rate across each assessment.</div>
    ${perAssessment
      .filter((r) => r.perQuestion.length > 0)
      .map(
        (r) => `
      <div class="part-block">
        <div class="part-head">
          <div>
            <div class="sum-code">${escHtml(r.assessment.code)}</div>
            <div class="sum-title">${escHtml(r.assessment.title)}</div>
          </div>
        </div>
        <div style="padding:14px;display:grid;gap:6px;">
          ${r.perQuestion
            .map((q) => {
              const c =
                q.correctRate >= 80
                  ? "#10b981"
                  : q.correctRate >= 50
                  ? "#f59e0b"
                  : "#ef4444";
              return `<div class="q-row">
                <div class="q-row-head">
                  <div class="q-text"><span class="q-no">Q${q.index + 1}.</span> ${escHtml(shortenText(q.text || "(no text)", 200))}</div>
                  <div class="q-pct" style="color:${c};">${q.correctRate}%</div>
                </div>
                <div class="q-bar"><div class="q-fill" style="width:${q.correctRate}%;background:${c};"></div></div>
              </div>`;
            })
            .join("")}
        </div>
      </div>
    `
      )
      .join("")}
  `
    : "";

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
  .dim { color: #64748b; font-size: 11px; }
  .page-break { page-break-before: always; }

  /* Cover */
  .cover {
    background: linear-gradient(135deg,#0f1c35 0%,#1e293b 55%,#312e81 100%);
    color: #f1f5f9;
    border-radius: 12px;
    text-align: center;
    padding: 46px 36px;
    margin-bottom: 22px;
    border-top: 4px solid #f0c040;
    position: relative;
  }
  .cover-tag { font-size:10px;font-weight:800;letter-spacing:0.35em;color:#f0c040;margin-bottom:10px; }
  .cover-brand-1 { font-size:22px;font-weight:900;letter-spacing:0.06em;color:#fff;line-height:1.2; }
  .cover-brand-2 { font-size:14px;font-weight:700;color:#c7d2fe;font-style:italic;margin-top:6px; }
  .cover-rule { width:60px;height:1px;background:rgba(240,192,64,0.6);margin:22px auto; }
  .cover-doc-title {
    font-size:18px;font-weight:900;color:#fff;letter-spacing:0.22em;
    padding:8px 18px;border-top:1px solid rgba(255,255,255,0.18);
    border-bottom:1px solid rgba(255,255,255,0.18);display:inline-block;
  }
  .cover-meta { margin-top:20px;font-size:12px;color:#cbd5e1;line-height:1.8; }
  .cover-meta strong { color:#fff; }
  .cover-conf {
    margin-top:18px;display:inline-block;padding:5px 14px;
    font-size:10px;font-weight:800;letter-spacing:0.18em;color:#f0c040;
    border:1px solid rgba(240,192,64,0.5);border-radius:999px;
  }

  /* Section header */
  .sec-title {
    font-size: 13px; font-weight: 900; color: #0f172a;
    border-left: 4px solid #6366f1; padding-left: 10px;
    margin: 18px 0 10px 0; letter-spacing: 0.02em;
  }
  .sec-sub { font-size:11px;color:#64748b;margin:-6px 0 10px 14px; }

  /* Executive summary */
  .exec-block {
    background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
    padding:16px 18px;margin-bottom:14px;font-size:12px;line-height:1.7;
  }
  .exec-bullets {
    display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;
  }
  .exec-bullet {
    background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:10px 12px;border-left:3px solid #6366f1;
  }
  .exec-bullet-k {
    font-size:9px;font-weight:800;color:#64748b;
    text-transform:uppercase;letter-spacing:0.06em;
  }
  .exec-bullet-v { font-size:12px;font-weight:800;color:#0f172a;margin-top:2px; }
  .exec-bullet-h { font-size:10px;color:#64748b;margin-top:2px; }

  /* Management dashboard */
  .dash-grid {
    display:grid;grid-template-columns:repeat(7,1fr);gap:8px;
    margin-bottom:14px;
  }
  .dash-tile {
    background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:10px;
  }
  .dash-tile-k {
    font-size:9px;font-weight:800;color:#64748b;
    text-transform:uppercase;letter-spacing:0.06em;
  }
  .dash-tile-v { font-size:18px;font-weight:900;color:#0f172a;margin-top:2px; }

  /* Assessment summary cards */
  .sum-grid-outer {
    display:grid;grid-template-columns:repeat(2,1fr);gap:10px;
    margin-bottom:12px;
  }
  .sum-card {
    background:#fff;border:1px solid #e2e8f0;border-radius:10px;
    padding:12px 14px;page-break-inside:avoid;break-inside:avoid;
  }
  .sum-head { display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px; }
  .sum-code {
    font-size:9px;font-weight:800;letter-spacing:0.1em;
    color:#64748b;text-transform:uppercase;
  }
  .sum-title { font-size:13px;font-weight:900;color:#0f172a;line-height:1.3; }
  .badge {
    padding:3px 8px;border-radius:999px;font-size:9px;font-weight:800;
    border:1px solid transparent;white-space:nowrap;letter-spacing:0.04em;
  }
  .sum-grid {
    display:grid;grid-template-columns:repeat(3,1fr);gap:6px;
  }
  .kv-k {
    font-size:9px;font-weight:800;color:#64748b;
    text-transform:uppercase;letter-spacing:0.05em;
  }
  .kv-v { font-size:13px;font-weight:900;color:#0f172a;margin-top:1px; }
  .failed-strip {
    margin-top:8px;background:rgba(239,68,68,0.06);
    border:1px solid rgba(239,68,68,0.25);border-radius:6px;
    padding:6px 10px;font-size:11px;color:#ef4444;font-weight:700;
  }

  /* Follow-up */
  .followup-table { width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px; }
  .followup-table th {
    background:#f1f5f9;color:#475569;font-weight:800;
    font-size:9px;text-transform:uppercase;letter-spacing:0.06em;
    text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;
  }
  .followup-table td {
    padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#0f172a;vertical-align:middle;
  }
  .pill {
    display:inline-block;padding:2px 7px;border-radius:999px;
    font-size:9px;font-weight:800;border:1px solid transparent;white-space:nowrap;
  }
  .pill-ok { background:#dcfce7;color:#166534;border-color:#86efac; }
  .pill-bad { background:#fee2e2;color:#991b1b;border-color:#fecaca; }
  .pill-indigo { background:#eef2ff;color:#4338ca;border-color:#c7d2fe; }

  /* Pending */
  .ok-note {
    background:rgba(16,185,129,0.06);border-left:3px solid #10b981;
    border-radius:6px;padding:10px 14px;font-size:11px;color:#0f172a;margin-bottom:12px;
  }
  .pending-grid {
    display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;
  }
  .pending-card {
    background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:10px 12px;border-left:3px solid #f59e0b;
  }
  .pending-title { font-size:12px;font-weight:800;color:#0f172a;line-height:1.3;margin:2px 0; }

  /* Branch */
  .branch-grid {
    display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px;
  }
  .branch-card {
    background:#fff;border:1px solid #e2e8f0;border-radius:10px;
    padding:12px 14px;
  }
  .branch-leading {
    background:linear-gradient(135deg,rgba(16,185,129,0.06) 0%,rgba(16,185,129,0.02) 100%);
    border-color:rgba(16,185,129,0.4);
  }
  .branch-head { display:flex;justify-content:space-between;align-items:center;margin-bottom:8px; }
  .branch-name { font-size:13px;font-weight:900;color:#0f172a; }

  /* Training focus */
  .focus-list { display:grid;gap:8px;margin-bottom:12px; }
  .focus-card {
    background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:10px 14px;border-left:3px solid #f59e0b;
  }
  .focus-tag {
    font-size:9px;font-weight:800;letter-spacing:0.06em;
    color:#64748b;text-transform:uppercase;margin-bottom:3px;
  }
  .focus-text { font-size:11px;color:#0f172a;line-height:1.55; }

  /* Participants per assessment */
  .part-block {
    background:#fff;border:1px solid #e2e8f0;border-radius:10px;
    margin-bottom:10px;overflow:hidden;page-break-inside:avoid;break-inside:avoid;
  }
  .part-head {
    padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;
    display:flex;justify-content:space-between;align-items:center;gap:10px;
  }
  .part-table { width:100%;border-collapse:collapse;font-size:10px; }
  .part-table th {
    background:#f1f5f9;color:#475569;font-weight:800;
    font-size:9px;text-transform:uppercase;letter-spacing:0.06em;
    text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;
  }
  .part-table td {
    padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#0f172a;
  }

  /* Recommendations */
  .rec {
    background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #10b981;
    border-radius:6px;padding:10px 14px;font-size:11px;color:#0f172a;
    line-height:1.55;margin-bottom:6px;display:flex;gap:10px;align-items:flex-start;
  }
  .rec-sym { font-size:14px;font-weight:900;line-height:1; }

  /* Question detail */
  .q-row { background:#f8fafc;border-radius:6px;padding:7px 10px; }
  .q-row-head { display:flex;justify-content:space-between;gap:8px;align-items:flex-start; }
  .q-no { color:#64748b;font-weight:800;margin-right:4px; }
  .q-text { font-size:10px;color:#0f172a;line-height:1.4;flex:1; }
  .q-pct { font-size:10px;font-weight:800;white-space:nowrap; }
  .q-bar { height:4px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:4px; }
  .q-fill { height:100%;border-radius:999px; }

  /* Footer */
  .footer {
    margin-top:24px;border-top:2px solid #1e293b;padding-top:10px;
    display:flex;justify-content:space-between;font-size:10px;color:#475569;
  }
</style>
</head>
<body>
  <div class="doc">
    <!-- Cover -->
    <div class="cover">
      <div class="cover-tag">✦ OFFICIAL EXECUTIVE REPORT ✦</div>
      <div class="cover-brand-1">EMIRATES INTERNATIONAL HOLDING GROUP</div>
      <div class="cover-brand-2">Philippine Supermarket</div>
      <div class="cover-rule"></div>
      <div class="cover-doc-title">FULL ASSESSMENTS REPORT</div>
      <div class="cover-meta">
        <div>Generated <strong>${escHtml(generatedAt)}</strong></div>
        ${period ? `<div>Report Period <strong>${escHtml(period)}</strong></div>` : ""}
      </div>
      <div class="cover-conf">CONFIDENTIAL · INTERNAL USE</div>
    </div>

    <!-- Executive summary -->
    <div class="sec-title">Executive Summary</div>
    <div class="exec-block">
      ${
        hasData
          ? `Across <strong>${overall.totalAssessments}</strong> assessments, <strong>${overall.totalParticipants}</strong> employees submitted <strong>${overall.totalSubmissions}</strong> attempts. The overall average score is <strong style="color:${scoreColor(overall.overallAvg)}">${overall.overallAvg}%</strong> with a pass rate of <strong>${overall.overallPassRate}%</strong>. ${followUp.length > 0 ? `<strong style="color:#ef4444">${followUp.length}</strong> record${followUp.length === 1 ? "" : "s"} require follow-up.` : "No participants currently require follow-up."}`
          : `No submissions have been recorded yet. This report reflects only the structure of the ${overall.totalAssessments} assessment${overall.totalAssessments === 1 ? "" : "s"} currently in the system.`
      }
      <div class="exec-bullets">
        <div class="exec-bullet" style="border-left-color:#10b981">
          <div class="exec-bullet-k">Best Performing Assessment</div>
          <div class="exec-bullet-v">${escHtml(overall.bestAssessment ? overall.bestAssessment.assessment.title : "—")}</div>
          <div class="exec-bullet-h">${overall.bestAssessment ? `${overall.bestAssessment.averagePct}% average` : "No data yet"}</div>
        </div>
        <div class="exec-bullet" style="border-left-color:#ef4444">
          <div class="exec-bullet-k">Lowest Performing Assessment</div>
          <div class="exec-bullet-v">${escHtml(overall.worstAssessment ? overall.worstAssessment.assessment.title : "—")}</div>
          <div class="exec-bullet-h">${overall.worstAssessment ? `${overall.worstAssessment.averagePct}% average` : "No data yet"}</div>
        </div>
        <div class="exec-bullet" style="border-left-color:${overall.failedParticipantsCount === 0 ? "#10b981" : "#ef4444"}">
          <div class="exec-bullet-k">Failed Participants</div>
          <div class="exec-bullet-v">${overall.failedParticipantsCount}</div>
          <div class="exec-bullet-h">${overall.failedParticipantsCount === 0 ? "No follow-up needed" : `Below ${FOLLOWUP_THRESHOLD}% threshold`}</div>
        </div>
        <div class="exec-bullet" style="border-left-color:${overall.pendingSectionsCount === 0 ? "#10b981" : "#f59e0b"}">
          <div class="exec-bullet-k">Sections with No Participants</div>
          <div class="exec-bullet-v">${overall.pendingSectionsCount}</div>
          <div class="exec-bullet-h">${overall.pendingSectionsCount === 0 ? "All assessments engaged" : "Awaiting submissions"}</div>
        </div>
      </div>
    </div>

    <!-- Management dashboard -->
    <div class="sec-title">Management Dashboard</div>
    <div class="dash-grid">
      <div class="dash-tile"><div class="dash-tile-k">Assessments</div><div class="dash-tile-v">${overall.totalAssessments}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Participants</div><div class="dash-tile-v">${overall.totalParticipants}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Submissions</div><div class="dash-tile-v">${overall.totalSubmissions}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Average</div><div class="dash-tile-v" style="${hasData ? scoreCss(overall.overallAvg) : ""}">${hasData ? overall.overallAvg + "%" : "—"}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Pass Rate</div><div class="dash-tile-v">${hasData ? overall.overallPassRate + "%" : "—"}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Failed</div><div class="dash-tile-v" style="color:${overall.failedParticipantsCount === 0 ? "#10b981" : "#ef4444"};">${overall.failedParticipantsCount}</div></div>
      <div class="dash-tile"><div class="dash-tile-k">Pending</div><div class="dash-tile-v" style="color:${overall.pendingSectionsCount === 0 ? "#10b981" : "#f59e0b"};">${overall.pendingSectionsCount}</div></div>
    </div>

    <!-- Assessment summary cards -->
    <div class="sec-title">Assessment Summary</div>
    <div class="sum-grid-outer">${summaryCards}</div>

    <!-- Follow-up -->
    <div class="sec-title">Participants Requiring Follow-Up</div>
    ${
      followUp.length === 0
        ? `<div class="ok-note">✓ Every participant scored at or above ${FOLLOWUP_THRESHOLD}%. No follow-up training needed.</div>`
        : `<table class="followup-table">
            <thead>
              <tr>
                <th>Employee</th><th>Branch</th><th>Assessment</th>
                <th>Best Score</th><th>Last Submitted</th><th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>${followUpRows}</tbody>
          </table>`
    }

    <!-- Pending -->
    <div class="sec-title">Assessments Pending Participation</div>
    ${pendingHtml}

    <!-- Branch -->
    ${branchHtml ? `<div class="sec-title">Branch Comparison</div>${branchHtml}` : ""}

    <!-- Training focus -->
    <div class="sec-title">Training Focus Areas</div>
    ${focusHtml}

    <!-- Participants per assessment -->
    <div class="sec-title">Participants by Assessment</div>
    ${participantsHtml}

    <!-- Recommended actions -->
    <div class="sec-title">Recommended Actions</div>
    ${recActionsHtml}

    ${detailedHtml}

    <div class="footer">
      <div>Confidential · Internal Use · Emirates International Holding Group © ${new Date().getFullYear()}</div>
      <div>Generated ${escHtml(generatedAt)}</div>
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
