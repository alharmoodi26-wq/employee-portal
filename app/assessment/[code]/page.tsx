"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  getCountFromServer,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type {
  Assessment,
  AssessmentQuestion,
  AssessmentSubmission,
  AssessmentSubmissionStatus,
} from "../../portal-utils";

// ── helpers ──────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  return raw.replace(/\s|-/g, "").trim();
}

function isValidPhone(raw: string): boolean {
  const v = normalizePhone(raw);
  return /^\+?\d{7,15}$/.test(v);
}

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
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [participantName, setParticipantName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);

  const [answers, setAnswers] = useState<LocalAnswer[]>([]);
  const [previousAttempts, setPreviousAttempts] = useState(0);

  const [result, setResult] = useState<{
    score: number;
    total: number;
    percentage: number;
    status: AssessmentSubmissionStatus;
    attempt: number;
    perQuestion: { questionText: string; chosen: number; correct: number; ok: boolean; options: string[] }[];
  } | null>(null);

  // Hard-guard against double Submit clicks beyond the React state debounce
  const submitInFlight = useRef(false);

  // Fetch assessment by code
  useEffect(() => {
    if (!code) {
      setStage("not_found");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "assessments"),
          where("code", "==", code),
          limit(1)
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        if (snap.empty) {
          setStage("not_found");
          return;
        }

        const docSnap = snap.docs[0];
        const data = docSnap.data();
        const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
        const questions: AssessmentQuestion[] = rawQuestions.map((q: unknown, i: number) => {
          const item = (q ?? {}) as Record<string, unknown>;
          return {
            id: typeof item.id === "string" ? item.id : `q_${i}`,
            text: typeof item.text === "string" ? item.text : "",
            options: Array.isArray(item.options)
              ? (item.options as unknown[]).map((o) => (typeof o === "string" ? o : ""))
              : [],
            correctAnswerIndex:
              typeof item.correctAnswerIndex === "number" ? item.correctAnswerIndex : 0,
          };
        });

        const mapped: Assessment = {
          id: docSnap.id,
          title: typeof data.title === "string" ? data.title : "Untitled Assessment",
          description: typeof data.description === "string" ? data.description : "",
          passingPercentage:
            typeof data.passingPercentage === "number" ? data.passingPercentage : 70,
          maxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 2,
          code: typeof data.code === "string" ? data.code : code,
          questions,
          createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
          createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
          createdByName: typeof data.createdByName === "string" ? data.createdByName : "",
          isActive: data.isActive !== false,
        };

        setAssessment(mapped);
        setAnswers(Array.from({ length: mapped.questions.length }, () => null));

        if (!mapped.isActive) {
          setStage("inactive");
        } else if (mapped.questions.length === 0) {
          setStage("error");
          setErrorMsg("This assessment has no questions yet.");
        } else {
          setStage("intro");
        }
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
  const phoneValid = isValidPhone(phoneNumber);

  const checkAttemptsAndProceed = async () => {
    if (!assessment) return;
    if (!nameValid || !phoneValid) {
      setTouchedName(true);
      setTouchedPhone(true);
      return;
    }

    setStage("checking");
    try {
      const phone = normalizePhone(phoneNumber);
      // Server-side aggregation: one round-trip, no document payloads — much faster
      // than getDocs() when a person has previous attempts or the project grows.
      const q = query(
        collection(db, "assessmentSubmissions"),
        where("assessmentId", "==", assessment.id),
        where("phoneNumber", "==", phone)
      );
      const countSnap = await getCountFromServer(q);
      const used = countSnap.data().count;
      setPreviousAttempts(used);

      if (used >= assessment.maxAttempts) {
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
    // Hard guard: prevents a fast second click / Enter-key replay from launching a second request
    if (submitInFlight.current) return;
    submitInFlight.current = true;

    setStage("submitting");
    try {
      // Re-check attempts right before insert using server-side COUNT (1 RTT, no payload)
      const phone = normalizePhone(phoneNumber);
      const q = query(
        collection(db, "assessmentSubmissions"),
        where("assessmentId", "==", assessment.id),
        where("phoneNumber", "==", phone)
      );
      const countSnap = await getCountFromServer(q);
      const used = countSnap.data().count;

      if (used >= assessment.maxAttempts) {
        setPreviousAttempts(used);
        setStage("max_attempts");
        return;
      }

      const attemptNumber = used + 1;
      const total = assessment.questions.length;
      const correctAnswers = assessment.questions.map((q) => q.correctAnswerIndex);
      let score = 0;
      const perQuestion = assessment.questions.map((q, idx) => {
        const chosen = answers[idx] as number;
        const ok = chosen === q.correctAnswerIndex;
        if (ok) score++;
        return {
          questionText: q.text,
          chosen,
          correct: q.correctAnswerIndex,
          ok,
          options: q.options,
        };
      });
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      const status: AssessmentSubmissionStatus =
        percentage >= assessment.passingPercentage ? "Pass" : "Fail";

      const submissionDoc = {
        assessmentId: assessment.id,
        assessmentCode: assessment.code,
        assessmentTitle: assessment.title,
        participantName: participantName.trim(),
        phoneNumber: phone,
        attemptNumber,
        answers: answers.map((a) => (typeof a === "number" ? a : -1)),
        correctAnswers,
        score,
        totalQuestions: total,
        percentage,
        status,
        submittedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "assessmentSubmissions"), submissionDoc);

      setResult({
        score,
        total,
        percentage,
        status,
        attempt: attemptNumber,
        perQuestion,
      });
      setStage("result");
    } catch (err) {
      console.error("Error submitting assessment:", err);
      setStage("error");
      const msg = err instanceof Error ? err.message : "";
      if (/permission|insufficient/i.test(msg)) {
        setErrorMsg("Submission was rejected by the server. Please contact the administrator.");
      } else {
        setErrorMsg("Could not submit your answers. Please try again.");
      }
    } finally {
      submitInFlight.current = false;
    }
  };

  // Shared layout shell
  const shell = (content: React.ReactNode) => (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #eef2ff 0%, #f8fafc 50%, #f0f4ff 100%)",
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
              background: "linear-gradient(145deg, #0d1a30 0%, #1b2a4a 100%)",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid rgba(240,192,64,0.45)",
            }}
          >
            <span style={{ color: "#F0C040", fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", lineHeight: 1 }}>EIHG</span>
            <span style={{ color: "#c9a520", fontSize: 6, fontWeight: 700, letterSpacing: "0.2em", lineHeight: 1, opacity: 0.75 }}>PORTAL</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Emirates International Holdings Group
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>Online Assessment</div>
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
              border: "3px solid #e5e7eb",
              borderTopColor: "#4338ca",
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
            placeholder="e.g. Ahmed Al Mansoori"
            autoComplete="name"
          />
          <Field
            label="Phone number *"
            value={phoneNumber}
            onChange={(v) => setPhoneNumber(v)}
            onBlur={() => setTouchedPhone(true)}
            invalid={touchedPhone && !phoneValid}
            hint={
              touchedPhone && !phoneValid
                ? "Enter a valid phone number (digits only, optional +)."
                : "Used to track your attempts (max " + assessment.maxAttempts + ")."
            }
            placeholder="e.g. +9715XXXXXXXX"
            autoComplete="tel"
            inputMode="tel"
          />
        </div>

        <button
          style={{
            ...primaryButton,
            marginTop: 24,
            width: "100%",
            opacity: nameValid && phoneValid ? 1 : 0.6,
            cursor: nameValid && phoneValid ? "pointer" : "not-allowed",
          }}
          onClick={checkAttemptsAndProceed}
          disabled={!nameValid || !phoneValid}
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
              {participantName} · Attempt {previousAttempts + 1} of {assessment.maxAttempts}
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
                        border: selected ? "2px solid #4338ca" : "1px solid #d1d5db",
                        background: selected ? "#eef2ff" : "#fff",
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
                        style={{ accentColor: "#4338ca" }}
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
        background: "#eef2ff",
        color: "#4338ca",
        border: "1px solid #c7d2fe",
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
  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 15,
  boxShadow: "0 4px 16px rgba(99,102,241,0.32)",
};

function cardStyle(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 16px 38px rgba(15,23,42,0.07)",
  };
}

// Avoid unused-export warning by referencing the type
export type _AssessmentSubmissionPlaceholder = AssessmentSubmission;
