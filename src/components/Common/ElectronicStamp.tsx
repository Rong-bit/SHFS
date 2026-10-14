import React from 'react';

/** 官章紅（接近實物原子印章） */
const STAMP_RED = '#c41e3a';
/**
 * 標楷體優先（Windows DFKai-SB／macOS BiauKai）；
 * 系統沒有時用已載入的霞鶩文楷 LXGW WenKai。
 */
export const STAMP_KAI_FONT =
  '"標楷體", "DFKai-SB", "DFKaiShu-SB-Estd-BF", "BiauKai", "LXGW WenKai", "KaiTi", "STKaiti", serif';

/**
 * 左職稱／右姓名欄寬比。
 * 左欄略寬：維持職稱字級，並讓「教務主任」四字有空隙（勿壓扁）。
 */
const TITLE_SHARE = 4.5;
const NAME_SHARE = 5.5;
/** 姓名字級相對戳章內高 */
const NAME_FONT_RATIO = 0.92;
/** 職稱字級相對戳章內高（上限；會再依欄寬與字距下修） */
const TITLE_FONT_RATIO_TWO = 0.42;
const TITLE_FONT_RATIO_ONE = 0.5;
/** 職稱字距相對字寬（四字排略鬆於三字排） */
const TITLE_CHAR_GAP_RATIO = 0.22;

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

/** 單排職稱：固定字距等分拉開，兩排共用同一寬度 */
function TitleLine({
  text,
  fontSize,
  width,
  gap,
}: {
  text: string;
  fontSize: number;
  width: number;
  gap: number;
}) {
  const chars = [...text];
  if (chars.length <= 1) {
    return (
      <div
        style={{
          width,
          fontSize,
          lineHeight: 1,
          fontFamily: STAMP_KAI_FONT,
          color: STAMP_RED,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width,
        fontSize,
        lineHeight: 1,
        fontFamily: STAMP_KAI_FONT,
        color: STAMP_RED,
      }}
    >
      {chars.map((ch, i) => (
        <span key={`${ch}-${i}`} style={{ flex: '0 0 auto' }}>
          {ch}
        </span>
      ))}
    </div>
  );
}

/**
 * 扁長紅框職名章（實物約 0.75×2.25cm）
 * 左職稱二排同寬（字距拉開）／右姓名整塊上下置中；標楷體。
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
  const borderPx = Math.max(1.5, widthPx * 0.013);
  const innerH = Math.max(1, heightPx - borderPx * 2);
  const innerPadX = Math.max(3, widthPx * 0.022);
  const colGap = Math.max(5, widthPx * 0.04);

  const longestTitle = Math.max(...lines.map((l) => [...l].length));
  const titleMaxW = widthPx * (TITLE_SHARE / (TITLE_SHARE + NAME_SHARE)) - innerPadX * 0.3;
  // 字級須讓「最長一排 + 字距」放進左欄，避免四字被擠實
  const titleSlots = longestTitle + Math.max(0, longestTitle - 1) * TITLE_CHAR_GAP_RATIO;
  const titleFontPx = Math.min(
    innerH * (twoLine ? TITLE_FONT_RATIO_TWO : TITLE_FONT_RATIO_ONE),
    titleMaxW / Math.max(titleSlots, 1)
  );
  const titleCharGap = titleFontPx * TITLE_CHAR_GAP_RATIO;
  const titleBlockW = Math.min(
    titleMaxW,
    longestTitle * titleFontPx + Math.max(0, longestTitle - 1) * titleCharGap
  );

  const nameChars = Math.max(1, [...name].length);
  const nameAvailW =
    widthPx - borderPx * 2 - innerPadX * 2 - titleBlockW - colGap;
  // 字級貼齊高度（對齊參考圖）；寬度不足時用 letter-spacing／輕微 scaleX，不先砍字級
  const nameFontPx = innerH * NAME_FONT_RATIO;
  const nameNaturalW = nameChars * nameFontPx * 0.98;
  const nameScaleX = Math.min(1, nameAvailW / Math.max(nameNaturalW, 1));

  return (
    <div
      className={`electronic-stamp-flat ${className}`.trim()}
      style={{
        width: widthPx,
        height: heightPx,
        boxSizing: 'border-box',
        border: `${borderPx}px solid ${STAMP_RED}`,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
        color: STAMP_RED,
        fontFamily: STAMP_KAI_FONT,
        background: 'transparent',
        paddingLeft: innerPadX,
        paddingRight: innerPadX,
        gap: colGap,
      }}
      aria-hidden
      title={`${caption} ${name}`}
    >
      {/* 左：職稱二排同寬、字距拉開、上下置中 */}
      <div
        style={{
          flex: '0 0 auto',
          width: titleBlockW,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: Math.max(2, innerH * 0.12),
          fontFamily: STAMP_KAI_FONT,
        }}
      >
        {lines.map((line) => (
          <div key={line}>
            <TitleLine
              text={line}
              fontSize={titleFontPx}
              width={titleBlockW}
              gap={titleCharGap}
            />
          </div>
        ))}
      </div>

      {/* 右：姓名整塊幾何上下置中、字級貼齊高度 */}
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
            letterSpacing: nameChars >= 3 ? '0.04em' : '0.1em',
            transform: nameScaleX < 0.995 ? `scaleX(${nameScaleX})` : undefined,
            transformOrigin: 'center center',
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
};
