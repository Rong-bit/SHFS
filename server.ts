import dns from "dns";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

// Render 等雲端常無可用 IPv6，連 Gmail:587 會 ENETUNREACH；優先走 IPv4
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Node 舊版無此 API 時略過
}

const app = express();
/** Render／雲端會注入 PORT；本機預設 3000 */
const PORT = Number(process.env.PORT) || 3000;

// GitHub Pages 前端若另填「寄信 API 根網址」打到此伺服器，需允許跨域
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-patrol-notify-token"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

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
    // 強制 IPv4，避免雲端 ENETUNREACH 2607:f8b0:…（Gmail IPv6）
    family: 4,
    // 避免 Render Free 封鎖 SMTP 時請求一直掛起，前端只看到 Failed to fetch
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
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
      const raw = err instanceof Error ? err.message : String(err);
      let error = raw;
      if (/ENETUNREACH|EHOSTUNREACH/i.test(raw)) {
        error = `${raw}（雲端無法連到該 SMTP；請確認主機／埠）`;
      } else if (/ETIMEDOUT|Timeout|timeout|ESOCKET/i.test(raw)) {
        error =
          `${raw}（連線 SMTP 逾時。若 API 架在 Render 免費方案，對外 25/465/587 埠會被封鎖；` +
          `請升級為付費方案，或改把寄信 API 架在可寄 SMTP 的主機）`;
      }
      failed.push({ email, error });
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
    console.log(`教務系統 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
