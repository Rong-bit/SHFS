import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

type SmtpPayload = {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromEmail: string;
};

type NotifyBody = {
  smtp: SmtpPayload;
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

/** 巡堂異常會辦：以學校 SMTP／第三方寄信服務寄出 */
app.post("/api/patrol/notify", async (req, res) => {
  const body = req.body as NotifyBody;
  const smtp = body?.smtp;
  const to = Array.isArray(body?.to) ? body.to.filter((e) => typeof e === "string" && e.includes("@")) : [];
  const notifyToken = process.env.PATROL_NOTIFY_TOKEN;
  if (notifyToken) {
    const provided =
      (typeof req.headers["x-patrol-notify-token"] === "string"
        ? req.headers["x-patrol-notify-token"]
        : "") ||
      (typeof (body as { token?: string })?.token === "string"
        ? (body as { token?: string }).token
        : "");
    if (provided !== notifyToken) {
      return res.status(401).json({
        ok: false,
        sent: 0,
        failed: [],
        error: "未授權的寄信請求",
      });
    }
  }
  if (!smtp?.host || !smtp?.fromEmail) {
    return res.status(400).json({
      ok: false,
      sent: 0,
      failed: [],
      error: "缺少 SMTP 主機或寄件信箱",
    });
  }
  if (to.length === 0) {
    return res.status(400).json({
      ok: false,
      sent: 0,
      failed: [],
      error: "沒有有效收件信箱",
    });
  }
  if (to.length > 40) {
    return res.status(400).json({
      ok: false,
      sent: 0,
      failed: [],
      error: "單次收件人數超過上限（40）",
    });
  }
  if (!body.subject || !body.text) {
    return res.status(400).json({
      ok: false,
      sent: 0,
      failed: [],
      error: "缺少主旨或內文",
    });
  }

  const port = Number(smtp.port) || (smtp.secure ? 465 : 587);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: Boolean(smtp.secure),
    auth: smtp.user
      ? {
          user: smtp.user,
          pass: smtp.pass || "",
        }
      : undefined,
  });

  const from = smtp.fromName
    ? `"${smtp.fromName.replace(/"/g, "")}" <${smtp.fromEmail}>`
    : smtp.fromEmail;

  const failed: { email: string; error: string }[] = [];
  let sent = 0;
  for (const email of [...new Set(to)]) {
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: body.subject,
        text: body.text,
        html: body.html || undefined,
      });
      sent += 1;
    } catch (err) {
      failed.push({
        email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.json({
    ok: failed.length === 0,
    sent,
    failed,
    error: failed.length ? failed[0].error : undefined,
  });
});

// Vite & Static file handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`調代課與鐘點費管理系統 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
