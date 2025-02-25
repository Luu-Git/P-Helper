/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onCall, HttpsOptions} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Define types for our email data
interface TimeSlot {
  date: string;
  start: string;
  end: string,
}

interface EmailData {
  to: string;
  tutorName: string;
  timeSlots: TimeSlot[],
}

// Check if environment variables are set
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  logger.error("Missing email credentials in environment variables");
}

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Configure function options with explicit CORS settings
const functionConfig: HttpsOptions = {
  maxInstances: 10,
  cors: ["*"], // Allow requests from any origin
  region: "us-central1"
};

export const sendAcknowledgmentEmail = onCall<EmailData>(
  functionConfig,
  async (request) => {
    const data = request.data;
    
    // Log the function call
    logger.info("Sending acknowledgment email", {
      tutorName: data.tutorName,
      recipientEmail: data.to,
      numTimeSlots: data.timeSlots.length,
    });

    // Check if email credentials are available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      logger.error("Email credentials not configured");
      throw new Error("Email service not properly configured");
    }

    try {
      // Create email content
      const emailContent = `
        <h2>Time Slot Acknowledgment</h2>
        <p>${data.tutorName} has acknowledged the following time slots:</p>
        <ul>
          ${data.timeSlots.map((slot) => `
            <li>Date: ${slot.date}<br>
                Time: ${slot.start} - ${slot.end}</li>
          `).join("")}
        </ul>
        <p>This is an automated message from the Student Organizer system.</p>
      `;

      // Send email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: data.to,
        subject: `Time Slot Acknowledgment from ${data.tutorName}`,
        html: emailContent,
      };
      
      logger.info("Attempting to send email with options:", {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      
      await transporter.sendMail(mailOptions);

      logger.info("Email sent successfully", {
        to: data.to,
        tutorName: data.tutorName,
      });

      return {success: true, message: "Email sent successfully"};
    } catch (error) {
      logger.error("Failed to send email", {
        error,
        to: data.to,
        tutorName: data.tutorName,
      });

      if (error instanceof Error) {
        logger.error("Error details:", {
          message: error.message,
          stack: error.stack
        });
      }

      throw new Error("Failed to send acknowledgment email: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);
