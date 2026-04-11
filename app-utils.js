export const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export function stableStringify(value) {
    const seen = new WeakSet();
    const walk = (v) => {
        if (v === null) return "null";
        const t = typeof v;
        if (t === "number" || t === "boolean") return JSON.stringify(v);
        if (t === "string") return JSON.stringify(v);
        if (t === "undefined") return "null";
        if (t === "bigint") return JSON.stringify(String(v));
        if (t === "function") return "null";
        if (t !== "object") return "null";
        if (seen.has(v)) return '"[Circular]"';
        seen.add(v);
        if (Array.isArray(v)) return "[" + v.map(walk).join(",") + "]";
        const keys = Object.keys(v).sort();
        const parts = [];
        for (const k of keys) {
            const vv = v[k];
            if (typeof vv === "undefined") continue;
            parts.push(JSON.stringify(k) + ":" + walk(vv));
        }
        return "{" + parts.join(",") + "}";
    };
    return walk(value);
}

export function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashObject(obj) {
    return hash32(stableStringify(obj));
}

export const padRight = (s, n) => (String(s ?? "") + " ".repeat(n)).slice(0, n);
export const trimTo = (s, n) => String(s ?? "").slice(0, n);

export function normalizeZip5(v) {
    return String(v || "").replace(/\D+/g, "").slice(0, 5);
}

export function isValidZip5(v) {
    return /^\d{5}$/.test(String(v || ""));
}

export function feUuid() {
    try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
    } catch (e) { }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function slugifyKey(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/__+/g, "_");
}

export function nextKey(pack) {
    let i = 1;
    while (pack.boards[`stage_${i}`]) i++;
    return `stage_${i}`;
}

export function waitForGlobal(name, timeoutMs = 8000, pollMs = 50) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function tick() {
            if (window[name]) return resolve(window[name]);
            if (Date.now() - start >= timeoutMs) {
                return reject(new Error(`${name} not available after ${timeoutMs}ms`));
            }
            setTimeout(tick, pollMs);
        })();
    });
}

export function msToDelaySecondsValue(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n / 1000));
}

export function formatDelaySeconds(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return "—";
    return String(msToDelaySecondsValue(n)) + "s";
}

export function _digitsOnly(s) {
    return String(s || "").replace(/\D/g, "");
}

export function formatMMDDYYYYInput(raw) {
    const d = _digitsOnly(raw).slice(0, 8);
    if (!d) return "";
    const mm = d.slice(0, 2);
    const dd = d.slice(2, 4);
    const yy = d.slice(4, 8);
    let out = "";
    if (d.length <= 2) out = mm;
    else if (d.length <= 4) out = mm + "/" + dd;
    else out = mm + "/" + dd + "/" + yy;
    return out;
}

export function fromISOToMDY(iso) {
    const s = String(iso || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[2]}/${m[3]}/${m[1]}`;
}

export function toISOFromMDY(mdy) {
    const s = String(mdy || "").trim();
    if (!s) return "";
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
}