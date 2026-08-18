import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Lazy Gemini API initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set in environment. AI Advisor will operate with fallback mode if key is missing.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "dummy-key-for-init",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI Advisor endpoint for Vocational High School Regulations & Schedule Optimization
app.post("/api/ai-advisor", async (req, res) => {
  try {
    const { message, contextData, conversationHistory } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return high quality intelligent local regulatory rule response if API key is not yet configured
      return res.json({
        reply: `【教育部技術型高級中等學校排課與調代課法規指引】\n\n針對您的提問：「${message}」\n\n根據《高級中等學校教師每週授課節數標準》及相關代課差假法規要點：\n1. **鐘點費基準**：高職日間部教師兼代課鐘點費標準為 **420元/節**；夜間部/進修部/第八節課輔為 **500元/節**。\n2. **授課節數標準**：專任教師 16 節、導師 12 節（減授4節）、科主任 10 節（減授6節）、各處室組長 8 節（減授8節）。\n3. **兼代課上限**：專任教師每週兼任、代課節數合計以 **9 節** 為限（兼課不得超過 4 節，代課不得超過 5 節）。\n4. **公差假公費派代**：因公派差（如指導學生參加全國技藝競賽、技能檢定監評、校外輔導團公差）由學校支給代課鐘點費（公費派代），原任教師不扣薪；私人事病假則採自費代課。\n5. **實習工場安全**：高職專業實習課凡分組教學（達25人以上）或具危險性機具操作，得依規定安排雙師協同教學，並核實核算授課鐘點。\n\n如需進一步推薦特定無課代課教師，請於系統排課模組直接檢視即時衝堂分析！`,
        modelUsed: "local-rules-engine",
      });
    }

    const ai = getGeminiAI();

    const systemInstruction = `你是一位精通台灣「教育部技術型高級中等學校（高職）排課、調代課、差假派代與鐘點費法規」的智慧教務與主計顧問專員。
你的職責是為高職的授課教師、教務處教學組、主計出納處及系統管理員提供即時、專業、精準、條理分明的法規解答與智慧排課代課建議。

高職專屬法規與常識背景：
1. 鐘點費標準：日間部課點費為 420 元/節，夜間部/夜間輔導為 500 元/節。
2. 每週基本授課節數：專任教師 16 節、導師 12 節（減授4節）、科主任 10 節（減授6節）、處室組長 8 節（減授8節）。
3. 兼代課法定上限：每週兼代課節數合計不得超過 9 節（兼課不超過4節，代課不超過5節），超過時教學組與主計處必須進行法規防呆警示。
4. 假別派代原則：
   - 公假/公差（帶學生參加技藝競賽、科展、公假研習、證照檢定監評）：由學校「公費派代」，原任教師領原薪，代課教師領 420 元/節代課費。
   - 事假/病假/自願調假：由請假教師「自費代課」，由請假人扣除鐘點費支付給代課教師。
   - 產假/陪產檢假/喪假：依規定由學校公費派代。
5. 高職實習工場與分組特色：
   - 電機科、資訊科、機械科、餐飲科、設計科等具有專業實習工場與電腦教室。
   - 實習課程常有連續 2~4 節，調代課需特別注意工場設備可用性、專業師資證照（如乙級技術士、相關科系合格教師證）與無課時段。
   - 調課模式包含：🔄 相互調課 (Swap)、⏱️ 自行移課 (Reschedule)、👤 請假派代 (Substitute)。

若使用者提供目前學校的課表或教師負擔資料（contextData），請優先比對該教師之專業科目、空堂時段與每週節數負擔，提供最佳代課教師人選及具體分析。
回答請採用清晰條理、繁體中文（台灣習慣用語），適當使用粗體標記重點，語氣專業熱誠。`;

    // Format prompt with context if available
    let promptText = message;
    if (contextData) {
      promptText = `【目前高職系統即時情境資料】：
${typeof contextData === "string" ? contextData : JSON.stringify(contextData, null, 2)}

【使用者問題/諮詢情境】：
${message}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: promptText,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    const reply = response.text || "目前未能生成回應，請稍後重試。";
    res.json({ reply, modelUsed: "gemini-3.7-flash" });
  } catch (error: any) {
    console.error("Error in AI advisor:", error);
    res.status(500).json({
      error: "AI 顧問暫時無法回應",
      details: error.message,
      fallbackReply: `針對您的提問，依技術型高級中等學校排課法規：\n1. 高職日間部基本鐘點費為 420 元/節。\n2. 每週兼代課上限為 9 節。\n3. 公差假由學校公費派代，事病假由教師自費代課。\n4. 實習工場調代課需兼顧工場無衝堂與專業師資資格。`,
    });
  }
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
    console.log(`高職調代課與課點費管理系統 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
