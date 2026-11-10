/**
 * Firebase Realtime Database REST 客戶端：匿名 Auth + 可選 App Check。
 * 教師／教學組日常仍只使用「學校同步密碼」；此層在背景取得 token，避免公開規則被匿名狂讀。
 */

export type FirebaseWebConfig = {
  apiKey: string;
  appId: string;
  appCheckSiteKey: string;
};

/** 預設專案公開 Web 設定（非機密；請在 Firebase Console 啟用匿名登入與 App Check） */
export const DEFAULT_FIREBASE_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: '',
  appId: '',
  appCheckSiteKey: '',
};

type IdTokenCache = {
  apiKey: string;
  idToken: string;
  refreshToken: string;
  expiresAtMs: number;
};

type AppCheckCache = {
  appId: string;
  token: string;
  expiresAtMs: number;
};

let idTokenCache: IdTokenCache | null = null;
let idTokenInflight: Promise<string | null> | null = null;
let appCheckCache: AppCheckCache | null = null;
let appCheckInflight: Promise<string | null> | null = null;
let recaptchaLoader: Promise<void> | null = null;

const hasWindow = () => typeof window !== 'undefined';

/** 從 RTDB 網址推斷 Firebase projectId */
export const projectIdFromDatabaseUrl = (databaseUrl: string): string | null => {
  try {
    const host = new URL(databaseUrl.trim()).hostname.toLowerCase();
    if (host.endsWith('.firebaseio.com')) {
      return host.split('.')[0] || null;
    }
    const defaultRtdb = host.match(/^([a-z0-9-]+)-default-rtdb\./);
    if (defaultRtdb) return defaultRtdb[1];
    const first = host.split('.')[0];
    return first || null;
  } catch {
    return null;
  }
};

export const appendQueryParam = (url: string, key: string, value: string): string => {
  const hashIdx = url.indexOf('#');
  const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const sep = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
};

const refreshIdToken = async (apiKey: string, refreshToken: string): Promise<IdTokenCache> => {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Firebase Auth 重新整理失敗（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
  };
  if (!json.id_token || !json.refresh_token) {
    throw new Error('Firebase Auth 重新整理回應不完整');
  }
  const expiresInSec = Number(json.expires_in || '3600');
  return {
    apiKey,
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };
};

const signInAnonymously = async (apiKey: string): Promise<IdTokenCache> => {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Firebase 匿名登入失敗（HTTP ${res.status}）。請在 Console 啟用 Anonymous Authentication，並確認 Web API 金鑰正確。${
        detail ? ` ${detail.slice(0, 180)}` : ''
      }`
    );
  }
  const json = (await res.json()) as {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
  };
  if (!json.idToken || !json.refreshToken) {
    throw new Error('Firebase 匿名登入回應不完整');
  }
  const expiresInSec = Number(json.expiresIn || '3600');
  return {
    apiKey,
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };
};

/** 取得 Firebase ID token（匿名）；無 apiKey 時回傳 null（相容舊的公開規則） */
export const getFirebaseIdToken = async (apiKey: string): Promise<string | null> => {
  const key = apiKey.trim();
  if (!key) return null;

  if (idTokenCache && idTokenCache.apiKey === key && idTokenCache.expiresAtMs > Date.now()) {
    return idTokenCache.idToken;
  }

  if (idTokenInflight) return idTokenInflight;

  idTokenInflight = (async () => {
    try {
      if (idTokenCache && idTokenCache.apiKey === key && idTokenCache.refreshToken) {
        try {
          idTokenCache = await refreshIdToken(key, idTokenCache.refreshToken);
          return idTokenCache.idToken;
        } catch {
          idTokenCache = null;
        }
      }
      idTokenCache = await signInAnonymously(key);
      return idTokenCache.idToken;
    } finally {
      idTokenInflight = null;
    }
  })();

  return idTokenInflight;
};

const loadRecaptchaV3 = async (siteKey: string): Promise<void> => {
  if (!hasWindow()) return;
  const w = window as Window & {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  };
  if (w.grecaptcha?.execute) return;

  if (!recaptchaLoader) {
    recaptchaLoader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-shfs-recaptcha="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('reCAPTCHA 腳本載入失敗')));
        return;
      }
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.dataset.shfsRecaptcha = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('reCAPTCHA 腳本載入失敗'));
      document.head.appendChild(script);
    });
  }
  await recaptchaLoader;
};

const exchangeRecaptchaForAppCheck = async (params: {
  projectId: string;
  appId: string;
  recaptchaToken: string;
}): Promise<AppCheckCache> => {
  const { projectId, appId, recaptchaToken } = params;
  const endpoint = `https://content-firebaseappcheck.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/apps/${encodeURIComponent(appId)}:exchangeRecaptchaV3Token`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recaptcha_v3_token: recaptchaToken }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `App Check 換票失敗（HTTP ${res.status}）。請確認 App Check（reCAPTCHA v3）已註冊。${
        detail ? ` ${detail.slice(0, 180)}` : ''
      }`
    );
  }
  const json = (await res.json()) as { token?: string; ttl?: string };
  if (!json.token) throw new Error('App Check 回應缺少 token');
  // ttl 形如 "3600s"
  const ttlSec = Number(String(json.ttl || '3600').replace(/s$/i, '')) || 3600;
  return {
    appId,
    token: json.token,
    expiresAtMs: Date.now() + Math.max(60, ttlSec - 60) * 1000,
  };
};

export const getAppCheckToken = async (params: {
  databaseUrl: string;
  appId: string;
  appCheckSiteKey: string;
}): Promise<string | null> => {
  const appId = params.appId.trim();
  const siteKey = params.appCheckSiteKey.trim();
  if (!appId || !siteKey || !hasWindow()) return null;

  if (appCheckCache && appCheckCache.appId === appId && appCheckCache.expiresAtMs > Date.now()) {
    return appCheckCache.token;
  }
  if (appCheckInflight) return appCheckInflight;

  appCheckInflight = (async () => {
    try {
      const projectId = projectIdFromDatabaseUrl(params.databaseUrl);
      if (!projectId) {
        throw new Error('無法從資料庫網址判斷 Firebase projectId，請檢查網址格式。');
      }
      await loadRecaptchaV3(siteKey);
      const w = window as Window & {
        grecaptcha?: {
          ready: (cb: () => void) => void;
          execute: (siteKey: string, opts: { action: string }) => Promise<string>;
        };
      };
      if (!w.grecaptcha) throw new Error('reCAPTCHA 尚未就緒');
      const recaptchaToken = await new Promise<string>((resolve, reject) => {
        w.grecaptcha!.ready(() => {
          w.grecaptcha!.execute(siteKey, { action: 'rtdb' }).then(resolve, reject);
        });
      });
      appCheckCache = await exchangeRecaptchaForAppCheck({ projectId, appId, recaptchaToken });
      return appCheckCache.token;
    } finally {
      appCheckInflight = null;
    }
  })();

  return appCheckInflight;
};

export type RtdbFetchConfig = FirebaseWebConfig & {
  databaseUrl: string;
  /** 設為 true 時，若有 apiKey 但拿不到 token 就拋錯（測試連線用） */
  requireAuth?: boolean;
};

/**
 * 對 RTDB REST 發出請求：自動附上 auth=ID_TOKEN，並在設定齊全時附上 X-Firebase-AppCheck。
 * 未設定 apiKey 時行為與舊版相同（相容仍開放的規則）。
 */
export const rtdbFetch = async (
  url: string,
  init: RequestInit | undefined,
  config: RtdbFetchConfig
): Promise<Response> => {
  const apiKey = (config.apiKey || '').trim();
  let finalUrl = url;
  const headers = new Headers(init?.headers || {});

  if (apiKey) {
    const idToken = await getFirebaseIdToken(apiKey);
    if (!idToken) {
      if (config.requireAuth) {
        throw new Error('無法取得 Firebase Auth token，請確認 Web API 金鑰與匿名登入設定。');
      }
    } else {
      finalUrl = appendQueryParam(url, 'auth', idToken);
    }
  } else if (config.requireAuth) {
    throw new Error('請填寫 Firebase Web API 金鑰（專案設定 → 一般 → 網頁應用程式）。');
  }

  const appCheckToken = await getAppCheckToken({
    databaseUrl: config.databaseUrl,
    appId: config.appId || '',
    appCheckSiteKey: config.appCheckSiteKey || '',
  });
  if (appCheckToken) {
    headers.set('X-Firebase-AppCheck', appCheckToken);
  }

  return fetch(finalUrl, { ...init, headers });
};

/** 測試用：清除 token 快取 */
export const resetFirebaseRtdbClientCaches = () => {
  idTokenCache = null;
  idTokenInflight = null;
  appCheckCache = null;
  appCheckInflight = null;
  recaptchaLoader = null;
};
