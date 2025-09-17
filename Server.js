const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
require("dotenv").config();

// ------------------ CORS ------------------
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(bodyParser.json());

// ------------------ UPLOADS ------------------
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = [".pdf", ".doc", ".docx"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Invalid file type"), ok);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ------------------ MYSQL ------------------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection()
  .then(() => console.log("✅ MySQL Connected..."))
  .catch((err) => console.error("❌ MySQL Connection Error:", err));

// ------------------ EMAIL ------------------
let transporter = null;

try {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} catch (err) {
  console.warn("⚠️ Email transporter not configured properly:", err.message);
}

async function sendMailSafe(to, subject, html) {
  if (!transporter) {
    console.warn(`⚠️ Skipping email to ${to} - transporter not configured`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Deep Learner Academy"<${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`⚠️ Failed to send email to ${to}:`, err.message);
  }
}

// ------------------ COURSES ------------------
app.get("/api/courses", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM courses");
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/courses/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.execute("SELECT * FROM courses WHERE id = ?", [id]);
    if (!results.length) return res.status(404).json({ error: "Course not found" });

    let course = results[0];
    if (course.syllabus && typeof course.syllabus === "string") {
      try { course.syllabus = JSON.parse(course.syllabus); } catch { course.syllabus = []; }
    }
    res.json(course);
  } catch (err) {
    console.error("❌ Error fetching course by ID:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------ ENROLL ------------------
app.post("/api/enroll", async (req, res) => {
  const { name, email, phone, status = "Pending", courseId } = req.body;
  if (!name || !email || !phone || !courseId)
    return res.status(400).json({ success: false, message: "All fields are required" });

  try {
    const [result] = await db.query(
      "INSERT INTO enrollments (name, email, phone, status, course_id) VALUES (?, ?, ?, ?, ?)",
      [name, email, phone, status, courseId]
    );

    // Send emails safely
    await sendMailSafe(
      "deeplearneracademy@gmail.com",
      "📩 New Enrollment",
      `<h2>${name} enrolled in Course ID: ${courseId}</h2>
       <p>Email: ${email}</p>
       <p>Phone: ${phone}</p>
       <p>Status: ${status}</p>`
    );

    await sendMailSafe(
      email,
      "✅ Enrollment Successful",
      `<h2>Hi ${name},</h2>
       <p>You are successfully enrolled in course ID: ${courseId}! 🎉</p>
       <p>Our team will contact you soon.</p>
       <br/>- Deep Learner Academy Team`
    );

    res.status(201).json({
      success: true,
      message: "Enrollment successful, confirmation email sent",
      enrollmentId: result.insertId,
    });
  } catch (err) {
    console.error("Enrollment Error:", err);
    res.status(500).json({ success: false, message: "Server error, please try again later" });
  }
});

// ------------------ USERS, SIGNUP, LOGIN, OTP, WORKSHOPS, MENTOR APPLY, TESTIMONIALS, DEMO REQUEST ------------------
// Keep all existing routes exactly as they are, but replace sendMail(...) with sendMailSafe(...)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
 console.log(`🚀 Server running on port ${PORT}`));
