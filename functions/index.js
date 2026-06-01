const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Resend } = require("resend");

initializeApp();

const db = getFirestore();

exports.sendTaskAssignedEmail = onDocumentCreated(
  "assignedTasks/{taskId}",
  async (event) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey) {
      logger.error("RESEND_API_KEY is missing.");
      return;
    }

    if (!fromEmail) {
      logger.error("RESEND_FROM_EMAIL is missing.");
      return;
    }

    const resend = new Resend(apiKey);

    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const taskId = snapshot.id;

    if (!data) return;

    if (data.emailNotificationSent === true) {
      logger.info("Email already sent for task:", taskId);
      return;
    }

    const employeeEmail = data.employeeEmail;
    const employeeName = data.employeeName || "Employee";
    const taskTitle = data.title || "New Task";
    const deadline = data.deadline || "No deadline";
    const description = data.description || "";
    const createdByAdmin = data.createdByAdmin || "Admin";

    if (!employeeEmail) {
      logger.error("Missing employeeEmail for task:", taskId);
      return;
    }

    let portalLink = "";
    if (process.env.APP_URL) {
      portalLink =
        '<p><a href="' +
        process.env.APP_URL +
        '">Open Employee Portal</a></p>';
    }

    try {
      await resend.emails.send({
        from: fromEmail,
        to: [employeeEmail],
        subject: "New task assigned: " + taskTitle,
        html:
          '<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7;">' +
          "<h2>Emirates International Holdings Group</h2>" +
          "<p>Hello " +
          employeeName +
          ",</p>" +
          "<p>A new task has been assigned to you.</p>" +
          "<p><strong>Task:</strong> " +
          taskTitle +
          "</p>" +
          "<p><strong>Deadline:</strong> " +
          deadline +
          "</p>" +
          "<p><strong>Assigned by:</strong> " +
          createdByAdmin +
          "</p>" +
          "<p><strong>Description:</strong> " +
          description +
          "</p>" +
          "<p>Please log in to the employee portal to review and complete the task.</p>" +
          portalLink +
          "</div>",
      });

      await db.collection("assignedTasks").doc(taskId).update({
        emailNotificationSent: true,
        emailNotificationSentAt: new Date().toISOString(),
      });

      logger.info("Task assignment email sent successfully:", taskId);
    } catch (error) {
      logger.error("Failed to send task assignment email:", error);
    }
  }
);

exports.sendTaskSubmittedEmailToAdmin = onDocumentUpdated(
  "assignedTasks/{taskId}",
  async (event) => {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!apiKey) {
      logger.error("RESEND_API_KEY is missing.");
      return;
    }

    if (!fromEmail) {
      logger.error("RESEND_FROM_EMAIL is missing.");
      return;
    }

    if (!adminEmail) {
      logger.error("ADMIN_EMAIL is missing.");
      return;
    }

    const beforeSnapshot = event.data.before;
    const afterSnapshot = event.data.after;

    if (!beforeSnapshot || !afterSnapshot) return;

    const beforeData = beforeSnapshot.data();
    const afterData = afterSnapshot.data();
    const taskId = afterSnapshot.id;

    if (!beforeData || !afterData) return;

    const statusChangedToSubmitted =
      beforeData.status !== "Submitted" && afterData.status === "Submitted";

    if (!statusChangedToSubmitted) {
      return;
    }

    if (afterData.adminNotificationSent === true) {
      logger.info("Admin email already sent for submitted task:", taskId);
      return;
    }

    const resend = new Resend(apiKey);

    const employeeName = afterData.employeeName || "Employee";
    const employeeEmail = afterData.employeeEmail || "No email";
    const taskTitle = afterData.title || "Task";
    const submittedNotes = afterData.submittedNotes || "No notes provided";
    const deadline = afterData.deadline || "No deadline";
    const resubmissionCount = afterData.resubmissionCount || 0;

    const submittedFiles = Array.isArray(afterData.submittedFiles)
      ? afterData.submittedFiles
      : [];
    const filesHtml =
      submittedFiles.length > 0
        ? "<p><strong>Submitted Files:</strong> " +
          submittedFiles.map((f) => f.name || "file").join(", ") +
          "</p>"
        : "<p><strong>Submitted Files:</strong> No files attached</p>";

    const resubmissionHtml =
      resubmissionCount > 0
        ? "<p><strong>Resubmission #:</strong> " + resubmissionCount + "</p>"
        : "";

    let portalLink = "";
    if (process.env.APP_URL) {
      portalLink =
        '<p><a href="' +
        process.env.APP_URL +
        '">Open Employee Portal</a></p>';
    }

    try {
      await resend.emails.send({
        from: fromEmail,
        to: [adminEmail],
        subject: "Task submitted by " + employeeName + ": " + taskTitle,
        html:
          '<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7;">' +
          "<h2>Emirates International Holdings Group</h2>" +
          "<p>An employee has submitted a task for your review.</p>" +
          "<p><strong>Employee:</strong> " +
          employeeName +
          "</p>" +
          "<p><strong>Employee Email:</strong> " +
          employeeEmail +
          "</p>" +
          "<p><strong>Task:</strong> " +
          taskTitle +
          "</p>" +
          "<p><strong>Deadline:</strong> " +
          deadline +
          "</p>" +
          "<p><strong>Submitted Notes:</strong> " +
          submittedNotes +
          "</p>" +
          filesHtml +
          resubmissionHtml +
          portalLink +
          "</div>",
      });

      await db.collection("assignedTasks").doc(taskId).update({
        adminNotificationSent: true,
        adminNotificationSentAt: new Date().toISOString(),
      });

      logger.info("Admin submission email sent successfully:", taskId);
    } catch (error) {
      logger.error("Failed to send admin submission email:", error);
    }
  }
);