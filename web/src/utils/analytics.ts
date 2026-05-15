/**
 * Google Analytics 4 (gtag.js) ラッパ
 *
 * index.html で読み込まれた gtag が window に存在する前提。
 * 開発時 (gtag 未ロード) は no-op として動作。
 */

type GtagFn = (...args: unknown[]) => void

declare global {
  interface Window {
    gtag?: GtagFn
    dataLayer?: unknown[]
  }
}

/** カスタムイベントを GA4 に送信 */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const g = window.gtag
  if (typeof g !== 'function') return
  try {
    g('event', name, params ?? {})
  } catch (e) {
    // GA4 取得失敗時もアプリの動作は止めない
    console.debug('[analytics] trackEvent error:', e)
  }
}

/** ページビュー (SPA で route 切替時に呼ぶ。本ツールは単一ページなので初期表示時のみ自動送信に任せる) */
export function trackPageView(path: string): void {
  if (typeof window === 'undefined') return
  const g = window.gtag
  if (typeof g !== 'function') return
  try {
    g('event', 'page_view', { page_path: path })
  } catch {
    /* noop */
  }
}
