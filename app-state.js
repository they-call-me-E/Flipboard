import { deepClone, hashObject } from "./app-utils.js";

export const DUMMY_PACK = {
    "meta": {
        "grid": { "columns": 20, "rows": 8 },
        "description": "FlipBoard Demo Pack — Split Flap Dashboard",
        "weather": {
            "location": {
                "type": "zip",
                "value": "60601",
                "label": "CHICAGO IL"
            }
        }
    },
    "rotation": {
        "enabled": true,
        "dwell_ms": 15000,
        "order": [
            "welcome",
            "weather_main",
            "system_status",
            "daily_agenda"
        ]
    },
    "boards": {
        "welcome": {
            "name": "Welcome",
            "type": "static",
            "rows": [
                "FLIPBOARD           ",
                "DIGITAL DASHBOARD   ",
                "                    ",
                "REAL TIME DATA      ",
                "ROTATING DISPLAY    ",
                "                    ",
                "CONFIGURABLE PANELS ",
                "                    "
            ]
        },
        "weather_main": {
            "name": "Weather — Local",
            "type": "dynamic",
            "source": "openweather_onecall",
            "rows": [
                "{LOCATION}          ",
                "TEMP: {TEMP_LINE}   ",
                "{CONDITION_LINE}    ",
                "{WIND_LINE}         ",
                "HUM: {current.humidity}%",
                "UV:  {current.uvi}   ",
                "UPDATED: {TIME}     ",
                "                    "
            ]
        },
        "system_status": {
            "name": "System Status",
            "type": "static",
            "rows": [
                "SYSTEM STATUS       ",
                "FIRESTORE: ONLINE   ",
                "WEATHER: CONNECTED  ",
                "ROTATION: ENABLED   ",
                "                    ",
                "GRID: 20 x 8        ",
                "DWELL: 15 SECONDS   ",
                "                    "
            ]
        },
        "daily_agenda": {
            "name": "Daily Agenda",
            "type": "static",
            "rows": [
                "TODAY               ",
                "8:00 AM  TEAM SYNC  ",
                "10:30 AM DESIGN REV ",
                "1:00 PM  CLIENT MTG ",
                "3:30 PM  BUILD TEST ",
                "6:00 PM  GYM        ",
                "                    ",
                "                    "
            ]
        }
    }
};

export let pack = deepClone(DUMMY_PACK);

export function exposePack() {
    try { window._boardPack = pack; window.pack = pack; window._pack = pack; } catch (_) { }
}
exposePack();

export let packSaved = deepClone(pack);
export let packSavedHash = hashObject(packSaved);
export let selectedKey = null;
export let draft = null;
export let draftSaved = null;

// ✅ track last focused row input so token modal can insert at cursor
export let lastFocusedRowInput = null;

export function getCols() { return pack?.meta?.grid?.columns ?? 20; }
export function getRows() { return pack?.meta?.grid?.rows ?? 8; }

export let eventsDoc = { events: {}, order: [] };
export let eventsDocSaved = { events: {}, order: [] };
export let eventsSavedHash = hashObject(eventsDocSaved);
export let eventsLoadSeq = 0;

export function setPackSaved(nextPack) {
    packSaved = deepClone(nextPack);
    packSavedHash = hashObject(packSaved);
}

export function setEventsSaved(nextDoc) {
    eventsDocSaved = deepClone(nextDoc);
    eventsSavedHash = hashObject(eventsDocSaved);
}
export function setEventsDoc(nextDoc) {
    eventsDoc = nextDoc && typeof nextDoc === "object"
        ? nextDoc
        : { events: {}, order: [] };
    return eventsDoc;
}
export function packIsDirty() {
    if (!pack) return false;
    if (!packSavedHash) return true;
    return hashObject(pack) !== packSavedHash;
}

export function eventsDirty() {
    if (!eventsDoc) return false;
    if (!eventsSavedHash) return true;
    return hashObject(eventsDoc) !== eventsSavedHash;
}


export function editorIsDirty() {
    return !!draft && !!draftSaved && JSON.stringify(draft) !== JSON.stringify(draftSaved);
}

/* ============================================================
   Utilities
============================================================ */
export function ensurePackDefaults(p) {
    if (!p || typeof p !== "object") return p;

    p.meta = (p.meta && typeof p.meta === "object") ? p.meta : {};
    p.meta.ui = (p.meta.ui && typeof p.meta.ui === "object") ? p.meta.ui : {};
    if (!Number.isInteger(p.meta.ui.flip_speed)) p.meta.ui.flip_speed = 3;

    p.meta.grid = (p.meta.grid && typeof p.meta.grid === "object") ? p.meta.grid : {};
    if (!Number.isInteger(p.meta.grid.columns)) p.meta.grid.columns = 20;
    if (!Number.isInteger(p.meta.grid.rows)) p.meta.grid.rows = 8;

    p.rotation = (p.rotation && typeof p.rotation === "object") ? p.rotation : {};
    if (typeof p.rotation.enabled !== "boolean") p.rotation.enabled = true;
    if (!Number.isInteger(p.rotation.dwell_ms)) p.rotation.dwell_ms = 15000;
    if (!Array.isArray(p.rotation.order)) p.rotation.order = [];

    p.boards = (p.boards && typeof p.boards === "object") ? p.boards : {};

    return p;
}

export function ensureWeatherShape() {
    pack.meta ||= { grid: { columns: 20, rows: 8 }, description: "", weather: {} };
    pack.meta.weather ||= {};
    pack.meta.weather.location ||= { type: "city", value: "", label: "" };
}

// export function normalizePack(p) {
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
export function bumpEventsLoadSeq() {
    eventsLoadSeq += 1;
    return eventsLoadSeq;
}

export function setPack(nextPack) {
    pack = nextPack;
    exposePack();
    return pack;
}

export function setSelectedKey(nextKey) {
    selectedKey = nextKey;
    return selectedKey;
}

export function setDraft(nextDraft) {
    draft = nextDraft;
    return draft;
}

export function setDraftSaved(nextDraftSaved) {
    draftSaved = nextDraftSaved;
    return draftSaved;
}
export function setLastFocusedRowInput(nextEl) {
    lastFocusedRowInput = nextEl;
    return lastFocusedRowInput;
}