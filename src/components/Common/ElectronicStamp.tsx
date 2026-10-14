import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
/**
 * 標楷體優先（Windows DFKai-SB／macOS BiauKai）；
 * 系統沒有時用已載入的霞鶩文楷 LXGW WenKai。
 */
export const STAMP_KAI_FONT =
  '"標楷體", "DFKai-SB", "DFKaiShu-SB-Estd-BF", "BiauKai", "LXGW WenKai", "KaiTi", "STKaiti", serif';

/** 職稱：姓名 = 4：6（姓名佔六等分） */
const TITLE_SHARE = 4;
const NAME_SHARE = 6;
/** 姓名字級相對戳章高度的比例（盡量填滿並上下置中） */
const NAME_FONT_RATIO = 0.88;
/** 職稱字級上限（與改欄寬前相同） */
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
 * 左職稱（四等分、字級不變、左側壓縮）／右姓名（六等分、標楷體、上下置中填滿高度）
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

  const widthPx = size;
  const heightPx = size / STAMP_ASPECT;
  // viewBox 比例換算：舊 SVG 225 寬上的字級 → 螢幕 px
  const scale = widthPx / 225;
  const titleMeasureW = (twoLine ? TITLE_MEASURE_W_TWO : TITLE_MEASURE_W_ONE) * scale;
  const longestTitle = Math.max(...lines.map((l) => [...l].length));
  const titleFontPx = maxFontForLine(
    longestTitle,
    titleMeasureW,
    (twoLine ? TITLE_FONT_MAX_TWO : TITLE_FONT_MAX_ONE) * scale,
    (twoLine ? 11 : 13) * scale
  );
  const nameFontPx = heightPx * NAME_FONT_RATIO;
  const titleFlex = TITLE_SHARE;
  const nameFlex = NAME_SHARE;
  const nameChars = Math.max(1, [...name].length);
  // 姓名區約六等分寬；字級維持填滿高度，過寬時只做水平壓縮，避免蓋住職稱
  const nameZoneW =
    widthPx * (NAME_SHARE / (TITLE_SHARE + NAME_SHARE)) - Math.max(4, 6 * scale);
  const nameNaturalW = nameChars * nameFontPx * 0.98;
  const nameScaleX = Math.min(1, nameZoneW / nameNaturalW);

  return (
    <div
      className={`electronic-stamp-flat ${className}`.trim()}
      style={{
        width: widthPx,
        height: heightPx,
        boxSizing: 'border-box',
        border: `${Math.max(1.5, 2.2 * scale)}px solid ${STAMP_RED}`,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        overflow: 'hidden',
        color: STAMP_RED,
        fontFamily: STAMP_KAI_FONT,
        background: 'transparent',
      }}
      aria-hidden
      title={`${caption} ${name}`}
    >
      {/* 左四等分：職稱，整塊上下置中 */}
      <div
        style={{
          flex: `${titleFlex} 1 0`,
          minWidth: 0,
          maxWidth: `${(TITLE_SHARE / (TITLE_SHARE + NAME_SHARE)) * 100}%`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          paddingLeft: Math.max(2, 4 * scale),
          paddingRight: Math.max(1, 2 * scale),
          fontFamily: STAMP_KAI_FONT,
          zIndex: 1,
        }}
      >
        {twoLine ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: Math.max(1, 2 * scale),
              width: '100%',
            }}
          >
            {lines.map((line) => (
              <div
                key={line}
                style={{
                  fontSize: titleFontPx,
                  lineHeight: 1.05,
                  fontFamily: STAMP_KAI_FONT,
                  color: STAMP_RED,
                  whiteSpace: 'nowrap',
                  textAlign: 'justify',
                  textAlignLast: 'justify',
                  width: '100%',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: titleFontPx,
              lineHeight: 1,
              fontFamily: STAMP_KAI_FONT,
              color: STAMP_RED,
              letterSpacing: '0.08em',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {lines[0]}
          </div>
        )}
      </div>

      {/* 右六等分：姓名，上下置中、字級貼齊高度；水平壓縮以不溢出 */}
      <div
        style={{
          flex: `${nameFlex} 1 0`,
          minWidth: 0,
          maxWidth: `${(NAME_SHARE / (TITLE_SHARE + NAME_SHARE)) * 100}%`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingRight: Math.max(2, 3 * scale),
          overflow: 'hidden',
          fontFamily: STAMP_KAI_FONT,
        }}
      >
        <div
          style={{
            fontSize: nameFontPx,
            lineHeight: 1,
            fontFamily: STAMP_KAI_FONT,
            color: STAMP_RED,
            whiteSpace: 'nowrap',
            letterSpacing: nameChars >= 3 ? '-0.02em' : '0.06em',
            transform: `scaleX(${nameScaleX})`,
            transformOrigin: 'center center',
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
};
