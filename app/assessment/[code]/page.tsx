"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { AssessmentSubmissionStatus } from "../../portal-utils";

// ── Public-page types (assessment without correct answers) ───────────
type PublicQuestion = {
  id: string;
  text: string;
  options: string[];
};

type PublicAssessment = {
  id: string;
  title: string;
  description: string;
  passingPercentage: number;
  maxAttempts: number;
  code: string;
  questions: PublicQuestion[];
  isActive: boolean;
};

const BRANCHES = ["PS Muraqqabat", "PS Karama"] as const;
type Branch = (typeof BRANCHES)[number];

function isValidName(raw: string): boolean {
  return raw.trim().length >= 2;
}

type Stage =
  | "loading"
  | "not_found"
  | "inactive"
  | "intro"
  | "max_attempts"
  | "checking"
  | "questions"
  | "submitting"
  | "result"
  | "error";

type LocalAnswer = number | null;

export default function PublicAssessmentPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code || "").trim();

  const [stage, setStage] = useState<Stage>("loading");
  const [assessment, setAssessment] = useState<PublicAssessment | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [participantName, setParticipantName] = useState("");
  const [branch, setBranch] = useState<Branch | "">("");
  const [touchedName, setTouchedName] = useState(false);
  const [touchedBranch, setTouchedBranch] = useState(false);

  const [answers, setAnswers] = useState<LocalAnswer[]>([]);
  const [previousAttempts, setPreviousAttempts] = useState(0);

  const [result, setResult] = useState<{
    score: number;
    total: number;
    percentage: number;
    status: AssessmentSubmissionStatus;
    attempt: number;
  } | null>(null);

  const submitInFlight = useRef(false);

  // Fetch assessment by code via the public API (no auth needed)
  useEffect(() => {
    if (!code) {
      setStage("not_found");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public-assessment/get?code=${encodeURIComponent(code)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok) {
          const c = typeof data?.code === "string" ? data.code : "";
          const detail = typeof data?.detail === "string" ? data.detail : "";
          if (c === "not_found") {
            setStage("not_found");
            return;
          }
          if (c === "inactive") {
            setStage("inactive");
            return;
          }
          if (c === "no_questions") {
            setStage("error");
            setErrorMsg("This assessment has no questions yet.");
            return;
          }
          if (c === "server_misconfigured") {
            setStage("error");
            setErrorMsg(
              detail
                ? `Server configuration issue. ${detail} Please ask the administrator to fix this.`
                : "Server is not fully configured. Please contact the administrator."
            );
            return;
          }
          setStage("error");
          setErrorMsg(
            detail
              ? `Could not load the assessment: ${detail}`
              : "Could not load the assessment. Please try again later."
          );
          return;
        }

        const a = data?.assessment as PublicAssessment | undefined;
        if (!a) {
          setStage("error");
          setErrorMsg("Could not load the assessment. Please try again later.");
          return;
        }

        setAssessment(a);
        setAnswers(Array.from({ length: a.questions.length }, () => null));
        setStage("intro");
      } catch (err) {
        console.error("Error loading assessment:", err);
        if (!cancelled) {
          setStage("error");
          setErrorMsg("Could not load the assessment. Please try again later.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const nameValid = isValidName(participantName);
  const branchValid = branch === "PS Muraqqabat" || branch === "PS Karama";

  const checkAttemptsAndProceed = async () => {
    if (!assessment) return;
    if (!nameValid || !branchValid) {
      setTouchedName(true);
      setTouchedBranch(true);
      return;
    }

    setStage("checking");
    try {
      const res = await fetch("/api/public-assessment/check-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: assessment.id,
          participantName,
          branch,
        }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const c = typeof data?.code === "string" ? data.code : "";
        const detail = typeof data?.detail === "string" ? data.detail : "";
        if (c === "inactive") {
          setStage("inactive");
          return;
        }
        if (c === "not_found") {
          setStage("not_found");
          return;
        }
        if (c === "server_misconfigured") {
          setStage("error");
          setErrorMsg(
            detail
              ? `Server configuration issue. ${detail} Please ask the administrator to fix this.`
              : "Server is not fully configured. Please contact the administrator."
          );
          return;
        }
        setStage("error");
        setErrorMsg(
          detail
            ? `Could not verify attempt count: ${detail}`
            : "Could not verify attempt count. Please try again."
        );
        return;
      }

      const used = typeof data?.attemptsUsed === "number" ? data.attemptsUsed : 0;
      setPreviousAttempts(used);

      if (!data?.canAttempt) {
        setStage("max_attempts");
        return;
      }

      setStage("questions");
    } catch (err) {
      console.error("Error checking attempts:", err);
      setStage("error");
      setErrorMsg("Could not verify attempt count. Please try again.");
    }
  };

  const allAnswered = useMemo(
    () => answers.length > 0 && answers.every((a) => a !== null),
    [answers]
  );

  const submitAnswers = async () => {
    if (!assessment) return;
    if (!allAnswered) return;
    if (submitInFlight.current) return;
    submitInFlight.current = true;

    setStage("submitting");
    try {
      const res = await fetch("/api/public-assessment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: assessment.id,
          participantName,
          branch,
          answers,
        }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const c = typeof data?.code === "string" ? data.code : "";
        const detail = typeof data?.detail === "string" ? data.detail : "";
        if (c === "max_attempts") {
          const used = typeof data?.attemptsUsed === "number" ? data.attemptsUsed : 0;
          setPreviousAttempts(used);
          setStage("max_attempts");
          return;
        }
        if (c === "inactive") {
          setStage("inactive");
          return;
        }
        if (c === "not_found") {
          setStage("not_found");
          return;
        }
        if (c === "bad_answers") {
          setStage("error");
          setErrorMsg("Some answers were invalid. Please reload and try again.");
          return;
        }
        if (c === "server_misconfigured") {
          setStage("error");
          setErrorMsg(
            detail
              ? `Server configuration issue. ${detail} Please ask the administrator to fix this.`
              : "Server is not fully configured. Please contact the administrator."
          );
          return;
        }
        setStage("error");
        setErrorMsg(
          detail
            ? `Could not submit your answers: ${detail}`
            : "Could not submit your answers. Please try again."
        );
        return;
      }

      setResult({
        score: typeof data?.score === "number" ? data.score : 0,
        total:
          typeof data?.totalQuestions === "number"
            ? data.totalQuestions
            : assessment.questions.length,
        percentage: typeof data?.percentage === "number" ? data.percentage : 0,
        status: data?.status === "Pass" ? "Pass" : "Fail",
        attempt: typeof data?.attemptNumber === "number" ? data.attemptNumber : 1,
      });
      setStage("result");
    } catch (err) {
      console.error("Error submitting assessment:", err);
      setStage("error");
      setErrorMsg("Could not submit your answers. Please try again.");
    } finally {
      submitInFlight.current = false;
    }
  };

  // Shared layout shell (brand updated to Philippine Supermarket)
  const shell = (content: React.ReactNode) => (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #fff7ed 0%, #fef3c7 50%, #fef9c3 100%)",
        padding: "32px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "linear-gradient(145deg, #b91c1c 0%, #7f1d1d 100%)",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid rgba(252,211,77,0.55)",
            }}
          >
            <span style={{ color: "#FCD34D", fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", lineHeight: 1 }}>PS</span>
            <span style={{ color: "#fbbf24", fontSize: 6, fontWeight: 700, letterSpacing: "0.2em", lineHeight: 1, opacity: 0.85 }}>MARKET</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Philippine Supermarket
            </div>
            <div style={{ fontSize: 14, color: "#78350f", fontWeight: 600 }}>Online Assessment</div>
          </div>
        </div>

        {content}
      </div>
    </div>
  );

  if (stage === "loading" || stage === "checking" || stage === "submitting") {
    return shell(
      <div style={cardStyle()}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid #fde68a",
              borderTopColor: "#b45309",
              margin: "0 auto 14px",
              animation: "assessSpin 0.8s linear infinite",
            }}
          />
          <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>
            {stage === "submitting"
              ? "Submitting your answers…"
              : stage === "checking"
              ? "Checking previous attempts…"
              : "Loading assessment…"}
          </div>
          <style>{`@keyframes assessSpin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (stage === "not_found") {
    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>Assessment not found</h1>
        <p style={paragraphStyle}>
          The link you opened doesn&apos;t match any assessment. Please check the link or contact
          the person who shared it with you.
        </p>
      </div>
    );
  }

  if (stage === "inactive") {
    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>This assessment is currently closed</h1>
        <p style={paragraphStyle}>
          The administrator has temporarily disabled this assessment. Please reach out for
          guidance.
        </p>
      </div>
    );
  }

  if (stage === "error") {
    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>Something went wrong</h1>
        <p style={paragraphStyle}>{errorMsg || "Please try again later."}</p>
        <button style={{ ...primaryButton, marginTop: 18 }} onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (stage === "max_attempts") {
    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>Maximum attempts reached</h1>
        <p style={paragraphStyle}>
          You have already used all allowed attempts for this assessment.
        </p>
        {assessment && (
          <p style={{ ...paragraphStyle, marginTop: 6 }}>
            Used: <strong>{previousAttempts}</strong> / {assessment.maxAttempts}
          </p>
        )}
      </div>
    );
  }

  if (stage === "intro" && assessment) {
    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>{assessment.title}</h1>
        {assessment.description && (
          <p style={paragraphStyle}>{assessment.description}</p>
        )}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 12,
            marginBottom: 24,
          }}
        >
          <Pill label={`${assessment.questions.length} question${assessment.questions.length === 1 ? "" : "s"}`} />
          <Pill label={`Passing: ${assessment.passingPercentage}%`} />
          <Pill label={`Up to ${assessment.maxAttempts} attempt${assessment.maxAttempts === 1 ? "" : "s"}`} />
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Field
            label="Full name *"
            value={participantName}
            onChange={(v) => setParticipantName(v)}
            onBlur={() => setTouchedName(true)}
            invalid={touchedName && !nameValid}
            hint={touchedName && !nameValid ? "Please enter your full name." : ""}
            placeholder="e.g. Juan Dela Cruz"
            autoComplete="name"
          />

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 13,
                fontWeight: 700,
                color: "#374151",
              }}
            >
              Branch *
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              {BRANCHES.map((b) => {
                const selected = branch === b;
                const isInvalid = touchedBranch && !branchValid;
                return (
                  <label
                    key={b}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: selected
                        ? "2px solid #b45309"
                        : isInvalid
                        ? "1px solid #ef4444"
                        : "1px solid #d1d5db",
                      background: selected ? "#fef3c7" : "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="branch"
                      checked={selected}
                      onChange={() => {
                        setBranch(b);
                        setTouchedBranch(true);
                      }}
                      style={{ accentColor: "#b45309" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>{b}</span>
                  </label>
                );
              })}
            </div>
            {touchedBranch && !branchValid && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>
                Please choose your branch.
              </div>
            )}
          </div>
        </div>

        <button
          style={{
            ...primaryButton,
            marginTop: 24,
            width: "100%",
            opacity: nameValid && branchValid ? 1 : 0.6,
            cursor: nameValid && branchValid ? "pointer" : "not-allowed",
          }}
          onClick={checkAttemptsAndProceed}
          disabled={!nameValid || !branchValid}
        >
          Start assessment →
        </button>
      </div>
    );
  }

  if (stage === "questions" && assessment) {
    const remaining = assessment.maxAttempts - previousAttempts;
    return shell(
      <div style={cardStyle()}>
        <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ ...titleStyle, marginBottom: 4 }}>{assessment.title}</h1>
            <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
              {participantName} · {branch} · Attempt {previousAttempts + 1} of {assessment.maxAttempts}
            </div>
          </div>
          <Pill label={`${remaining} attempt${remaining === 1 ? "" : "s"} left after this`} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {assessment.questions.map((q, qIdx) => (
            <div
              key={q.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, marginBottom: 6 }}>
                Question {qIdx + 1} of {assessment.questions.length}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>
                {q.text}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {q.options.map((opt, oIdx) => {
                  const selected = answers[qIdx] === oIdx;
                  return (
                    <label
                      key={oIdx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 13px",
                        borderRadius: 12,
                        border: selected ? "2px solid #b45309" : "1px solid #d1d5db",
                        background: selected ? "#fef3c7" : "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        checked={selected}
                        onChange={() =>
                          setAnswers((prev) => {
                            const next = [...prev];
                            next[qIdx] = oIdx;
                            return next;
                          })
                        }
                        style={{ accentColor: "#b45309" }}
                      />
                      <span style={{ fontSize: 14, color: "#1f2937", fontWeight: 600 }}>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!allAnswered && (
          <div
            style={{
              marginTop: 18,
              padding: "10px 14px",
              borderRadius: 12,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              color: "#92400e",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Please answer every question before submitting.
          </div>
        )}

        <button
          style={{
            ...primaryButton,
            marginTop: 18,
            width: "100%",
            opacity: allAnswered ? 1 : 0.6,
            cursor: allAnswered ? "pointer" : "not-allowed",
          }}
          onClick={submitAnswers}
          disabled={!allAnswered}
        >
          Submit answers
        </button>
      </div>
    );
  }

  if (stage === "result" && assessment && result) {
    const passColor = result.status === "Pass" ? "#15803d" : "#b91c1c";
    const passBg = result.status === "Pass" ? "#dcfce7" : "#fee2e2";
    const passBorder = result.status === "Pass" ? "#86efac" : "#fecaca";

    return shell(
      <div style={cardStyle()}>
        <h1 style={titleStyle}>Submission received</h1>
        <p style={paragraphStyle}>
          Thank you, {participantName}. Your answers for <strong>{assessment.title}</strong> have
          been recorded.
        </p>

        <div
          style={{
            background: passBg,
            border: `1px solid ${passBorder}`,
            borderRadius: 16,
            padding: 18,
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: passColor, fontWeight: 800, letterSpacing: "0.04em" }}>
              YOUR RESULT
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: passColor, letterSpacing: "-0.02em", marginTop: 4 }}>
              {result.status} · {result.percentage}%
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
              Score: {result.score} / {result.total} · Passing: {assessment.passingPercentage}% · Attempt {result.attempt} of {assessment.maxAttempts}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Branch: <strong>{branch}</strong>
            </div>
          </div>
        </div>

        {result.status === "Fail" && result.attempt < assessment.maxAttempts && (
          <p style={{ ...paragraphStyle, marginTop: 14 }}>
            You can retake this assessment {assessment.maxAttempts - result.attempt} more time
            {assessment.maxAttempts - result.attempt === 1 ? "" : "s"}.
          </p>
        )}

        {result.status === "Fail" && result.attempt >= assessment.maxAttempts && (
          <p style={{ ...paragraphStyle, marginTop: 14 }}>
            You have used all available attempts. Please contact the administrator if a retake
            is required.
          </p>
        )}
      </div>
    );
  }

  return shell(<div style={cardStyle()}>Unknown state.</div>);
}

// ── inline UI helpers ────────────────────────────────────────────────
function Pill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 11px",
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fcd34d",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  invalid,
  hint,
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: 13,
          fontWeight: 700,
          color: "#374151",
        }}
      >
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: invalid ? "1px solid #ef4444" : "1px solid #d1d5db",
          fontSize: 14,
          background: "#fff",
          color: "#111827",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {hint && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: invalid ? "#b91c1c" : "#6b7280",
            fontWeight: 600,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: "#111827",
  letterSpacing: "-0.02em",
  margin: 0,
  marginBottom: 8,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4b5563",
  lineHeight: 1.7,
  margin: 0,
};

const primaryButton: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #b45309 0%, #92400e 100%)",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 15,
  boxShadow: "0 4px 16px rgba(146,64,14,0.32)",
};

function cardStyle(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #fde68a",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 16px 38px rgba(146,64,14,0.08)",
  };
}
