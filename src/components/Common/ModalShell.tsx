import React from 'react';

type ModalShellProps = {
  children: React.ReactNode;
  /** z-index，預設 z-50 */
  zClassName?: string;
  /** 遮罩背景 */
  backdropClassName?: string;
  /** 面板外觀（寬度、底色、圓角等） */
  panelClassName?: string;
  /**
   * panel：整塊面板可捲（表單類）
   * body：限制高度，由子層 flex-1 overflow-y-auto 捲動（有固定標題／底欄）
   * none：只修正外層置中裁切，不限制高度（列印預覽等）
   */
  scroll?: 'panel' | 'body' | 'none';
  maxHeightClassName?: string;
};

/**
 * 統一 Modal 外殼：避免 fixed + flex 垂直置中時，內容超出視窗卻捲不到頂／底。
 * body 模式另以 row wrapper 避開 Safari「僅 max-height 時 flex-1 不收縮」導致底欄被裁、點擊無反應。
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  children,
  zClassName = 'z-50',
  backdropClassName = 'bg-slate-950/70 backdrop-blur-xs',
  panelClassName = 'bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl',
  scroll = 'panel',
  maxHeightClassName = 'max-h-[min(92dvh,920px)]',
}) => {
  const panelScrollClass =
    scroll === 'panel'
      ? `${maxHeightClassName} overflow-y-auto overscroll-contain`
      : scroll === 'body'
        ? // min-h-0 + 明確 max-h：讓標題／底欄留在面板內，中間區塊捲動
          `${maxHeightClassName} overflow-hidden flex flex-col min-h-0`
        : 'overflow-visible';

  const panel = <div className={`${panelClassName} ${panelScrollClass}`}>{children}</div>;

  return (
    <div className={`fixed inset-0 ${zClassName} overflow-y-auto ${backdropClassName}`}>
      <div className="min-h-full flex items-end sm:items-center justify-center p-3 sm:p-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-6">
        {scroll === 'body' ? (
          // Safari：外層改 row flex，max-height 才會約束內層 column flex 的 flex-1 子層
          <div className="flex w-full max-w-full justify-center min-h-0">{panel}</div>
        ) : (
          panel
        )}
      </div>
    </div>
  );
};
