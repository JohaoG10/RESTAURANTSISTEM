const SRI_CONNECTIVITY_KEY = "sri_connectivity_cache";
const CACHE_TTL_MS = 5 * 60 * 1000;

type ConnectivityCache = {
  available: boolean;
  checkedAt: number;
};

export function getCachedSriConnectivity(): ConnectivityCache | null {
  try {
    const raw = localStorage.getItem(SRI_CONNECTIVITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectivityCache;
    if (Date.now() - parsed.checkedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedSriConnectivity(available: boolean): void {
  localStorage.setItem(
    SRI_CONNECTIVITY_KEY,
    JSON.stringify({ available, checkedAt: Date.now() } satisfies ConnectivityCache)
  );
}
