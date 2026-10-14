import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
/** 優先標楷體（Windows DFKai-SB／macOS BiauKai 等） */
const STAMP_KAI =
  '"標楷體", "DFKai-SB", "DFKaiShu-SB-Estd-BF", "BiauKai", "KaiTi", "STKaiti", "Noto Serif TC", serif';

/** 內容區左右內緣（viewBox 225×75） */
const STAMP_INNER_LEFT = 6;
const STAMP_INNER_RIGHT = 221;
const STAMP_INNER_W = STAMP_INNER_RIGHT - STAMP_INNER_LEFT;
/** 職稱：姓名 = 4：6（姓名佔六等分） */
const TITLE_SHARE = 4;
const NAME_SHARE = 6;
const TITLE_ZONE_W = (STAMP_INNER_W * TITLE_SHARE) / (TITLE_SHARE + NAME_SHARE);
const NAME_ZONE_W = (STAMP_INNER_W * NAME_SHARE) / (TITLE_SHARE + NAME_SHARE);
const NAME_ZONE_LEFT = STAMP_INNER_LEFT + TITLE_ZONE_W;
const NAME_CENTER_X = NAME_ZONE_LEFT + NAME_ZONE_W / 2;
/** 戳章內高約 70；姓名字級盡量貼齊上下內緣 */
const NAME_FILL_FONT = 62;
/** 職稱字級上限（與改欄寬前相同，不因左欄壓縮而變小） */
const TITLE_FONT_MAX_TWO = 26;
const TITLE_FONT_MAX_ONE = 30;
const TITLE_MEASURE_W_TWO = 119;
const TITLE_MEASURE_W_ONE = 104;

/**
 * 職名章螢幕／列印規格：
 * 寬 2.25cm、高 0.75cm。
 * 簽文欄維持舊寬（對應 2.8cm），戳章依比例縮窄並在簽文欄內置中。
 */
export const STAMP_HEIGHT_CM = 0.75;
export const STAMP_WIDTH_CM = 2.25;
/** 簽文欄對應的參考寬（舊戳章寬）；簽文維持此寬度 */
export const STAMP_REMARK_REF_CM = 2.8;
export const STAMP_REMARK_COL_LIST_PX = 168;
export const STAMP_REMARK_COL_PREVIEW_PX = 200;
const STAMP_ASPECT = STAMP_WIDTH_CM / STAMP_HEIGHT_CM; // = 3

/** 簽文欄寬（px）→ 戳章螢幕寬（px），維持 2.25／2.8 比例 */
export function stampDisplayWidthPx(remarkColPx: number): number {
  return Math.round((remarkColPx * STAMP_WIDTH_CM) / STAMP_REMARK_REF_CM);
}

type ElectronicStampProps = {
  /**
   * 職銜文案：主任／組長為「教師兼教務主任」等；校長為「校長」。
   * 長職銜自動拆成二排（兩排同寬對齊）；姓名固定一排。
   */
  stampCaption?: string;
  /** @deprecated 改以 stampCaption；仍相容舊的處室欄 */
  officeLabel?: string;
  /** 職稱短名或完整職銜（無 stampCaption 時使用） */
  titleLabel?: string;
  /** 姓名（右一排），如 陳柏宇 */
  personName: string;
  /**
   * 螢幕預覽寬度（px）。列印時固定為 2.25cm × 0.75cm。
   * @default 193
   */
  size?: number;
  className?: string;
  /** @deprecated 圓戳時代欄位 */
  schoolName?: string;
  /** @deprecated 動作應顯示於戳章外 */
  actionLabel?: string;
  dateLabel?: string;
  stampedAt?: string;
};

/** 職銜拆成至多二排：教師兼／教務主任 */
export function splitStampCaptionLines(caption: string): [string] | [string, string] {
  const t = caption.trim();
  const chars = [...t];
  if (chars.length <= 3) return [t];
  if (t.startsWith('教師兼') && chars.length > 3) {
    return ['教師兼', chars.slice(3).join('')];
  }
  // 其餘長職銜對半切
  const mid = Math.ceil(chars.length / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

/** 在可用寬度內盡量放大字級（約略依全形字寬 ≈ fontSize） */
function maxFontForLine(charCount: number, maxWidth: number, maxFont: number, minFont = 10): number {
  if (charCount <= 0) return maxFont;
  const byWidth = Math.floor(maxWidth / charCount);
  return Math.max(minFont, Math.min(maxFont, byWidth));
}

/**
 * 扁長紅框職名章（實物約 0.75×2.25cm）
 * 左職稱（四等分、字級不變、左側壓縮）／右姓名（六等分、標楷體、盡量填滿高度）
 * 會畢／閱畢顯示於戳章下方；簽文／指示顯示於戳章上方（簽文欄可寬於戳章，戳章置中）
 */
export const ElectronicStamp: React.FC<ElectronicStampProps> = ({
  stampCaption,
  officeLabel,
  titleLabel,
  personName,
  actionLabel,
  size = stampDisplayWidthPx(240),
  className = '',
}) => {
  const caption = (
    stampCaption ||
    [officeLabel, titleLabel || actionLabel].filter(Boolean).join('').trim() ||
    titleLabel ||
    actionLabel ||
    '—'
  )
    .trim()
    .replace(/^已/, '');
  const name = (personName || '').trim() || '—';
  const lines = splitStampCaptionLines(caption);
  const twoLine = lines.length === 2;

  // 職稱：字級依舊（以舊測寬計算）；畫入左四等分時只壓 textLength
  const titlePad = 2;
  const titleZoneInnerW = TITLE_ZONE_W - titlePad * 2;
  const longestTitle = Math.max(...lines.map((l) => [...l].length));
  const titleFont = maxFontForLine(
    longestTitle,
    twoLine ? TITLE_MEASURE_W_TWO : TITLE_MEASURE_W_ONE,
    twoLine ? TITLE_FONT_MAX_TWO : TITLE_FONT_MAX_ONE,
    twoLine ? 11 : 13
  );
  // 兩排同寬對齊；寬度不超過左四等分
  const titleBlockWidth = Math.min(titleZoneInnerW, longestTitle * titleFont);
  const titleLeftX = STAMP_INNER_LEFT + titlePad;
  // 姓名：六等分寬、字級貼齊內高；過寬時以 textLength 微壓字距／字形
  const nameChars = Math.max(1, [...name].length);
  const nameMaxW = NAME_ZONE_W - 4;
  const nameNaturalW = nameChars * NAME_FILL_FONT;
  const nameTextLength = Math.min(nameMaxW, Math.max(nameNaturalW * 0.88, NAME_FILL_FONT * 0.85));

  const widthPx = size;
  const heightPx = size / STAMP_ASPECT;

  return (
    <div
      className={`electronic-stamp-flat ${className}`.trim()}
      style={{
        width: widthPx,
        height: heightPx,
      }}
      aria-hidden
      title={`${caption} ${name}`}
    >
      <svg
        viewBox="0 0 225 75"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <rect
          x="2"
          y="2.5"
          width="221"
          height="70"
          fill="none"
          stroke={STAMP_RED}
          strokeWidth="2.2"
          rx="1"
        />

        {/* 左四等分：職銜（字級不變） */}
        {twoLine ? (
          <>
            <text
              x={titleLeftX}
              y="26"
              textAnchor="start"
              dominantBaseline="middle"
              fill={STAMP_RED}
              fontFamily={STAMP_KAI}
              fontSize={titleFont}
              textLength={titleBlockWidth}
              lengthAdjust="spacing"
            >
              {lines[0]}
            </text>
            <text
              x={titleLeftX}
              y="52"
              textAnchor="start"
              dominantBaseline="middle"
              fill={STAMP_RED}
              fontFamily={STAMP_KAI}
              fontSize={titleFont}
              textLength={titleBlockWidth}
              lengthAdjust="spacing"
            >
              {lines[1]}
            </text>
          </>
        ) : (
          <text
            x={titleLeftX + titleBlockWidth / 2}
            y="40"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={STAMP_RED}
            fontFamily={STAMP_KAI}
            fontSize={titleFont}
            letterSpacing="0.08em"
          >
            {lines[0]}
          </text>
        )}

        {/* 右六等分：姓名（標楷體、填滿高度） */}
        <text
          x={NAME_CENTER_X}
          y="39"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={STAMP_RED}
          fontFamily={STAMP_KAI}
          fontSize={NAME_FILL_FONT}
          textLength={nameTextLength}
          lengthAdjust="spacingAndGlyphs"
        >
          {name}
        </text>
      </svg>
    </div>
  );
};
