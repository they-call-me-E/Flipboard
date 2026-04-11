import {
    deepClone,
    stableStringify,
    hash32,
    hashObject,
    padRight,
    trimTo,
    normalizeZip5,
    isValidZip5,
    feUuid,
    slugifyKey,
    nextKey,
    waitForGlobal,
    msToDelaySecondsValue,
    formatDelaySeconds,
    _digitsOnly,
    formatMMDDYYYYInput,
    fromISOToMDY,
    toISOFromMDY
} from "./app-utils.js";
import {
    DUMMY_PACK,
    pack,
    setPack,
    draft,
    draftSaved,
    packSaved,
    eventsDoc,
    bumpEventsLoadSeq,
    setEventsDoc,
    setPackSaved,
    setEventsSaved,
    packIsDirty,
    eventsDirty,
    editorIsDirty,
    exposePack,
    ensurePackDefaults,
    ensureWeatherShape,
    selectedKey,
    setSelectedKey,
    setDraft,
    setDraftSaved,
    setLastFocusedRowInput,
    getCols,
    getRows
} from "./app-state.js";

/* ============================================================
   Dummy fallback pack (used only if Firestore load fails)
============================================================ */
// const DUMMY_PACK = {
//     "meta": {
//         "grid": { "columns": 20, "rows": 8 },
//         "description": "FlipBoard Demo Pack — Split Flap Dashboard",
//         "weather": {
//             "location": {
//                 "type": "zip",
//                 "value": "60601",
//                 "label": "CHICAGO IL"
//             }
//         }
//     },
//     "rotation": {
//         "enabled": true,
//         "dwell_ms": 15000,
//         "order": [
//             "welcome",
//             "weather_main",
//             "system_status",
//             "daily_agenda"
//         ]
//     },
//     "boards": {
//         "welcome": {
//             "name": "Welcome",
//             "type": "static",
//             "rows": [
//                 "FLIPBOARD           ",
//                 "DIGITAL DASHBOARD   ",
//                 "                    ",
//                 "REAL TIME DATA      ",
//                 "ROTATING DISPLAY    ",
//                 "                    ",
//                 "CONFIGURABLE PANELS ",
//                 "                    "
//             ]
//         },
//         "weather_main": {
//             "name": "Weather — Local",
//             "type": "dynamic",
//             "source": "openweather_onecall",
//             "rows": [
//                 "{LOCATION}          ",
//                 "TEMP: {TEMP_LINE}   ",
//                 "{CONDITION_LINE}    ",
//                 "{WIND_LINE}         ",
//                 "HUM: {current.humidity}%",
//                 "UV:  {current.uvi}   ",
//                 "UPDATED: {TIME}     ",
//                 "                    "
//             ]
//         },
//         "system_status": {
//             "name": "System Status",
//             "type": "static",
//             "rows": [
//                 "SYSTEM STATUS       ",
//                 "FIRESTORE: ONLINE   ",
//                 "WEATHER: CONNECTED  ",
//                 "ROTATION: ENABLED   ",
//                 "                    ",
//                 "GRID: 20 x 8        ",
//                 "DWELL: 15 SECONDS   ",
//                 "                    "
//             ]
//         },
//         "daily_agenda": {
//             "name": "Daily Agenda",
//             "type": "static",
//             "rows": [
//                 "TODAY               ",
//                 "8:00 AM  TEAM SYNC  ",
//                 "10:30 AM DESIGN REV ",
//                 "1:00 PM  CLIENT MTG ",
//                 "3:30 PM  BUILD TEST ",
//                 "6:00 PM  GYM        ",
//                 "                    ",
//                 "                    "
//             ]
//         }
//     }
// };

/* ============================================================
   Token helper config (editor-only)
============================================================ */
const TOKEN_GROUPS = [
    {
        title: "Preset Weather Tokens (recommended)",
        defaultOpen: false,
        items: [
            { token: "{LOCATION}", desc: "Resolved display location for this pack (from Weather Label)." },
            { token: "{TIME}", desc: "Weather timestamp (from OpenWeather data time), formatted by Flipboard." },
            { token: "{TEMP_LINE}", desc: "Temp display line (ex: 72° or 72° FEELS: 68°)." },
            { token: "{TEMP}", desc: "Just the current temperature (ex: 72°)." },
            { token: "{FEELS}", desc: "Just feels-like temperature (ex: 68°)." },
            { token: "{CONDITION_LINE}", desc: "Condition text (ex: MOSTLY CLOUDY)." },
            { token: "{WIND_LINE}", desc: "Wind display line (ex: WND: 7MPH)." }
        ]
    },
    {
        title: "Common Weather JSON Paths (advanced)",
        defaultOpen: false,
        items: [
            { token: "{current.temp}", desc: "Current temperature (number)." },
            { token: "{current.feels_like}", desc: "Feels-like temperature (number)." },
            { token: "{current.wind_speed}", desc: "Wind speed (number)." },
            { token: "{current.humidity}", desc: "Humidity percent (number)." },
            { token: "{current.pressure}", desc: "Pressure (hPa) (number)." },
            { token: "{current.weather[0].main}", desc: "Weather main (ex: CLOUDS)." },
            { token: "{current.weather[0].description}", desc: "Weather description (ex: SCATTERED CLOUDS)." },
            { token: "{current.uvi}", desc: "UV index (number)." }
        ]
    },
    {
        title: "Countdown Tokens",
        defaultOpen: false,
        items: [
            { token: "{COUNTDOWN CHRISTMAS.DAYS}", desc: "Days until the event date." },
            { token: "{COUNTDOWN CHRISTMAS.TITLE}", desc: "Event title." },
            { token: "{COUNTDOWN CHRISTMAS.DATE}", desc: "Event date (YYYY-MM-DD)." }
        ]
    }
];

// /* ============================================================
//    Utilities
// ============================================================ */
// function ensurePackDefaults(p) {
//     if (!p || typeof p !== "object") return p;

//     p.meta = (p.meta && typeof p.meta === "object") ? p.meta : {};
//     p.meta.ui = (p.meta.ui && typeof p.meta.ui === "object") ? p.meta.ui : {};
//     if (!Number.isInteger(p.meta.ui.flip_speed)) p.meta.ui.flip_speed = 3;

//     p.meta.grid = (p.meta.grid && typeof p.meta.grid === "object") ? p.meta.grid : {};
//     if (!Number.isInteger(p.meta.grid.columns)) p.meta.grid.columns = 20;
//     if (!Number.isInteger(p.meta.grid.rows)) p.meta.grid.rows = 8;

//     p.rotation = (p.rotation && typeof p.rotation === "object") ? p.rotation : {};
//     if (typeof p.rotation.enabled !== "boolean") p.rotation.enabled = true;
//     if (!Number.isInteger(p.rotation.dwell_ms)) p.rotation.dwell_ms = 15000;
//     if (!Array.isArray(p.rotation.order)) p.rotation.order = [];

//     p.boards = (p.boards && typeof p.boards === "object") ? p.boards : {};

//     return p;
// }


/* ============================================================
   Debug logging (opt-in via localStorage flip_debug=1 or window.FLIP_DEBUG=true)
   - Keep this lightweight and non-invasive
============================================================ */
const DEBUG = (() => {
    try { return localStorage.getItem("flip_debug") === "1"; } catch (e) { return false; }
})() || (window.FLIP_DEBUG === true);
let _lastDirtyState = null;

function dbg(...args) { if (DEBUG) console.log("[FlipEditor]", ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn("[FlipEditor]", ...args); }
function dbgGroup(title, fn) {
    if (!DEBUG) return fn();
    console.groupCollapsed("[FlipEditor] " + title);
    try { return fn(); } finally { console.groupEnd(); }
}


window.setFlipDebug = (on) => {
    try { localStorage.setItem("flip_debug", on ? "1" : "0"); } catch (e) { /* ignore */ }
    location.reload();
};

function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1400);
}


function confirmUnsavedAction({ title = "Unsaved changes", sub = "You have unsaved changes.", hint = "" } = {}) {
    const modal = document.getElementById("confirmModal");
    const elTitle = document.getElementById("confirmTitle");
    const elSub = document.getElementById("confirmSub");
    const elHint = document.getElementById("confirmHint");
    const btnSave = document.getElementById("confirmSave");
    const btnDiscard = document.getElementById("confirmDiscard");
    const btnCancel = document.getElementById("confirmCancel");
    const btnX = document.getElementById("confirmX");

    const prevFocus = document.activeElement;

    if (!modal || !btnSave || !btnDiscard || !btnCancel) {
        const ok = confirm(`${title}\n\n${sub}\n\n${hint}`.trim());
        return Promise.resolve(ok ? "discard" : "cancel");
    }

    elTitle.textContent = title || "Unsaved changes";
    elSub.textContent = sub || "";
    elHint.textContent = hint || "";
    elHint.style.display = hint ? "" : "none";

    modal.inert = false;
    modal.style.display = "";
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("show");

    return new Promise((resolve) => {
        const restoreFocus = () => {
            try {
                const ae = document.activeElement;
                if (ae && modal.contains(ae)) {
                    if (prevFocus && typeof prevFocus.focus === "function" && !modal.contains(prevFocus)) prevFocus.focus();
                    else if (typeof document.body.focus === "function") document.body.focus();
                }
            } catch (_) { }
        };

        const cleanup = () => {
            btnSave.removeEventListener("click", onSave);
            btnDiscard.removeEventListener("click", onDiscard);
            btnCancel.removeEventListener("click", onCancel);
            btnX?.removeEventListener("click", onX);
            modal.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKey);

            restoreFocus();

            modal.classList.remove("show");
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            modal.inert = true;
        };

        const finish = (choice) => { cleanup(); resolve(choice); };

        const onSave = (e) => { e.preventDefault(); finish("save"); };
        const onDiscard = (e) => { e.preventDefault(); finish("discard"); };
        const onCancel = (e) => { e.preventDefault(); finish("cancel"); };
        const onX = (e) => { e.preventDefault(); finish("cancel"); };

        const onBackdrop = (e) => { if (e.target === modal) finish("cancel"); };
        const onKey = (e) => { if (e.key === "Escape") finish("cancel"); };

        btnSave.addEventListener("click", onSave);
        btnDiscard.addEventListener("click", onDiscard);
        btnCancel.addEventListener("click", onCancel);
        btnX?.addEventListener("click", onX);
        modal.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKey);
    });
}



function anyFirestoreDirty() {
    try { return (typeof packIsDirty === "function" && packIsDirty()) || (typeof editorIsDirty === "function" && editorIsDirty()) || (typeof eventsDirty === "function" && eventsDirty()); }
    catch (_) { return false; }
}
// Force-reset dirty baselines (used after device add/switch flows that write seed data).
function forceClearDirtyBaselines() {
    try {
        if (typeof pack !== 'undefined' && pack) setPackSaved(pack);
        if (typeof eventsData !== 'undefined' && eventsData) setEventsSaved(eventsData);
        if (typeof draft !== 'undefined' && draft) {
            try { setDraftSaved(JSON.parse(JSON.stringify(draft))); } catch (_) { /* noop */ }
        }
    } catch (e) {
        console.warn('[EDITOR] forceClearDirtyBaselines failed:', e);
    }
    try { updateDirtyIndicators && updateDirtyIndicators(); } catch (_) { }
}


// Phase 2B: browser close/refresh guard (Firestore-backed only)
window.addEventListener("beforeunload", (e) => {
    if (!anyFirestoreDirty()) return;
    e.preventDefault();
    e.returnValue = "";
});


/* ============================================================
   ✅ TOKEN ENGINE: COLOR + COUNTDOWN
   - Valid tokens are ignored for visible-count + trimming
   - Invalid tokens count as normal text
   - Trimming preserves tokens exactly (no auto-format)
   - Normalization (uppercase) happens on Fix / blur / Save / pad/trim all
============================================================ */

// --- COLOR ---
const COLOR_TOKEN_CANDIDATE_RE = /\{COLOR[^}]*\}/gi;

function isValidColorToken(token) {
    if (typeof token !== "string") return false;
    if (!token.startsWith("{") || !token.endsWith("}")) return false;

    // strict: "COLOR " (one space)
    const inner = token.slice(1, -1);
    if (!/^COLOR\s/i.test(inner)) return false;
    if (!/^COLOR [^\s].*$/i.test(inner)) return false;        // must have exactly one space after COLOR
    if (/^COLOR  /i.test(inner)) return false;                // two spaces after COLOR invalid
    if (/\s{2,}/.test(inner)) return false;                   // extra spaces anywhere invalid
    if (/\s$/.test(inner)) return false;                      // trailing space invalid

    const value = inner.slice(6); // after "COLOR "
    if (!value) return false;
    if (value.includes(" ")) return false;

    const up = String(value).toUpperCase();

    if (up === "RESET") return true;
    if (/^[A-Z]+$/.test(up)) return true;

    if (/^#[0-9A-F]{3}$/.test(up)) return true;
    if (/^#[0-9A-F]{6}$/.test(up)) return true;
    if (/^#[0-9A-F]{8}$/.test(up)) return true;

    if (/^RGB\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(up)) {
        const nums = up.slice(4, -1).split(",").map(n => Number(n));
        return nums.every(n => Number.isFinite(n) && n >= 0 && n <= 255);
    }

    if (/^RGBA\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\)$/.test(up)) {
        const parts = up.slice(5, -1).split(",");
        const rgb = parts.slice(0, 3).map(n => Number(n));
        const a = Number(parts[3]);
        return rgb.every(n => Number.isFinite(n) && n >= 0 && n <= 255) &&
            Number.isFinite(a) && a >= 0 && a <= 1;
    }

    return false;
}

function validateColorTokens(line) {
    const s = String(line ?? "");
    const out = { validTokens: [], invalidTokens: [] };
    let m;
    COLOR_TOKEN_CANDIDATE_RE.lastIndex = 0;
    while ((m = COLOR_TOKEN_CANDIDATE_RE.exec(s)) !== null) {
        const token = m[0];
        const start = m.index;
        const end = start + token.length;
        (isValidColorToken(token) ? out.validTokens : out.invalidTokens).push({ token, start, end });
    }
    return out;
}

// --- COUNTDOWN ---
const COUNTDOWN_TOKEN_CANDIDATE_RE = /\{COUNTDOWN[^}]*\}/gi;
const COUNTDOWN_STRICT_RE = /^\{COUNTDOWN [A-Z0-9_]+\.(DAYS|TITLE|DATE)\}$/i;

function isValidCountdownToken(token) {
    if (typeof token !== "string") return false;
    return COUNTDOWN_STRICT_RE.test(String(token).trim());
}

function validateCountdownTokens(line) {
    const s = String(line ?? "");
    const out = { validTokens: [], invalidTokens: [] };
    let m;
    COUNTDOWN_TOKEN_CANDIDATE_RE.lastIndex = 0;
    while ((m = COUNTDOWN_TOKEN_CANDIDATE_RE.exec(s)) !== null) {
        const token = m[0];
        const start = m.index;
        const end = start + token.length;
        (isValidCountdownToken(token) ? out.validTokens : out.invalidTokens).push({ token, start, end });
    }
    return out;
}

// While typing, allow temporary "incomplete" tokens so users can finish them.
// If the caret is currently inside an unclosed {COLOR ... or {COUNTDOWN ... token, we avoid hard-trimming.
function isCaretInOpenToken(text, caretIndex) {
    const s = String(text ?? "");
    const i = Math.max(0, Math.min(Number.isFinite(caretIndex) ? caretIndex : s.length, s.length));

    // Find the last "{" before the caret that is not closed by a "}" before the caret.
    const open = s.lastIndexOf("{", i - 1);
    if (open === -1) return false;

    const close = s.indexOf("}", open + 1);
    if (close !== -1 && close < i) return false; // closed before caret

    const head = s.slice(open, i).toUpperCase();

    // Only treat these as "tokens in progress" (so normal text still trims normally).
    return head.startsWith("{COLOR") || head.startsWith("{COUNTDOWN");
}


function readControlTokenAt(line, index) {
    const s = String(line ?? "");
    const i = Number(index) || 0;
    if (s[i] !== "{") return null;

    const close = s.indexOf("}", i);
    if (close === -1) return null;

    const tokRaw = s.slice(i, close + 1);
    if (/^\{COLOR/i.test(tokRaw) && isValidColorToken(tokRaw)) {
        return { token: tokRaw, end: close + 1, kind: "color" };
    }
    if (/^\{COUNTDOWN/i.test(tokRaw) && isValidCountdownToken(tokRaw)) {
        return { token: tokRaw, end: close + 1, kind: "countdown" };
    }
    return null;
}

function stripValidTokens(line) {
    const s = String(line ?? "");
    let out = "";

    for (let i = 0; i < s.length;) {
        const tok = (s[i] === "{") ? readControlTokenAt(s, i) : null;
        if (tok) {
            i = tok.end;
            continue;
        }
        out += s[i];
        i++;
    }
    return out;
}

function getVisibleLength(line) {
    return stripValidTokens(String(line ?? "")).length;
}

// Trim to visible cols, preserving VALID control tokens exactly as typed.
// If the user is actively typing an open control token, do not cut that token apart.
function trimToVisibleCols(line, cols, opts = {}) {
    const s = String(line ?? "");
    const max = Math.max(0, Number(cols || 0));
    const caret = Number.isFinite(opts.caret) ? opts.caret : s.length;
    const preserveOpenToken = opts.preserveOpenToken !== false;

    let visible = 0;
    let out = "";

    for (let i = 0; i < s.length;) {
        const tok = (s[i] === "{") ? readControlTokenAt(s, i) : null;
        if (tok) {
            out += tok.token;
            i = tok.end;
            continue;
        }

        if (preserveOpenToken && s[i] === "{") {
            const close = s.indexOf("}", i);
            if (close === -1) {
                const head = s.slice(i, Math.max(i, caret)).toUpperCase();
                if (head.startsWith("{COLOR") || head.startsWith("{COUNTDOWN")) {
                    out += s.slice(i);
                    break;
                }
            }
        }

        if (visible >= max) break;
        out += s[i];
        visible++;
        i++;
    }

    return out;
}

function padToVisibleCols(line, cols) {
    const s = String(line ?? "");
    const max = Math.max(0, Number(cols || 0));
    const need = max - getVisibleLength(s);
    if (need <= 0) return s;
    return s + " ".repeat(need);
}

// normalize on demand (Fix/Blur/Save/PadAll/TrimAll)
function normalizeLineForGrid(line, cols, justify = "left") {
    let v = String(line ?? "");
    v = fixColorTokensInLine(v);
    v = fixCountdownTokensInLine(v);
    v = v.toUpperCase();                 // runtime behavior
    v = trimToVisibleCols(v, cols);
    v = applyRowJustify(v, cols, justify);
    return v;
}

function rtrimSpaces(line) {
    return String(line ?? "").replace(/\s+$/g, "");
}

function stripOuterPadding(line) {
    return String(line ?? "").replace(/^\s+|\s+$/g, "");
}

function normalizeJustifyValue(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (s == "right" || s == "center") return s;
    return "left";
}

function ensureBoardRowJustify(board, rows) {
    if (!board || typeof board !== "object") return [];
    const count = Math.max(0, Number(rows || 0));
    const src = Array.isArray(board.row_justify) ? board.row_justify : [];
    board.row_justify = Array.from({ length: count }, (_, i) => normalizeJustifyValue(src[i]));
    return board.row_justify;
}

function applyRowJustify(line, cols, justify) {
    const max = Math.max(0, Number(cols || 0));
    const mode = normalizeJustifyValue(justify);
    const core = trimToVisibleCols(stripOuterPadding(String(line ?? "")), max);
    const visible = getVisibleLength(core);
    const need = Math.max(0, max - visible);

    if (mode === "right") {
        return " ".repeat(need) + core;
    }
    if (mode === "center") {
        const left = Math.floor(need / 2);
        const right = need - left;
        return " ".repeat(left) + core + " ".repeat(right);
    }
    return core + " ".repeat(need);
}
function normalizePack(p) {
    p ||= {};
    p.meta ||= { grid: { columns: 20, rows: 8 }, description: "", weather: {} };
    p.meta.grid ||= { columns: 20, rows: 8 };
    p.rotation ||= { enabled: true, dwell_ms: 15000, order: [] };
    p.rotation.order ||= [];

    if (!p.boards || typeof p.boards !== "object") p.boards = {};
    if (Object.keys(p.boards).length === 0 && p.stages && typeof p.stages === "object") {
        p.boards = JSON.parse(JSON.stringify(p.stages));
    }

    // Ensure meta.ui.flip_speed (1–5) exists without clobbering other meta keys
    Object.keys(p.boards || {}).forEach((key) => {
        const b = p.boards[key];
        if (!b || typeof b !== "object") return;
        if (!Array.isArray(b.rows)) b.rows = [];
        ensureBoardRowJustify(b, b.rows.length || (p.meta?.grid?.rows ?? 8));
    });
    if (!p.meta.ui || typeof p.meta.ui !== "object") p.meta.ui = {};
    const rawFlip = p.meta.ui.flip_speed;
    let fs = Number.isFinite(rawFlip) ? rawFlip : parseInt(rawFlip, 10);
    if (!Number.isFinite(fs)) fs = 3;
    fs = Math.max(1, Math.min(5, Math.round(fs)));
    p.meta.ui.flip_speed = fs;

    ensureWeatherShape();
    return p;
}

function fixColorTokensInLine(line) {
    const s = String(line ?? "");
    return s.replace(/\{COLOR[^}]*\}/gi, (tok) => {
        let inner = tok.slice(1, -1);
        inner = inner.replace(/^color\s+/i, "COLOR ");
        inner = inner.replace(/\s+/g, " ").trim();

        // If it doesn't even look like COLOR, keep user intent but normalize casing
        if (!inner.toUpperCase().startsWith("COLOR ")) return tok;

        const value = inner.slice(6).trim();
        const normalized = `COLOR ${value.replace(/\s+/g, "")}`;
        const finalTok = `{${normalized}}`;

        return isValidColorToken(finalTok) ? finalTok : tok;
    });
}

// Normalize COUNTDOWN tokens on Fix/Save (uppercase COUNTDOWN + EVENT + FIELD)
function fixCountdownTokensInLine(line) {
    const s = String(line ?? "");

    return s.replace(/\{COUNTDOWN[^}]*\}/gi, (tok) => {
        const raw = String(tok).trim();

        let inner = raw.slice(1, -1).trim();

        inner = inner.replace(/^COUNTDOWN\s*:\s*/i, "COUNTDOWN ");
        inner = inner.replace(/^COUNTDOWN\s+/i, "COUNTDOWN ");
        inner = inner.replace(/\s+/g, " ").trim();

        if (!/^COUNTDOWN /i.test(inner)) return tok;

        const rest = inner.slice("COUNTDOWN ".length).trim();
        const m = rest.match(/^([A-Z0-9_]+)\.(DAYS|TITLE|DATE)$/i);
        if (!m) return tok;

        const evKey = m[1].toUpperCase();
        const field = m[2].toUpperCase();

        const normalized = `{COUNTDOWN ${evKey}.${field}}`;
        return isValidCountdownToken(normalized) ? normalized : tok;
    });
}

/* ============================================================
   ✅ NEW COLOR PICKER MODULE (unchanged)
============================================================ */
(function () {
    const backdrop = document.getElementById('fpColorBackdrop');
    const btnClose = document.getElementById('fpColorClose');
    const btnCancel = document.getElementById('fpCancel');
    const btnApply = document.getElementById('fpApply');

    const modeDot = document.getElementById('fpModeDot');
    const modeText = document.getElementById('fpModeText');
    const preview = document.getElementById('fpPreview');

    const cv = document.getElementById('fpSvCanvas');
    const ctx = cv.getContext('2d');

    const hueEl = document.getElementById('fpHue');
    const alphaEl = document.getElementById('fpAlpha');

    const hexEl = document.getElementById('fpHex');
    const fmtEl = document.getElementById('fpFormat');
    const rEl = document.getElementById('fpR');
    const gEl = document.getElementById('fpG');
    const bEl = document.getElementById('fpB');
    const aEl = document.getElementById('fpA');

    const swatchRow = document.getElementById('fpSwatchRow');
    const liveOut = document.getElementById('fpLiveOut');

    let targetEl = null;
    let editRange = null;
    let lastPointerType = "mouse";

    let lastUsedRGBA = { r: 255, g: 255, b: 255, a: 1 };

    const state = { h: 210, s: 0.5, v: 0.8, a: 1.0 };
    const SWATCHES = ["#FFFFFF", "#3FB1CE", "#59A5FF", "#FF6A3D", "#494BCE", "#00C48C", "#FFC542", "#FF3D71"];

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const clamp255 = (x) => Math.max(0, Math.min(255, x | 0));
    const clamp360 = (x) => ((x % 360) + 360) % 360;
    const round2 = (x) => Math.round(x * 100) / 100;

    function isWordChar(ch) { return !!ch && /[A-Za-z0-9_]/.test(ch); }

    function rgbToHex(r, g, b) {
        const h = (n) => n.toString(16).padStart(2, '0').toUpperCase();
        return `#${h(clamp255(r))}${h(clamp255(g))}${h(clamp255(b))}`;
    }

    function extractStrictColorValueFromToken(rawToken) {
        const t = String(rawToken).trim();
        const m = t.match(/^\{COLOR ([^}]+)\}$/i);
        return m ? m[1].trim() : null;
    }

    function hexToRgb(hex) {
        let s = String(hex || "").trim();
        if (s.startsWith("{")) s = extractStrictColorValueFromToken(s) || s;
        if (!s.startsWith("#")) s = "#" + s;
        const m = s.match(/^#([0-9a-fA-F]{6})$/);
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function hsvToRgb(h, s, v) {
        h = clamp360(h); s = clamp01(s); v = clamp01(v);
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let rp = 0, gp = 0, bp = 0;
        if (h < 60) { rp = c; gp = x; }
        else if (h < 120) { rp = x; gp = c; }
        else if (h < 180) { gp = c; bp = x; }
        else if (h < 240) { gp = x; bp = c; }
        else if (h < 300) { rp = x; bp = c; }
        else { rp = c; bp = x; }
        return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) };
    }

    function rgbToHsv(r, g, b) {
        r = clamp255(r) / 255; g = clamp255(g) / 255; b = clamp255(b) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d === 0) h = 0;
        else if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * (((b - r) / d) + 2);
        else h = 60 * (((r - g) / d) + 4);
        if (h < 0) h += 360;
        const s = max === 0 ? 0 : d / max;
        return { h, s, v: max };
    }

    function isIntInRange(x, lo, hi) {
        const n = Number(x);
        return Number.isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi;
    }
    function isFloatInRange(x, lo, hi) {
        const n = Number(x);
        return Number.isFinite(n) && n >= lo && n <= hi;
    }

    function parseValueToRGBA(value) {
        const s = String(value || "").trim();

        // HEX
        if (/^#([0-9a-fA-F]{6})$/.test(s)) {
            const rgb = hexToRgb(s);
            return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 } : null;
        }

        // RGB(...)
        let m = s.match(/^RGB\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
        if (m) {
            if (!isIntInRange(+m[1], 0, 255) || !isIntInRange(+m[2], 0, 255) || !isIntInRange(+m[3], 0, 255)) return null;
            return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
        }

        // RGBA(...)
        m = s.match(/^RGBA\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)$/i);
        if (m) {
            if (!isIntInRange(+m[1], 0, 255) || !isIntInRange(+m[2], 0, 255) || !isIntInRange(+m[3], 0, 255)) return null;
            if (!isFloatInRange(+m[4], 0, 1)) return null;
            return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
        }

        // Named CSS colors (RED, BLUE, etc.)
        // We resolve through canvas normalization so it matches browser rules and avoids maintaining a giant map.
        if (/^[A-Za-z]+$/.test(s)) {
            const rgba = cssNamedColorToRGBA(s);
            if (rgba) return rgba;
        }

        return null;
    }

    function cssNamedColorToRGBA(name) {
        // Canvas trick: invalid names don't change fillStyle from the sentinel.
        const ctx = cssNamedColorToRGBA._ctx || (cssNamedColorToRGBA._ctx = document.createElement("canvas").getContext("2d"));
        const sentinel = "#000000";
        ctx.fillStyle = sentinel;
        ctx.fillStyle = String(name).trim();
        const normalized = String(ctx.fillStyle || "").toLowerCase();

        // If it stayed sentinel and the user didn't actually ask for black, treat as invalid.
        if (normalized === sentinel && String(name).trim().toLowerCase() !== "black") return null;

        // normalized is usually "#rrggbb" in modern browsers for canvas.
        if (/^#([0-9a-f]{6})$/.test(normalized)) {
            const rgb = hexToRgb(normalized);
            return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 } : null;
        }

        // Fallback: handle rgb(...) if returned (some engines)
        let m = normalized.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };

        m = normalized.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)$/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };

        return null;
    }

    const COLOR_TOKEN_RE = /\{COLOR [^}]+\}/g;

    function getAllStrictValidColorTokens(text) {
        const out = [];
        COLOR_TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = COLOR_TOKEN_RE.exec(text)) !== null) {
            const start = m.index;
            const end = start + m[0].length;
            const raw = m[0];
            const value = extractStrictColorValueFromToken(raw);
            const rgba = value ? parseValueToRGBA(value) : null;
            if (!rgba) continue;
            out.push({ start, end, raw, value, rgba });
        }
        return out;
    }

    function pickBestTokenForSelection(tokens, selStart, selEnd) {
        const caret = (selStart === selEnd) ? selStart : selEnd;
        let best = null;
        let bestScore = null;

        for (const t of tokens) {
            const intersects = !(t.end < selStart || t.start > selEnd);
            const caretInside = (selStart === selEnd) && caret >= t.start && caret <= t.end;
            const caretAfter = (selStart === selEnd) && caret === t.end;
            if (!intersects && !caretInside && !caretAfter) continue;

            const priority = caretInside ? 0 : (intersects ? 1 : (caretAfter ? 2 : 3));
            const dist = (caret < t.start) ? (t.start - caret) : (caret > t.end ? (caret - t.end) : 0);
            const score = [priority, dist, t.start];

            if (!best || score[0] < bestScore[0] ||
                (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
                (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] > bestScore[2])) {
                best = t;
                bestScore = score;
            }
        }
        return best;
    }


    // Find a token to EDIT based on caret/selection position.
    // Rules:
    // 1) If caret/selection is inside a token's { ... } range -> edit that token.
    // 2) If caret is in the "apply zone" right after a token (token ends, then only whitespace,
    //    and caret is before the next non-whitespace char on the same line) -> edit that token.
    // Otherwise, caller should treat as INSERT.
    function findTokenForCaret(tokens, text, selStart, selEnd) {
        const ss = (typeof selStart === "number") ? selStart : 0;
        const se = (typeof selEnd === "number") ? selEnd : ss;
        const caret = (ss === se) ? ss : se;

        // Determine line bounds to avoid crossing newlines in "apply zone" logic.
        const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
        let lineEnd = text.indexOf("\n", caret);
        if (lineEnd === -1) lineEnd = text.length;

        // 1) Direct containment / boundary hit.
        for (const t of tokens) {
            if (t.start < lineStart || t.end > lineEnd) continue;
            // treat boundaries as edit-friendly: caret at start or end counts
            if ((caret >= t.start && caret <= t.end) ||
                (ss !== se && !(Math.max(ss, se) < t.start || Math.min(ss, se) > t.end))) {
                return t;
            }
        }

        // 2) Apply zone: caret is after a token and only whitespace between token end and caret,
        // and caret is before the next non-whitespace char after that token end.
        let best = null;
        for (const t of tokens) {
            if (t.start < lineStart || t.end > lineEnd) continue;
            if (t.end > caret) continue;

            const between = text.slice(t.end, caret);
            if (!/^[\t ]*$/.test(between)) continue;

            // Next non-whitespace after token end (same line)
            const after = text.slice(t.end, lineEnd);
            const m = after.match(/^[\t ]*/);
            const wsLen = m ? m[0].length : 0;
            const nextNonWs = t.end + wsLen;

            if (caret <= nextNonWs) {
                if (!best || t.start > best.start) best = t;
            }
        }
        return best;
    }

    function replaceRange(text, start, end, insert) {
        return text.slice(0, start) + insert + text.slice(end);
    }

    function setMode(isEdit) {
        modeText.textContent = isEdit ? "Edit" : "Insert";
        modeDot.classList.toggle("edit", !!isEdit);
    }

    function buildToken() {
        const rgb = hsvToRgb(state.h, state.s, state.v);
        const a = round2(clamp01(state.a));

        if (fmtEl.value === "HEX" && a < 1) {
            return `{COLOR RGBA(${rgb.r},${rgb.g},${rgb.b},${a})}`;
        }
        if (fmtEl.value === "RGB") return `{COLOR RGB(${rgb.r},${rgb.g},${rgb.b})}`;
        if (fmtEl.value === "RGBA") return `{COLOR RGBA(${rgb.r},${rgb.g},${rgb.b},${a})}`;
        return `{COLOR ${rgbToHex(rgb.r, rgb.g, rgb.b)}}`;
    }

    function setRangeBackgrounds() {
        hueEl.style.background =
            "linear-gradient(to right,rgb(255,0,0),rgb(255,255,0),rgb(0,255,0),rgb(0,255,255),rgb(0,0,255),rgb(255,0,255),rgb(255,0,0))";
        const rgb = hsvToRgb(state.h, state.s, state.v);
        alphaEl.style.background = `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), rgba(${rgb.r},${rgb.g},${rgb.b},1))`;
    }

    function drawSV() {
        const base = hsvToRgb(state.h, 1, 1);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
        ctx.fillRect(0, 0, cv.width, cv.height);

        const w = ctx.createLinearGradient(0, 0, cv.width, 0);
        w.addColorStop(0, "rgba(255,255,255,1)");
        w.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = w; ctx.fillRect(0, 0, cv.width, cv.height);

        const k = ctx.createLinearGradient(0, 0, 0, cv.height);
        k.addColorStop(0, "rgba(0,0,0,0)");
        k.addColorStop(1, "rgba(0,0,0,1)");
        ctx.fillStyle = k; ctx.fillRect(0, 0, cv.width, cv.height);

        const x = Math.round(state.s * cv.width);
        const y = Math.round((1 - state.v) * cv.height);

        const ring = (lastPointerType === "touch") ? 13 : 10;
        const ring2 = ring + 2;

        ctx.beginPath();
        ctx.arc(x, y, ring, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,.92)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(0,0,0,.45)";
        ctx.shadowBlur = 6;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, ring2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function updateSwatchActive(hex) {
        const norm = String(hex).toUpperCase();
        [...swatchRow.children].forEach(el => el.classList.toggle("fp-active", el.dataset.hex === norm));
    }

    function updatePreviewChip(r, g, b, a) {
        preview.style.backgroundImage =
            `linear-gradient(rgba(${r},${g},${b},${a}), rgba(${r},${g},${b},${a}))`;
        preview.style.backgroundBlendMode = "normal";
        preview.style.backgroundColor = "transparent";
    }

    function sync() {
        const rgb = hsvToRgb(state.h, state.s, state.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const a = round2(clamp01(state.a));

        hueEl.value = Math.round(state.h);
        alphaEl.value = state.a;

        hexEl.value = hex;
        rEl.value = rgb.r; gEl.value = rgb.g; bEl.value = rgb.b; aEl.value = a;

        liveOut.textContent =
            (fmtEl.value === "HEX" && a < 1)
                ? `RGBA(${rgb.r},${rgb.g},${rgb.b},${a})`
                : (fmtEl.value === "RGB")
                    ? `RGB(${rgb.r},${rgb.g},${rgb.b})`
                    : (fmtEl.value === "RGBA")
                        ? `RGBA(${rgb.r},${rgb.g},${rgb.b},${a})`
                        : hex;

        setRangeBackgrounds();
        drawSV();
        updateSwatchActive(hex);

        lastUsedRGBA = { r: rgb.r, g: rgb.g, b: rgb.b, a };
        updatePreviewChip(rgb.r, rgb.g, rgb.b, a);
    }

    function renderSwatches() {
        swatchRow.innerHTML = "";
        SWATCHES.forEach(hex => {
            const d = document.createElement("div");
            d.className = "fp-swatch";
            d.style.background = hex;
            d.dataset.hex = hex.toUpperCase();
            d.title = hex;
            d.addEventListener("click", () => {
                const rgb = hexToRgb(hex);
                if (!rgb) return;
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
                sync();
            });
            swatchRow.appendChild(d);
        });
    }

    function insertAtCursor(el, text) {
        const start = el.selectionStart;
        const end = el.selectionEnd ?? start;
        el.value = el.value.slice(0, start) + text + el.value.slice(end);
        const caret = start + text.length;
        el.selectionStart = el.selectionEnd = caret;
        el.focus();
    }

    function seedFromLastOrDefault(defaultHex, initialFormat) {
        const hsv = rgbToHsv(lastUsedRGBA.r, lastUsedRGBA.g, lastUsedRGBA.b);
        state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
        state.a = clamp01(lastUsedRGBA.a ?? 1);
        fmtEl.value = initialFormat || "HEX";
        if (fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
    }

    function open(opts) {
        targetEl = opts.target;
        editRange = null;
        setMode(false);

        const defaultHex = opts.default || "#FFFFFF";
        const initialFormat = opts.format || "HEX";

        if (!targetEl || typeof targetEl.selectionStart !== "number") {
            seedFromLastOrDefault(defaultHex, initialFormat);
        } else {
            const text = targetEl.value;
            const ss = targetEl.selectionStart;
            const se = targetEl.selectionEnd ?? ss;
            const caret = (ss === se) ? ss : se;

            const prev = text[caret - 1];
            const next = text[caret];
            const caretInsideWord = isWordChar(prev) && isWordChar(next);

            // Prefer EDIT when the caret/selection is within a valid token.
            // Only fall back to INSERT logic when no token is targeted.
            const tokens = getAllStrictValidColorTokens(text);
            const bestHit = pickBestTokenForSelection(tokens, Math.min(ss, se), Math.max(ss, se));
            let chosen = bestHit || findTokenForCaret(tokens, text, ss, se);

            if (chosen) {
                editRange = { start: chosen.start, end: chosen.end };
                setMode(true);

                const hsv = rgbToHsv(chosen.rgba.r, chosen.rgba.g, chosen.rgba.b);
                state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
                state.a = clamp01(chosen.rgba.a ?? 1);

                if (/^RGBA\(/i.test(chosen.value)) fmtEl.value = "RGBA";
                else if (/^RGB\(/i.test(chosen.value)) fmtEl.value = "RGB";
                else fmtEl.value = initialFormat;

                if (fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
            } else {
                editRange = null;
                setMode(false);

                if (caretInsideWord) {
                    // If user is between letters in plain text, don't surprise-replace:
                    // seed from last used/default and treat as insert.
                    seedFromLastOrDefault(defaultHex, initialFormat);
                } else {
                    const def = hexToRgb(defaultHex) || { r: 255, g: 255, b: 255 };
                    const hsv = rgbToHsv(def.r, def.g, def.b);
                    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
                    state.a = 1;
                    fmtEl.value = initialFormat;
                }
            }
        }

        renderSwatches();
        backdrop.classList.add("fp-open");
        sync();
        setTimeout(() => hexEl.focus(), 0);
    }

    function close() {
        backdrop.classList.remove("fp-open");
        editRange = null;
    }
    function isOpen() { return backdrop.classList.contains("fp-open"); }

    hueEl.addEventListener("input", () => {
        state.h = clamp360(+hueEl.value);
        sync();
    });

    alphaEl.addEventListener("input", () => {
        state.a = clamp01(+alphaEl.value);
        if (fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
        sync();
    });

    fmtEl.addEventListener("change", () => sync());

    hexEl.addEventListener("change", () => {
        const rgb = hexToRgb(hexEl.value);
        if (!rgb) return sync();
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
        sync();
    });

    function chanCommit() {
        const r = clamp255(+rEl.value), g = clamp255(+gEl.value), b = clamp255(+bEl.value);
        const a = clamp01(+aEl.value);
        state.a = Number.isFinite(a) ? a : state.a;

        const hsv = rgbToHsv(r, g, b);
        state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;

        if (fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
        sync();
    }
    [rEl, gEl, bEl, aEl].forEach(el => { el.addEventListener("change", chanCommit); el.addEventListener("blur", chanCommit); });

    let dragging = false;
    function pointToSV(cx, cy) {
        const r = cv.getBoundingClientRect();
        const x = clamp01((cx - r.left) / r.width);
        const y = clamp01((cy - r.top) / r.height);
        return { s: x, v: 1 - y };
    }
    cv.addEventListener("pointerdown", (e) => {
        lastPointerType = e.pointerType || "mouse";
        dragging = true;
        cv.setPointerCapture?.(e.pointerId);
        const p = pointToSV(e.clientX, e.clientY);
        state.s = p.s; state.v = p.v; sync();
    });
    window.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        lastPointerType = e.pointerType || lastPointerType;
        const p = pointToSV(e.clientX, e.clientY);
        state.s = p.s; state.v = p.v; sync();
    });
    window.addEventListener("pointerup", (e) => {
        dragging = false;
        try { cv.releasePointerCapture?.(e.pointerId); } catch (_) { }
    });

    preview.addEventListener("click", async () => {
        const token = buildToken();
        try {
            await navigator.clipboard.writeText(token);
        } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = token;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        const old = preview.style.boxShadow;
        preview.style.boxShadow = "0 0 0 3px rgba(63,177,206,.55), " + old;
        setTimeout(() => preview.style.boxShadow = old, 350);
    });

    function applyNow() {
        if (!targetEl) { close(); return; }
        const token = buildToken();

        if (editRange && typeof targetEl.selectionStart === "number") {
            const text = targetEl.value;
            targetEl.value = replaceRange(text, editRange.start, editRange.end, token);
            const caret = editRange.start + token.length;
            targetEl.selectionStart = targetEl.selectionEnd = caret;
            targetEl.focus();
            targetEl.dispatchEvent(new Event("input", { bubbles: true }));
            close();
            return;
        }


        // INSERT mode: avoid creating back-to-back {COLOR ...} tokens.
        // If the caret is directly before an existing token (allowing only whitespace between),
        // replace that next token instead of inserting a new one.
        if (typeof targetEl.selectionStart === "number") {
            const text = targetEl.value;
            const ss = targetEl.selectionStart;
            const se = targetEl.selectionEnd ?? ss;
            const caret = (ss === se) ? ss : se;

            const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
            let lineEnd = text.indexOf("\n", caret);
            if (lineEnd === -1) lineEnd = text.length;

            const tokens = getAllStrictValidColorTokens(text).filter(t => t.start >= lineStart && t.end <= lineEnd);
            let nextTok = null;

            for (const t of tokens) {
                if (t.start < caret) continue;
                const between = text.slice(caret, t.start);
                if (/^[\t ]*$/.test(between)) { nextTok = t; break; }
            }

            if (nextTok) {
                targetEl.value = replaceRange(text, nextTok.start, nextTok.end, token);
                const newCaret = nextTok.start + token.length;
                targetEl.selectionStart = targetEl.selectionEnd = newCaret;
                targetEl.focus();
                targetEl.dispatchEvent(new Event("input", { bubbles: true }));
                close();
                return;
            }
        }

        insertAtCursor(targetEl, token);
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        close();
    }

    btnApply.addEventListener("click", applyNow);
    btnClose.addEventListener("click", close);
    btnCancel.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

    window.addEventListener("keydown", (e) => {
        if (!isOpen()) return;
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        if (e.key === "Enter") { e.preventDefault(); applyNow(); return; }
    });

    window.ColorPickerModal = { open, close };
})();

/* ============================================================
   App State
============================================================ */
// let pack = deepClone(DUMMY_PACK);
// // Expose the current pack for other script blocks (preview, etc.)
// function exposePack() {
//     try { window._boardPack = pack; window.pack = pack; window._pack = pack; } catch (_) { }
// }
// exposePack();
// let packSaved = deepClone(pack);
// let packSavedHash = hashObject(packSaved);
// let selectedKey = null;
// let draft = null;
// let draftSaved = null;

// // ✅ track last focused row input so token modal can insert at cursor
// let lastFocusedRowInput = null;

// function getCols() { return pack?.meta?.grid?.columns ?? 20; }
// function getRows() { return pack?.meta?.grid?.rows ?? 8; }

// /* ============================================================
//    EVENTS (Option A) cache + CRUD state
// ============================================================ */
// let eventsDoc = { events: {}, order: [] };
// let eventsDocSaved = { events: {}, order: [] };
// let eventsSavedHash = hashObject(eventsDocSaved);
// let eventsLoadSeq = 0; // guards against out-of-order reloads

async function saveEventsImmediate() {
    // Invalidate any in-flight reloads and persist immediately.
    bumpEventsLoadSeq();
    await waitForGlobal("__flipboardFirestoreReady", 8000, 50);
    await window.__flipboardFirestoreReady;

    // Optimistic UI update (prevents "saved but not visible" until refresh)
    renderEventsManager();

    updateDirtyUI();

    setEventsSaved(eventsDoc);
}

function normalizeEventKey(k) {
    return String(k || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").replace(/__+/g, "_");
}

function isISODateYYYYMMDD(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}


// Events ordering + rollover helpers
function getEventsOrder() {
    const ord = Array.isArray(eventsDoc.order) ? eventsDoc.order.slice() : [];
    // Ensure order contains only existing keys, and append any missing keys at end (stable)
    const map = getEventsMap();
    const keys = Object.keys(map);
    const set = new Set(keys);
    const cleaned = ord.filter(k => set.has(k));
    keys.forEach(k => { if (!cleaned.includes(k)) cleaned.push(k); });
    return cleaned;
}

function setEventsOrder(nextOrder) {
    const map = getEventsMap();
    const keys = Object.keys(map);
    const set = new Set(keys);
    const cleaned = (Array.isArray(nextOrder) ? nextOrder : [])
        .map(k => String(k || ""))
        .filter(k => set.has(k));
    keys.forEach(k => { if (!cleaned.includes(k)) cleaned.push(k); });
    eventsDoc.order = cleaned;
}

function todayLocalMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function autorollISODateYearly(iso) {
    if (!isISODateYYYYMMDD(iso)) return iso;
    const parts = String(iso).split("-");
    let y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!y || !m || !d) return iso;
    const t0 = todayLocalMidnight();
    let dt = new Date(y, m - 1, d);
    // If invalid date (e.g., Feb 29 on non-leap year), clamp to last day of month.
    if (dt.getMonth() !== (m - 1) || dt.getDate() !== d) {
        // last day of month:
        dt = new Date(y, m, 0);
    }
    while (dt < t0) {
        y += 1;
        dt = new Date(y, m - 1, d);
        if (dt.getMonth() !== (m - 1) || dt.getDate() !== d) dt = new Date(y, m, 0);
    }
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${mm}-${dd}`;
}

function autorollAllEventsYearly() {
    const map = getEventsMap();
    let changed = false;
    Object.keys(map).forEach((k) => {
        const ev = map[k] || {};
        if (isISODateYYYYMMDD(ev.date)) {
            const next = autorollISODateYearly(ev.date);
            if (next !== ev.date) {
                map[k] = { ...ev, date: next };
                changed = true;
            }
        }
    });
    if (changed) eventsDoc.events = map;
    return changed;
}

function findDuplicateDateKey(targetISO, excludeKey) {
    if (!targetISO) return null;
    const map = getEventsMap();
    const keys = Object.keys(map);
    for (const k of keys) {
        if (excludeKey && k === excludeKey) continue;
        if (String(map[k]?.date || "") === targetISO) return k;
    }
    return null;
}

/* ============================================================
   DOM refs
============================================================ */
const rotationListEl = document.getElementById("rotationList");
const otherListEl = document.getElementById("otherList");

const rotationEnabledEl = document.getElementById("rotationEnabled");
const rotationDwellEl = document.getElementById("rotationDwell");

const gridColsEl = document.getElementById("gridCols");
const gridRowsEl = document.getElementById("gridRows");
const metaDescriptionEl = document.getElementById("metaDescription");
const flipSpeedEl = document.getElementById("flipSpeed");
const flipSpeedValEl = document.getElementById("flipSpeedVal");

const weatherTypeEl = document.getElementById("weatherType");
const weatherValueEl = document.getElementById("weatherValue");
const weatherLabelEl = document.getElementById("weatherLabel");
const dashboardWeatherWrapEl = document.getElementById("dashboardWeatherWrap");

const btnAddBoard = document.getElementById("btnAddBoard");
const btnDeleteBoard = document.getElementById("btnDeleteBoard");
const btnAddToRotation = document.getElementById("btnAddToRotation");
const btnRemoveFromRotation = document.getElementById("btnRemoveFromRotation");
const btnMoveUp = document.getElementById("btnMoveUp");
const btnMoveDown = document.getElementById("btnMoveDown");

const btnSavePack = document.getElementById("btnSavePack");
const btnCopyJSON = document.getElementById("btnCopyJSON");
const btnReload = document.getElementById("btnReload");

const boardKeyEl = document.getElementById("boardKey");
const boardNameEl = document.getElementById("boardName");
const boardTypeEl = document.getElementById("boardType");
const sourceWrapEl = document.getElementById("sourceWrap");
const boardSourceEl = document.getElementById("boardSource");
const boardOneShotEl = document.getElementById("boardOneShot");
const boardIsWeatherEl = document.getElementById("boardIsWeather");
const weatherZipWrapEl = document.getElementById("weatherZipWrap");
const boardWeatherZipEl = document.getElementById("boardWeatherZip");

const rowsContainerEl = document.getElementById("rowsContainer");
const btnInsertColor = document.getElementById("btnInsertColor");
const btnDiscardEdits = document.getElementById("btnDiscardEdits");

const colsValEl = document.getElementById("colsVal");
const rowsValEl = document.getElementById("rowsVal");
const dwellValEl = document.getElementById("dwellVal");
const dirtyPillEl = document.getElementById("dirtyPill");
const colsHintEl = document.getElementById("colsHint");
const colsHint2El = document.getElementById("colsHint2");

const sourceValEl = document.getElementById("sourceVal");
const statusValEl = document.getElementById("statusVal");

const btnOpenWeatherTokens = document.getElementById("btnOpenWeatherTokens");

const tokenModalOverlay = document.getElementById("tokenModalOverlay");
const tokenModalClose = document.getElementById("tokenModalClose");

// Events manager refs
const eventsListEl = document.getElementById("eventsList");
const eventsEmptyHintEl = document.getElementById("eventsEmptyHint");
const btnEventsReload = document.getElementById("btnEventsReload");
const btnEventsAdd = document.getElementById("btnEventsAdd");
const btnEventsSave = document.getElementById("btnEventsSave");

function setStatus(source, status, state) {
    if (sourceValEl) sourceValEl.textContent = source || "—";
    if (statusValEl) {
        statusValEl.textContent = status || "—";
        const pill = statusValEl.parentElement;
        pill.classList.remove("ok", "warn", "err");
        if (state === "ok") pill.classList.add("ok");
        if (state === "warn") pill.classList.add("warn");
        if (state === "err") pill.classList.add("err");
    }
}


function getDirtyBuckets() {
    const buckets = [];
    try { if (typeof editorIsDirty === "function" && editorIsDirty()) buckets.push("Boards"); } catch (_) { }
    try { if (typeof packIsDirty === "function" && packIsDirty()) buckets.push("Pack"); } catch (_) { }
    try { if (typeof eventsDirty === "function" && eventsDirty()) buckets.push("Events"); } catch (_) { }
    return buckets;
}

function updateUnsavedPill() {
    try {
        const pill = document.getElementById("dirtyPill") || document.querySelector('[data-pill="dirty"]') || document.querySelector(".dirtyPill");
        if (!pill) return;

        const buckets = getDirtyBuckets();
        const dirty = buckets.length > 0;

        if (!dirty) {
            const b0 = pill.querySelector('b');
            if (b0) b0.textContent = "No changes"; else pill.textContent = "No changes";
            pill.title = "Everything is saved.";
            pill.classList.remove("on");
            return;
        }

        const label = buckets.length ? `Unsaved: ${buckets.join(" + ")}` : "Unsaved changes";
        const b = pill.querySelector('b');
        if (b) b.textContent = label; else pill.textContent = label;
        pill.title = `Unsaved changes in: ${buckets.join(", ")}.

Save writes:
- Boards/Pack to Firestore (Save button)
- Events to Firestore (Events Save)

Discard clears local board edits (current board only).`;
        pill.classList.add("on");
    } catch (_) { }
}

function updateDirtyUI() {
    const dirty = packIsDirty() || editorIsDirty() || eventsDirty();
    dirtyPillEl.style.display = dirty ? "inline-flex" : "none";
    btnSavePack.disabled = !(packIsDirty() || editorIsDirty());   // SavePack is ONLY pack
    btnDiscardEdits.disabled = !editorIsDirty();
    btnEventsSave.disabled = !eventsDirty();

    if (_lastDirtyState !== dirty) {
        dbg("Dirty state changed:", _lastDirtyState, "→", dirty, {
            packDirty: packIsDirty(),
            editorDirty: editorIsDirty(),
            eventsDirty: eventsDirty()
        });
        _lastDirtyState = dirty;
    }
    try { updateDirtyIndicators(); } catch (_) { }
    try { updateUnsavedPill(); } catch (_) { }

    function updateDirtyIndicators() {
        // Highlight fields/rows that differ from the last-saved draft.
        try {
            const clearAll = () => {
                try { boardKeyEl?.classList.remove("dirtyField"); } catch (_) { }
                try { boardNameEl?.classList.remove("dirtyField"); } catch (_) { }
                try { boardTypeEl?.classList.remove("dirtyField"); } catch (_) { }
                try { boardSourceEl?.classList.remove("dirtyField"); } catch (_) { }
                try { boardOneShotEl?.classList.remove("dirtyField"); } catch (_) { }
                try {
                    document.querySelectorAll(".lineRow.dirtyRow").forEach(el => el.classList.remove("dirtyRow"));
                    document.querySelectorAll("input.field.dirtyField").forEach(el => el.classList.remove("dirtyField"));
                } catch (_) { }
            };

            if (!draft || !draftSaved) { clearAll(); return; }

            // Pack-level: description (global)
            try {
                const descDirty = String(pack?.meta?.description ?? "") !== String(packSaved?.meta?.description ?? "");
                if (metaDescriptionEl) metaDescriptionEl.classList.toggle("dirtyField", descDirty);
            } catch (_) { }


            // Board-level fields
            const nameDirty = String(draft.name ?? "") !== String(draftSaved.name ?? "");
            const typeDirty = String(draft.type ?? "static") !== String(draftSaved.type ?? "static");
            const srcDirty = String(draft.source ?? "") !== String(draftSaved.source ?? "");
            const osDirty = !!draft.one_shot !== !!draftSaved.one_shot;

            if (boardNameEl) boardNameEl.classList.toggle("dirtyField", nameDirty);
            if (boardTypeEl) boardTypeEl.classList.toggle("dirtyField", typeDirty);
            if (boardSourceEl && sourceWrapEl && sourceWrapEl.style.display !== "none") {
                boardSourceEl.classList.toggle("dirtyField", srcDirty);
            } else if (boardSourceEl) {
                boardSourceEl.classList.remove("dirtyField");
            }
            if (boardOneShotEl) boardOneShotEl.classList.toggle("dirtyField", osDirty);

            // Row-level fields
            const rowsA = Array.isArray(draft.rows) ? draft.rows : [];
            const rowsB = Array.isArray(draftSaved.rows) ? draftSaved.rows : [];
            const max = Math.max(rowsA.length, rowsB.length);

            for (let i = 0; i < max; i++) {
                const a = String(rowsA[i] ?? "");
                const b = String(rowsB[i] ?? "");
                const rowDirty = a !== b;

                const inp = document.querySelector(`input.field[data-row-index="${i}"]`);
                if (inp) inp.classList.toggle("dirtyField", rowDirty);

                const rowWrap = inp?.closest(".lineRow");
                if (rowWrap) rowWrap.classList.toggle("dirtyRow", rowDirty);
            }
        } catch (e) {
            // Don't let highlight logic break editor
            try { console.warn("[EDITOR] updateDirtyIndicators failed:", e); } catch (_) { }
        }
    }

}

// Debounced local draft persistence + dirty UI update.
// This prevents console errors when typing and gives basic crash-recovery.
let __draftSaveTimer = null;
function scheduleSaveDraft() {
    try { updateDirtyUI(); } catch (e) { /* ignore */ }
    try {
        clearTimeout(__draftSaveTimer);
        __draftSaveTimer = setTimeout(() => {
            try {
                const kDev = (typeof activeDeviceId !== "undefined" && activeDeviceId) ? activeDeviceId : "nodev";
                const kBoard = (draft && (draft.id || draft.key || draft.name)) ? (draft.id || draft.key || draft.name) : "noboard";
                const key = `flipeditor:draft:${kDev}:${kBoard}`;
                localStorage.setItem(key, JSON.stringify({ t: Date.now(), draft }));
            } catch (e2) { /* ignore */ }
        }, 450);
    } catch (e3) { /* ignore */ }
}

function setHeaderMeta() {
    // Saved-only pills: reflect last persisted state, not unsaved edits.
    const src = (typeof packSaved !== "undefined" && packSaved) ? packSaved : pack;
    const cols = src?.meta?.grid?.columns ?? getCols();
    const rows = src?.meta?.grid?.rows ?? getRows();
    const dwell = src?.rotation?.dwell_ms;

    colsValEl.textContent = String(cols);
    rowsValEl.textContent = String(rows);
    dwellValEl.textContent = formatDelaySeconds(dwell);

    // These hints should also reflect the saved grid size
    colsHintEl.textContent = String(cols);
    colsHint2El.textContent = String(cols);
}


// function setPackSaved(nextPack) {
//     packSaved = deepClone(nextPack);
//     packSavedHash = hashObject(packSaved);
// }

// function setEventsSaved(nextDoc) {
//     eventsDocSaved = deepClone(nextDoc);
//     eventsSavedHash = hashObject(eventsDocSaved);
// }

// function packIsDirty() {
//     if (!pack) return false;
//     if (!packSavedHash) return true;
//     return hashObject(pack) !== packSavedHash;
// }

// function eventsDirty() {
//     if (!eventsDoc) return false;
//     if (!eventsSavedHash) return true;
//     return hashObject(eventsDoc) !== eventsSavedHash;
// }

// function editorIsDirty() {
//     if (!draft || !draftSaved) return false;
//     return JSON.stringify(draft) !== JSON.stringify(draftSaved);
// }

// Phase 2B: Browser close/refresh guard (native confirm)
// NOTE: Browsers ignore custom text; setting returnValue triggers the built-in prompt.
window.addEventListener('beforeunload', (e) => {
    try {
        if (typeof editorIsDirty === 'function' && editorIsDirty()) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    } catch (_) { /* ignore */ }
});



function sanitizeRotation() {
    pack.rotation ||= { enabled: true, dwell_ms: 15000, order: [] };
    pack.rotation.order ||= [];

    const boards = pack.boards || {};
    const canonByLower = {};
    for (const key of Object.keys(boards)) canonByLower[String(key).toLowerCase()] = key;

    const repaired = [];
    const seen = new Set();

    for (let raw of (pack.rotation.order || [])) {
        if (raw == null) continue;
        const k0 = String(raw).trim();
        if (!k0) continue;

        let k = k0;
        if (!boards[k]) {
            const hit = canonByLower[k0.toLowerCase()];
            if (hit && boards[hit]) {
                console.warn(`[EDITOR] rotation.order key repaired: "${k0}" -> "${hit}"`);
                k = hit;
            } else {
                console.warn(`[EDITOR] rotation.order removed missing key: "${k0}"`);
                continue;
            }
        }

        if (seen.has(k)) continue;
        seen.add(k);
        repaired.push(k);
    }

    pack.rotation.order = repaired;
}
// function ensureWeatherShape() {
//     pack.meta ||= { grid: { columns: 20, rows: 8 }, description: "", weather: {} };
//     pack.meta.weather ||= {};
//     pack.meta.weather.location ||= { type: "city", value: "", label: "" };
// }



function updateWeatherUiVisibility() {
    try {
        const wrap = document.getElementById("weatherZipWrap");
        const btn = document.getElementById("btnOpenWeatherTokens");
        const cb = document.getElementById("boardIsWeather");
        const on = !!(cb && cb.checked);
        if (wrap) wrap.style.display = on ? "" : "none";
        if (btn) btn.style.display = on ? "" : "none";
    } catch (_) { }
}

function openWeatherTokenModal() {
    openTokenModal();
}

function openTokenModal() {
    if (!tokenModalOverlay) return;

    renderEventTokenBrowser();

    tokenModalOverlay.classList.add("show");
    tokenModalOverlay.setAttribute("aria-hidden", "false");
}


function closeTokenModal(silent = false) {
    if (!tokenModalOverlay) return;

    tokenModalOverlay.classList.remove("show");
    tokenModalOverlay.setAttribute("aria-hidden", "true");

    if (!silent) toast("Closed");
}

function formatEventDateLabel(rawDate) {
    if (!rawDate || typeof rawDate !== "string") return "—";
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return rawDate;
    const [, y, mo, d] = m;
    return `${mo}/${d}/${y}`;
}

function buildCountdownToken(eventKey, field) {
    return `{COUNTDOWN ${String(eventKey || "").toUpperCase()}.${field}}`;
}

function makeEventTokenChip(token) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "eventTokenChip mono";
    chip.textContent = token;

    chip.addEventListener("click", (e) => {
        e.preventDefault();
        insertAtLastFocusedRow(token);
    });

    return chip;
}

function renderEventTokenBrowser() {
    const listEl = document.getElementById("eventTokenList");
    const emptyEl = document.getElementById("eventTokenEmptyHint");

    if (!listEl) return;

    listEl.innerHTML = "";
    if (emptyEl) {
        emptyEl.style.display = "none";
        emptyEl.textContent = "";
    }

    const events = getEventsMap();
    const keys = Object.keys(events).sort();

    if (!keys.length) {
        if (emptyEl) {
            emptyEl.textContent = "No events found.";
            emptyEl.style.display = "";
        }
        return;
    }

    keys.forEach((eventKey) => {
        const ev = events[eventKey] || {};

        const card = document.createElement("div");
        card.className = "eventTokenCard";

        card.innerHTML = `
            <div class="eventTokenKey mono">${eventKey}</div>
            <div class="eventTokenTitle">${ev.title || eventKey}</div>
            <div class="eventTokenMeta">Date: ${formatEventDateLabel(ev.date)}</div>
        `;

        const row = document.createElement("div");
        row.className = "eventTokenRow";

        row.appendChild(makeEventTokenChip(buildCountdownToken(eventKey, "DAYS")));
        row.appendChild(makeEventTokenChip(buildCountdownToken(eventKey, "TITLE")));
        row.appendChild(makeEventTokenChip(buildCountdownToken(eventKey, "DATE")));

        card.appendChild(row);
        listEl.appendChild(card);
    });
}

/* ============================================================
   ✅ Countdown dropdown population (from events doc)
============================================================ */


function getEventsMap() {
    const ev = eventsDoc && typeof eventsDoc === "object" ? eventsDoc.events : null;
    if (!ev || typeof ev !== "object") return {};
    return ev;
}



function insertAtLastFocusedRow(text) {
    const el = lastFocusedRowInput;
    if (!el) {
        toast("Click a row input first");
        return false;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const caret = start + text.length;
    el.selectionStart = el.selectionEnd = caret;
    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}



/* ============================================================
   ✅ Events Manager CRUD (Option A)
============================================================ */

// ===== Events Modal wiring (Option A: immediate save) =====
let evmBackdrop, evmTitleHdr, evmTitleInput, evmKey, evmDate, evmSave, evmCancel, evmClose, evmModePill;
const evmState = { inited: false, mode: "add", originalKey: null };

function initEventModal() {
    if (evmState.inited) return true;
    evmBackdrop = document.getElementById("evmBackdrop");
    evmTitleHdr = document.getElementById("evmTitle");
    evmTitleInput = document.getElementById("evmTitleInput");
    evmKey = document.getElementById("evmKey");
    evmDate = document.getElementById("evmDate");
    evmSave = document.getElementById("evmSave");
    evmCancel = document.getElementById("evmCancel");
    evmClose = document.getElementById("evmClose");
    evmModePill = document.getElementById("evmModePill");

    if (!evmBackdrop || !evmTitleHdr || !evmTitleInput || !evmKey || !evmDate || !evmSave || !evmCancel || !evmClose) {
        console.warn("[EVENTS] Modal DOM not ready (elements missing).");
        return false;
    }

    function closeEventModalInner() {
        evmBackdrop.classList.remove("open");
        evmBackdrop.setAttribute("aria-hidden", "true");
    }

    // Close handlers
    evmClose.addEventListener("click", closeEventModalInner);
    evmCancel.addEventListener("click", closeEventModalInner);
    evmBackdrop.addEventListener("click", (e) => {
        if (e.target === evmBackdrop) closeEventModalInner();
    });

    // Auto-generate key from title when adding (doesn't fight the user if they typed a key)
    evmTitleInput.addEventListener("input", () => {
        if (evmState.mode !== "add") return;
        const curKey = String(evmKey.value || "").trim();
        if (curKey) return;
        evmKey.value = normalizeEventKey(evmTitleInput.value);
    });

    // Auto-format date as MM/DD/YYYY while typing
    evmDate.addEventListener("input", (e) => {
        const el = e.target;
        const before = el.value;
        const formatted = formatMMDDYYYYInput(before);
        // basic caret behavior: keep caret at end (good enough for now)
        el.value = formatted;
    });


    // Save
    evmSave.addEventListener("click", async () => {
        // Ensure we have events loaded
        if (!eventsDoc || !eventsDoc.events) setEventsDoc({ events: {}, order: [] });

        const rawKey = String(evmKey.value || "").trim();
        const key = normalizeEventKey(rawKey);
        const title = String(evmTitleInput.value || "").trim();
        const dateUI = String(evmDate.value || "").trim();
        const date = dateUI ? toISOFromMDY(dateUI) : "";

        if (!key) { toast("Key required"); evmKey.focus(); return; }
        if (!title) { toast("Title required"); evmTitleInput.focus(); return; }
        if (dateUI && !date) { toast("Date must be MM/DD/YYYY"); evmDate.focus(); return; }

        // If user typed a past date, roll it forward to the next occurrence (yearly)
        const rolledDate = date ? autorollISODateYearly(date) : "";
        if (date && rolledDate !== date) {
            // Update the UI to reflect the actual stored date
            evmDate.value = fromISOToMDY(rolledDate);
        }

        // Prevent duplicate dates (except for the same event in edit mode)
        const isEdit = (evmState.mode === "edit");
        const oldKey = String(evmState.originalKey || "").trim();

        // Build a working copy for duplicate checks.
        // In edit mode, remove the old record first so it can't collide with itself.
        const compareEvents = { ...(eventsDoc.events || {}) };
        if (isEdit && oldKey) {
            delete compareEvents[oldKey];
        }

        // Also remove the new key before checking, in case we're overwriting/renaming.
        delete compareEvents[key];

        let dupKey = null;
        if (rolledDate) {
            for (const [k, ev] of Object.entries(compareEvents)) {
                if (String(ev?.date || "") === rolledDate) {
                    dupKey = k;
                    break;
                }
            }
        }

        if (dupKey) {
            toast(`Duplicate date already used by "${dupKey}"`);
            evmDate.focus();
            return;
        }

        // Handle rename (edit mode key changed)
        if (isEdit && oldKey && oldKey !== key) {
            if (eventsDoc.events[key]) {
                if (!confirm(`Event key "${key}" already exists. Overwrite?`)) return;
            }
            delete eventsDoc.events[oldKey];
        }

        // Maintain order list on rename
        if (eventsDoc.order && Array.isArray(eventsDoc.order)) {
            const oi = eventsDoc.order.indexOf(oldKey);
            if (oi !== -1) eventsDoc.order[oi] = key;
        }

        // Overwrite check (add mode)
        if (!isEdit && eventsDoc.events[key]) {
            if (!confirm(`Event "${key}" already exists. Overwrite?`)) return;
        }


        // Ensure this key exists in the ordering list
        if (!eventsDoc.order || !Array.isArray(eventsDoc.order)) eventsDoc.order = getEventsOrder();
        if (!eventsDoc.order.includes(key)) eventsDoc.order.push(key);

        eventsDoc.events[key] = { title: title.toUpperCase(), date: rolledDate };

        try {
            evmSave.disabled = true;
            await window.saveEventsPack(eventsDoc);
            // Re-load from Firestore and re-render to avoid any stale/racing state.
            if (typeof window.loadEventsOnce !== "function") {
                throw new ReferenceError("window.loadEventsOnce is not defined");
            }
            await window.loadEventsOnce();
            toast("Event saved");
            closeEventModalInner();
        } catch (err) {
            console.error(err);
            toast("Save failed");
        } finally {
            evmSave.disabled = false;
        }
    });

    // Optional: mode pill just for display
    if (evmModePill) {
        evmModePill.addEventListener("click", () => {
            // No manual toggle in this modal; mode is driven by openEventModal().
        });
    }

    // Expose close function
    window._closeEventModal = closeEventModalInner;
    evmState.inited = true;
    return true;
}

window.addEventListener("DOMContentLoaded", initEventModal);

function openEventModal(opts) {
    initEventModal();
    if (!evmState.inited) { toast("Event modal not ready"); return; }

    const mode = (opts && opts.mode) || "add";
    evmState.mode = mode;
    evmState.originalKey = (opts && opts.originalKey) || null;

    const seedKey = (opts && opts.key) || "";
    let seedTitle = (opts && opts.title) || "";
    let seedDate = (opts && opts.date) || "";

    // If editing by key, seed from current eventsDoc
    if (mode === "edit" && seedKey && eventsDoc && eventsDoc.events && eventsDoc.events[seedKey]) {
        const cur = eventsDoc.events[seedKey];
        if (!seedTitle) seedTitle = String(cur.title || "");
        if (!seedDate) seedDate = String(cur.date || "");
    }
    // Display-friendly date
    seedDate = fromISOToMDY(seedDate);


    evmKey.value = seedKey;
    evmTitleInput.value = seedTitle;
    evmDate.value = seedDate;

    if (evmModePill) evmModePill.textContent = (mode === "edit" ? "EDIT" : "ADD");

    evmBackdrop.classList.add("open");
    evmBackdrop.setAttribute("aria-hidden", "false");

    setTimeout(() => { (evmTitleInput.value ? evmTitleInput : evmKey).focus(); }, 0);
}

function closeEventModal() {
    if (!evmState.inited) return;
    if (window._closeEventModal) window._closeEventModal();
}
function renderEventsManager() {
    const map = getEventsMap();
    const keys = getEventsOrder();
    eventsListEl.innerHTML = "";
    eventsEmptyHintEl.style.display = keys.length ? "none" : "";

    keys.forEach((key) => {
        const ev = map[key] || {};
        const card = document.createElement("div");
        card.className = "eventCard";
        card.dataset.key = key;
        // Drag reorder (mobile-friendly pointer drag with long-press)
        const rail = document.createElement("div");
        rail.className = "dragRail";
        rail.setAttribute("role", "button");
        rail.setAttribute("tabindex", "-1");
        rail.setAttribute("aria-label", "Drag to reorder");
        rail.dataset.dragHandle = "1";
        card.appendChild(rail);

        const content = document.createElement("div");
        content.className = "eventCardContent";
        card.appendChild(content);

        const top = document.createElement("div");
        top.className = "eventCardTop";

        const keyPill = document.createElement("div");
        keyPill.className = "eventKeyPill";
        keyPill.textContent = key;

        const delBtn = document.createElement("button");
        delBtn.className = "danger smallBtn";
        delBtn.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>';
        delBtn.setAttribute("aria-label", "Delete event");
        delBtn.addEventListener("click", async () => {
            const ok = confirm(`Delete event "${key}"?`);
            if (!ok) return;
            delete eventsDoc.events[key];
            if (eventsDoc.order && Array.isArray(eventsDoc.order)) {
                eventsDoc.order = eventsDoc.order.filter(k => k !== key);
            }

            try {
                await saveEventsImmediate();
            } catch (err) {
                alert(String(err?.message || err));
                return;
            }
            renderEventsManager();

            updateDirtyUI();
            toast("Event deleted");
        });


        const left = document.createElement("div");
        left.className = "eventTopLeft";
        left.appendChild(keyPill);
        top.appendChild(left);


        const editBtn = document.createElement("button");
        editBtn.className = "smallBtn";
        editBtn.title = "Edit";
        editBtn.innerHTML = '<i class="fa fa-edit" aria-hidden="true"></i>';
        editBtn.setAttribute("aria-label", "Edit event");
        editBtn.addEventListener("click", () => {
            openEventModal({ mode: "edit", key, originalKey: key });
        });

        const actions = document.createElement("div");
        actions.className = "eventActions";
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        top.appendChild(actions);

        const grid = document.createElement("div");
        grid.className = "eventGrid";

        const titleField = document.createElement("div");
        titleField.className = "field";
        const titleLbl = document.createElement("label");
        titleLbl.textContent = "Title";
        const titleInp = document.createElement("input");
        titleInp.type = "text";
        titleInp.value = String(ev.title || "");
        titleInp.readOnly = true;
        titleInp.addEventListener("click", () => openEventModal({ mode: "edit", key, originalKey: key }));
        titleField.appendChild(titleLbl);
        titleField.appendChild(titleInp);

        const dateField = document.createElement("div");
        dateField.className = "field";
        const dateLbl = document.createElement("label");
        dateLbl.textContent = "Date (MM/DD/YYYY)";
        const dateInp = document.createElement("input");
        dateInp.type = "text";
        dateInp.placeholder = "12/25/2026";
        dateInp.value = fromISOToMDY(ev.date);
        dateInp.readOnly = true;
        dateInp.addEventListener("click", () => openEventModal({ mode: "edit", key, originalKey: key }));
        dateField.appendChild(dateLbl);
        dateField.appendChild(dateInp);

        grid.appendChild(titleField);
        grid.appendChild(dateField);

        content.appendChild(top);
        content.appendChild(grid);

        eventsListEl.appendChild(card);
    });

    btnEventsSave.disabled = !eventsDirty();
}

function addEvent() {
    openEventModal({ mode: "add" });
}

async function loadEventsOnce() {
    // const seq = ++eventsLoadSeq;
    const seq = bumpEventsLoadSeq();
    try {
        await waitForGlobal("__flipboardFirestoreReady", 8000, 50);
        await window.__flipboardFirestoreReady;
        const obj = await window.loadEventsPack();
        // Normalize shape
        const map = (obj && typeof obj === "object" && obj.events && typeof obj.events === "object") ? obj.events : {};
        const ord = (obj && typeof obj === "object" && Array.isArray(obj.order)) ? obj.order : null;
        setEventsDoc({ events: map, order: ord || [] });
        // Roll past dates forward (yearly countdown behavior)
        const rolled = autorollAllEventsYearly();
        // Normalize/repair order list
        setEventsOrder(eventsDoc.order);

        // If we changed anything on load (autoroll or order repair), persist once
        if (rolled) {
            try { await saveEventsImmediate(); } catch (e) { console.warn("autoroll save failed", e); }
        }

        setEventsSaved(eventsDoc);

        renderEventsManager();

        updateDirtyUI();
    } catch (err) {
        console.warn("events load failed:", err);
        setEventsDoc({ events: {}, order: [] });
        setEventsSaved(eventsDoc);
        renderEventsManager();

        updateDirtyUI();
        toast("Events load failed (using empty)");
    }
}
// Expose for startup loader + other blocks
window.loadEventsOnce = loadEventsOnce;

async function saveEvents() {
    try {
        await saveEventsImmediate();
        renderEventsManager();

        updateDirtyUI();
        toast("Events saved");
    } catch (err) {
        alert(String(err?.message || err));
    }
}

btnEventsReload.addEventListener("click", (e) => { e.preventDefault(); (window.loadEventsOnce || loadEventsOnce)(); toast("Events reloaded"); });
btnEventsAdd.addEventListener("click", (e) => { e.preventDefault(); addEvent(); });
btnEventsSave.addEventListener("click", (e) => { e.preventDefault(); saveEvents(); });

/* ============================================================
   Lists
============================================================ */

// ===== Shared pointer-based reorder (supports touch + mouse; vanilla JS) =====
// - Touch/Pen: long-press (~300ms) to activate drag (prevents accidental reorder while scrolling)
// - Mouse: drag starts immediately
// - Auto-scrolls the list when near top/bottom while dragging
// - Only starts when the user grabs the left rail (.dragRail)
function attachReorderController(opts) {
    const {
        container,
        itemSelector,
        handleSelector = ".dragRail",
        longPressMs = 300,
        getKey = (el) => el?.dataset?.key,
        onCommitOrder, // async(order[]) or sync
        axis = "y",
        autoScroll = true,
        canDragItem = (el) => true
    } = opts;

    if (!container) throw new Error("attachReorderController: missing container");

    let pendingTimer = null;
    let pending = null;

    let dragging = false;
    let pointerId = null;
    let activeItem = null;
    let placeholder = null;
    let startRect = null;
    let offsetY = 0;
    let offsetX = 0;
    let lastClientY = 0;
    let lastClientX = 0;

    let autoScrollRaf = 0;

    function clearPending() {
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
        }
        pending = null;
    }

    function setGlobalDragging(on) {
        window.__FB_REORDER_DRAGGING__ = !!on;
    }

    function isInteractiveTarget(t) {
        if (!t) return false;
        return !!t.closest("button, a, input, select, textarea, label, [role='button'], [data-no-drag]");
    }

    function startDrag(e) {
        if (!pending) return;
        const { item } = pending;

        if (!item || !container.contains(item)) return;
        if (!canDragItem(item)) return;

        dragging = true;
        setGlobalDragging(true);
        pointerId = e.pointerId;
        activeItem = item;

        startRect = item.getBoundingClientRect();
        offsetY = e.clientY - startRect.top;
        offsetX = e.clientX - startRect.left;
        lastClientY = e.clientY;
        lastClientX = e.clientX;

        placeholder = document.createElement("div");
        placeholder.className = "dragPlaceholder";
        placeholder.style.height = `${startRect.height}px`;

        // Keep the original margin gap visually consistent with your flex column gaps
        const cs = getComputedStyle(item);
        placeholder.style.marginTop = cs.marginTop;
        placeholder.style.marginBottom = cs.marginBottom;

        item.parentNode.insertBefore(placeholder, item);

        // Float the real item
        item.classList.add("dragLift");
        item.style.position = "fixed";
        item.style.top = `${startRect.top}px`;
        item.style.left = `${startRect.left}px`;
        item.style.width = `${startRect.width}px`;
        item.style.zIndex = "9999";
        item.style.pointerEvents = "none"; // allow elementFromPoint to see beneath
        item.style.transformOrigin = "center";
        document.body.appendChild(item);

        container.classList.add("dragListActive");
        document.documentElement.classList.add("dragListActive");
        document.body.classList.add("pageDragLock");

        try { container.setPointerCapture(pointerId); } catch (_) { }
        try { e.preventDefault(); } catch (_) { }

        if (autoScroll) kickAutoScroll();
    }

    function moveFloat(e) {
        if (!dragging || !activeItem) return;

        lastClientY = e.clientY;
        lastClientX = e.clientX;

        // Move floating item
        const top = e.clientY - offsetY;
        const left = startRect.left; // lock X to avoid sideways jitter
        activeItem.style.top = `${top}px`;
        activeItem.style.left = `${left}px`;

        // Reorder placeholder
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const over = el ? el.closest(itemSelector) : null;
        if (over && over !== activeItem && over !== placeholder && container.contains(over)) {
            const r = over.getBoundingClientRect();
            const insertAfter = e.clientY > (r.top + r.height / 2);
            const ref = insertAfter ? over.nextSibling : over;
            if (ref !== placeholder) container.insertBefore(placeholder, ref);
        }
    }

    function stopAutoScroll() {
        if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = 0;
    }

    function kickAutoScroll() {
        stopAutoScroll();

        const step = () => {
            if (!dragging) return;

            const r = container.getBoundingClientRect();
            const edge = 44;
            const maxSpeed = 16;

            let dy = 0;
            if (lastClientY < r.top + edge) dy = -Math.min(maxSpeed, (r.top + edge - lastClientY) / 2);
            else if (lastClientY > r.bottom - edge) dy = Math.min(maxSpeed, (lastClientY - (r.bottom - edge)) / 2);

            if (dy !== 0) container.scrollTop += dy;

            autoScrollRaf = requestAnimationFrame(step);
        };

        autoScrollRaf = requestAnimationFrame(step);
    }

    async function endDrag(e, cancelled = false) {
        clearPending();
        if (!dragging) return;

        dragging = false;
        stopAutoScroll();

        const item = activeItem;
        const ph = placeholder;

        setGlobalDragging(false);
        container.classList.remove("dragListActive");
        document.documentElement.classList.remove("dragListActive");
        document.body.classList.remove("pageDragLock");

        // Put item back into list
        if (ph && item) {
            container.insertBefore(item, ph);
            ph.remove();
        }

        // Clean floating styles
        if (item) {
            item.classList.remove("dragLift");
            item.style.position = "";
            item.style.top = "";
            item.style.left = "";
            item.style.width = "";
            item.style.zIndex = "";
            item.style.pointerEvents = "";
            item.style.transformOrigin = "";
        }

        placeholder = null;
        activeItem = null;
        startRect = null;

        try { container.releasePointerCapture(pointerId); } catch (_) { }
        pointerId = null;

        if (!cancelled && typeof onCommitOrder === "function") {
            const order = [...container.querySelectorAll(itemSelector)]
                .filter(el => el !== ph)
                .map(getKey)
                .filter(Boolean);
            try { await onCommitOrder(order); } catch (err) { console.warn("reorder commit failed:", err); }
        }
    }

    function onPointerDown(e) {
        // Only start from rail handle (or within handle)
        const handle = e.target?.closest(handleSelector);
        if (!handle || !container.contains(handle)) return;

        // Don't start drag if they clicked an interactive control inside the handle area
        if (isInteractiveTarget(e.target) && !e.target.closest(handleSelector)) return;

        const item = handle.closest(itemSelector);
        if (!item || !container.contains(item)) return;
        if (!canDragItem(item)) return;

        // If the click is actually on a button/input inside the card (edit/delete), do nothing.
        if (isInteractiveTarget(e.target) && !e.target.closest(handleSelector)) return;

        clearPending();

        // Touch/Pen: long-press required
        const isMouse = e.pointerType === "mouse";
        const mustLongPress = !isMouse;

        // If user moves finger before long-press triggers, we cancel and allow normal scroll.
        pending = { item, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };

        if (mustLongPress) {
            pendingTimer = setTimeout(() => startDrag(e), longPressMs);
        } else {
            startDrag(e);
        }
    }

    function onPointerMove(e) {
        if (dragging) {
            e.preventDefault();
            moveFloat(e);
            return;
        }
        if (!pending) return;

        // Cancel long-press if user intends to scroll (moved beyond slop before timer fires)
        const dx = Math.abs(e.clientX - pending.startX);
        const dy = Math.abs(e.clientY - pending.startY);
        if (dx > 8 || dy > 8) {
            clearPending();
        }
    }

    function onPointerUp(e) {
        if (dragging) {
            endDrag(e, false);
            return;
        }
        clearPending();
    }

    function onPointerCancel(e) {
        if (dragging) {
            endDrag(e, true);
            return;
        }
        clearPending();
    }

    // Use capture so we can preventDefault while dragging
    container.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerCancel, { passive: true });

    return {
        isDragging: () => dragging,
        destroy: () => {
            clearPending();
            stopAutoScroll();
            container.removeEventListener("pointerdown", onPointerDown, { passive: true });
            window.removeEventListener("pointermove", onPointerMove, { passive: false });
            window.removeEventListener("pointerup", onPointerUp, { passive: true });
            window.removeEventListener("pointercancel", onPointerCancel, { passive: true });
        }
    };
}
function makeItem(key, inRotation) {
    const b = pack.boards[key];
    const name = b?.name || "(unnamed)";

    const item = document.createElement("div");
    item.className = "boardItem" + (key === selectedKey ? " selected" : "");
    item.dataset.key = key;

    const rail = document.createElement("div");
    rail.className = "dragRail";
    rail.setAttribute("role", "button");
    rail.setAttribute("tabindex", "-1");
    rail.setAttribute("aria-label", "Drag to reorder");
    rail.dataset.dragHandle = "1";
    item.appendChild(rail);

    const content = document.createElement("div");
    content.className = "boardItemContent";
    item.appendChild(content);


    const top = document.createElement("div");
    top.className = "boardTop";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "boardName";
    title.textContent = name;

    const sub = document.createElement("div");
    sub.className = "boardKey";
    sub.textContent = key;

    left.appendChild(title);
    left.appendChild(sub);

    const badges = document.createElement("div");
    badges.className = "badges";

    const typeBadge = document.createElement("div");
    typeBadge.className = "badge " + (b?.type === "dynamic" ? "dynamic" : "");
    typeBadge.textContent = b?.type || "static";
    badges.appendChild(typeBadge);

    if (b?.one_shot) {
        const one = document.createElement("div");
        one.className = "badge oneshot";
        one.textContent = "one-shot";
        badges.appendChild(one);
    }

    top.appendChild(left);
    top.appendChild(badges);
    content.appendChild(top);

    item.addEventListener("click", () => { if (window.__FB_REORDER_DRAGGING__) return; attemptSelect(key); });

    return item;
}

function renderLists() {
    sanitizeRotation();

    rotationListEl.innerHTML = "";
    otherListEl.innerHTML = "";

    const order = pack.rotation?.order ?? [];
    const inRot = new Set(order);

    order.forEach(k => {
        const b = pack.boards[k];
        if (!b) return;
        rotationListEl.appendChild(makeItem(k, true));
    });

    Object.keys(pack.boards)
        .filter(k => !inRot.has(k))
        .sort()
        .forEach(k => otherListEl.appendChild(makeItem(k, false)));

    btnDeleteBoard.disabled = !selectedKey;

    const selectedBoard = selectedKey ? pack.boards[selectedKey] : null;
    const selectedIsOneShot = !!selectedBoard?.one_shot;

    btnAddToRotation.disabled = !selectedKey || inRot.has(selectedKey);
    btnRemoveFromRotation.disabled = !selectedKey || !inRot.has(selectedKey);

    if (!selectedKey || !inRot.has(selectedKey)) {
        btnMoveUp.disabled = true;
        btnMoveDown.disabled = true;
    } else {
        const idx = order.indexOf(selectedKey);
        btnMoveUp.disabled = idx <= 0;
        btnMoveDown.disabled = idx < 0 || idx >= order.length - 1;
    }

    updateDirtyUI();
}


// Attach drag-reorder controllers (rotation + events)
// NOTE: Delegated pointer listeners: safe to initialize once even though the lists re-render.
const rotationReorderCtl = attachReorderController({
    container: rotationListEl,
    itemSelector: ".boardItem",
    handleSelector: ".dragRail",
    longPressMs: 300,
    getKey: (el) => el?.dataset?.key,
    canDragItem: (el) => {
        const k = el?.dataset?.key;
        const b = k ? pack?.boards?.[k] : null;
        return !!k && !b?.one_shot; // keep one-shot boards out of reordering
    },
    onCommitOrder: async (order) => {
        pack.rotation ||= { enabled: true, dwell_ms: 15000, order: [] };
        pack.rotation.order = order;
        renderLists();      // keep UI in sync (badges, selection, etc.)
        setHeaderMeta();
        updateDirtyUI();
        toast("Rotation order updated");
    }
});

const eventsReorderCtl = attachReorderController({
    container: eventsListEl,
    itemSelector: ".eventCard",
    handleSelector: ".dragRail",
    longPressMs: 300,
    getKey: (el) => el?.dataset?.key,
    onCommitOrder: async (order) => {
        setEventsOrder(order);
        try {
            await saveEventsImmediate(); // keep existing behavior (save immediately)
            toast("Events reordered");
        } catch (err) {
            console.warn(err);
            toast("Reorder save failed");
        }
        renderEventsManager();

        updateDirtyUI();
    }
});

function reorderRotation(fromKey, toKey) {
    const fromBoard = pack.boards[fromKey];
    const toBoard = pack.boards[toKey];
    if (fromBoard?.one_shot || toBoard?.one_shot) return;

    const order = [...(pack.rotation?.order ?? [])];
    const fromIdx = order.indexOf(fromKey);
    const toIdx = order.indexOf(toKey);
    if (fromIdx < 0 || toIdx < 0) return;

    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromKey);
    pack.rotation.order = order;

    renderLists();
    setHeaderMeta();
    updateDirtyUI();
    toast("Rotation order updated");
}

function moveSelectedInRotation(delta) {
    if (!selectedKey) return;
    const b = pack.boards[selectedKey];
    if (b?.one_shot) return;

    const order = [...(pack.rotation?.order ?? [])];
    const idx = order.indexOf(selectedKey);
    if (idx < 0) return;

    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= order.length) return;

    const tmp = order[nextIdx];
    order[nextIdx] = order[idx];
    order[idx] = tmp;
    pack.rotation.order = order;

    renderLists();
    setHeaderMeta();
    updateDirtyUI();
    toast(delta < 0 ? "Moved up" : "Moved down");
}

/* ============================================================
   Create Board Modal (unchanged)
============================================================ */
const createBoardOverlay = document.getElementById("createBoardOverlay");
const createBoardClose = document.getElementById("createBoardClose");
const cbKeyEl = document.getElementById("cbKey");
const cbNameEl = document.getElementById("cbName");
const cbIsWeatherEl = document.getElementById("cbIsWeather");
const cbWeatherZipWrapEl = document.getElementById("cbWeatherZipWrap");
const cbWeatherZipEl = document.getElementById("cbWeatherZip");
const cbOneShotEl = document.getElementById("cbOneShot");
const cbAddToRotationEl = document.getElementById("cbAddToRotation");
const cbCancelBtn = document.getElementById("cbCancel");
const cbCreateBtn = document.getElementById("cbCreate");

function openCreateBoardModal() {
    cbKeyEl.value = feUuid();
    cbKeyEl.readOnly = true;
    cbNameEl.value = "New Board";
    cbIsWeatherEl.checked = false;
    if (cbWeatherZipEl) cbWeatherZipEl.value = "";
    if (cbWeatherZipWrapEl) cbWeatherZipWrapEl.style.display = "none";

    cbOneShotEl.checked = false;
    cbAddToRotationEl.checked = true;
    cbAddToRotationEl.disabled = false;

    createBoardOverlay.classList.add("show");
    createBoardOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => cbNameEl.focus(), 0);
}

function closeCreateBoardModal() {
    if (createBoardOverlay.contains(document.activeElement)) {
        document.activeElement.blur();
        setTimeout(() => btnAddBoard?.focus(), 0);
    }
    createBoardOverlay.classList.remove("show");
    createBoardOverlay.setAttribute("aria-hidden", "true");
}

cbOneShotEl.addEventListener("change", () => {
    if (cbOneShotEl.checked) {
        cbAddToRotationEl.checked = false;
        cbAddToRotationEl.disabled = true;
    } else {
        cbAddToRotationEl.disabled = false;
    }
});

cbIsWeatherEl.addEventListener("change", () => {
    if (!cbWeatherZipWrapEl) return;
    cbWeatherZipWrapEl.style.display = cbIsWeatherEl.checked ? "" : "none";
    if (cbIsWeatherEl.checked) setTimeout(() => cbWeatherZipEl?.focus(), 0);
});

createBoardClose.addEventListener("click", closeCreateBoardModal);
cbCancelBtn.addEventListener("click", closeCreateBoardModal);

createBoardOverlay.addEventListener("click", (e) => {
    if (e.target === createBoardOverlay) closeCreateBoardModal();
});

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && createBoardOverlay.classList.contains("show")) {
        closeCreateBoardModal();
    }
});

function createBoardFromModal() {
    // Board keys are UUIDs (system-generated). Name is user-facing.
    let key = feUuid();
    while (pack.boards && pack.boards[key]) key = feUuid();

    // Keep the hidden field in sync for debugging.
    cbKeyEl.value = key;

    const name = (cbNameEl.value || "New Board").trim() || "New Board";

    const oneShot = !!cbOneShotEl.checked;
    const addToRotation = !!cbAddToRotationEl.checked && !oneShot;

    const isWeather = !!cbIsWeatherEl.checked;
    const type = isWeather ? "dynamic" : "static";
    const zip = isWeather ? normalizeZip5(cbWeatherZipEl?.value) : "";
    if (isWeather) {
        if (cbWeatherZipEl) cbWeatherZipEl.value = zip;
        if (!isValidZip5(zip)) {
            alert("Enter a valid 5-digit Weather ZIP before creating a Weather board.");
            cbWeatherZipEl?.focus();
            return;
        }
    }

    const cols = getCols();
    const rows = getRows();
    const rowsArr = Array.from({ length: rows }, () => " ".repeat(cols));

    const newBoard = { name, type, rows: rowsArr, row_justify: Array.from({ length: rows }, () => "left") };
    if (isWeather) {
        newBoard.source = "openweather_onecall";
        newBoard.weather = { location: { type: "zip", value: zip, label: "" } };
    }
    if (oneShot) newBoard.one_shot = true;

    pack.boards[key] = newBoard;

    if (addToRotation) {
        pack.rotation.order = pack.rotation.order || [];
        pack.rotation.order.push(key);
    }

    closeCreateBoardModal();
    selectBoard(key);
    renderLists();
    updateDirtyUI();
    toast("Board created");
}

cbCreateBtn.addEventListener("click", createBoardFromModal);

/* ============================================================
   Editor select / discard prompt
============================================================ */
function attemptSelect(key) {
    if (key === selectedKey) return;

    if (editorIsDirty()) {
        if (window.__suppressDirtyConfirms) {
            // Auto-discard when we are switching devices / reloading
            try { setDraftSaved(JSON.parse(JSON.stringify(draft))); } catch (_) { }
            try { updateDirtyIndicators(); } catch (_) { }
            selectBoard(key);
            return;
        }

        (async () => {
            const choice = await confirmUnsavedAction({
                title: "Switch boards?",
                sub: "You have unsaved changes.",
                hint: `Save = write boardPack/events to Firestore, then switch.
Discard = lose local changes and switch anyway.
Cancel = stay on the current board.`
            });

            if (choice === "cancel") return;

            if (choice === "save") {
                await savePack();
                if (editorIsDirty()) return; // save failed / still dirty
            } else if (choice === "discard") {
                discardEditorEdits();
            }

            selectBoard(key);
        })();

        return;
    }

    selectBoard(key);
}


function selectBoard(key, opts = {}) {
    // selectedKey = key;
    setSelectedKey(key);
    const b = pack.boards[key];
    if (!b) { clearEditor(); renderLists(); return; }

    // draft = deepClone(b);
    setDraft(deepClone(b));

    const r = getRows();
    const c = getCols();

    ensureBoardRowJustify(draft, r);
    draft.rows = Array.from({ length: r }, (_, i) => normalizeLineForGrid(draft.rows?.[i] ?? "", c, draft.row_justify?.[i]));
    if (!opts.preserveSavedBaseline || !draftSaved) {

        setDraftSaved(deepClone(draft));
    }

    boardKeyEl.value = key;
    boardNameEl.value = draft.name ?? "";
    boardTypeEl.value = draft.type ?? "static";
    boardOneShotEl.checked = !!draft.one_shot;
    const isW = !!(draft.source === "openweather_onecall" || draft.weather?.location?.type === "zip");
    if (boardIsWeatherEl) boardIsWeatherEl.checked = isW;
    if (weatherZipWrapEl) weatherZipWrapEl.style.display = isW ? "" : "none";
    if (btnOpenWeatherTokens) btnOpenWeatherTokens.style.display = isW ? "" : "none";
    if (boardWeatherZipEl) boardWeatherZipEl.value = isW ? normalizeZip5(draft.weather?.location?.value || "") : "";

    if ((draft.type ?? "static") === "dynamic") {
        sourceWrapEl.style.display = "";
        boardSourceEl.value = (draft.source ?? "");
    } else {
        sourceWrapEl.style.display = "none";
        boardSourceEl.value = "";
    }

    renderRowInputs();
    renderLists();
    updateDirtyUI();
    try { window.renderPreview("full"); } catch (e) { }

}

function clearEditor() {
    // selectedKey = null;
    // draft = null;
    // draftSaved = null;
    setSelectedKey(null);
    setDraft(null);
    setDraftSaved(null);

    boardKeyEl.value = "";
    boardNameEl.value = "";
    boardTypeEl.value = "static";
    boardSourceEl.value = "";
    boardOneShotEl.checked = false;
    if (boardIsWeatherEl) boardIsWeatherEl.checked = false;
    if (weatherZipWrapEl) weatherZipWrapEl.style.display = "none";
    if (btnOpenWeatherTokens) btnOpenWeatherTokens.style.display = "none";
    if (boardWeatherZipEl) boardWeatherZipEl.value = "";
    sourceWrapEl.style.display = "none";
    rowsContainerEl.innerHTML = "";

    updateDirtyUI();
    try { window.renderPreview("full"); } catch (e) { }

}

function renderRowInputs() {
    rowsContainerEl.innerHTML = "";
    const cols = getCols();
    const rows = getRows();

    for (let i = 0; i < rows; i++) {
        const line = draft.rows[i] ?? "";

        const wrap = document.createElement("div");
        wrap.className = "lineRow";

        const lbl = document.createElement("div");
        lbl.className = "lbl";
        lbl.textContent = `ROW ${i + 1}`;

        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "field";
        inp.dataset.rowIndex = String(i);

        // While typing: show trimmed-right only (no pad), preserve casing
        inp.value = stripOuterPadding(String(line));
        inp.removeAttribute("maxLength");
        inp.spellcheck = false;

        inp.autocomplete = "off";

        // inp.addEventListener("focus", () => { lastFocusedRowInput = inp; });
        inp.addEventListener("focus", () => { setLastFocusedRowInput(inp); });

        ensureBoardRowJustify(draft, rows);
        const justifyGroup = document.createElement("div");
        justifyGroup.className = "justifyGroup";
        justifyGroup.setAttribute("role", "group");
        justifyGroup.setAttribute("aria-label", `Row ${i + 1} justify`);

        const justifyButtons = {};
        const setRowJustifyUI = (mode) => {
            const normalized = normalizeJustifyValue(mode);
            Object.entries(justifyButtons).forEach(([key, btn]) => {
                const active = key === normalized;
                btn.classList.toggle("active", active);
                btn.setAttribute("aria-pressed", active ? "true" : "false");
            });
        };

        ["left", "center", "right"].forEach((mode) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "justifyBtn";
            btn.setAttribute("data-justify", mode);
            btn.title = `${mode[0].toUpperCase()}${mode.slice(1)} justify`;
            btn.setAttribute("aria-label", `${mode[0].toUpperCase()}${mode.slice(1)} justify`);
            btn.innerHTML = mode === "left"
                ? '<i class="fa fa-align-left" aria-hidden="true"></i>'
                : (mode === "center"
                    ? '<i class="fa fa-align-center" aria-hidden="true"></i>'
                    : '<i class="fa fa-align-right" aria-hidden="true"></i>');
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                ensureBoardRowJustify(draft, rows);
                draft.row_justify[i] = mode;
                setRowJustifyUI(mode);
                onDraftChanged();
                try { scheduleLayout(); } catch (e) { }
            });
            justifyButtons[mode] = btn;
            justifyGroup.appendChild(btn);
        });

        setRowJustifyUI(draft.row_justify?.[i]);

        const count = document.createElement("div");
        count.className = "count";
        const vis0 = getVisibleLength(inp.value);
        const raw0 = inp.value.length;
        count.textContent = `V ${String(vis0).padStart(2, "0")}/${cols} • R ${String(raw0).padStart(2, "0")}`;

        inp.addEventListener("paste", (e) => {
            const clip = (e.clipboardData || window.clipboardData).getData("text") || "";
            const selStart = inp.selectionStart ?? inp.value.length;
            const selEnd = inp.selectionEnd ?? inp.value.length;
            const before = inp.value.slice(0, selStart);
            const after = inp.value.slice(selEnd);
            const next = before + clip + after;

            const nextVisible = getVisibleLength(next);
            if (nextVisible > cols) {
                inp.classList.add("flashOver");
                setTimeout(() => inp.classList.remove("flashOver"), 350);
            }
        });

        const applyInvalidTokenUI = () => {
            const badColor = validateColorTokens(inp.value).invalidTokens;
            const badCd = validateCountdownTokens(inp.value).invalidTokens;

            // One outline for any invalid token (simple + predictable)
            const hasBad = (badColor.length + badCd.length) > 0;
            inp.style.outline = hasBad ? "2px solid rgba(255,77,77,.55)" : "";

            const msgs = [];
            if (badColor.length) msgs.push(`Invalid COLOR: ${badColor.map(t => t.token).join(" ")}`);
            if (badCd.length) msgs.push(`Invalid COUNTDOWN: ${badCd.map(t => t.token).join(" ")}`);
            inp.title = msgs.join("\n");
        };

        inp.addEventListener("input", () => {
            // While typing, preserve exactly what the user entered.
            // We only analyze visible width here; normalization happens on blur / Fix / Save.
            ensureBoardRowJustify(draft, rows);
            draft.rows[i] = inp.value;

            const visLen = getVisibleLength(inp.value);
            const rawLen = inp.value.length;
            count.textContent = `V ${String(visLen).padStart(2, "0")}/${cols} • R ${String(rawLen).padStart(2, "0")}`;

            if (visLen > cols) {
                count.style.color = "var(--danger)";
                inp.classList.add("flashOver");
                clearTimeout(inp._flashT);
                inp._flashT = setTimeout(() => inp.classList.remove("flashOver"), 180);
            } else {
                count.style.color = "";
            }

            applyInvalidTokenUI();
            // updateLineTokenStatus(i); // removed legacy hook (was causing console errors)
            onDraftChanged();
        });

        inp.addEventListener("blur", () => {
            // Normalize on blur to match runtime behavior
            ensureBoardRowJustify(draft, rows);
            let v = normalizeLineForGrid(inp.value, cols, draft.row_justify?.[i]);
            draft.rows[i] = v;

            // input shows unpadded content for edit comfort
            inp.value = stripOuterPadding(v);

            const visLen = getVisibleLength(inp.value);
            const rawLen = inp.value.length;
            count.textContent = `V ${String(visLen).padStart(2, "0")}/${cols} • R ${String(rawLen).padStart(2, "0")}`;

            applyInvalidTokenUI();
            onDraftChanged();
        });

        const fixBtn = document.createElement("button");
        fixBtn.className = "fixBtn";
        fixBtn.textContent = "Fix";
        fixBtn.title = "Normalize COLOR + COUNTDOWN tokens, uppercase, trim trailing spaces";

        fixBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const before = inp.value;

            let after = String(before ?? "");
            after = fixColorTokensInLine(after);
            after = fixCountdownTokensInLine(after);
            after = after.toUpperCase();
            after = trimToVisibleCols(after, cols);

            ensureBoardRowJustify(draft, rows);
            const normalized = normalizeLineForGrid(after, cols, draft.row_justify?.[i]);

            inp.value = stripOuterPadding(normalized);
            draft.rows[i] = normalized;
            after = inp.value;

            const visLen = getVisibleLength(after);
            const rawLen = after.length;
            count.textContent = `V ${String(visLen).padStart(2, "0")}/${cols} • R ${String(rawLen).padStart(2, "0")}`;

            applyInvalidTokenUI();
            onDraftChanged();

            toast(after !== before ? "Fixed line" : "Nothing to fix");
        });

        applyInvalidTokenUI();

        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        wrap.appendChild(justifyGroup);
        wrap.appendChild(count);
        wrap.appendChild(fixBtn);
        rowsContainerEl.appendChild(wrap);
    }

    boardNameEl.oninput = () => {
        draft.name = boardNameEl.value;
        onDraftChanged();
    };

    boardTypeEl.onchange = () => {
        draft.type = boardTypeEl.value;
        if (boardTypeEl.value === "dynamic") {
            sourceWrapEl.style.display = "";
            draft.source = boardSourceEl.value || draft.source || "";
        } else {
            sourceWrapEl.style.display = "none";
            delete draft.source;
        }
        onDraftChanged();
    };

    boardSourceEl.oninput = () => {
        draft.source = boardSourceEl.value;
        onDraftChanged();
    };

    boardOneShotEl.onchange = () => {
        draft.one_shot = !!boardOneShotEl.checked;
        onDraftChanged();
    };

    if (boardIsWeatherEl) {
        boardIsWeatherEl.onchange = () => {
            const on = !!boardIsWeatherEl.checked;
            if (on) {
                // Weather boards are dynamic with the OpenWeather onecall source.
                draft.type = "dynamic";
                boardTypeEl.value = "dynamic";
                sourceWrapEl.style.display = "";
                draft.source = "openweather_onecall";
                boardSourceEl.value = "openweather_onecall";
                if (!draft.weather) draft.weather = {};
                if (!draft.weather.location) draft.weather.location = { type: "zip", value: "", label: "" };
                draft.weather.location.type = "zip";
                if (weatherZipWrapEl) weatherZipWrapEl.style.display = "";
                if (btnOpenWeatherTokens) btnOpenWeatherTokens.style.display = "";
                setTimeout(() => boardWeatherZipEl?.focus(), 0);
            } else {
                // Hard transition: non-weather boards do not keep weather config.
                if (weatherZipWrapEl) weatherZipWrapEl.style.display = "none";
                if (btnOpenWeatherTokens) btnOpenWeatherTokens.style.display = "none";
                if (boardWeatherZipEl) boardWeatherZipEl.value = "";
                delete draft.weather;
                // Also clear source/type back to static.
                draft.type = "static";
                boardTypeEl.value = "static";
                sourceWrapEl.style.display = "none";
                boardSourceEl.value = "";
                delete draft.source;
            }
            onDraftChanged();
        };
    }

    if (boardWeatherZipEl) {
        boardWeatherZipEl.oninput = () => {
            const zip = normalizeZip5(boardWeatherZipEl.value);
            boardWeatherZipEl.value = zip;
            if (!draft.weather) draft.weather = {};
            if (!draft.weather.location) draft.weather.location = { type: "zip", value: "", label: "" };
            draft.weather.location.type = "zip";
            draft.weather.location.value = zip;
            onDraftChanged();
        };
    }
}

function onDraftChanged() {
    if (selectedKey && draft) {
        pack.boards[selectedKey] = deepClone(draft);
    }
    sanitizeRotation();
    renderLists();
    setHeaderMeta();
    updateDirtyUI();
}

function discardEditorEdits() {
    if (!selectedKey || !draftSaved) return;
    setDraft(deepClone(draftSaved));
    pack.boards[selectedKey] = deepClone(draftSaved);
    selectBoard(selectedKey);
    toast("Edits discarded");
}

function addBoard() {
    const activeDeviceId = (window.getActiveDeviceId ? window.getActiveDeviceId() : "") || "";
    if (!activeDeviceId) {
        toast("Select or add a device first");
        // If your UI has a devices modal, nudge it open instead of crashing.
        try { if (typeof openDevicesModal === "function") openDevicesModal(); } catch (_) { }
        return;
    }

    // Prompt if there are unsaved changes before creating a new board.
    if (editorIsDirty() && !window.__suppressDirtyConfirms) {
        (async () => {
            const choice = await confirmUnsavedAction({
                title: "Create new board?",
                sub: "You have unsaved changes.",
                hint: `Save = write boardPack/events to Firestore, then open New Board.
Discard = lose local changes and open New Board.
Cancel = stay here.`
            });

            if (choice === "cancel") return;

            if (choice === "save") {
                await savePack();
                if (editorIsDirty()) return;
            } else if (choice === "discard") {
                discardEditorEdits();
            }

            openCreateBoardModal();
        })();

        return;
    }

    openCreateBoardModal();
    try { window.syncWeatherFooterHeight && window.syncWeatherFooterHeight(); } catch (e) { }

}



function makeUniqueBoardKey(baseKey) {
    const raw = String(baseKey || "").trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    const base = raw || "NEW_BOARD";
    let k = base;
    let n = 2;
    while (pack?.boards?.[k]) {
        k = `${base}_${n++}`;
    }
    return k;
}

function duplicateBoard() {
    if (!selectedKey || !pack?.boards?.[selectedKey]) {
        toast("Select a board to duplicate");
        return;
    }

    const activeDeviceId = (window.getActiveDeviceId ? window.getActiveDeviceId() : "") || "";
    if (!activeDeviceId) {
        toast("Select or add a device first");
        try { openDevicesModal?.(); } catch (_) { }
        return;
    }

    if (editorIsDirty()) {
        confirmUnsavedAction({
            title: "Duplicate board?",
            sub: "You have unsaved changes.",
            hint: `Save = write boardPack/events to Firestore, then duplicate.\nDiscard = lose local changes, then duplicate.\nCancel = stay here.`
        }).then(async (choice) => {
            if (choice === "cancel") return;
            if (choice === "save") {
                await savePack();
                if (editorIsDirty()) return;
            } else if (choice === "discard") {
                discardEditorEdits();
            }
            duplicateBoard();
        });
        return;
    }

    const srcKey = selectedKey;
    const src = deepClone(pack.boards[srcKey]);
    const base = `${srcKey}_COPY`;
    const newKey = makeUniqueBoardKey(base);

    const srcName = String(src?.name || srcKey);
    src.name = srcName.includes("Copy") ? srcName : `${srcName} (Copy)`;

    pack.boards[newKey] = src;

    const order = pack.rotation?.order || [];
    const inRot = order.includes(srcKey);
    const isOneShot = !!src.one_shot;
    if (inRot && !isOneShot) {
        pack.rotation.order = order.concat([newKey]);
    }

    selectBoard(newKey);
    renderLists();
    updateDirtyUI();
    toast(`Duplicated as ${newKey}`);
}

function deleteBoard() {
    if (!selectedKey) return;

    const key = selectedKey;
    const boardName = pack.boards[key]?.name || key;

    const ok = confirm(`Delete board "${boardName}" (${key})?\n\nThis cannot be undone.`);
    if (!ok) return;

    delete pack.boards[key];
    pack.rotation.order = (pack.rotation.order || []).filter(k => k !== key);

    clearEditor();
    renderLists();
    updateDirtyUI();
    toast("Board deleted");
}

function addSelectedToRotation() {
    if (!selectedKey) return;
    const b = pack.boards[selectedKey];
    const order = pack.rotation.order || [];
    if (order.includes(selectedKey)) return;
    order.push(selectedKey);
    pack.rotation.order = order;
    renderLists();
    updateDirtyUI();
    toast("Added to rotation");
}

function removeSelectedFromRotation() {
    if (!selectedKey) return;
    pack.rotation.order = (pack.rotation.order || []).filter(k => k !== selectedKey);
    renderLists();
    updateDirtyUI();
    toast("Removed from rotation");
}

function bindRotationControls() {
    rotationEnabledEl.onchange = () => {
        pack.rotation.enabled = !!rotationEnabledEl.checked;
        updateDirtyUI();
    };
    rotationDwellEl.oninput = () => {
        const seconds = Math.max(0, Number(rotationDwellEl.value || 0));
        pack.rotation.dwell_ms = Math.round(seconds * 1000);
        dbg('Rotation delay changed (seconds → ms stored):', seconds, pack.rotation.dwell_ms);
        // Saved-only pills: do not update header delay pill until save succeeds.
        updateDirtyUI();
    };
}

function bindGlobalControls() {
    gridColsEl.oninput = () => {
        const v = Math.max(1, Math.min(120, Number(gridColsEl.value || 1)));
        pack.meta.grid.columns = v;
        dbg('Grid cols changed:', v);

        for (const k of Object.keys(pack.boards)) {
            const b = pack.boards[k];
            ensureBoardRowJustify(b, getRows());
            b.rows = (b.rows || []).map((r, i) => normalizeLineForGrid(r, v, b.row_justify?.[i]));
        }

        setHeaderMeta();
        if (selectedKey) selectBoard(selectedKey, { preserveSavedBaseline: true });
        renderLists();
        updateDirtyUI();
    };

    gridRowsEl.oninput = () => {
        const v = Math.max(1, Math.min(40, Number(gridRowsEl.value || 1)));
        pack.meta.grid.rows = v;
        dbg('Grid rows changed:', v);

        const cols = getCols();
        for (const k of Object.keys(pack.boards)) {
            const b = pack.boards[k];
            const old = Array.isArray(b.rows) ? b.rows : [];
            ensureBoardRowJustify(b, v);
            b.rows = Array.from({ length: v }, (_, i) => normalizeLineForGrid(old[i] ?? "", cols, b.row_justify?.[i]));
        }

        setHeaderMeta();
        if (selectedKey) selectBoard(selectedKey, { preserveSavedBaseline: true });
        renderLists();
        updateDirtyUI();
    };

    // Flip Speed slider (meta.ui.flip_speed)
    if (flipSpeedEl) {
        const clampFlipSpeed = (val) => {
            let n = parseInt(String(val ?? ""), 10);
            if (!Number.isFinite(n)) n = 3;
            n = Math.max(1, Math.min(5, n));
            return n;
        };

        const applyFlipSpeedUI = (n) => {
            if (flipSpeedEl.value !== String(n)) flipSpeedEl.value = String(n);
            if (flipSpeedValEl) flipSpeedValEl.textContent = String(n);
        };

        // Keep UI aligned with current pack value at startup
        applyFlipSpeedUI(clampFlipSpeed(pack?.meta?.ui?.flip_speed ?? 3));

        flipSpeedEl.oninput = () => {
            const n = clampFlipSpeed(flipSpeedEl.value);
            pack.meta ||= {};
            pack.meta.ui ||= {};
            pack.meta.ui.flip_speed = n;
            applyFlipSpeedUI(n);
            console.log(`[EDITOR] flip_speed updated → ${n}`);
            updateDirtyUI();
        };
    }

    metaDescriptionEl.oninput = () => {
        pack.meta.description = metaDescriptionEl.value;
        updateDirtyUI();
    };

    weatherTypeEl.onchange = () => {
        ensureWeatherShape();
        pack.meta.weather.location.type = weatherTypeEl.value;
        updateDirtyUI();
    };

    weatherValueEl.oninput = () => {
        ensureWeatherShape();
        pack.meta.weather.location.value = String(weatherValueEl.value || "").trim();
        updateDirtyUI();
    };

    weatherLabelEl.oninput = () => {
        ensureWeatherShape();
        // Weather label should be uppercase always
        pack.meta.weather.location.label = String(weatherLabelEl.value || "").toUpperCase();
        updateDirtyUI();
    };

    weatherLabelEl.addEventListener("blur", () => {
        ensureWeatherShape();
        pack.meta.weather.location.label = String(weatherLabelEl.value || "").toUpperCase().trim();
        weatherLabelEl.value = pack.meta.weather.location.label || "";
        updateDirtyUI();
    });
}

async function copyJSON() {
    const cols = getCols();
    const rows = getRows();

    const out = deepClone(pack);
    out.meta ||= { grid: { columns: cols, rows: rows }, description: "", weather: {} };
    out.meta.grid ||= { columns: cols, rows: rows };
    out.rotation ||= { enabled: true, dwell_ms: 15000, order: [] };
    out.rotation.order ||= [];
    out.boards ||= {};
    ensureWeatherShape();

    out.rotation.order = out.rotation.order.filter(k => {
        const b = out.boards?.[k];
        return !!b && !b.one_shot;
    });

    for (const k of Object.keys(out.boards)) {
        const b = out.boards[k];
        b.name = b.name ?? k;
        b.type = b.type ?? "static";

        const old = Array.isArray(b.rows) ? b.rows : [];
        ensureBoardRowJustify(b, rows);
        b.rows = Array.from({ length: rows }, (_, i) => normalizeLineForGrid(old[i] ?? "", cols, b.row_justify?.[i]));

        if (b.type !== "dynamic") delete b.source;
    }

    const text = JSON.stringify(out, null, 2);
    await navigator.clipboard.writeText(text);
    toast("JSON copied");
}

function validateWeatherBoardsOrToast() {
    const boards = pack?.boards || {};
    for (const [k, b] of Object.entries(boards)) {
        const isWeather = (b?.source === "openweather_onecall") || (b?.weather?.location?.type === "zip");
        if (!isWeather) continue;
        const zip = normalizeZip5(b?.weather?.location?.value || "");
        if (!isValidZip5(zip)) {
            toast(`Weather board "${b?.name || k}" needs a 5-digit ZIP.`);
            try { selectBoard(k); } catch (_) { }
            try { if (weatherZipWrapEl) weatherZipWrapEl.style.display = ""; } catch (_) { }
            try { boardWeatherZipEl?.focus(); } catch (_) { }
            return false;
        }
    }
    return true;
}

async function savePack() {
    if (!validateWeatherBoardsOrToast()) return;
    dbgGroup('Save pack click', () => {
        dbg('Before save:', { packDirty: packIsDirty(), editorDirty: editorIsDirty(), eventsDirty: eventsDirty() });
    });
    try {
        await waitForGlobal("__flipboardFirestoreReady", 8000, 50);
        await window.__flipboardFirestoreReady;

        // Phase 2: enforce required defaults without dropping unknown keys
        ensurePackDefaults(pack);

        // Normalize board rows to runtime rules
        if (selectedKey && draft) {
            const cols = getCols();
            ensureBoardRowJustify(draft, getRows());
            draft.rows = (draft.rows || []).map((r, i) => normalizeLineForGrid(r, cols, draft.row_justify?.[i]));
            pack.boards[selectedKey] = deepClone(draft);
        }

        sanitizeRotation();

        if (!window.saveStagePack) throw new Error("saveStagePack() missing");
        await window.saveStagePack(pack);

        console.log(`[EDITOR] flip_speed saved → ${pack?.meta?.ui?.flip_speed ?? 3}`);

        setPackSaved(pack);
        setHeaderMeta();

        if (selectedKey && pack.boards[selectedKey]) {
            setDraftSaved(deepClone(pack.boards[selectedKey]));
        }

        const src = window.__flipboardLastSource || "firestore";
        setStatus(src, "saved", "ok");
        updateDirtyUI();
        toast("Saved to Firestore");
    } catch (err) {
        setStatus("firestore", String(err?.message || err), "err");
        alert(String(err?.message || err));
    }
}

async function reloadPack() {
    if (!window.__suppressReloadConfirm && anyFirestoreDirty()) {
        const choice = await confirmUnsavedAction({
            title: "Reload from Firestore?",
            sub: "You have unsaved changes. Reloading will discard local changes unless you save first.",
            hint: "Save = write boardPack/events to Firestore, then reload. Discard = reload anyway. Cancel = stay here."
        });
        if (choice === "cancel") return;
        if (choice === "save") {
            // Save pack and events before reloading
            try {
                if (typeof window.savePack === "function" && (packIsDirty() || editorIsDirty())) await window.savePack();
            } catch (e) { console.warn("[EDITOR] save pack before reload failed:", e); return; }
            try {
                if (typeof window.saveEvents === "function" && eventsDirty()) await window.saveEvents();
            } catch (e) { console.warn("[EDITOR] save events before reload failed:", e); return; }
        }
        // discard -> continue
    }

    try {
        setStatus("firestore", "reloading…", "warn");
        await waitForGlobal("__flipboardFirestoreReady", 8000, 50);
        await window.__flipboardFirestoreReady;

        if (!window.loadStagePack) throw new Error("loadStagePack() missing");
        try { setBootPhase("BOARDPKG"); } catch (_) { }
        setPack(await window.loadStagePack());
        exposePack();
        setPackSaved(pack);
        setHeaderMeta();

        setSelectedKey(null);
        setDraft(null);
        setDraftSaved(null);

        initFromPack();

        const src = window.__flipboardLastSource || "firestore";
        setStatus(src, "loaded", src.includes("server") ? "ok" : "warn");
        toast("Reloaded");
    } catch (err) {
        setStatus("firestore", String(err?.message || err), "err");
        alert(String(err?.message || err));
    }
}

// Expose for device switching
window.reloadPack = reloadPack;


(function enableSplitter() {
    const app = document.getElementById("appSplit");
    const splitter = document.getElementById("splitter");
    if (!app || !splitter) return;

    let dragging = false;

    splitter.addEventListener("mousedown", () => {
        dragging = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = app.getBoundingClientRect();
        const minLeft = 330;
        const maxLeft = 520;
        let leftWidth = e.clientX - rect.left;
        leftWidth = Math.max(minLeft, Math.min(maxLeft, leftWidth));
        app.style.gridTemplateColumns = `${leftWidth}px 8px 1fr`;
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
    });
})();

// function normalizePack(p) {
//     p ||= {};
//     p.meta ||= { grid: { columns: 20, rows: 8 }, description: "", weather: {} };
//     p.meta.grid ||= { columns: 20, rows: 8 };
//     p.rotation ||= { enabled: true, dwell_ms: 15000, order: [] };
//     p.rotation.order ||= [];

//     if (!p.boards || typeof p.boards !== "object") p.boards = {};
//     if (Object.keys(p.boards).length === 0 && p.stages && typeof p.stages === "object") {
//         p.boards = JSON.parse(JSON.stringify(p.stages));
//     }

//     // Ensure meta.ui.flip_speed (1–5) exists without clobbering other meta keys
//     Object.keys(p.boards || {}).forEach((key) => {
//         const b = p.boards[key];
//         if (!b || typeof b !== "object") return;
//         if (!Array.isArray(b.rows)) b.rows = [];
//         ensureBoardRowJustify(b, b.rows.length || (p.meta?.grid?.rows ?? 8));
//     });
//     if (!p.meta.ui || typeof p.meta.ui !== "object") p.meta.ui = {};
//     const rawFlip = p.meta.ui.flip_speed;
//     let fs = Number.isFinite(rawFlip) ? rawFlip : parseInt(rawFlip, 10);
//     if (!Number.isFinite(fs)) fs = 3;
//     fs = Math.max(1, Math.min(5, Math.round(fs)));
//     p.meta.ui.flip_speed = fs;

//     ensureWeatherShape();
//     return p;
// }

function initFromPack() {
    // pack = normalizePack(pack);
    // exposePack();
    setPack(normalizePack(pack));
    sanitizeRotation();

    rotationEnabledEl.checked = !!pack.rotation.enabled;
    rotationDwellEl.value = msToDelaySecondsValue(pack.rotation.dwell_ms ?? 15000);

    gridColsEl.value = getCols();
    gridRowsEl.value = getRows();
    metaDescriptionEl.value = pack.meta.description ?? "";
    // Flip Speed slider (meta.ui.flip_speed)
    if (flipSpeedEl) flipSpeedEl.value = String(pack?.meta?.ui?.flip_speed ?? 3);
    if (flipSpeedValEl) flipSpeedValEl.textContent = String(pack?.meta?.ui?.flip_speed ?? 3);


    ensureWeatherShape();
    weatherTypeEl.value = pack.meta.weather.location.type || "city";
    weatherValueEl.value = pack.meta.weather.location.value || "";
    weatherLabelEl.value = (pack.meta.weather.location.label || "").toUpperCase();

    setHeaderMeta();
    renderLists();

    const first = (pack.rotation.order || []).find(k => pack.boards[k]) || Object.keys(pack.boards)[0];
    if (first) selectBoard(first);
    else clearEditor();

    updateDirtyUI();
}

/* Events */
btnAddBoard.addEventListener("click", addBoard);
btnDeleteBoard.addEventListener("click", deleteBoard);
btnAddToRotation.addEventListener("click", addSelectedToRotation);
btnRemoveFromRotation.addEventListener("click", removeSelectedFromRotation);
btnMoveUp.addEventListener("click", () => moveSelectedInRotation(-1));
btnMoveDown.addEventListener("click", () => moveSelectedInRotation(1));

btnDiscardEdits.addEventListener("click", discardEditorEdits);
btnInsertColor.addEventListener("click", () => {
    // One global button to reduce clutter: inserts/edits into the last-focused row.
    let target = lastFocusedRowInput;

    // Fallback: first row input in the current rows container (row editors are <input>, not <textarea>)
    if (!target) {
        target = rowsContainerEl.querySelector('input[type="text"]');
        if (target) { target.focus(); lastFocusedRowInput = target; }
    }

    if (!target) { toast("Select a row first."); return; }

    // Open the picker bound to the active row input.
    // The modal decides Insert vs Edit based on caret/selection and existing {COLOR ...} tokens.
    ColorPickerModal.open({
        target,
        default: "#FFFFFF",
        format: "HEX"
    });
});

btnCopyJSON.addEventListener("click", copyJSON);
btnSavePack.addEventListener("click", savePack);
btnReload.addEventListener("click", reloadPack);

/* Token modal events */
const btnTokenModal = document.getElementById("btnTokenModal");

if (btnTokenModal) {
    btnTokenModal.addEventListener("click", () => {
        openTokenModal(); // or whatever your function is
    });
}

if (btnOpenWeatherTokens) btnOpenWeatherTokens.addEventListener("click", () => openWeatherTokenModal());


if (tokenModalClose) {
    tokenModalClose.addEventListener("click", () => closeTokenModal(true));
}

if (tokenModalOverlay) {
    tokenModalOverlay.addEventListener("click", (e) => {
        if (e.target === tokenModalOverlay) closeTokenModal(true);
    });
}

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tokenModalOverlay.classList.contains("show")) {
        closeTokenModal(true);
    }
});


setHeaderMeta();

// Re-bind pack-level controls (cols/rows/delay/meta/weather) so edits correctly mark dirty
// NOTE: This was present in the last known-good editor; keeping behavior identical.
bindGlobalControls();
bindRotationControls();


// Collapsible panels: Events Manager + Token Manager (default: collapsed)
function initCollapsiblePanel(panelId, defaultCollapsed = true) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const header = panel.querySelector(".panelHeader");
    const body = panel.querySelector(".panelBody");
    if (!header || !body) return;

    const setExpanded = (expanded) => {
        panel.classList.toggle("collapsed", !expanded);
        header.setAttribute("aria-expanded", String(expanded));

        // Update caret glyph for clarity (▸ collapsed, ▾ expanded)
        const caret = header.querySelector(".caret");
        if (caret) caret.textContent = expanded ? "▾" : "▸";

        if (expanded) {
            // Let layout settle before measuring
            requestAnimationFrame(() => {
                body.style.maxHeight = body.scrollHeight + "px";
            });
        } else {
            body.style.maxHeight = "0px";
        }
    };

    // Click + keyboard support
    header.addEventListener("click", () => setExpanded(panel.classList.contains("collapsed")));
    header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(panel.classList.contains("collapsed"));
        }
    });

    // Keep height correct on resize when expanded
    window.addEventListener("resize", () => {
        if (!panel.classList.contains("collapsed")) {
            body.style.maxHeight = body.scrollHeight + "px";
        }
    }, { passive: true });

    setExpanded(!defaultCollapsed);
}

initCollapsiblePanel("eventsPanel", true);
// initCollapsiblePanel("tokenPanel", true);
initCollapsiblePanel("boardsPanel", true);

(async () => {
    setStatus("starting", "loading…", "warn");

    try {
        await waitForGlobal("__flipboardFirestoreReady", 8000, 50);

    } catch (err) {
        const msg = String(err?.message || err);
        console.error("Firestore bootstrap failed:", err);

        setStatus("dummy", msg, "err");
        setPack(deepClone(DUMMY_PACK));
        exposePack();
        setPackSaved(pack);
        initFromPack();
        toast("Firestore load failed — using dummy");
    }
})();


// ---- Boot phase pacing (min visible time per phase) ----
(function () {
    const MIN_PHASE_MS = 450; // slight delay so phases are readable
    let lastApply = 0;
    let pending = null;
    let timer = null;

    function scheduleApply(fn) {
        pending = fn;
        const now = Date.now();
        const dueIn = Math.max(0, MIN_PHASE_MS - (now - lastApply));
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (!pending) return;
            const f = pending;
            pending = null;
            lastApply = Date.now();
            try { f(); } catch (e) { console.warn("[EDITOR] boot phase apply failed", e); }
        }, dueIn);
    }

    // Patch known boot-phase setters if they exist
    const candidates = ["setBootPhase", "setBootStage", "setBootText", "bootPhase", "setBootStatus"];
    for (const name of candidates) {
        const orig = window[name];
        if (typeof orig === "function" && !orig.__paced) {
            window[name] = function (...args) {
                scheduleApply(() => orig.apply(this, args));
            };
            window[name].__paced = true;
        }
    }

    // If phases are set via a function in local scope, also expose a helper to use manually.
    window.__fb_pacedBoot = function (fn) { scheduleApply(fn); };
})();


(function () {
    function _fe_initWeatherFooter() {
        const cb = document.getElementById('chkBoardWeather') || document.getElementById('boardWeather');
        if (cb && !cb.__fe_weatherFooterBound) {
            cb.__fe_weatherFooterBound = true;
            cb.addEventListener('change', () => { try { window.syncWeatherFooterHeight && window.syncWeatherFooterHeight(); } catch (e) { } });
        }
        window.syncWeatherFooterHeight && window.syncWeatherFooterHeight();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _fe_initWeatherFooter, { once: true });
    } else {
        _fe_initWeatherFooter();
    }
})();


/* ============================================================
   LIVE PREVIEW (aspect-locked + letterboxed; static)
   - No Firebase calls
   - No rotation
   - Renders currently selected board only
============================================================ */
/* ============================================================
   LIVE PREVIEW (aspect-locked + letterboxed; static)
   - No Firebase calls
   - No rotation
   - Renders currently selected board only
============================================================ */
(function () {
    const PREVIEW_DEBOUNCE_MS = 70;
    const PREVIEW_CLOCK_TICK_MS = 1000;
    let _previewTimer = null;
    let _previewTriggersAttached = false;
    let _previewClockTimer = null;
    let _previewForcedKey = "";

    // Visual tuning: tile aspect ratio (width / height)
    const PREVIEW_TILE_AR = 0.75;

    function log() { try { console.log.apply(console, arguments); } catch (e) { } }
    function byId(id) { return document.getElementById(id); }

    function isValidPreviewColorToken(token) {
        if (typeof token !== "string") return false;
        if (!token.startsWith("{") || !token.endsWith("}")) return false;
        const inner = token.slice(1, -1);
        if (!/^COLOR\s/i.test(inner)) return false;
        if (!/^COLOR [^\s].*$/i.test(inner)) return false;
        if (/^COLOR  /i.test(inner)) return false;
        if (/\s{2,}/.test(inner)) return false;
        if (/\s$/.test(inner)) return false;
        const value = inner.slice(6);
        if (!value) return false;
        if (value.includes(" ")) return false;
        const up = String(value).toUpperCase();
        if (up === "RESET") return true;
        if (/^[A-Z]+$/.test(up)) return true;
        if (/^#[0-9A-F]{3}$/.test(up)) return true;
        if (/^#[0-9A-F]{6}$/.test(up)) return true;
        if (/^#[0-9A-F]{8}$/.test(up)) return true;
        if (/^RGB\(\d{1,3},\d{1,3},\d{1,3}\)$/i.test(up)) {
            const nums = up.slice(4, -1).split(",").map(n => Number(n));
            return nums.every(n => Number.isFinite(n) && n >= 0 && n <= 255);
        }
        if (/^RGBA\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\)$/i.test(up)) {
            const parts = up.slice(5, -1).split(",");
            const rgb = parts.slice(0, 3).map(n => Number(n));
            const a = Number(parts[3]);
            return rgb.every(n => Number.isFinite(n) && n >= 0 && n <= 255) &&
                Number.isFinite(a) && a >= 0 && a <= 1;
        }
        return false;
    }

    function previewColorTokenToCss(token) {
        if (!isValidPreviewColorToken(token)) return null;
        const value = token.slice(1, -1).slice(6);
        const up = String(value).toUpperCase();
        if (up === "RESET") return "";
        return value;
    }

    function getPack() {
        return window._boardPack || window.pack || window._pack || null;
    }

    function getActiveBoardKey() {
        if (window._activeBoardKey) return window._activeBoardKey;

        const el = byId("boardKey") || byId("activeBoardKey") || byId("boardKeyInput");
        if (el && el.value) return String(el.value).trim();

        const sel = document.querySelector(".boardItem.selected, .boardRow.selected, [data-boardkey].selected, [data-boardkey][aria-selected='true']");
        if (sel) {
            const k = sel.getAttribute("data-boardkey") || sel.dataset.boardkey || sel.dataset.key;
            if (k) return String(k);
        }
        return "";
    }

    function getGridColsRows(pack) {
        const liveColsEl = byId("gridCols");
        const liveRowsEl = byId("gridRows");
        const liveCols = liveColsEl ? Number(String(liveColsEl.value || "").trim()) : NaN;
        const liveRows = liveRowsEl ? Number(String(liveRowsEl.value || "").trim()) : NaN;

        const packCols = (pack && pack.meta && pack.meta.grid && pack.meta.grid.columns) ? Number(pack.meta.grid.columns) : 20;
        const packRows = (pack && pack.meta && pack.meta.grid && pack.meta.grid.rows) ? Number(pack.meta.grid.rows) : 8;

        const cols = Number.isFinite(liveCols) && liveCols > 0 ? liveCols : packCols;
        const rows = Number.isFinite(liveRows) && liveRows > 0 ? liveRows : packRows;

        return { cols: Math.max(1, cols | 0), rows: Math.max(1, rows | 0) };
    }

    function ensurePreviewHost() {
        let host = byId("editorPreview");
        if (!host) return null;

        if (!host.__previewBuilt) {
            host.innerHTML = [
                '<div class="previewHeaderRow">',
                '<div class="previewHeaderMain">',
                '<div class="previewTitle">LIVE PREVIEW</div>',
                '<div class="previewHint" id="previewHint"></div>',
                '</div>',
                '<div class="previewBadge" id="previewBadge">ONE-SHOT</div>',
                '</div>',
                '<div class="previewStageWrap">',
                '<div class="previewStage">',
                '<div class="previewBoard" id="previewBoard"></div>',
                '</div>',
                '</div>'
            ].join("");

            host.__previewBuilt = true;
        }
        return host;
    }

    function applyPreviewSizing(host, boardEl, cols, rows) {
        const stage = host.querySelector(".previewStage");
        if (!stage || !boardEl) return;

        const hostCS = getComputedStyle(host);
        const gap = parseFloat(hostCS.getPropertyValue("--gap")) || 10;

        const availW = stage.clientWidth || 0;
        const availH = stage.clientHeight || 0;
        if (availW <= 0 || availH <= 0) return;

        const safeCols = Math.max(1, cols | 0);
        const safeRows = Math.max(1, rows | 0);

        let tileW = (availW - gap * (safeCols - 1)) / safeCols;
        let tileH = tileW / PREVIEW_TILE_AR;
        let gridH = tileH * safeRows + gap * (safeRows - 1);

        if (gridH > availH) {
            tileH = (availH - gap * (safeRows - 1)) / safeRows;
            tileW = tileH * PREVIEW_TILE_AR;
        }

        tileW = Math.max(4, Math.floor(tileW));
        tileH = Math.max(4, Math.floor(tileH));

        host.style.setProperty("--cols", String(safeCols));
        host.style.setProperty("--rows", String(safeRows));
        host.style.setProperty("--pv-tile-w", tileW + "px");
        host.style.setProperty("--pv-tile-h", tileH + "px");

        const fontPx = Math.max(10, Math.min(52, Math.floor(tileH * 0.62)));
        host.style.setProperty("--pv-font", fontPx + "px");
    }

    function buildTiles(boardEl, cols, rows) {
        const total = cols * rows;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < total; i++) {
            const d = document.createElement("div");
            d.className = "tile";
            const s = document.createElement("span");
            s.className = "tileChar";
            s.textContent = " ";
            d.appendChild(s);
            frag.appendChild(d);
        }
        boardEl.innerHTML = "";
        boardEl.appendChild(frag);
    }

    function setTileChar(boardEl, idx, ch, color) {
        const tile = boardEl.children[idx];
        if (!tile) return;
        const span = tile.querySelector(".tileChar");
        if (span) {
            span.textContent = ch;
            span.style.color = color || "";
        }
    }

    function _pad2(n) { return String(n).padStart(2, "0"); }

    function resolveLocalDateTimeTokens(line) {
        const d = new Date();
        const DAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        const DAYS_LONG = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
        const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const MONTHS_LONG = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

        const h24 = d.getHours();
        const h12n = (h24 % 12) || 12;
        const min = _pad2(d.getMinutes());
        const sec = _pad2(d.getSeconds());
        const ampm = h24 >= 12 ? "PM" : "AM";

        const tokenMap = {
            "{TIME}": `${h12n}:${min} ${ampm}`,
            "{TIME_12H}": `${h12n}:${min} ${ampm}`,
            "{TIME_24H}": `${_pad2(h24)}:${min}`,
            "{TIME_24H_SEC}": `${_pad2(h24)}:${min}:${sec}`,
            "{TIME_12H_SEC}": `${h12n}:${min}:${sec} ${ampm}`,
            "{DATE}": `${DAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
            "{DATE_LONG}": `${DAYS_LONG[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
            "{DAY}": DAYS_LONG[d.getDay()],
            "{DAY_SHORT}": DAYS_SHORT[d.getDay()],
            "{MONTH}": MONTHS_LONG[d.getMonth()],
            "{MONTH_SHORT}": MONTHS_SHORT[d.getMonth()],
            "{YEAR}": String(d.getFullYear())
        };

        let out = String(line ?? "");
        Object.keys(tokenMap).forEach(tok => {
            out = out.replaceAll(tok, tokenMap[tok]);
        });
        return out;
    }

    function resolveCountdownTokensForPreview(line) {
        let out = String(line ?? "");
        const map = (eventsDoc && eventsDoc.events && typeof eventsDoc.events === "object")
            ? eventsDoc.events
            : {};

        out = out.replace(/\{COUNTDOWN\s+([A-Z0-9_]+)\.(DAYS|TITLE|DATE)\}/gi, (_, rawKey, rawField) => {
            const key = String(rawKey || "").trim().toUpperCase();
            const field = String(rawField || "").trim().toUpperCase();
            const ev = map[key];
            if (!ev) return "";

            const iso = String(ev.date || "").trim();
            const title = String(ev.title || key).trim();

            if (field === "TITLE") return title;
            if (field === "DATE") return iso ? fromISOToMDY(iso) : "";

            if (field === "DAYS") {
                if (!iso) return "";
                const today = new Date();
                const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const target = new Date(iso + "T00:00:00");
                const diffMs = target - now;
                return String(Math.max(0, Math.ceil(diffMs / 86400000)));
            }

            return "";
        });

        return out;
    }

    function resolveTokens(line) {
        let out = resolveLocalDateTimeTokens(String(line ?? ""));
        out = resolveCountdownTokensForPreview(out);

        try {
            if (typeof window.resolveTokensForRuntime === "function") {
                out = String(window.resolveTokensForRuntime(out));
            }
        } catch (e) { }

        return String(out)
            .replaceAll("{LOCATION}", "LOCATION")
            .replaceAll("{TEMP}", "TEMP")
            .replaceAll("{FEELS}", "FEELS")
            .replaceAll("{CONDITION_LINE}", "CONDITION")
            .replaceAll("{WIND_LINE}", "WIND");
    }

    function lineToPreviewCells(line, cols) {
        const resolved = resolveTokens(String(line ?? ""));
        const out = [];
        let activeColor = "";

        for (let i = 0; i < resolved.length && out.length < cols;) {
            if (resolved[i] === "{") {
                const close = resolved.indexOf("}", i);
                if (close !== -1) {
                    const tok = resolved.slice(i, close + 1);
                    if (/^\{COLOR/i.test(tok) && isValidPreviewColorToken(tok)) {
                        const css = previewColorTokenToCss(tok);
                        activeColor = (css == null) ? activeColor : css;
                        i = close + 1;
                        continue;
                    }
                }
            }
            out.push({ ch: resolved[i], color: activeColor });
            i++;
        }

        while (out.length < cols) out.push({ ch: " ", color: "" });
        return out;
    }

    function getDraftBoardFromEditor(packObj, key) {
        const b = packObj && packObj.boards ? packObj.boards[key] : null;
        if (!b) return null;

        const rowsContainer = byId("rowsContainer");
        if (rowsContainer) {
            const inputs = rowsContainer.querySelectorAll(
                "input.field[data-row-index], input[data-row-index], textarea[data-row-index]"
            );
            if (inputs && inputs.length) {
                const arr = [];
                const just = Array.isArray(b.row_justify) ? b.row_justify.slice() : [];
                inputs.forEach((inp) => {
                    arr.push(inp.value ?? "");
                    const rowIndex = parseInt(inp.dataset.rowIndex || "-1", 10);
                    if (Number.isFinite(rowIndex) && rowIndex >= 0) {
                        const rowWrap = inp.closest(".lineRow");
                        const activeBtn = rowWrap && rowWrap.querySelector(".justifyBtn.active[data-justify]");
                        const mode = activeBtn
                            ? normalizeJustifyValue(activeBtn.getAttribute("data-justify") || "left")
                            : normalizeJustifyValue(just[rowIndex] || "left");
                        just[rowIndex] = mode;
                    }
                });
                return { ...b, rows: arr, row_justify: just };
            }
        }
        return b;
    }

    function renderPreview(mode) {
        mode = mode || "full";
        const host = ensurePreviewHost();
        if (!host) return;

        const hint = byId("previewHint");
        const badge = byId("previewBadge");
        const boardEl = byId("previewBoard");
        if (!boardEl) return;

        const packObj = getPack();
        let activeKey = _previewForcedKey || getActiveBoardKey();

        if (!packObj || !packObj.boards) {
            if (hint) hint.textContent = "Loading boardPack…";
            boardEl.innerHTML = "";
            boardEl.__sig = null;
            boardEl.__sized = false;
            if (badge) badge.classList.remove("show");
            return;
        }

        if (!activeKey || !packObj.boards[activeKey]) {
            const firstKey = Object.keys(packObj.boards || {})[0] || "";
            if (!firstKey) {
                if (hint) hint.textContent = "No boards available";
                boardEl.innerHTML = "";
                boardEl.__sig = null;
                boardEl.__sized = false;
                if (badge) badge.classList.remove("show");
                return;
            }
            _previewForcedKey = firstKey;
            activeKey = firstKey;
        } else {
            _previewForcedKey = "";
        }

        const selectedBoard = packObj.boards[activeKey] || null;
        if (badge) badge.classList.toggle("show", !!selectedBoard?.one_shot);

        const grid = getGridColsRows(packObj);
        const cols = (packObj.boards[activeKey].cols != null)
            ? Math.max(1, Number(packObj.boards[activeKey].cols) | 0)
            : grid.cols;
        const rows = grid.rows;

        const sig = cols + "x" + rows;
        const needsRebuild = (boardEl.__sig !== sig) || (boardEl.children.length !== (cols * rows));
        if (needsRebuild) {
            buildTiles(boardEl, cols, rows);
            boardEl.__sig = sig;
            mode = "full";
        }

        if (mode === "full" || !boardEl.__sized) {
            applyPreviewSizing(host, boardEl, cols, rows);
            boardEl.__sized = true;
        }

        const draftObj = getDraftBoardFromEditor(packObj, activeKey);
        const srcRows = Array.isArray(draftObj && draftObj.rows) ? draftObj.rows : [];
        for (let r = 0; r < rows; r++) {
            const raw = srcRows[r] ?? "";
            const justify = Array.isArray(draftObj && draftObj.row_justify) ? draftObj.row_justify[r] : "left";
            const cells = lineToPreviewCells(normalizeLineForGrid(raw, cols, justify), cols);
            for (let c = 0; c < cols; c++) {
                const cell = cells[c] || { ch: " ", color: "" };
                setTileChar(boardEl, (r * cols) + c, cell.ch || " ", cell.color || "");
            }
        }

        if (hint) hint.textContent = selectedBoard && selectedBoard.name ? String(selectedBoard.name) : activeKey;
        log("[PREVIEW] render preview");
    }

    function scheduleRender(kind) {
        kind = kind || "chars";
        if (_previewTimer) clearTimeout(_previewTimer);

        const delay = (kind === "layout") ? 0 : PREVIEW_DEBOUNCE_MS;
        _previewTimer = setTimeout(function () {
            try {
                if (kind === "layout") window.renderPreview("full");
                else window.renderPreview("chars");
            } catch (e) { }
        }, delay);
    }

    function scheduleLayout() { scheduleRender("layout"); }
    function scheduleChars() { scheduleRender("chars"); }

    function attachTriggers() {
        if (_previewTriggersAttached) return;
        _previewTriggersAttached = true;

        const rowsContainer = byId("rowsContainer");
        if (rowsContainer) {
            rowsContainer.addEventListener("input", function (e) {
                const t = e && e.target;
                if (!t) return;
                if (t.matches("input,textarea")) scheduleChars();
            }, true);
        }

        const gridColsInput = byId("gridCols");
        const gridRowsInput = byId("gridRows");
        if (gridColsInput) {
            gridColsInput.addEventListener("input", scheduleLayout, true);
            gridColsInput.addEventListener("change", scheduleLayout, true);
        }
        if (gridRowsInput) {
            gridRowsInput.addEventListener("input", scheduleLayout, true);
            gridRowsInput.addEventListener("change", scheduleLayout, true);
        }

        const colsInput = byId("boardCols") || byId("colsInput") || byId("boardColsInput");
        if (colsInput) {
            colsInput.addEventListener("input", scheduleLayout, true);
            colsInput.addEventListener("change", scheduleLayout, true);
        }

        const zipInput = byId("weatherZip") || byId("zipInput") || byId("weather_zip");
        if (zipInput) {
            zipInput.addEventListener("input", scheduleChars, true);
            zipInput.addEventListener("change", scheduleChars, true);
        }

        document.addEventListener("click", function (e) {
            const el = e && e.target;
            if (!el) return;
            const boardItem = el.closest && el.closest(".boardItem, .boardRow, [data-boardkey]");
            if (boardItem) {
                setTimeout(function () {
                    log("[PREVIEW] board selected");
                    scheduleLayout();
                }, 0);
            }
        }, true);
    }

    function init() {
        log("[PREVIEW] init");
        attachTriggers();

        window.addEventListener("resize", scheduleLayout, { passive: true });

        setTimeout(function () {
            try { window.renderPreview("full"); } catch (e) { }
        }, 0);

        if (_previewClockTimer) clearInterval(_previewClockTimer);

        _previewClockTimer = setInterval(function () {
            try {
                const packObj = getPack();
                const activeKey = _previewForcedKey || getActiveBoardKey();
                const board = (packObj && packObj.boards && activeKey) ? packObj.boards[activeKey] : null;
                const rows = Array.isArray(board && board.rows) ? board.rows : [];

                const needsClock = rows.some(r =>
                    /\{TIME(?:_12H|_24H|_24H_SEC|_12H_SEC)?\}|\{DATE(?:_LONG)?\}|\{DAY(?:_SHORT)?\}|\{MONTH(?:_SHORT)?\}|\{YEAR\}/i.test(String(r || ""))
                );

                if (needsClock) {
                    window.renderPreview("chars");
                }
            } catch (e) { }
        }, PREVIEW_CLOCK_TICK_MS);
    }

    window.renderPreview = renderPreview;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

window.ensurePackDefaults = ensurePackDefaults;
window.deepClone = deepClone;
window.exposePack = exposePack;
window.setPackSaved = setPackSaved;
window.setEventsSaved = setEventsSaved;
window.initFromPack = initFromPack;
window.setHeaderMeta = setHeaderMeta;
window.setStatus = setStatus;
window.toast = toast;
window.DUMMY_PACK = DUMMY_PACK;
window.loadEventsOnce = loadEventsOnce;
window.savePack = savePack;
window.saveEvents = saveEvents;
