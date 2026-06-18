"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "./lib/firebase";
import {
  Assessment,
  AssessmentQuestion,
  AssessmentSubmission,
  buttonStyle,
  cardStyle,
  COMPANY_NAME,
  dangerButtonStyle,
  EmptyState,
  escHtml,
  getThemeMode,
  getThemePalette,
  inputStyle,
  SectionTitle,
  selectStyle,
  smallButtonStyle,
  SkeletonCard,
  softCardStyle,
  StatBox,
  SYSTEM_NAME,
  ToastType,
} from "./portal-utils";

export type AssessmentDraftQuestion = {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  // AI-only hint shown in the editor; never persisted to Firestore
  explanation?: string;
};

export type AssessmentDraft = {
  title: string;
  description: string;
  passingPercentage: number;
  maxAttempts: number;
  isActive: boolean;
  questions: AssessmentDraftQuestion[];
};

export type AdminAssessmentsProps = {
  assessments: Assessment[];
  submissions: AssessmentSubmission[];
  loadingAssessments: boolean;
  loadingSubmissions: boolean;
  onCreateAssessment: (
    draft: AssessmentDraft
  ) => Promise<{ id: string; code: string }>;
  onUpdateAssessment: (id: string, draft: AssessmentDraft) => Promise<void>;
  onDeleteAssessment: (id: string, title: string) => void;
  onToggleAssessmentActive: (id: string, nextActive: boolean) => Promise<void>;
  onSoftDeleteSubmission: (submissionId: string) => Promise<void>;
  showToast: (type: ToastType, message: string) => void;
};

const emptyQuestion = (): AssessmentDraftQuestion => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  text: "",
  options: ["", ""],
  correctAnswerIndex: 0,
});

const emptyDraft = (): AssessmentDraft => ({
  title: "",
  description: "",
  passingPercentage: 70,
  maxAttempts: 2,
  isActive: true,
  questions: [emptyQuestion()],
});

function publicAssessmentUrl(code: string): string {
  if (typeof window === "undefined") return `/assessment/${code}`;
  return `${window.location.origin}/assessment/${code}`;
}

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

export default function AdminAssessments({
  assessments,
  submissions: rawSubmissions,
  loadingAssessments,
  loadingSubmissions,
  onCreateAssessment,
  onUpdateAssessment,
  onDeleteAssessment,
  onToggleAssessmentActive,
  onSoftDeleteSubmission,
  showToast,
}: AdminAssessmentsProps) {
  // Single point of truth: anything deleted is hidden from results, stats, and
  // print everywhere it matters.
  const submissions = useMemo(
    () => rawSubmissions.filter((s) => s.deleted !== true),
    [rawSubmissions]
  );
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";

  type View =
    | { type: "list" }
    | { type: "results"; assessmentId: string }
    | { type: "submission"; submissionId: string };

  const [view, setView] = useState<View>({ type: "list" });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssessmentDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ code: string; url: string } | null>(null);
  const [search, setSearch] = useState("");

  // AI Generate-from-File state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateFile, setGenerateFile] = useState<File | null>(null);
  const generateInFlight = useRef(false);

  const submissionsByAssessment = useMemo(() => {
    const map = new Map<string, AssessmentSubmission[]>();
    for (const s of submissions) {
      const arr = map.get(s.assessmentId) || [];
      arr.push(s);
      map.set(s.assessmentId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    }
    return map;
  }, [submissions]);

  const handleStartCreate = () => {
    setEditorMode("create");
    setEditingId(null);
    setDraft(emptyDraft());
    setCreatedInfo(null);
    setEditorOpen(true);
  };

  const handleOpenGenerate = () => {
    setGenerateFile(null);
    setGenerateOpen(true);
  };

  const handleRunGenerate = async () => {
    if (!generateFile) return;
    if (generateInFlight.current) return;
    generateInFlight.current = true;
    setGenerateLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast("error", "Please sign in again.");
        return;
      }
      const fd = new FormData();
      fd.append("file", generateFile);
      const res = await fetch("/api/assessments/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        showToast("error", "Could not read the AI response. Please try again.");
        return;
      }
      console.log("[assess-gen] response", res.status, data);

      if (!res.ok) {
        const code = typeof data?.code === "string" ? data.code : "";
        if (res.status === 429 || code === "quota_exceeded") {
          showToast("error", "AI quota reached. Please try again in a minute.");
          return;
        }
        if (code === "file_invalid") {
          showToast("error", "Unsupported file. Upload a PDF or an image (JPG/PNG).");
          return;
        }
        if (res.status === 401 || code === "unauthorized") {
          showToast("error", "Please sign in again.");
          return;
        }
        if (code === "no_questions") {
          showToast(
            "error",
            "Could not extract any usable questions from this file. Try a clearer source."
          );
          return;
        }
        showToast("error", "Could not generate the assessment. Please try again.");
        return;
      }

      const apiDraft = (data?.draft ?? {}) as {
        title?: string;
        description?: string;
        passingPercentage?: number;
        maxAttempts?: number;
        questions?: {
          questionText?: string;
          options?: string[];
          correctAnswerIndex?: number;
          explanation?: string | null;
        }[];
      };

      const rawQuestions = Array.isArray(apiDraft.questions) ? apiDraft.questions : [];
      const mappedQuestions: AssessmentDraftQuestion[] = rawQuestions
        .map((q, i) => {
          const text = typeof q.questionText === "string" ? q.questionText : "";
          const opts = Array.isArray(q.options)
            ? q.options.filter((o): o is string => typeof o === "string")
            : [];
          const correct =
            typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0;
          return {
            id: `q_ai_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            text,
            options: opts,
            correctAnswerIndex: Math.max(0, Math.min(opts.length - 1, correct)),
            explanation: typeof q.explanation === "string" ? q.explanation : undefined,
          };
        })
        .filter((q) => q.text && q.options.length >= 2);

      if (mappedQuestions.length === 0) {
        showToast(
          "error",
          "AI returned no valid questions. Try a clearer document or write the assessment manually."
        );
        return;
      }

      const nextDraft: AssessmentDraft = {
        title: (apiDraft.title || "").trim() || "Untitled Assessment",
        description: (apiDraft.description || "").trim(),
        passingPercentage:
          typeof apiDraft.passingPercentage === "number" &&
          apiDraft.passingPercentage >= 0 &&
          apiDraft.passingPercentage <= 100
            ? Math.round(apiDraft.passingPercentage)
            : 70,
        maxAttempts:
          typeof apiDraft.maxAttempts === "number" &&
          apiDraft.maxAttempts >= 1 &&
          apiDraft.maxAttempts <= 10
            ? Math.round(apiDraft.maxAttempts)
            : 2,
        isActive: true,
        questions: mappedQuestions,
      };

      // Close upload modal, open the existing editor in CREATE mode pre-filled
      setGenerateOpen(false);
      setGenerateFile(null);
      setEditorMode("create");
      setEditingId(null);
      setDraft(nextDraft);
      setCreatedInfo(null);
      setEditorOpen(true);
      showToast(
        "success",
        `AI generated ${mappedQuestions.length} question${mappedQuestions.length === 1 ? "" : "s"}. Review and approve.`
      );
    } catch (err) {
      console.error("Error generating assessment:", err);
      showToast("error", "Could not generate the assessment. Please try again.");
    } finally {
      setGenerateLoading(false);
      generateInFlight.current = false;
    }
  };

  const handleStartEdit = (a: Assessment) => {
    const hasSubs = (submissionsByAssessment.get(a.id) || []).length > 0;
    if (hasSubs) {
      showToast(
        "error",
        "This assessment already has submissions and cannot be edited."
      );
      return;
    }
    setEditorMode("edit");
    setEditingId(a.id);
    setDraft({
      title: a.title,
      description: a.description,
      passingPercentage: a.passingPercentage,
      maxAttempts: a.maxAttempts,
      isActive: a.isActive,
      questions: a.questions.map((q) => ({
        id: q.id,
        text: q.text,
        options: [...q.options],
        correctAnswerIndex: q.correctAnswerIndex,
      })),
    });
    setCreatedInfo(null);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const validation = validateDraft(draft);
    if (validation) {
      showToast("error", validation);
      return;
    }

    setSaving(true);
    try {
      if (editorMode === "create") {
        const { code } = await onCreateAssessment(draft);
        const url = publicAssessmentUrl(code);
        setCreatedInfo({ code, url });
        showToast("success", "Assessment created.");
      } else if (editingId) {
        await onUpdateAssessment(editingId, draft);
        showToast("success", "Assessment updated.");
        setEditorOpen(false);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Error saving assessment.";
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredAssessments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assessments;
    return assessments.filter((a) =>
      [a.title, a.description, a.code, a.createdByName]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [assessments, search]);

  // Stats
  const totalAssessments = assessments.length;
  const totalActive = assessments.filter((a) => a.isActive).length;
  const totalSubmissions = submissions.length;
  const totalPasses = submissions.filter((s) => s.status === "Pass").length;

  if (view.type === "submission") {
    const sub = submissions.find((s) => s.id === view.submissionId);
    if (!sub) {
      return (
        <div style={cardStyle()}>
          <div style={{ marginBottom: 12 }}>
            <button style={smallButtonStyle()} onClick={() => setView({ type: "list" })}>
              ← Back to Assessments
            </button>
          </div>
          <EmptyState
            title="Submission not found"
            description="This submission may have been removed."
          />
        </div>
      );
    }
    const assessment = assessments.find((a) => a.id === sub.assessmentId);
    return (
      <SubmissionDetail
        submission={sub}
        assessment={assessment}
        onBack={() => setView({ type: "results", assessmentId: sub.assessmentId })}
      />
    );
  }

  if (view.type === "results") {
    const assessment = assessments.find((a) => a.id === view.assessmentId);
    const subs = (submissionsByAssessment.get(view.assessmentId) || []).slice();
    return (
      <AssessmentResults
        assessment={assessment}
        submissions={subs}
        loading={loadingSubmissions}
        onBack={() => setView({ type: "list" })}
        onOpenSubmission={(id) => setView({ type: "submission", submissionId: id })}
        onSoftDeleteSubmission={onSoftDeleteSubmission}
        showToast={showToast}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Top stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatBox title="Total Assessments" value={totalAssessments} hint={`${totalActive} active`} />
        <StatBox title="Submissions" value={totalSubmissions} hint="across all assessments" />
        <StatBox title="Pass rate" value={totalSubmissions === 0 ? "—" : `${Math.round((totalPasses / totalSubmissions) * 100)}%`} hint={`${totalPasses}/${totalSubmissions} passed`} />
      </div>

      {/* Toolbar */}
      <div style={{ ...cardStyle(), padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            placeholder="Search by title, code, or creator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle(), maxWidth: 340 }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={buttonStyle(false)} onClick={handleOpenGenerate}>
              🪄 Generate from File
            </button>
            <button style={buttonStyle(true)} onClick={handleStartCreate}>
              ＋ New Assessment
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div>
        <SectionTitle>Assessments</SectionTitle>
        {loadingAssessments ? (
          <div style={{ display: "grid", gap: 12 }}>
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </div>
        ) : filteredAssessments.length === 0 ? (
          <EmptyState
            title="No assessments yet"
            description="Create your first assessment to share a public link with employees or external participants."
            icon="📝"
            action={{ label: "Create assessment", onClick: handleStartCreate }}
          />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredAssessments.map((a) => {
              const subs = submissionsByAssessment.get(a.id) || [];
              const passes = subs.filter((s) => s.status === "Pass").length;
              const url = publicAssessmentUrl(a.code);
              const avgPct =
                subs.length === 0
                  ? 0
                  : Math.round(subs.reduce((sum, s) => sum + s.percentage, 0) / subs.length);
              return (
                <div key={a.id} style={softCardStyle()}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: theme.title }}>
                          {a.title}
                        </div>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: a.isActive
                              ? (isDark ? "rgba(16,185,129,0.14)" : "#dcfce7")
                              : (isDark ? "rgba(100,116,139,0.14)" : "#f3f4f6"),
                            color: a.isActive
                              ? (isDark ? "#34d399" : "#166534")
                              : (isDark ? "#94a3b8" : "#374151"),
                            border: `1px solid ${a.isActive ? (isDark ? "rgba(16,185,129,0.3)" : "#86efac") : theme.cardBorder}`,
                          }}
                        >
                          {a.isActive ? "Active" : "Disabled"}
                        </span>
                      </div>
                      {a.description && (
                        <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 4, lineHeight: 1.6 }}>
                          {a.description}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>📋 {a.questions.length} question{a.questions.length === 1 ? "" : "s"}</span>
                        <span>🎯 Passing: {a.passingPercentage}%</span>
                        <span>🔁 {a.maxAttempts} attempt{a.maxAttempts === 1 ? "" : "s"}</span>
                        <span>👥 {subs.length} submission{subs.length === 1 ? "" : "s"}</span>
                        {subs.length > 0 && (
                          <span>
                            ✅ {passes} pass · ❌ {subs.length - passes} fail · ⌀ {avgPct}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <button
                        style={smallButtonStyle()}
                        onClick={() => setView({ type: "results", assessmentId: a.id })}
                      >
                        Results
                      </button>
                      <button
                        style={smallButtonStyle()}
                        onClick={() => handleStartEdit(a)}
                        title={subs.length > 0 ? "Cannot edit after submissions exist" : "Edit"}
                      >
                        Edit
                      </button>
                      <button
                        style={smallButtonStyle()}
                        onClick={async () => {
                          try {
                            await onToggleAssessmentActive(a.id, !a.isActive);
                            showToast("success", a.isActive ? "Assessment disabled." : "Assessment enabled.");
                          } catch (err) {
                            console.error(err);
                            showToast("error", "Could not update status.");
                          }
                        }}
                      >
                        {a.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        style={dangerButtonStyle()}
                        onClick={() => onDeleteAssessment(a.id, a.title)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Link box */}
                  <div
                    style={{
                      marginTop: 14,
                      background: theme.fileCardBg,
                      border: `1px solid ${theme.fileCardBorder}`,
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 700, letterSpacing: "0.05em" }}>
                        CODE: <span style={{ color: theme.title, fontWeight: 900 }}>{a.code}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.mutedText,
                          fontWeight: 600,
                          marginTop: 4,
                          wordBreak: "break-all",
                        }}
                      >
                        {url}
                      </div>
                    </div>
                    <CopyButton text={url} onCopy={() => showToast("success", "Link copied.")} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editorOpen && (
        <AssessmentEditor
          mode={editorMode}
          draft={draft}
          setDraft={setDraft}
          createdInfo={createdInfo}
          saving={saving}
          onClose={() => {
            setEditorOpen(false);
            setCreatedInfo(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Generate-from-File modal */}
      {generateOpen && (
        <GenerateFromFileModal
          file={generateFile}
          setFile={setGenerateFile}
          loading={generateLoading}
          onClose={() => {
            if (generateLoading) return;
            setGenerateOpen(false);
            setGenerateFile(null);
          }}
          onRun={handleRunGenerate}
        />
      )}
    </div>
  );
}

function GenerateFromFileModal({
  file,
  setFile,
  loading,
  onClose,
  onRun,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  loading: boolean;
  onClose: () => void;
  onRun: () => Promise<void>;
}) {
  const theme = getThemePalette();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: theme.modalOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2500,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardStyle(),
          width: "100%",
          maxWidth: 540,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>
            🪄 Generate Assessment from File
          </div>
          <button style={smallButtonStyle()} onClick={onClose} disabled={loading}>
            Close
          </button>
        </div>

        <p style={{ fontSize: 13, color: theme.subtleText, lineHeight: 1.7, marginTop: 0 }}>
          Upload a PDF or image. The AI will read it and propose a quiz draft. Nothing is published
          until you review and approve.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />

        <div
          style={{
            background: theme.fileCardBg,
            border: `1px dashed ${theme.fileCardBorder}`,
            borderRadius: 14,
            padding: 18,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.title, wordBreak: "break-word" }}>
                📄 {file.name}
              </div>
              <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 4 }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
              <button
                style={{ ...smallButtonStyle(), marginTop: 10 }}
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={loading}
              >
                Choose different file
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
              <button
                style={buttonStyle(false)}
                onClick={() => inputRef.current?.click()}
                disabled={loading}
              >
                Choose file
              </button>
              <div style={{ fontSize: 12, color: theme.subtleText, marginTop: 8 }}>
                PDF or image · up to 15 MB
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(99,102,241,0.08)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#4338ca",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "2px solid rgba(99,102,241,0.3)",
                borderTopColor: "#4338ca",
                animation: "assessGenSpin 0.7s linear infinite",
              }}
            />
            Reading the file and generating questions…
            <style>{`@keyframes assessGenSpin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 18,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button style={smallButtonStyle()} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            style={{
              ...buttonStyle(true),
              opacity: file && !loading ? 1 : 0.55,
              cursor: file && !loading ? "pointer" : "not-allowed",
            }}
            onClick={onRun}
            disabled={!file || loading}
          >
            {loading ? "Generating…" : "Generate draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function validateDraft(d: AssessmentDraft): string | null {
  if (!d.title.trim()) return "Title is required.";
  if (d.passingPercentage < 0 || d.passingPercentage > 100)
    return "Passing percentage must be between 0 and 100.";
  if (d.maxAttempts < 1 || d.maxAttempts > 10) return "Attempts must be between 1 and 10.";
  if (d.questions.length === 0) return "Add at least one question.";
  for (const [i, q] of d.questions.entries()) {
    if (!q.text.trim()) return `Question ${i + 1} text is required.`;
    if (q.options.length < 2) return `Question ${i + 1} needs at least 2 options.`;
    if (q.options.length > 4) return `Question ${i + 1} can have at most 4 options.`;
    for (const [j, opt] of q.options.entries()) {
      if (!opt.trim()) return `Question ${i + 1} option ${j + 1} is empty.`;
    }
    if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
      return `Question ${i + 1}: pick a correct answer.`;
    }
  }
  return null;
}

function AssessmentEditor({
  mode,
  draft,
  setDraft,
  createdInfo,
  saving,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  draft: AssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssessmentDraft>>;
  createdInfo: { code: string; url: string } | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const theme = getThemePalette();

  const setField = <K extends keyof AssessmentDraft>(key: K, value: AssessmentDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const setQuestion = (idx: number, patch: Partial<AssessmentDraftQuestion>) => {
    setDraft((prev) => {
      const next = [...prev.questions];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, questions: next };
    });
  };

  const addOption = (qIdx: number) => {
    setDraft((prev) => {
      const next = [...prev.questions];
      const q = next[qIdx];
      if (q.options.length >= 4) return prev;
      next[qIdx] = { ...q, options: [...q.options, ""] };
      return { ...prev, questions: next };
    });
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    setDraft((prev) => {
      const next = [...prev.questions];
      const q = next[qIdx];
      if (q.options.length <= 2) return prev;
      const newOpts = q.options.filter((_, i) => i !== oIdx);
      let correct = q.correctAnswerIndex;
      if (oIdx === q.correctAnswerIndex) correct = 0;
      else if (oIdx < q.correctAnswerIndex) correct = q.correctAnswerIndex - 1;
      next[qIdx] = { ...q, options: newOpts, correctAnswerIndex: correct };
      return { ...prev, questions: next };
    });
  };

  const addQuestion = () => {
    setDraft((prev) => ({ ...prev, questions: [...prev.questions, emptyQuestion()] }));
  };

  const removeQuestion = (idx: number) => {
    setDraft((prev) => {
      if (prev.questions.length <= 1) return prev;
      return { ...prev, questions: prev.questions.filter((_, i) => i !== idx) };
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: theme.modalOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2500,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardStyle(),
          width: "100%",
          maxWidth: 760,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>
            {mode === "create" ? "New Assessment" : "Edit Assessment"}
          </div>
          <button style={smallButtonStyle()} onClick={onClose}>
            Close
          </button>
        </div>

        {createdInfo ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #86efac",
                borderRadius: 14,
                padding: 14,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              ✅ Assessment created. Share the link below with anyone you want to assess.
            </div>
            <div>
              <label style={fieldLabel}>Code</label>
              <div
                style={{
                  ...inputStyle(),
                  fontFamily: "monospace",
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                }}
              >
                {createdInfo.code}
              </div>
            </div>
            <div>
              <label style={fieldLabel}>Public link</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={createdInfo.url}
                  readOnly
                  style={{ ...inputStyle(), flex: 1 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <CopyButton text={createdInfo.url} primary />
              </div>
            </div>
            <button style={buttonStyle(true)} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={fieldLabel}>Title *</label>
                <input
                  value={draft.title}
                  onChange={(e) => setField("title", e.target.value)}
                  style={inputStyle()}
                  placeholder="e.g. Onboarding Quiz"
                />
              </div>
              <div>
                <label style={fieldLabel}>Description / Instructions (optional)</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  style={{ ...inputStyle(), resize: "vertical" }}
                  placeholder="What participants should know before they start."
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "#92400e",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  ⚠️ Please review the instructions before saving.
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <label style={fieldLabel}>Passing percentage</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.passingPercentage}
                    onChange={(e) =>
                      setField("passingPercentage", Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    style={inputStyle()}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Max attempts per person</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.maxAttempts}
                    onChange={(e) =>
                      setField("maxAttempts", Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                    }
                    style={inputStyle()}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Active</label>
                  <select
                    value={draft.isActive ? "yes" : "no"}
                    onChange={(e) => setField("isActive", e.target.value === "yes")}
                    style={selectStyle()}
                  >
                    <option value="yes">Active</option>
                    <option value="no">Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.title }}>Questions</div>
                <button style={smallButtonStyle()} onClick={addQuestion}>
                  ＋ Add question
                </button>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {draft.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    style={{
                      background: theme.fileCardBg,
                      border: `1px solid ${theme.fileCardBorder}`,
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: theme.subtleText }}>
                        Question {qIdx + 1}
                      </div>
                      <button
                        style={dangerButtonStyle()}
                        onClick={() => removeQuestion(qIdx)}
                        disabled={draft.questions.length <= 1}
                        title={draft.questions.length <= 1 ? "At least one question is required" : "Remove"}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      value={q.text}
                      onChange={(e) => setQuestion(qIdx, { text: e.target.value })}
                      placeholder="Question text"
                      style={inputStyle()}
                    />
                    {q.explanation && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "rgba(99,102,241,0.06)",
                          border: "1px solid rgba(99,102,241,0.2)",
                          color: "#4338ca",
                          fontSize: 12,
                          fontWeight: 600,
                          lineHeight: 1.6,
                        }}
                      >
                        🪄 AI explanation: <span style={{ fontWeight: 500 }}>{q.explanation}</span>
                      </div>
                    )}
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              color: theme.mutedText,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <input
                              type="radio"
                              name={`correct_${q.id}`}
                              checked={q.correctAnswerIndex === oIdx}
                              onChange={() => setQuestion(qIdx, { correctAnswerIndex: oIdx })}
                              style={{ accentColor: "#4338ca" }}
                            />
                            Correct
                          </label>
                          <input
                            value={opt}
                            onChange={(e) => {
                              const next = [...q.options];
                              next[oIdx] = e.target.value;
                              setQuestion(qIdx, { options: next });
                            }}
                            placeholder={`Option ${oIdx + 1}`}
                            style={{ ...inputStyle(), flex: 1 }}
                          />
                          <button
                            style={smallButtonStyle()}
                            onClick={() => removeOption(qIdx, oIdx)}
                            disabled={q.options.length <= 2}
                            title={q.options.length <= 2 ? "At least 2 options" : "Remove option"}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        style={smallButtonStyle()}
                        onClick={() => addOption(qIdx)}
                        disabled={q.options.length >= 4}
                      >
                        ＋ Add option {q.options.length >= 4 ? "(max 4)" : ""}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button style={smallButtonStyle()} onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button style={buttonStyle(true)} onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Create assessment" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CopyButton({
  text,
  onCopy,
  primary,
}: {
  text: string;
  onCopy?: () => void;
  primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const doCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopy?.();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <button style={primary ? buttonStyle(true) : smallButtonStyle()} onClick={doCopy}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function AssessmentResults({
  assessment,
  submissions,
  loading,
  onBack,
  onOpenSubmission,
  onSoftDeleteSubmission,
  showToast,
}: {
  assessment: Assessment | undefined;
  submissions: AssessmentSubmission[];
  loading: boolean;
  onBack: () => void;
  onOpenSubmission: (id: string) => void;
  onSoftDeleteSubmission: (submissionId: string) => Promise<void>;
  showToast: (type: ToastType, message: string) => void;
}) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssessmentSubmission | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onSoftDeleteSubmission(deleteTarget.id);
      showToast("success", "Result deleted successfully.");
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "";
      if (/permission|insufficient|denied/i.test(msg)) {
        showToast(
          "error",
          "You don't have permission to delete this result. Contact the admin."
        );
      } else {
        showToast("error", msg || "Could not delete the result.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.participantName.toLowerCase().includes(q) ||
        (s.branch ? s.branch.toLowerCase().includes(q) : false)
    );
  }, [submissions, search]);

  if (!assessment) {
    return (
      <div style={cardStyle()}>
        <div style={{ marginBottom: 12 }}>
          <button style={smallButtonStyle()} onClick={onBack}>
            ← Back to Assessments
          </button>
        </div>
        <EmptyState
          title="Assessment not found"
          description="This assessment may have been deleted."
        />
      </div>
    );
  }

  const passes = submissions.filter((s) => s.status === "Pass").length;
  const fails = submissions.length - passes;
  const avgPct =
    submissions.length === 0
      ? 0
      : Math.round(submissions.reduce((sum, s) => sum + s.percentage, 0) / submissions.length);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button style={smallButtonStyle()} onClick={onBack}>
          ← Back to Assessments
        </button>
        <button
          style={buttonStyle(false)}
          onClick={() => printAllResults(assessment, submissions)}
          disabled={submissions.length === 0}
        >
          🖨️ Print all results
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>{assessment.title}</div>
        {assessment.description && (
          <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 4 }}>
            {assessment.description}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: theme.subtleText, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>📋 {assessment.questions.length} questions</span>
          <span>🎯 Passing: {assessment.passingPercentage}%</span>
          <span>🔁 Max attempts: {assessment.maxAttempts}</span>
          <span>🔑 Code: <strong>{assessment.code}</strong></span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <StatBox title="Submissions" value={submissions.length} hint="total" />
        <StatBox title="Passes" value={passes} hint={submissions.length ? `${Math.round((passes / submissions.length) * 100)}%` : "—"} />
        <StatBox title="Fails" value={fails} hint={submissions.length ? `${Math.round((fails / submissions.length) * 100)}%` : "—"} />
        <StatBox title="Average score" value={submissions.length ? `${avgPct}%` : "—"} hint="across all attempts" />
      </div>

      <div style={{ ...cardStyle(), padding: 16 }}>
        <input
          placeholder="Search by name or branch…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle(), maxWidth: 340 }}
        />
      </div>

      {loading ? (
        <SkeletonCard rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Share the assessment link to start collecting responses."
          icon="📨"
        />
      ) : (
        <div style={{ ...cardStyle(), padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: isDark ? "#0f172a" : "#f9fafb", color: theme.mutedText }}>
                <th style={th}>Name</th>
                <th style={th}>Branch</th>
                <th style={th}>Attempt</th>
                <th style={th}>Score</th>
                <th style={th}>%</th>
                <th style={th}>Status</th>
                <th style={th}>Submitted</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: theme.title }}>{s.participantName}</div>
                  </td>
                  <td style={td}>{s.branch || (s.phoneNumber ? `Legacy · ${s.phoneNumber}` : "—")}</td>
                  <td style={td}>{s.attemptNumber}</td>
                  <td style={td}>{s.score} / {s.totalQuestions}</td>
                  <td style={td}>{s.percentage}%</td>
                  <td style={td}>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        background:
                          s.status === "Pass"
                            ? (isDark ? "rgba(16,185,129,0.14)" : "#dcfce7")
                            : (isDark ? "rgba(239,68,68,0.14)" : "#fee2e2"),
                        color:
                          s.status === "Pass"
                            ? (isDark ? "#34d399" : "#166534")
                            : (isDark ? "#f87171" : "#991b1b"),
                      }}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td style={td}>{fmtDateTime(s.submittedAt)}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={smallButtonStyle()} onClick={() => onOpenSubmission(s.id)}>
                        View
                      </button>
                      <button
                        style={dangerButtonStyle()}
                        onClick={() => setDeleteTarget(s)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteSubmissionModal
          submission={deleteTarget}
          assessment={assessment}
          deleting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

function DeleteSubmissionModal({
  submission,
  assessment,
  deleting,
  onClose,
  onConfirm,
}: {
  submission: AssessmentSubmission;
  assessment: Assessment;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const theme = getThemePalette();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: theme.modalOverlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2600,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardStyle(),
          width: "100%",
          maxWidth: 520,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 20, fontWeight: 900, color: theme.title, marginBottom: 6 }}>
          Delete result
        </div>
        <p style={{ fontSize: 13, color: theme.subtleText, lineHeight: 1.7, margin: 0 }}>
          Are you sure you want to delete this result? This action cannot be undone.
        </p>

        <div
          style={{
            marginTop: 14,
            background: theme.fileCardBg,
            border: `1px solid ${theme.fileCardBorder}`,
            borderRadius: 12,
            padding: 14,
            display: "grid",
            gap: 8,
            fontSize: 13,
          }}
        >
          <Row k="Participant" v={submission.participantName} />
          <Row
            k="Branch"
            v={submission.branch || (submission.phoneNumber ? `Legacy · ${submission.phoneNumber}` : "—")}
          />
          <Row k="Assessment" v={assessment.title} />
          <Row k="Attempt" v={`${submission.attemptNumber} of ${assessment.maxAttempts}`} />
          <Row
            k="Score"
            v={`${submission.score} / ${submission.totalQuestions} · ${submission.percentage}% · ${submission.status}`}
          />
          <Row k="Submitted" v={fmtDateTime(submission.submittedAt)} />
        </div>

        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
            color: "#92400e",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          ℹ️ Deleting this result frees up one attempt for the participant if they were at the cap.
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 18,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button style={smallButtonStyle()} onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            style={{
              ...dangerButtonStyle(),
              padding: "10px 16px",
              fontWeight: 800,
              fontSize: 14,
            }}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  const theme = getThemePalette();
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
      <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {k}
      </div>
      <div style={{ fontSize: 13, color: theme.title, fontWeight: 700, textAlign: "right", maxWidth: "70%", wordBreak: "break-word" }}>
        {v}
      </div>
    </div>
  );
}

function SubmissionDetail({
  submission,
  assessment,
  onBack,
}: {
  submission: AssessmentSubmission;
  assessment: Assessment | undefined;
  onBack: () => void;
}) {
  const theme = getThemePalette();
  const isDark = getThemeMode() === "dark";

  // Use questions stored on the assessment if available, otherwise reconstruct from submission.correctAnswers
  const questions: AssessmentQuestion[] = assessment
    ? assessment.questions
    : submission.correctAnswers.map((c, i) => ({
        id: `q_${i}`,
        text: `Question ${i + 1}`,
        options: [],
        correctAnswerIndex: c,
      }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button style={smallButtonStyle()} onClick={onBack}>
          ← Back to results
        </button>
        <button
          style={buttonStyle(false)}
          onClick={() => printSingleResult(submission, assessment)}
        >
          🖨️ Print result
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontSize: 20, fontWeight: 900, color: theme.title }}>
          {submission.assessmentTitle}
        </div>
        <div style={{ fontSize: 13, color: theme.subtleText, marginTop: 4 }}>
          Attempt {submission.attemptNumber} · Submitted {fmtDateTime(submission.submittedAt)}
        </div>
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <StatBox
            title="Participant"
            value={submission.participantName}
            hint={
              submission.branch ||
              (submission.phoneNumber ? `Legacy · ${submission.phoneNumber}` : "—")
            }
          />
          <StatBox title="Score" value={`${submission.score} / ${submission.totalQuestions}`} hint="correct answers" />
          <StatBox title="Percentage" value={`${submission.percentage}%`} hint={`Passing ${assessment?.passingPercentage ?? "—"}%`} />
          <StatBox title="Status" value={submission.status} hint={submission.status === "Pass" ? "Above passing mark" : "Below passing mark"} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <SectionTitle>Answers</SectionTitle>
        {questions.map((q, qIdx) => {
          const chosen = submission.answers[qIdx];
          const correct = q.correctAnswerIndex;
          const ok = chosen === correct;
          return (
            <div
              key={q.id}
              style={{
                ...softCardStyle(),
                borderLeft: `4px solid ${ok ? "#10b981" : "#ef4444"}`,
              }}
            >
              <div style={{ fontSize: 12, color: theme.subtleText, fontWeight: 700, marginBottom: 4 }}>
                Question {qIdx + 1} · {ok ? "Correct" : "Incorrect"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.title }}>{q.text}</div>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {q.options.length > 0 ? (
                  q.options.map((opt, oIdx) => {
                    const isChosen = oIdx === chosen;
                    const isCorrect = oIdx === correct;
                    let bg = isDark ? "#0f172a" : "#f9fafb";
                    let color = theme.mutedText;
                    let border = theme.cardBorder;
                    let suffix = "";
                    if (isCorrect) {
                      bg = isDark ? "rgba(16,185,129,0.14)" : "#dcfce7";
                      color = isDark ? "#34d399" : "#166534";
                      border = isDark ? "rgba(16,185,129,0.3)" : "#86efac";
                      suffix = "  (correct answer)";
                    }
                    if (isChosen && !isCorrect) {
                      bg = isDark ? "rgba(239,68,68,0.14)" : "#fee2e2";
                      color = isDark ? "#f87171" : "#991b1b";
                      border = isDark ? "rgba(239,68,68,0.3)" : "#fecaca";
                      suffix = "  (their answer)";
                    } else if (isChosen && isCorrect) {
                      suffix = "  (their answer · correct)";
                    }
                    return (
                      <div
                        key={oIdx}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {opt}
                        <span style={{ fontWeight: 700, opacity: 0.8 }}>{suffix}</span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 12, color: theme.subtleText }}>
                    Their answer: option {chosen + 1} · Correct: option {correct + 1}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Print helpers (HTML window pattern, matches existing employee report style) ────
function printSingleResult(s: AssessmentSubmission, assessment: Assessment | undefined) {
  const html = buildSingleResultHtml(s, assessment);
  openPrintWindow(html);
}

function printAllResults(assessment: Assessment, submissions: AssessmentSubmission[]) {
  const html = buildAllResultsHtml(assessment, submissions);
  openPrintWindow(html);
}

function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function buildSingleResultHtml(
  s: AssessmentSubmission,
  assessment: Assessment | undefined
): string {
  const questions: AssessmentQuestion[] = assessment
    ? assessment.questions
    : s.correctAnswers.map((c, i) => ({
        id: `q_${i}`,
        text: `Question ${i + 1}`,
        options: [],
        correctAnswerIndex: c,
      }));

  const branchDisplay =
    s.branch || (s.phoneNumber ? `Legacy · ${s.phoneNumber}` : "—");

  const passClass = s.status === "Pass" ? "status-pass" : "status-fail";

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Assessment Result — ${escHtml(s.participantName)}</title>
<style>${printCss()}</style></head><body><div class="page">
  ${officialHeaderHtml("Assessment Result Report")}

  <h2 class="sec">Assessment Information</h2>
  <table class="info">
    <tr><th>Assessment Title</th><td>${escHtml(s.assessmentTitle)}</td></tr>
    <tr><th>Assessment Code</th><td>${escHtml(s.assessmentCode || assessment?.code || "—")}</td></tr>
    <tr><th>Passing Percentage</th><td>${assessment?.passingPercentage ?? "—"}%</td></tr>
    <tr><th>Total Questions</th><td>${s.totalQuestions}</td></tr>
    <tr><th>Submitted Date</th><td>${escHtml(fmtDateTime(s.submittedAt))}</td></tr>
  </table>

  <h2 class="sec">Participant Information</h2>
  <table class="info">
    <tr><th>Participant Name</th><td>${escHtml(s.participantName)}</td></tr>
    <tr><th>Branch</th><td>${escHtml(branchDisplay)}</td></tr>
    <tr><th>Attempt Number</th><td>${s.attemptNumber} of ${assessment?.maxAttempts ?? "—"}</td></tr>
    <tr><th>Result Status</th><td><span class="status ${passClass}">${escHtml(s.status === "Pass" ? "PASS" : "FAIL")}</span></td></tr>
    <tr><th>Score</th><td>${s.score} / ${s.totalQuestions}</td></tr>
    <tr><th>Percentage</th><td>${s.percentage}%</td></tr>
  </table>

  <h2 class="sec">Result Summary</h2>
  <div class="summary">
    <div class="summary-row">
      <div class="summary-cell">
        <div class="summary-lbl">Score</div>
        <div class="summary-val">${s.score} / ${s.totalQuestions}</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Percentage</div>
        <div class="summary-val">${s.percentage}%</div>
      </div>
      <div class="summary-cell">
        <div class="summary-lbl">Status</div>
        <div class="summary-val ${passClass}">${escHtml(s.status === "Pass" ? "PASS" : "FAIL")}</div>
      </div>
    </div>
  </div>

  <h2 class="sec">Questions and Answers</h2>
  ${questions
    .map((q, qIdx) => {
      const chosen = s.answers[qIdx];
      const correct = q.correctAnswerIndex;
      const ok = chosen === correct;
      const selectedText =
        chosen >= 0 && chosen < q.options.length
          ? q.options[chosen]
          : `Option ${chosen + 1}`;
      const correctText =
        correct >= 0 && correct < q.options.length
          ? q.options[correct]
          : `Option ${correct + 1}`;
      return `<div class="q">
        <div class="q-num">Question ${qIdx + 1}</div>
        <div class="q-text">${escHtml(q.text)}</div>
        <table class="qa">
          <tr><th>Selected answer</th><td>${escHtml(selectedText)}</td></tr>
          <tr><th>Correct answer</th><td>${escHtml(correctText)}</td></tr>
          <tr><th>Result</th><td><span class="${ok ? "result-correct" : "result-wrong"}">${ok ? "Correct" : "Wrong"}</span></td></tr>
        </table>
      </div>`;
    })
    .join("")}

  ${footerHtml()}
  ${printActionsHtml()}
</div></body></html>`;
}

function buildAllResultsHtml(
  assessment: Assessment,
  submissions: AssessmentSubmission[]
): string {
  // Defense in depth: even though the caller already filters, exclude any
  // soft-deleted submission here too.
  const live = submissions.filter((s) => s.deleted !== true);
  const sorted = [...live].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  const passes = sorted.filter((s) => s.status === "Pass").length;
  const fails = sorted.length - passes;
  const avg =
    sorted.length === 0
      ? 0
      : Math.round(sorted.reduce((sum, s) => sum + s.percentage, 0) / sorted.length);

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Assessment Summary — ${escHtml(assessment.title)}</title>
<style>${printCss()}</style></head><body><div class="page">
  ${officialHeaderHtml("Assessment Summary Report")}

  <h2 class="sec">Assessment Information</h2>
  <table class="info">
    <tr><th>Assessment Title</th><td>${escHtml(assessment.title)}</td></tr>
    <tr><th>Assessment Code</th><td>${escHtml(assessment.code)}</td></tr>
    <tr><th>Passing Percentage</th><td>${assessment.passingPercentage}%</td></tr>
    <tr><th>Total Questions</th><td>${assessment.questions.length}</td></tr>
    <tr><th>Max Attempts per Participant</th><td>${assessment.maxAttempts}</td></tr>
  </table>

  <h2 class="sec">Overall Summary</h2>
  <table class="info">
    <tr><th>Total Submissions</th><td>${sorted.length}</td></tr>
    <tr><th>Passes</th><td>${passes}</td></tr>
    <tr><th>Fails</th><td>${fails}</td></tr>
    <tr><th>Average Percentage</th><td>${sorted.length ? avg + "%" : "—"}</td></tr>
  </table>

  <h2 class="sec">All Submissions</h2>
  <table class="tbl">
    <thead><tr>
      <th>Participant Name</th>
      <th>Branch</th>
      <th>Attempt</th>
      <th>Score</th>
      <th>%</th>
      <th>Status</th>
      <th>Submitted</th>
    </tr></thead>
    <tbody>
      ${sorted
        .map(
          (s) => `<tr>
            <td>${escHtml(s.participantName)}</td>
            <td>${escHtml(s.branch || (s.phoneNumber ? `Legacy · ${s.phoneNumber}` : "—"))}</td>
            <td>${s.attemptNumber}</td>
            <td>${s.score} / ${s.totalQuestions}</td>
            <td>${s.percentage}%</td>
            <td><span class="status ${s.status === "Pass" ? "status-pass" : "status-fail"}">${escHtml(s.status === "Pass" ? "PASS" : "FAIL")}</span></td>
            <td>${escHtml(fmtDateTime(s.submittedAt))}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>

  ${footerHtml()}
  ${printActionsHtml()}
</div></body></html>`;
}

function officialHeaderHtml(reportTitle: string): string {
  return `<header class="report-hdr">
    <div class="brand-block">
      <div class="brand-mark">PS</div>
      <div>
        <div class="brand-name">Philippine Supermarket</div>
        <div class="brand-sub">A Project of ${escHtml(COMPANY_NAME)}</div>
      </div>
    </div>
    <h1 class="report-title">${escHtml(reportTitle)}</h1>
    <div class="report-date">Issued: ${escHtml(
      new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    )}</div>
  </header>`;
}

function footerHtml(): string {
  return `<footer class="report-ftr">
    <div>Philippine Supermarket — A Project of ${escHtml(COMPANY_NAME)}</div>
    <div>Document generated by ${escHtml(SYSTEM_NAME)}</div>
  </footer>`;
}

function printActionsHtml(): string {
  return `<div class="no-print" style="margin-top:24px;text-align:right">
    <button onclick="window.print()" style="padding:10px 16px;border:none;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer">🖨️ Print</button>
    <button onclick="window.close()" style="padding:10px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;font-weight:600;cursor:pointer;margin-left:8px">Close</button>
  </div>`;
}

function printCss(): string {
  return `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:"Times New Roman",Georgia,serif;background:#f3f4f6;color:#111827;padding:24px;line-height:1.55}
    .page{max-width:820px;margin:0 auto;background:#fff;padding:48px 52px;box-shadow:0 4px 12px rgba(15,23,42,0.08)}

    .report-hdr{border-bottom:2px solid #111827;padding-bottom:14px;margin-bottom:24px}
    .brand-block{display:flex;align-items:center;gap:14px}
    .brand-mark{width:54px;height:54px;border:2px solid #111827;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-weight:900;font-size:20px;letter-spacing:0.05em}
    .brand-name{font-size:20px;font-weight:900;letter-spacing:0.01em}
    .brand-sub{font-size:12px;color:#4b5563;font-style:italic;margin-top:2px}
    .report-title{font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;margin:18px 0 4px;color:#111827}
    .report-date{font-size:11px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase}

    .sec{font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#111827;border-bottom:1px solid #d1d5db;padding-bottom:6px;margin:24px 0 12px}

    .info{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:6px}
    .info th{text-align:left;padding:6px 12px 6px 0;font-weight:700;color:#374151;width:38%;vertical-align:top;border-bottom:1px solid #f3f4f6}
    .info td{padding:6px 0;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6;word-break:break-word}
    .info tr:last-child th,.info tr:last-child td{border-bottom:none}

    .summary{border:1px solid #111827;padding:14px 18px;margin-bottom:6px}
    .summary-row{display:flex;justify-content:space-between;gap:24px}
    .summary-cell{text-align:center;flex:1}
    .summary-lbl{font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#4b5563;font-weight:700}
    .summary-val{font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;color:#111827;margin-top:4px}
    .summary-val.status-pass,.status.status-pass{color:#15803d}
    .summary-val.status-fail,.status.status-fail{color:#b91c1c}
    .status{display:inline-block;padding:2px 9px;border:1.5px solid currentColor;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:900;letter-spacing:0.08em}

    .q{border:1px solid #d1d5db;padding:12px 16px;margin-bottom:10px;page-break-inside:avoid;break-inside:avoid}
    .q-num{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7280;font-weight:800;letter-spacing:0.06em;text-transform:uppercase}
    .q-text{font-size:14.5px;font-weight:700;color:#111827;margin:4px 0 8px;line-height:1.45}
    .qa{width:100%;border-collapse:collapse;font-size:13px}
    .qa th{width:30%;text-align:left;padding:4px 12px 4px 0;color:#4b5563;font-weight:600;vertical-align:top}
    .qa td{padding:4px 0;color:#111827;font-weight:600;word-break:break-word}
    .result-correct{font-family:Arial,Helvetica,sans-serif;color:#15803d;font-weight:900;letter-spacing:0.04em;text-transform:uppercase}
    .result-wrong{font-family:Arial,Helvetica,sans-serif;color:#b91c1c;font-weight:900;letter-spacing:0.04em;text-transform:uppercase}

    .tbl{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}
    .tbl th,.tbl td{padding:6px 8px;text-align:left;border:1px solid #d1d5db}
    .tbl th{background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#111827;font-weight:800}

    .report-ftr{margin-top:32px;padding-top:12px;border-top:1px solid #d1d5db;display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#6b7280;font-style:italic}

    @page{size:A4;margin:14mm}
    @media print{
      body{background:#fff;padding:0}
      .page{box-shadow:none;padding:0;max-width:none}
      .no-print{display:none!important}
      .q{page-break-inside:avoid;break-inside:avoid}
      .tbl tr{page-break-inside:avoid;break-inside:avoid}
    }
  `;
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  verticalAlign: "middle",
};
