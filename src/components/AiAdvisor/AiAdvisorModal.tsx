import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  User, 
  BookOpen, 
  Lightbulb, 
  HelpCircle,
  Loader2,
  Trash2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AiAdvisorModal: React.FC = () => {
  const { isAiAdvisorOpen, setIsAiAdvisorOpen, teachers, sessions, venues, systemConfig } = useApp();

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: `您好！我是**高職調代課與課點費 AI 智慧顧問** 🎓。\n\n我精通台灣《技術型高級中等學校教師每週授課節數標準》、《高級中等學校實習工場安全衛生管理規範》以及公立學校兼代課鐘點費（日間部 420 元/節）核算規定。\n\n您可以點擊下方常見問題，或直接向我詢問排課建議、調代課差假法規或鐘點費計算！`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    '高職實習工場調代課與一般學科有哪些法規與安全規定差異？',
    '公差帶學生參加全國專題競賽，鐘點費應如何核算？是公費派代嗎？',
    '教師每週兼課與代課節數合計最多幾節？超過會怎樣？',
    '電機科週二第3節實習課想調代，請推薦無課且有專業證照的教師',
    '導師基本12節、主任基本10節，超鐘點費計算公式為何？',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAiAdvisorOpen) {
      scrollToBottom();
    }
  }, [messages, isAiAdvisorOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputMessage.trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          contextData: {
            teachers: teachers.map((t) => ({
              id: t.id,
              name: t.name,
              department: t.department,
              title: t.title,
              basePeriods: t.basePeriods,
              weeklyActualPeriods: t.weeklyActualPeriods,
              certifications: t.certifications,
            })),
            venues: venues.map((v) => ({
              id: v.id,
              name: v.name,
              department: v.department,
              safetyLevel: v.safetyLevel,
              isWorkshop:
                v.safetyLevel === '高安全防護' ||
                v.safetyLevel === '危險機具區' ||
                v.name.includes('工場') ||
                v.name.includes('實習'),
            })),
            systemConfig: {
              schoolName: systemConfig.schoolName,
              academicYear: systemConfig.academicYear,
              semester: systemConfig.semester,
              currentMonth: systemConfig.currentMonth,
              dayHourlyRate: systemConfig.dayHourlyRate,
              nightHourlyRate: systemConfig.nightHourlyRate,
              maxWeeklyOverloadPeriods: systemConfig.maxWeeklyOverloadPeriods,
              standardBasePeriods: systemConfig.standardBasePeriods,
              // 刻意不送 authConfig／密碼相關欄位
            },
            sessionsCount: sessions.length,
          },
        }),
      });

      const data = await response.json();
      const reply =
        data.reply ||
        data.fallbackReply ||
        data.answer ||
        (data.error
          ? `AI 顧問暫時無法回應：${data.error}`
          : '抱歉，系統暫時無法取得回應，請稍後再試。');

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('AI Advisor error:', err);
      const errorMsg: ChatMessage = {
        id: `bot-err-${Date.now()}`,
        role: 'assistant',
        content: `### 系統建議 (離線規則備援)\n依教育部規定：\n1. **鐘點費支給**：公假、公差、研習為【公費派代】由學校公款支應 420 元/節；事假、病假為【自費代課】由請假教師自付。\n2. **法定兼代課上限**：每週超額鐘點與兼代課總節數不得超過 9 節。\n3. **實習工場**：須由具備同科專業證照合格師資進行代課，並落實設備點交與工場安全防護。`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAiAdvisorOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs flex justify-end">
      
      {/* Slide-out Drawer */}
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 to-indigo-500 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                <span>AI 智慧法規與排課顧問</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                  Gemini Flash
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                教育部授課節數標準 · 實習安全法規 · 智慧師資媒合
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setMessages([messages[0]])}
              title="清除對話紀錄"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              id="btn-close-ai-advisor"
              onClick={() => setIsAiAdvisorOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="bg-slate-50 p-3 border-b border-slate-200 overflow-x-auto">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>高職法規常見快速諮詢：</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                className="text-left text-xs bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-900 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-amber-300 transition shadow-2xs leading-relaxed"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start space-x-2.5 ${
                m.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-xs'
                }`}
              >
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] p-3.5 rounded-2xl ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white rounded-tr-xs'
                    : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-xs shadow-2xs'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed space-y-1">
                  {m.content}
                </div>
                <div
                  className={`text-[10px] mt-1.5 font-mono ${
                    m.role === 'user' ? 'text-slate-400 text-right' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-start space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-100 border border-slate-200 p-3 rounded-2xl rounded-tl-xs flex items-center space-x-2 text-xs text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span>AI 顧問正在檢索法規與課表矩陣中...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              id="input-ai-advisor-prompt"
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="請輸入調代課疑問、法規或媒合問題..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              id="btn-submit-ai-advisor"
              className={`p-2.5 rounded-xl font-bold transition flex items-center justify-center ${
                isLoading || !inputMessage.trim()
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm active:scale-95'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-[10px] text-slate-400 text-center mt-1.5">
            依據《高級中等學校教師每週授課節數標準》與公立學校日間部420元鐘點標準
          </div>
        </div>

      </div>
    </div>
  );
};
