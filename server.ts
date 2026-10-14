import dns from "dns";
import os from "os";
import express from "express";
import path from "path";
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

/** 本機區網 IPv4（供巡堂人員用 http://IP:PORT 連線） */
function listLanIPv4(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    for (const e of entries || []) {
      const v4 = e.family === "IPv4" || (e.family as unknown) === 4;
      if (v4 && !e.internal) out.push(e.address);
    }
  }
  return [...new Set(out)];
}

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
  const provided =
    (typeof req.headers["x-patrol-notify-token"] === "string"
      ? req.headers["x-patrol-notify-token"]
      : "") ||
    (typeof (body as { token?: string })?.token === "string"
      ? (body as { token?: string }).token!
      : "");
  if (notifyToken) {
    if (provided !== notifyToken) {
      return res.status(401).json({
        ok: false,
        sent: 0,
        failed: [],
        error: "未授權的寄信請求（請在系統「巡堂會辦寄信」填寫與伺服器 PATROL_NOTIFY_TOKEN 相同的授權碼）",
      });
    }
  } else if (req.headers.origin) {
    // 未設 token：拒絕明確跨域，降低開放 SMTP 轉發風險；校內同源仍可寄
    try {
      const originHost = new URL(String(req.headers.origin)).host;
      const reqHost = String(req.headers.host || "");
      if (originHost && reqHost && originHost !== reqHost) {
        return res.status(401).json({
          ok: false,
          sent: 0,
          failed: [],
          error:
            "跨域寄信需在伺服器設定 PATROL_NOTIFY_TOKEN，並於系統寄信設定填寫相同授權碼",
        });
      }
    } catch {
      /* ignore bad Origin */
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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: smtp.user
      ? {
          user: smtp.user,
          pass: smtp.pass || "",
        }
      : undefined,
    // 強制 IPv4（型別未宣告 family，用展開傳入）
    ...({ family: 4 } as Record<string, unknown>),
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
      const error = /ENETUNREACH|EHOSTUNREACH/i.test(raw)
        ? `${raw}（雲端無法連到該 SMTP；請確認主機／埠，或改用 smtp.gmail.com:587 與應用程式密碼）`
        : raw;
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
    // 動態載入，避免可攜包把整包 vite 打進去
    const { createServer: createViteServer } = await import("vite");
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
    const lan = listLanIPv4();
    console.log("");
    console.log("SHFS Mail Host ready");
    console.log(`  This PC:  http://localhost:${PORT}`);
    if (lan.length > 0) {
      for (const ip of lan) {
        console.log(`  LAN:      http://${ip}:${PORT}`);
      }
      console.log("  (Same Wi-Fi/LAN devices can open the LAN URL above)");
    } else {
      console.log("  LAN:      (no IPv4 found — check Wi-Fi / Ethernet)");
    }
    console.log("  Keep this window open.");
    console.log("");
  });
}

startServer();
