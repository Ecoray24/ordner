require('dotenv').config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();

// ✅ CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// ✅ Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files
const staticPath = path.resolve(__dirname);
app.use(express.static(staticPath));

// ✅ File upload setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Order endpoint
app.post("/send-order", upload.any(), async (req, res) => {
  try {
    const { name, email, address } = req.body;
    const cartFile = req.files.find(f => f.fieldname === "cart");

    if (!name || !email || !address || !cartFile) {
      return res.status(400).json({ success: false, error: "Nedostaju podaci" });
    }

    const cartData = JSON.parse(cartFile.buffer.toString("utf-8"));

    let textReport = `Neue Bestellung\n\nKunde:\nName: ${name}\nAdresse: ${address}\nE-Mail: ${email}\n\nProdukte:\n\n`;

    cartData.forEach((item, idx) => {
      textReport += `${idx + 1}. Größe: ${(item.width * 100).toFixed(0)} x ${(item.height * 100).toFixed(0)} cm\n`;
      if (item.front) {
        textReport += `   Front: ${item.front.type === "color" ? `Farbe (${item.front.value})` : `Bild (${extractFilename(item.front.value)})`}\n`;
      }
      if (item.back) {
        textReport += `   Back: ${item.back.type === "color" ? `Farbe (${item.back.value})` : `Bild (${extractFilename(item.back.value)})`}\n`;
      }
      textReport += `\n`;
    });

    function extractFilename(data) {
      if (!data) return "unbekannt";
      if (data.startsWith("data:")) return "Bild";
      const parts = data.split("/");
      return parts[parts.length - 1];
    }

    const attachments = [{
      filename: "bestellung.txt",
      content: textReport
    }];

    req.files.forEach(file => {
      if (file.fieldname !== "cart") {
        attachments.push({
          filename: file.originalname || `${file.fieldname}.png`,
          content: file.buffer.toString("base64"),
          type: file.mimetype
        });
      }
    });

    // ✅ Send order notification to admin
    const adminResponse = await axios.post(
      "https://api.resend.com/emails",
      {
        from: process.env.RESEND_FROM || "onboarding@resend.dev",
        to: process.env.RESEND_TO || "kulanicedin@gmail.com",
        subject: "Neue Bestellung",
        text: `Neue Bestellung von ${name}\n\n${textReport}`,
        attachments
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // ✅ Send confirmation email to customer
    const customerResponse = await axios.post(
      "https://api.resend.com/emails",
      {
        from: process.env.RESEND_FROM || "onboarding@resend.dev",
        to: email,
        subject: "Bestätigung Ihrer Bestellung",
        text: `Hallo ${name},\n\nvielen Dank für Ihre Bestellung. Wir haben Ihre Bestellung erhalten und bearbeiten sie so schnell wie möglich.\n\nMit freundlichen Grüßen,\nIhr Team`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({ success: true, adminResponse: adminResponse.data, customerResponse: customerResponse.data });
  } catch (err) {
    console.error("Greška:", err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

// ✅ SPA Catch-All
app.get("/*", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
