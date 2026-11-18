// Preferenze salvate nel browser: solo comodità, se lo storage non è disponibile si usano i default.
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`tkd.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`tkd.${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}
