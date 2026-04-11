
// --- Active Device accessor (global safe wrapper) ---
(function ensureActiveDeviceHelpers() {
    const _fallback = () => {
        try {
            const key = (typeof LS_ACTIVE_DEVICE !== "undefined") ? LS_ACTIVE_DEVICE : "FB_ACTIVE_DEVICE";
            return (localStorage.getItem(key) || "").trim();
        } catch (e) {
            return "";
        }
    };
    window.getActiveDeviceId = window.getActiveDeviceId || function () {
        try {
            if (typeof window.__fb_getActiveDeviceId === "function") {
                return (window.__fb_getActiveDeviceId() || "").trim();
            }
        } catch (e) { }
        return _fallback();
    };
})();

window.__flipboardFirestoreError = null;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    initializeFirestore,
    doc,
    collection,
    getDocFromServer,
    getDocFromCache,
    getDoc,
    setDoc,
    getDocs,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBMeYQiNcfhkFVtmbKAbDnFILfUz3nLY50",
    authDomain: "flipboard-937e3.firebaseapp.com",
    projectId: "flipboard-937e3",
    storageBucket: "flipboard-937e3.firebasestorage.app",
    messagingSenderId: "926200267004",
    appId: "1:926200267004:web:1ee00c4d344f670b775779"
};

// Collections / IDs (Option 2 "accounts" structure like FlipBoard runtime)
const EDITOR_VERSION = "1.2.99";
console.log(`[EDITOR] FlipEditor v${EDITOR_VERSION}`);
const ACCOUNT_COLLECTION = "accounts";
const DEVICES_SUBCOL = "devices";
const BOARDPACKS_SUBCOL = "boardPacks";
const USER_DATA_SUBCOL = "data";

const EVENTS_DOC_ID = "events";
const FIELD = "data";

const LS_ACTIVE_DEVICE = "flipeditor_activeDeviceId";

const $ = (id) => document.getElementById(id);

const authGate = $("authGate");
const workspace = $("workspace");
const devicePill = $("devicePill");
const deviceSelect = $("deviceSelect");
const btnDevices = $("btnDevices");

const devicesModal = $("devicesModal");
const btnDevicesClose = $("btnDevicesClose");
const devicesList = $("devicesList");
const boardPacksList = $("boardPacksList");
const btnCreateBoardPack = $("btnCreateBoardPack");
const addDevicePanel = $("addDevicePanel");
const addDevicePanelBody = $("addDevicePanelBody");
const btnToggleAddDevicePanel = $("btnToggleAddDevicePanel");
const btnAddDevice = $("btnAddDevice");
const newDeviceId = $("newDeviceId");
const newDeviceName = $("newDeviceName");

const deleteDeviceModal = $("deleteDeviceModal");
const btnDeleteDeviceClose = $("btnDeleteDeviceClose");
const btnDeleteDeviceCancel = $("btnDeleteDeviceCancel");
const btnDeleteDeviceConfirm = $("btnDeleteDeviceConfirm");
const deleteDeviceNameView = $("deleteDeviceNameView");
const deleteDeviceConfirmInput = $("deleteDeviceConfirmInput");

const renameDeviceModal = $("renameDeviceModal");
const btnRenameDeviceClose = $("btnRenameDeviceClose");
const btnRenameDeviceCancel = $("btnRenameDeviceCancel");
const btnRenameDeviceConfirm = $("btnRenameDeviceConfirm");
const renameDeviceIdView = $("renameDeviceIdView");
const renameDeviceInput = $("renameDeviceInput");

const boardPackNameModal = $("boardPackNameModal");
const boardPackNameModalTitle = $("boardPackNameModalTitle");
const boardPackNameModalSub = $("boardPackNameModalSub");
const boardPackNameModalHint = $("boardPackNameModalHint");
const btnBoardPackNameClose = $("btnBoardPackNameClose");
const btnBoardPackNameCancel = $("btnBoardPackNameCancel");
const btnBoardPackNameConfirm = $("btnBoardPackNameConfirm");
const boardPackNameInput = $("boardPackNameInput");

const deleteBoardPackModal = $("deleteBoardPackModal");
const btnDeleteBoardPackClose = $("btnDeleteBoardPackClose");
const btnDeleteBoardPackCancel = $("btnDeleteBoardPackCancel");
const btnDeleteBoardPackConfirm = $("btnDeleteBoardPackConfirm");
const deleteBoardPackNameView = $("deleteBoardPackNameView");
const deleteBoardPackConfirmInput = $("deleteBoardPackConfirmInput");

const tabEdLogin = $("tabEdLogin");
const tabEdSignup = $("tabEdSignup");
const formEdLogin = $("formEdLogin");
const formEdSignup = $("formEdSignup");
const btnEdLogout = $("btnEdLogout");
const authBanner = $("authBanner");
const authStateText = $("authStateText");

const edLoginEmail = $("edLoginEmail");
const edLoginPass = $("edLoginPass");
const edSignupEmail = $("edSignupEmail");
const edSignupPass1 = $("edSignupPass1");
const edSignupPass2 = $("edSignupPass2");

function showBanner(title, detail) {
    if (!authBanner) return;
    authBanner.style.display = "block";
    authBanner.textContent = detail ? `${title}: ${detail}` : String(title || "");
}
function hideBanner() {
    if (!authBanner) return;
    authBanner.style.display = "none";
    authBanner.textContent = "";
}
function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function showBootSplash(on, msg) {
    const el = document.getElementById("bootSplash");
    const tx = document.getElementById("bootSplashText");
    if (typeof msg === "string" && tx) tx.textContent = msg;
    if (!el) return;
    if (on) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
}


// Boot mini split-flap (4 tiles) — lightweight, isolated from editor runtime.
const __BOOT_FLAP = { ready: false, tiles: [], word: "        ", flipMs: 120 };

function bootFlapInit() {
    if (__BOOT_FLAP.ready) return true;
    const root = document.querySelector("#bootSplash .miniFlip");
    if (!root) return false;
    const tiles = Array.from(root.querySelectorAll(".miniTile"));
    __BOOT_FLAP.tiles = tiles.map(el => ({
        el,
        topStatic: el.querySelector(".top.static .glyphText"),
        botStatic: el.querySelector(".bottom.static .glyphText"),
        topFlap: el.querySelector(".flap.top"),
        botFlap: el.querySelector(".flap.bottom"),
        topFlapText: el.querySelector(".flap.top .glyphText"),
        botFlapText: el.querySelector(".flap.bottom .glyphText"),
        current: " "
    }));
    for (const t of __BOOT_FLAP.tiles) {
        if (t.topStatic) t.topStatic.textContent = " ";
        if (t.botStatic) t.botStatic.textContent = " ";
        bootFlapReset(t);
    }
    __BOOT_FLAP.ready = true;
    return true;
}

function bootFlapReset(t) {
    if (!t?.topFlap || !t?.botFlap) return;
    t.topFlap.classList.remove("shown"); t.topFlap.classList.add("hidden");
    t.botFlap.classList.remove("shown"); t.botFlap.classList.add("hidden");
    t.topFlap.style.transition = "none";
    t.botFlap.style.transition = "none";
    t.topFlap.style.transform = "rotateX(0deg)";
    t.botFlap.style.transform = "rotateX(90deg)";
    void t.el.offsetWidth;
    t.topFlap.style.transition = `transform ${__BOOT_FLAP.flipMs}ms linear`;
    t.botFlap.style.transition = `transform ${__BOOT_FLAP.flipMs}ms linear`;
}

async function bootFlapFlipTo(t, nextChar) {
    if (!t) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
        t.current = nextChar;
        if (t.topStatic) t.topStatic.textContent = nextChar;
        if (t.botStatic) t.botStatic.textContent = nextChar;
        return;
    }
    const cur = t.current || " ";
    if (cur === nextChar) return;

    t.topFlapText.textContent = cur;
    t.botFlapText.textContent = nextChar;

    t.topFlap.classList.remove("hidden"); t.topFlap.classList.add("shown");
    t.botFlap.classList.remove("hidden"); t.botFlap.classList.add("shown");

    t.topFlap.style.transition = "none";
    t.botFlap.style.transition = "none";
    t.topFlap.style.transform = "rotateX(0deg)";
    t.botFlap.style.transform = "rotateX(90deg)";
    void t.el.offsetWidth;
    t.topFlap.style.transition = `transform ${__BOOT_FLAP.flipMs}ms linear`;
    t.botFlap.style.transition = `transform ${__BOOT_FLAP.flipMs}ms linear`;

    t.topFlap.style.transform = "rotateX(-90deg)";
    t.botFlap.style.transform = "rotateX(0deg)";

    await new Promise(r => setTimeout(r, Math.floor(__BOOT_FLAP.flipMs / 2)));
    if (t.topStatic) t.topStatic.textContent = nextChar;
    if (t.botStatic) t.botStatic.textContent = nextChar;

    await new Promise(r => setTimeout(r, Math.ceil(__BOOT_FLAP.flipMs / 2)));
    bootFlapReset(t);
    t.current = nextChar;
}

function setBootPhase_old(word8) {
    const w = String(word8 || "").toUpperCase().padEnd(8, " ").slice(0, 8);
    __BOOT_FLAP.word = w;
    if (!bootFlapInit()) return;
    __BOOT_FLAP.tiles.forEach((tile, i) => {
        const next = w[i] || " ";
        setTimeout(() => bootFlapFlipTo(tile, next), i * 28);
    });
}
function setBootPhase(word8, opts = {}) {
    const staggerMs = Number(opts.staggerMs ?? 28);
    const settleMs = Number(opts.settleMs ?? (__BOOT_FLAP.flipMs || 120));

    const w = String(word8 || "").toUpperCase().padEnd(8, " ").slice(0, 8);
    __BOOT_FLAP.word = w;

    if (!bootFlapInit()) return Promise.resolve();

    __BOOT_FLAP.tiles.forEach((tile, i) => {
        const next = w[i] || " ";
        setTimeout(() => bootFlapFlipTo(tile, next), i * staggerMs);
    });

    const totalMs = ((__BOOT_FLAP.tiles.length - 1) * staggerMs) + settleMs;
    return new Promise(resolve => setTimeout(resolve, totalMs));
}

function setAuthBoot(on) {
    try { document.body.classList.toggle("authBoot", !!on); } catch (_) { }
}

function setAuthMode(mode) {
    const isLogin = mode === "login";
    tabEdLogin.classList.toggle("active", isLogin);
    tabEdSignup.classList.toggle("active", !isLogin);
    tabEdLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
    tabEdSignup.setAttribute("aria-selected", !isLogin ? "true" : "false");
    formEdLogin.style.display = isLogin ? "block" : "none";
    formEdSignup.style.display = isLogin ? "none" : "block";
    hideBanner();
}

tabEdLogin?.addEventListener("click", () => setAuthMode("login"));
tabEdSignup?.addEventListener("click", () => setAuthMode("signup"));


function isLikelyFirebaseUid(s) {
    // Typical Firebase Auth UID is 28 chars alnum (not guaranteed, but common).
    return /^[A-Za-z0-9]{24, 40}$/.test(s) && !s.includes('-');
}
function isUuidLike(s) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}
function validateDeviceIdInput(deviceId, currentUid) {
    const v = (deviceId || "").trim();
    if (!v) return { ok: false, msg: "Device ID is required." };
    if (currentUid && v === currentUid) return { ok: false, msg: "That looks like your Account UID. Paste the Device ID shown on the FlipBoard display (the one with dashes)." };
    if (isLikelyFirebaseUid(v) && !isUuidLike(v)) return { ok: false, msg: "That looks like an Account UID, not a Device ID. Paste the Device ID shown on the FlipBoard display (UUID format)." };
    if (!isUuidLike(v)) return { ok: false, msg: "Device ID must be in UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Copy it from the FlipBoard display screen." };
    return { ok: true, msg: "" };
}

function updateAddDeviceButton() {
    if (!btnAddDevice) return;
    const deviceId = String(newDeviceId?.value || "").trim();
    const label = String(newDeviceName?.value || "").trim();
    const user = window.__fb_user;
    const hasBoth = !!deviceId && !!label;
    const validId = hasBoth ? validateDeviceIdInput(deviceId, user && user.uid).ok : false;
    btnAddDevice.disabled = !(hasBoth && validId);
    btnAddDevice.textContent = btnAddDevice.dataset._busy === "1" ? "Adding…" : (btnAddDevice.dataset._label || "Add device");
}

function setAddDevicePanelCollapsed(collapsed) {
    if (!addDevicePanel || !btnToggleAddDevicePanel) return;
    addDevicePanel.classList.toggle("isCollapsed", !!collapsed);
    btnToggleAddDevicePanel.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btnToggleAddDevicePanel.setAttribute("aria-label", collapsed ? "Expand add device panel" : "Collapse add device panel");
    btnToggleAddDevicePanel.textContent = collapsed ? "+" : "▾";
}

function openDevicesModal() {
    if (!devicesModal) return;
    const user = window.__fb_user;
    if (!user) {
        try { toast("Please log in to manage devices."); } catch (_) { }
        try { const setGate = window.__fb_setGate; if (setGate) setGate(true); } catch (_) { }
        return;
    }
    devicesModal.style.display = "flex";
}
function isDeviceRequired() {
    const u = window.__fb_user;
    return !!u && !getActiveDeviceId();
}
function closeDevicesModal(force = false) {
    if (!devicesModal) return;
    if (!force && isDeviceRequired()) {
        toast?.("Select or add a device first.");
        const card = devicesModal.querySelector('.modalCard');
        if (card) { card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); }
        return;
    }
    devicesModal.style.display = "none";
}
btnToggleAddDevicePanel?.addEventListener("click", () => {
    const collapsed = !addDevicePanel?.classList.contains("isCollapsed");
    setAddDevicePanelCollapsed(collapsed);
    if (!collapsed) {
        setTimeout(() => newDeviceId?.focus(), 0);
    }
});
setAddDevicePanelCollapsed(true);

btnDevices?.addEventListener("click", openDevicesModal);
btnDevicesClose?.addEventListener("click", () => closeDevicesModal(false));
devicesModal?.addEventListener("click", (e) => {
    if (e.target === devicesModal) closeDevicesModal(false);
});
btnDeleteDeviceClose?.addEventListener("click", closeDeleteDeviceModal);
btnDeleteDeviceCancel?.addEventListener("click", closeDeleteDeviceModal);
deleteDeviceModal?.addEventListener("click", (e) => {
    if (e.target === deleteDeviceModal) closeDeleteDeviceModal();
});
deleteDeviceConfirmInput?.addEventListener("input", () => {
    const expected = pendingDeleteDevice?.name || "";
    if (btnDeleteDeviceConfirm) btnDeleteDeviceConfirm.disabled = (deleteDeviceConfirmInput.value !== expected);
});
deleteDeviceConfirmInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnDeleteDeviceConfirm && !btnDeleteDeviceConfirm.disabled) {
        e.preventDefault();
        performDeleteDevice();
    }
});
btnDeleteDeviceConfirm?.addEventListener("click", performDeleteDevice);

btnRenameDeviceClose?.addEventListener("click", closeRenameDeviceModal);
btnRenameDeviceCancel?.addEventListener("click", closeRenameDeviceModal);
renameDeviceModal?.addEventListener("click", (e) => {
    if (e.target === renameDeviceModal) closeRenameDeviceModal();
});
renameDeviceInput?.addEventListener("input", () => {
    const current = String(pendingRenameDevice?.name || "");
    const next = String(renameDeviceInput.value || "").trim();
    if (btnRenameDeviceConfirm) btnRenameDeviceConfirm.disabled = (!next || next === current);
});
renameDeviceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnRenameDeviceConfirm && !btnRenameDeviceConfirm.disabled) {
        e.preventDefault();
        performRenameDevice();
    }
});
btnRenameDeviceConfirm?.addEventListener("click", performRenameDevice);

btnBoardPackNameClose?.addEventListener("click", closeBoardPackNameModal);
btnBoardPackNameCancel?.addEventListener("click", closeBoardPackNameModal);
boardPackNameModal?.addEventListener("click", (e) => {
    if (e.target === boardPackNameModal) closeBoardPackNameModal();
});
boardPackNameInput?.addEventListener("input", () => {
    const typed = String(boardPackNameInput.value || "").trim();
    const current = String(pendingBoardPackAction?.currentName || "");
    if (btnBoardPackNameConfirm) btnBoardPackNameConfirm.disabled = !typed || (pendingBoardPackAction?.mode === "rename" && typed === current);
});
boardPackNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnBoardPackNameConfirm && !btnBoardPackNameConfirm.disabled) {
        e.preventDefault();
        performBoardPackNameAction();
    }
});
btnBoardPackNameConfirm?.addEventListener("click", performBoardPackNameAction);

btnDeleteBoardPackClose?.addEventListener("click", closeDeleteBoardPackModal);
btnDeleteBoardPackCancel?.addEventListener("click", closeDeleteBoardPackModal);
deleteBoardPackModal?.addEventListener("click", (e) => {
    if (e.target === deleteBoardPackModal) closeDeleteBoardPackModal();
});
deleteBoardPackConfirmInput?.addEventListener("input", () => {
    const expected = pendingDeleteBoardPack?.name || "";
    if (btnDeleteBoardPackConfirm) btnDeleteBoardPackConfirm.disabled = (deleteBoardPackConfirmInput.value !== expected);
});
deleteBoardPackConfirmInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnDeleteBoardPackConfirm && !btnDeleteBoardPackConfirm.disabled) {
        e.preventDefault();
        performDeleteBoardPack();
    }
});
btnDeleteBoardPackConfirm?.addEventListener("click", performDeleteBoardPack);

newDeviceId?.addEventListener("input", updateAddDeviceButton);
newDeviceName?.addEventListener("input", updateAddDeviceButton);
updateAddDeviceButton();

let pendingBoardPackAction = null;
let pendingDeleteBoardPack = null;

function closeBoardPackNameModal() {
    try { if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur(); } catch (_) { }
    pendingBoardPackAction = null;
    if (!boardPackNameModal) return;
    boardPackNameModal.style.display = "none";
    boardPackNameModal.setAttribute("aria-hidden", "true");
    boardPackNameModal.inert = true;
    if (boardPackNameInput) boardPackNameInput.value = "";
    if (boardPackNameModalHint) {
        boardPackNameModalHint.style.display = "none";
        boardPackNameModalHint.textContent = "";
    }
    if (btnBoardPackNameConfirm) {
        btnBoardPackNameConfirm.disabled = true;
        btnBoardPackNameConfirm.textContent = "Save";
    }
}

function openBoardPackNameModal(config) {
    if (!boardPackNameModal || !config) return;
    pendingBoardPackAction = {
        mode: String(config.mode || "create"),
        packId: String(config.packId || ""),
        sourceId: String(config.sourceId || ""),
        currentName: String(config.currentName || ""),
        defaultName: String(config.defaultName || ""),
        title: String(config.title || "Board Pack"),
        sub: String(config.sub || "Enter a board pack name."),
        confirmText: String(config.confirmText || "Save"),
        hint: String(config.hint || "")
    };
    if (boardPackNameModalTitle) boardPackNameModalTitle.textContent = pendingBoardPackAction.title;
    if (boardPackNameModalSub) boardPackNameModalSub.textContent = pendingBoardPackAction.sub;
    if (boardPackNameModalHint) {
        boardPackNameModalHint.textContent = pendingBoardPackAction.hint;
        boardPackNameModalHint.style.display = pendingBoardPackAction.hint ? "block" : "none";
    }
    if (boardPackNameInput) {
        boardPackNameInput.value = pendingBoardPackAction.defaultName || pendingBoardPackAction.currentName || "";
    }
    if (btnBoardPackNameConfirm) {
        btnBoardPackNameConfirm.textContent = pendingBoardPackAction.confirmText;
        const typed = String(boardPackNameInput?.value || "").trim();
        btnBoardPackNameConfirm.disabled = !typed || (pendingBoardPackAction.mode === "rename" && typed == pendingBoardPackAction.currentName);
    }
    boardPackNameModal.style.display = "flex";
    boardPackNameModal.setAttribute("aria-hidden", "false");
    boardPackNameModal.inert = false;
    setTimeout(() => {
        try {
            boardPackNameInput?.focus();
            boardPackNameInput?.select();
        } catch (_) { }
    }, 0);
}

async function performBoardPackNameAction() {
    const cfg = pendingBoardPackAction;
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!cfg || !db || !user) {
        toast("Not authenticated.");
        return;
    }
    const rawName = String(boardPackNameInput?.value || "").trim();
    if (!rawName) {
        toast("Board pack name required.");
        return;
    }
    if (cfg.mode === "rename" && rawName === cfg.currentName) {
        closeBoardPackNameModal();
        return;
    }

    try {
        if (btnBoardPackNameConfirm) {
            btnBoardPackNameConfirm.disabled = true;
            btnBoardPackNameConfirm.textContent = cfg.mode === "duplicate" ? "Duplicating…" : (cfg.mode === "rename" ? "Saving…" : "Creating…");
        }

        if (cfg.mode === "rename") {
            await setDoc(boardPackDocRef(db, user.uid, cfg.packId), {
                name: rawName,
                updatedAt: serverTimestamp()
            }, { merge: true });
            await refreshDeviceUI(db, user.uid);
            closeBoardPackNameModal();
            toast("Board pack renamed.");
            return;
        }

        if (cfg.mode === "duplicate") {
            const sourceSnap = await getDoc(boardPackDocRef(db, user.uid, cfg.sourceId));
            if (!sourceSnap.exists()) throw new Error("Source board pack not found.");
            const sourceData = sourceSnap.data() || {};
            const payload = sourceData.data && typeof sourceData.data === "object"
                ? JSON.parse(JSON.stringify(sourceData.data))
                : makeSeedBoardPack();

            await setDoc(boardPackDocRef(db, user.uid, feUuid()), {
                name: makeBoardPackName(rawName, cfg.defaultName || rawName),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                data: payload
            });
            await refreshDeviceUI(db, user.uid);
            closeBoardPackNameModal();
            toast("Board pack duplicated.");
            return;
        }

        const finalName = makeBoardPackName(rawName, cfg.defaultName || rawName);
        const newId = feUuid();
        await setDoc(boardPackDocRef(db, user.uid, newId), {
            name: finalName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            data: makeSeedBoardPack()
        });
        await refreshDeviceUI(db, user.uid);
        closeBoardPackNameModal();
        toast("Board pack created.");
    } catch (err) {
        console.error("[EDITOR] board pack action failed", err);
        toast(cfg.mode === "duplicate" ? "Duplicate failed." : (cfg.mode === "rename" ? "Rename failed." : "Create failed."));
        if (btnBoardPackNameConfirm) {
            btnBoardPackNameConfirm.disabled = false;
            btnBoardPackNameConfirm.textContent = cfg.confirmText || "Save";
        }
    }
}

function closeDeleteBoardPackModal() {
    try { if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur(); } catch (_) { }
    pendingDeleteBoardPack = null;
    if (!deleteBoardPackModal) return;
    deleteBoardPackModal.style.display = "none";
    deleteBoardPackModal.setAttribute("aria-hidden", "true");
    deleteBoardPackModal.inert = true;
    if (deleteBoardPackNameView) deleteBoardPackNameView.value = "";
    if (deleteBoardPackConfirmInput) deleteBoardPackConfirmInput.value = "";
    if (btnDeleteBoardPackConfirm) {
        btnDeleteBoardPackConfirm.disabled = true;
        btnDeleteBoardPackConfirm.textContent = "Delete Board Pack";
    }
}

function openDeleteBoardPackModal(pack) {
    if (!deleteBoardPackModal || !pack) return;
    pendingDeleteBoardPack = {
        id: String(pack.id || ""),
        name: String(pack.name || "")
    };
    if (deleteBoardPackNameView) deleteBoardPackNameView.value = pendingDeleteBoardPack.name;
    if (deleteBoardPackConfirmInput) deleteBoardPackConfirmInput.value = "";
    if (btnDeleteBoardPackConfirm) btnDeleteBoardPackConfirm.disabled = true;
    deleteBoardPackModal.style.display = "flex";
    deleteBoardPackModal.setAttribute("aria-hidden", "false");
    deleteBoardPackModal.inert = false;
    setTimeout(() => {
        try { deleteBoardPackConfirmInput?.focus(); } catch (_) { }
    }, 0);
}

async function performDeleteBoardPack() {
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db || !user || !pendingDeleteBoardPack?.id) {
        toast("Not authenticated.");
        return;
    }
    if (String(deleteBoardPackConfirmInput?.value || "") !== String(pendingDeleteBoardPack.name || "")) {
        toast("Board pack name does not match.");
        return;
    }
    try {
        if (btnDeleteBoardPackConfirm) {
            btnDeleteBoardPackConfirm.disabled = true;
            btnDeleteBoardPackConfirm.textContent = "Deleting…";
        }
        await deleteDoc(boardPackDocRef(db, user.uid, pendingDeleteBoardPack.id));
        await refreshDeviceUI(db, user.uid);
        closeDeleteBoardPackModal();
        toast("Board pack deleted.");
    } catch (err) {
        console.error("[EDITOR] delete board pack failed", err);
        toast("Delete failed.");
        if (btnDeleteBoardPackConfirm) {
            btnDeleteBoardPackConfirm.disabled = false;
            btnDeleteBoardPackConfirm.textContent = "Delete Board Pack";
        }
    }
}

function getActiveDeviceId() {
    return (localStorage.getItem(LS_ACTIVE_DEVICE) || "").trim();
}
function setActiveDeviceId(id) {
    localStorage.setItem(LS_ACTIVE_DEVICE, String(id || "").trim());
}


// Global device gate toggler (usable outside firebase bootstrap scope)
window.__flipeditorSetDeviceGate = function (on) {
    document.body.classList.toggle("deviceGate", !!on);
    if (btnDevicesClose) btnDevicesClose.disabled = !!on;
    if (btnDevicesClose) btnDevicesClose.style.opacity = on ? "0.45" : "1";
    if (btnDevicesClose) btnDevicesClose.style.cursor = on ? "not-allowed" : "pointer";
};

function deviceDocRef(db, uid, deviceId) {
    return doc(db, ACCOUNT_COLLECTION, uid, DEVICES_SUBCOL, deviceId);
}
function boardPackDocRef(db, uid, boardPackId) {
    return doc(db, ACCOUNT_COLLECTION, uid, BOARDPACKS_SUBCOL, boardPackId);
}

export function accountEventsRef(db, uid) {
    return doc(db, "accounts", uid, "events", "data");
}

function makeBoardPackName(base, fallback = "Board Pack") {
    const s = String(base || "").trim();
    return s || fallback;
}

async function listBoardPacks(db, uid) {
    const colRef = collection(db, ACCOUNT_COLLECTION, uid, BOARDPACKS_SUBCOL);
    const snap = await getDocs(colRef);
    const out = [];
    snap.forEach(docSnap => out.push({ id: docSnap.id, ...(docSnap.data() || {}) }));
    out.sort((a, b) => {
        const an = String(a.name || "").toLowerCase();
        const bn = String(b.name || "").toLowerCase();
        if (an && bn && an !== bn) return an.localeCompare(bn);
        if (an && !bn) return -1;
        if (!an && bn) return 1;
        return String(a.id).localeCompare(String(b.id));
    });
    return out;
}

async function getDeviceBoardPackInfo(db, uid, deviceId) {
    const deviceSnap = await getDoc(deviceDocRef(db, uid, deviceId));
    if (!deviceSnap.exists()) throw new Error("Device not found.");
    const deviceData = deviceSnap.data() || {};
    let boardPackId = String(deviceData.boardPackId || "").trim();

    if (!boardPackId) {
        boardPackId = feUuid();
        const packName = makeBoardPackName(deviceData.label || deviceId, "Board Pack");
        await setDoc(boardPackDocRef(db, uid, boardPackId), {
            name: packName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            data: makeSeedBoardPack()
        }, { merge: true });
        await setDoc(deviceDocRef(db, uid, deviceId), {
            boardPackId,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return { boardPackId, boardPackName: packName, repaired: true };
    }

    const packSnap = await getDoc(boardPackDocRef(db, uid, boardPackId));
    if (!packSnap.exists()) {
        const packName = makeBoardPackName(deviceData.label || deviceId, "Board Pack");
        await setDoc(boardPackDocRef(db, uid, boardPackId), {
            name: packName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            data: makeSeedBoardPack()
        }, { merge: true });
        return { boardPackId, boardPackName: packName, repaired: true };
    }

    const packData = packSnap.data() || {};
    return {
        boardPackId,
        boardPackName: String(packData.name || boardPackId).trim() || boardPackId,
        repaired: false
    };
}

function makeSeedBoardPack() {
    // Seed pack for new devices.
    // Board KEYS are UUIDs (internal). Board "name" is what the user sees.
    const ID_BS_WEATHER = feUuid();
    const ID_WELCOME = feUuid();
    const ID_DATETIME = feUuid();
    const ID_COUNTDOWN = feUuid();
    const ID_TODAY = feUuid();
    const ID_TOMORROW = feUuid();
    const ID_SYSTEM_UPDATED = feUuid();

    return {
        meta: {
            ui: { flip_speed: 3 },
            grid: { columns: 20, rows: 8 },
            description: "Split-flap dashboard stage definitions"
        },
        rotation: {
            enabled: true,
            dwell_ms: 15000,
            order: [
                ID_BS_WEATHER,
                ID_WELCOME,
                ID_DATETIME,
                ID_COUNTDOWN,
                ID_TODAY,
                ID_TOMORROW,
                ID_SYSTEM_UPDATED
            ]
        },
        boards: {
            [ID_BS_WEATHER]: {
                name: "BS Weather",
                type: "dynamic",
                cols: 20,
                rows: [
                    "{LOCATION}          ",
                    "{TEMP} - {FEELS}    ",
                    "{CONDITION_LINE}    ",
                    "{WIND_LINE}         ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                source: "openweather_onecall",
                weather: { location: { type: "zip", value: "29316", label: "" } },
                dwell_ms: 12000
            },

            [ID_WELCOME]: {
                name: "WELCOME",
                type: "static",
                cols: 20,
                rows: [
                    "WELCOME             ",
                    "TO                  ",
                    "FLIPBOARD           ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 12000
            },

            [ID_DATETIME]: {
                name: "DATE & TIME",
                type: "static",
                cols: 20,
                rows: [
                    "{DATE_LONG}         ",
                    "{TIME_12H}          ",
                    "{TIME_24H}          ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 12000
            },

            [ID_COUNTDOWN]: {
                name: "COUNTDOWN",
                type: "static",
                cols: 20,
                rows: [
                    "CHRISTMAS           ",
                    "{COUNTDOWN CHRISTMAS.DAYS}                    ",
                    "{COUNTDOWN WIFES.DAYS}                    ",
                    "EASTER              ",
                    "{COUNTDOWN EASTER.DAYS}                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 12000
            },

            [ID_TODAY]: {
                name: "TODAY",
                type: "static",
                cols: 20,
                rows: [
                    "TODAY               ",
                    "{EVENTS_TODAY}      ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 12000
            },

            [ID_TOMORROW]: {
                name: "TOMORROW",
                type: "static",
                cols: 20,
                rows: [
                    "TOMORROW            ",
                    "{EVENTS_TOMORROW}   ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 12000
            },

            [ID_SYSTEM_UPDATED]: {
                name: "SYSTEM UPDATED",
                type: "static",
                one_shot: true,
                cols: 20,
                rows: [
                    "SYSTEM              ",
                    "UPDATED             ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    ",
                    "                    "
                ],
                dwell_ms: 8000
            }
        }
    };
}
function makeSeedEvents() {
    return {
        "events": {
            "XMAS": {
                "title": "CHRISTMAS",
                "date": "2026-12-25"
            },
            "WIFES_BDAY": {
                "title": "WIFES BDAY",
                "date": "2026-03-17"
            },
            "ANNIVERSARY": {
                "title": "ANNIVERSARY",
                "date": "2026-06-14"
            },
            "VACATION": {
                "title": "VACATION",
                "date": "2026-07-01"
            }
        }
    };
}
function stringify(obj) {
    return JSON.stringify(obj, null, 2);
}

let pendingDeleteDevice = null;
let pendingRenameDevice = null;

function closeDeleteDeviceModal() {
    try { if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur(); } catch (_) { }
    if (!deleteDeviceModal) return;
    deleteDeviceModal.style.display = "none";
    deleteDeviceModal.setAttribute("aria-hidden", "true");
    deleteDeviceModal.inert = true;
    pendingDeleteDevice = null;
    if (deleteDeviceConfirmInput) deleteDeviceConfirmInput.value = "";
    if (btnDeleteDeviceConfirm) {
        btnDeleteDeviceConfirm.disabled = true;
        btnDeleteDeviceConfirm.textContent = "Delete Device";
    }
}

function openDeleteDeviceModal(device) {
    if (!deleteDeviceModal || !device) return;
    const name = String((device.label || device.nickname || device.name || "").trim() || "Unnamed device");
    pendingDeleteDevice = { id: String(device.id || "").trim(), name };
    if (deleteDeviceNameView) deleteDeviceNameView.value = name;
    if (deleteDeviceConfirmInput) deleteDeviceConfirmInput.value = "";
    if (btnDeleteDeviceConfirm) btnDeleteDeviceConfirm.disabled = true;
    deleteDeviceModal.style.display = "flex";
    deleteDeviceModal.setAttribute("aria-hidden", "false");
    deleteDeviceModal.inert = false;
    setTimeout(() => { try { deleteDeviceConfirmInput?.focus(); } catch (_) { } }, 0);
}

async function performDeleteDevice() {
    if (!pendingDeleteDevice) return;
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db || !user) {
        toast("Not authenticated.");
        return;
    }

    const { id, name } = pendingDeleteDevice;
    if ((deleteDeviceConfirmInput?.value || "") !== name) {
        toast("Device name does not match.");
        return;
    }

    const wasActive = getActiveDeviceId() === id;

    try {
        if (btnDeleteDeviceConfirm) {
            btnDeleteDeviceConfirm.disabled = true;
            btnDeleteDeviceConfirm.textContent = "Deleting…";
        }

        // await deleteDoc(eventsDocRef(db, user.uid, id));
        await deleteDoc(deviceDocRef(db, user.uid, id));

        if (wasActive) {
            setActiveDeviceId("");
            try { window.__flipeditorSetDeviceGate(true); } catch (_) { }
            if (deviceSelect) deviceSelect.value = "";
        }

        await refreshDeviceUI(db, user.uid);
        closeDeleteDeviceModal();
        toast("Device deleted.");

        if (wasActive) {
            try { openDevicesModal(); } catch (_) { }
        }
    } catch (err) {
        console.error("[EDITOR] delete device failed", err);
        toast("Delete failed.");
        if (btnDeleteDeviceConfirm) {
            btnDeleteDeviceConfirm.disabled = false;
            btnDeleteDeviceConfirm.textContent = "Delete Device";
        }
    }
}

function closeRenameDeviceModal() {
    try { if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur(); } catch (_) { }
    if (!renameDeviceModal) return;
    renameDeviceModal.style.display = "none";
    renameDeviceModal.setAttribute("aria-hidden", "true");
    renameDeviceModal.inert = true;
    pendingRenameDevice = null;
    if (renameDeviceInput) renameDeviceInput.value = "";
    if (btnRenameDeviceConfirm) {
        btnRenameDeviceConfirm.disabled = true;
        btnRenameDeviceConfirm.textContent = "Save Name";
    }
}

function openRenameDeviceModal(device) {
    if (!renameDeviceModal || !device) return;
    const id = String(device.id || "").trim();
    const name = String((device.label || device.nickname || device.name || "").trim() || "Unnamed device");
    pendingRenameDevice = { id, name };
    if (renameDeviceIdView) renameDeviceIdView.value = id;
    if (renameDeviceInput) renameDeviceInput.value = name;
    if (btnRenameDeviceConfirm) btnRenameDeviceConfirm.disabled = true;
    renameDeviceModal.style.display = "flex";
    renameDeviceModal.setAttribute("aria-hidden", "false");
    renameDeviceModal.inert = false;
    setTimeout(() => {
        try {
            renameDeviceInput?.focus();
            renameDeviceInput?.select();
        } catch (_) { }
    }, 0);
}

async function performRenameDevice() {
    if (!pendingRenameDevice) return;
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db || !user) {
        toast("Not authenticated.");
        return;
    }

    const { id, name } = pendingRenameDevice;
    const next = String(renameDeviceInput?.value || "").trim();
    if (!next) {
        toast("Device name required.");
        return;
    }
    if (next === name) {
        closeRenameDeviceModal();
        return;
    }

    try {
        if (btnRenameDeviceConfirm) {
            btnRenameDeviceConfirm.disabled = true;
            btnRenameDeviceConfirm.textContent = "Saving…";
        }

        await setDoc(deviceDocRef(db, user.uid, id), {
            label: next,
            updatedAt: serverTimestamp()
        }, { merge: true });

        await refreshDeviceUI(db, user.uid);
        closeRenameDeviceModal();
        toast("Device renamed.");
    } catch (err) {
        console.error("[EDITOR] rename device failed", err);
        toast("Rename failed.");
        if (btnRenameDeviceConfirm) {
            btnRenameDeviceConfirm.disabled = false;
            btnRenameDeviceConfirm.textContent = "Save Name";
        }
    }
}

function renderDevicesList(devs, boardPacksById) {
    if (!devicesList) return;
    devicesList.innerHTML = "";
    if (!devs.length) {
        devicesList.innerHTML = `<div style="color:rgba(232,232,239,.65);font-size:13px;">No devices yet. Add one below.</div>`;
        return;
    }
    const active = getActiveDeviceId();
    const packOptions = Object.values(boardPacksById || {}).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

    for (const d of devs) {
        const row = document.createElement("div");
        row.className = "deviceRow";
        const name = (d.label || d.nickname || d.name || "").trim() || "Unnamed device";
        const boardPackId = String(d.boardPackId || "").trim();
        const packLabel = boardPackId && boardPacksById?.[boardPackId]
            ? String(boardPacksById[boardPackId].name || boardPackId)
            : (boardPackId || "Unassigned");

        const selectHtml = packOptions.map(pack => {
            const selected = pack.id === boardPackId ? "selected" : "";
            return `<option value="${escapeHtml(pack.id)}" ${selected}>${escapeHtml(pack.name || pack.id)}</option>`;
        }).join("");

        row.innerHTML = `
    <div class="left">
        <div class="name">${escapeHtml(name)}${d.id === active ? " <span style='color:rgba(77,210,133,.95);font-weight:900'>(ACTIVE)</span>" : ""}</div>
        <div class="id">${escapeHtml(d.id)}</div>
        <div class="id" style="margin-top:4px;">Pack: <strong>${escapeHtml(packLabel)}</strong></div>
        <div style="margin-top:8px;">
            <label style="display:block;font-size:11px;opacity:.72;margin-bottom:4px;">Assigned Board Pack</label>
            <div class="packSelectWrap">
                <select class="packSelect" data-pack-assign="${escapeHtml(d.id)}">
                    ${selectHtml}
                </select>
            </div>
        </div>
    </div>
    <div class="actions">
        <button class="miniBtn" data-copy="${escapeHtml(d.id)}" type="button">Copy</button>
        <button class="miniBtn primary" data-activate="${escapeHtml(d.id)}" type="button">Set Active</button>
        <button class="miniBtn" data-rename="${escapeHtml(d.id)}" data-name="${escapeHtml(name)}" type="button" title="Rename device"><i class="fa fa-pencil" aria-hidden="true"></i></button>
        <button class="miniBtn danger" data-delete="${escapeHtml(d.id)}" data-name="${escapeHtml(name)}" type="button" title="Delete device"><i class="fa fa-trash" aria-hidden="true"></i></button>
    </div>
    `;
        devicesList.appendChild(row);
    }
    devicesList.querySelectorAll("button[data-copy]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-copy") || "";
            try { await navigator.clipboard.writeText(id); } catch (_) { }
            toast("Copied device ID.");
        });
    });
    devicesList.querySelectorAll("button[data-activate]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-activate") || "";
            await setDeviceActiveAndLoad(id);
            closeDevicesModal();
        });
    });
    devicesList.querySelectorAll("button[data-rename]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-rename") || "";
            const currentName = btn.getAttribute("data-name") || "";
            openRenameDeviceModal({ id, label: currentName });
        });
    });
    devicesList.querySelectorAll("button[data-delete]").forEach(btn => {
        btn.addEventListener("click", () => {
            openDeleteDeviceModal({
                id: btn.getAttribute("data-delete") || "",
                label: btn.getAttribute("data-name") || ""
            });
        });
    });
    devicesList.querySelectorAll("select[data-pack-assign]").forEach(sel => {
        sel.addEventListener("change", async () => {
            const deviceId = sel.getAttribute("data-pack-assign") || "";
            const boardPackId = String(sel.value || "").trim();
            const db = window.__fb_db;
            const user = window.__fb_user;
            if (!db || !user || !deviceId || !boardPackId) return;

            try {
                await setDoc(deviceDocRef(db, user.uid, deviceId), {
                    boardPackId,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                const isActive = getActiveDeviceId() === deviceId;
                await refreshDeviceUI(db, user.uid);
                if (isActive) {
                    await setDeviceActiveAndLoad(deviceId);
                }
                toast("Board pack assigned.");
            } catch (err) {
                console.error("[EDITOR] assign board pack failed", err);
                toast("Assignment failed.");
            }
        });
    });
}

function renderBoardPacksList(packs, devs) {
    if (!boardPacksList) return;
    boardPacksList.innerHTML = "";
    if (!packs.length) {
        boardPacksList.innerHTML = `<div style="color:rgba(232,232,239,.65);font-size:13px;">No board packs yet.</div>`;
        return;
    }

    const usageMap = {};
    for (const d of devs || []) {
        const id = String(d.boardPackId || "").trim();
        if (!id) continue;
        usageMap[id] = (usageMap[id] || 0) + 1;
    }

    for (const pack of packs) {
        const row = document.createElement("div");
        row.className = "deviceRow";
        const name = String(pack.name || pack.id).trim() || pack.id;
        const usage = usageMap[pack.id] || 0;
        row.innerHTML = `
    <div class="left">
        <div class="name">${escapeHtml(name)}</div>
        <div class="id">${escapeHtml(pack.id)}</div>
        <div class="id" style="margin-top:4px;">Assigned devices: <strong>${usage}</strong></div>
    </div>
    <div class="actions">
        <button class="miniBtn" data-pack-rename="${escapeHtml(pack.id)}" data-pack-name="${escapeHtml(name)}" type="button">Rename</button>
        <button class="miniBtn" data-pack-duplicate="${escapeHtml(pack.id)}" type="button">Duplicate</button>
        <button class="miniBtn danger" data-pack-delete="${escapeHtml(pack.id)}" data-pack-name="${escapeHtml(name)}" data-pack-usage="${usage}" type="button">Delete</button>
    </div>
    `;
        boardPacksList.appendChild(row);
    }

    boardPacksList.querySelectorAll("button[data-pack-rename]").forEach(btn => {
        btn.addEventListener("click", () => {
            const packId = btn.getAttribute("data-pack-rename") || "";
            const currentName = btn.getAttribute("data-pack-name") || "";
            openBoardPackNameModal({
                mode: "rename",
                packId,
                currentName,
                defaultName: currentName,
                title: "Rename Board Pack",
                sub: "Update the board pack name shown in FlipEditor.",
                confirmText: "Save Name"
            });
        });
    });

    boardPacksList.querySelectorAll("button[data-pack-duplicate]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const sourceId = btn.getAttribute("data-pack-duplicate") || "";
            const db = window.__fb_db;
            const user = window.__fb_user;
            if (!db || !user || !sourceId) return;
            try {
                const sourceSnap = await getDoc(boardPackDocRef(db, user.uid, sourceId));
                if (!sourceSnap.exists()) throw new Error("Source board pack not found.");
                const sourceData = sourceSnap.data() || {};
                const defaultName = `${String(sourceData.name || "Board Pack").trim()} Copy`;
                openBoardPackNameModal({
                    mode: "duplicate",
                    sourceId,
                    defaultName,
                    title: "Duplicate Board Pack",
                    sub: "Create a copied board pack with a new name.",
                    confirmText: "Duplicate"
                });
            } catch (err) {
                console.error("[EDITOR] duplicate board pack failed", err);
                toast("Duplicate failed.");
            }
        });
    });

    boardPacksList.querySelectorAll("button[data-pack-delete]").forEach(btn => {
        btn.addEventListener("click", () => {
            const packId = btn.getAttribute("data-pack-delete") || "";
            const usage = Number(btn.getAttribute("data-pack-usage") || "0");
            const packName = btn.getAttribute("data-pack-name") || "";
            const db = window.__fb_db;
            const user = window.__fb_user;
            if (!db || !user || !packId) return;
            if (usage > 0) {
                toast("Board pack is assigned to one or more devices.");
                return;
            }
            openDeleteBoardPackModal({ id: packId, name: packName });
        });
    });
}

function escapeHtml(s) {
    return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function listDevices(db, uid) {
    const colRef = collection(db, ACCOUNT_COLLECTION, uid, DEVICES_SUBCOL);
    const snap = await getDocs(colRef);
    const out = [];
    snap.forEach(docSnap => {
        out.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    });
    // Stable sort by label then id
    out.sort((a, b) => {
        const an = (a.label || a.nickname || a.name || "").toLowerCase();
        const bn = (b.label || b.nickname || b.name || "").toLowerCase();
        if (an && bn && an !== bn) return an.localeCompare(bn);
        if (an && !bn) return -1;
        if (!an && bn) return 1;
        return String(a.id).localeCompare(String(b.id));
    });
    return out;
}

async function ensureAccountDoc(db, user) {
    const uid = user.uid;
    const ref = doc(db, ACCOUNT_COLLECTION, uid);
    await setDoc(ref, {
        email: user.email || "",
        updatedAt: serverTimestamp(),
        schemaVersion: 1
    }, { merge: true });
}

async function ensureSeedForDevice(db, uid, deviceId) {
    const deviceRef = deviceDocRef(db, uid, deviceId);

    const deviceSnap = await getDoc(deviceRef);
    const deviceData = deviceSnap.exists() ? (deviceSnap.data() || {}) : {};
    let boardPackId = String(deviceData.boardPackId || "").trim();

    const writes = [];
    if (!boardPackId) {
        boardPackId = feUuid();
        writes.push(setDoc(boardPackDocRef(db, uid, boardPackId), {
            name: makeBoardPackName(deviceData.label || deviceId, "Board Pack"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            data: makeSeedBoardPack()
        }, { merge: true }));
        writes.push(setDoc(deviceRef, {
            boardPackId,
            updatedAt: serverTimestamp()
        }, { merge: true }));
    } else {
        const bSnap = await getDoc(boardPackDocRef(db, uid, boardPackId));
        if (!bSnap.exists()) {
            writes.push(setDoc(boardPackDocRef(db, uid, boardPackId), {
                name: makeBoardPackName(deviceData.label || deviceId, "Board Pack"),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                data: makeSeedBoardPack()
            }, { merge: true }));
        }
    }

    if (writes.length) await Promise.all(writes);
}

async function refreshDeviceUI(db, uid) {
    const devs = await listDevices(db, uid);
    const packs = await listBoardPacks(db, uid);
    const boardPacksById = {};
    for (const pack of packs) boardPacksById[pack.id] = pack;

    let repaired = false;
    for (const d of devs) {
        if (!String(d.boardPackId || "").trim() || !boardPacksById[String(d.boardPackId || "").trim()]) {
            const info = await getDeviceBoardPackInfo(db, uid, d.id);
            d.boardPackId = info.boardPackId;
            if (!boardPacksById[info.boardPackId]) {
                boardPacksById[info.boardPackId] = { id: info.boardPackId, name: info.boardPackName };
                packs.push({ id: info.boardPackId, name: info.boardPackName });
            }
            repaired = repaired || !!info.repaired;
        }
    }

    packs.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

    if (deviceSelect) {
        const active = getActiveDeviceId();
        deviceSelect.innerHTML = `<option value="">— Select —</option>` + devs.map(d => {
            const name = (d.label || d.nickname || d.name || "").trim() || d.id;
            const packName = d.boardPackId && boardPacksById[d.boardPackId]
                ? ` — ${String(boardPacksById[d.boardPackId].name || d.boardPackId)}`
                : "";
            const sel = (d.id === active) ? "selected" : "";
            return `<option value="${escapeHtml(d.id)}" ${sel}>${escapeHtml(name + packName)}</option>`;
        }).join("");
    }

    renderDevicesList(devs, boardPacksById);
    renderBoardPacksList(packs, devs);

    const active = getActiveDeviceId();
    if (active && !devs.some(d => d.id === active)) {
        setActiveDeviceId("");
    }

    if (devicePill) devicePill.style.display = "inline-flex";

    if (repaired) {
        console.log("[EDITOR] repaired missing board pack assignments");
    }

    return { devs, packs, boardPacksById };
}

async function setDeviceActiveAndLoad(deviceId) {
    const id = String(deviceId || "").trim();
    if (!id) return;

    const prevId = getActiveDeviceId();
    const isInitialSelect = !prevId;
    const isSameDevice = prevId === id;

    if (!window.__suppressDirtyConfirms && !isInitialSelect && !isSameDevice && anyFirestoreDirty()) {
        const choice = await confirmUnsavedAction({
            title: "Switch device?",
            sub: "You have unsaved changes. Switching devices will discard local changes unless you save first.",
            hint: "Save = write boardPack/events to Firestore, then switch. Discard = switch anyway. Cancel = stay here."
        });
        if (choice === "cancel") return;
        if (choice === "save") {
            try {
                if (typeof window.savePack === "function" && (packIsDirty() || editorIsDirty())) await window.savePack();
            } catch (e) { console.warn("[EDITOR] save pack before device switch failed:", e); return; }
            try {
                if (typeof window.saveEvents === "function" && eventsDirty()) await window.saveEvents();
            } catch (e) { console.warn("[EDITOR] save events before device switch failed:", e); return; }
        }
        // discard -> continue switching
    }

    window.__suppressDirtyConfirms = true;
    window.__suppressReloadConfirm = true;
    if (!id) return;
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db || !user) return;

    setActiveDeviceId(id);

    // Seed docs for device, then reload editor pack/events
    await ensureSeedForDevice(db, user.uid, id);

    // Reflect selection in UI
    if (deviceSelect) deviceSelect.value = id;

    // Reload pack/events via existing editor flow.
    try {
        if (typeof window.reloadPack === "function") {
            await window.reloadPack();
        } else if (window.loadStagePack) {
            // fallback: nudge the reload button if present
            const btn = document.getElementById("btnReload") || document.querySelector('[data-action="reload"]');
            if (btn) btn.click();
        }
    } catch (e) {
        console.warn("[EDITOR] device load failed:", e);
    }

    // Once a device is active, allow editing and close modal.
    try { window.__flipeditorSetDeviceGate(false); } catch (_) { }
    try { closeDevicesModal(true); } catch (_) { }
    window.__suppressDirtyConfirms = false;
    window.__suppressReloadConfirm = false;
}

deviceSelect?.addEventListener("change", async () => {
    const id = deviceSelect.value;
    if (!id) return;
    await setDeviceActiveAndLoad(id);
});

btnCreateBoardPack?.addEventListener("click", async () => {
    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db || !user) {
        toast("Not authenticated.");
        return;
    }

    const activeId = getActiveDeviceId();
    let suggested = "Board Pack";
    if (activeId) {
        try {
            const activeSnap = await getDoc(deviceDocRef(db, user.uid, activeId));
            const activeData = activeSnap.exists() ? (activeSnap.data() || {}) : {};
            suggested = makeBoardPackName(activeData.label || "Board Pack", "Board Pack");
        } catch (_) { }
    }

    openBoardPackNameModal({
        mode: "create",
        defaultName: suggested,
        title: "Create Board Pack",
        sub: "Create a reusable board pack that can be assigned to one or more devices.",
        confirmText: "Create Pack"
    });
});

btnAddDevice?.addEventListener("click", async () => {
    window.__suppressDirtyConfirms = true;
    window.__suppressReloadConfirm = true;

    hideBanner();

    const db = window.__fb_db;
    const user = window.__fb_user;
    if (!db) { try { toast("Firestore not ready yet. Give it a second and try again."); } catch (_) { } return; }
    if (!user) { try { toast("Not authenticated yet. Please log in."); } catch (_) { } try { const setGate = window.__fb_setGate; if (setGate) setGate(true); } catch (_) { } return; }

    const deviceId = String(newDeviceId.value || "").trim();
    const label = String(newDeviceName.value || "").trim();

    const vres = validateDeviceIdInput(deviceId, user && user.uid);
    if (!deviceId) { try { toast("Device ID required."); } catch (_) { } updateAddDeviceButton(); return; }
    if (!label) { try { toast("Nickname required."); } catch (_) { } updateAddDeviceButton(); return; }
    if (!vres.ok) { try { toast(vres.msg); } catch (_) { } updateAddDeviceButton(); return; }

    btnAddDevice.dataset._label = btnAddDevice.dataset._label || btnAddDevice.textContent || "Add device";
    btnAddDevice.dataset._busy = "1";
    btnAddDevice.disabled = true;
    btnAddDevice.textContent = "Adding…";

    try {
        const ref = deviceDocRef(db, user.uid, deviceId);
        const existingSnap = await getDoc(ref);
        if (existingSnap.exists()) {
            try { toast("That device ID already exists. Use Rename to change its nickname."); } catch (_) { }
            return;
        }

        const boardPackId = feUuid();
        await setDoc(ref, {
            label,
            boardPackId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        await setDoc(boardPackDocRef(db, user.uid, boardPackId), {
            name: makeBoardPackName(label, "Board Pack"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            data: makeSeedBoardPack()
        }, { merge: true });

        await ensureSeedForDevice(db, user.uid, deviceId);
        try {
            try { setBootPhase("EVENTS  "); } catch (_) { }
            await delay(700);
            window.loadEventsOnce();
        } catch (e) { console.warn('[EDITOR] events reload after seed failed:', e); }

        newDeviceId.value = "";
        newDeviceName.value = "";

        await refreshDeviceUI(db, user.uid);

        let cur = null;
        try { cur = getActiveDeviceId(); } catch (_) { cur = null; }
        let curExists = false;
        if (cur) {
            try {
                const curRef = doc(db, "accounts", user.uid, "devices", cur);
                const snap = await getDoc(curRef);
                curExists = snap.exists();
            } catch (_) { curExists = false; }
        }
        if (!cur || !curExists) {
            window.__suppressReloadConfirm = true;
            await setDeviceActiveAndLoad(deviceId);
            forceClearDirtyBaselines();
            try { await window.loadEventsOnce(); } catch (e) { console.warn('[EDITOR] events reload after activate failed:', e); }
            try { await new Promise(r => setTimeout(r, 150)); } catch (_) { }
            try {
                await reloadPack();
                forceClearDirtyBaselines();
            } catch (_) { }
            window.__suppressReloadConfirm = false;
        }
        toast("Device added.");
        try { closeDevicesModal(true); } catch (_) { }
    } catch (err) {
        console.error("[EDITOR] add device failed", err);
        alert(String(err?.message || err));
    } finally {
        btnAddDevice.dataset._busy = "0";
        btnAddDevice.textContent = btnAddDevice.dataset._label || "Add device";
        updateAddDeviceButton();
        window.__suppressDirtyConfirms = false;
        window.__suppressReloadConfirm = false;
    }
});

// Expose to main editor (optional)
window.__fb_getActiveDeviceId = getActiveDeviceId;

// Main Firestore integration exported functions used by the editor UI
window.__flipboardFirestoreReady = (async () => {
    try {
        const app = initializeApp(firebaseConfig);

        const db = initializeFirestore(app, {
            experimentalForceLongPolling: true,
            useFetchStreams: false
        });

        const auth = getAuth(app);
        window.__fb_auth = auth;
        try { await setPersistence(auth, browserLocalPersistence); } catch (_) { }

        // store for helpers
        window.__fb_db = db;

        // auth gate
        const setGate = (on) => {
            if (authGate) authGate.style.display = on ? "flex" : "none";
            if (workspace) workspace.style.display = on ? "none" : "";
        };
        // Expose for helpers (avoid referencing module scope from other closures)
        window.__fb_setGate = setGate;

        const setDeviceGate = (on) => {
            document.body.classList.toggle("deviceGate", !!on);
            // close button disabled when gate is on
            if (btnDevicesClose) btnDevicesClose.disabled = !!on;
            if (btnDevicesClose) btnDevicesClose.style.opacity = on ? "0.45" : "1";
            if (btnDevicesClose) btnDevicesClose.style.cursor = on ? "not-allowed" : "pointer";
        };

        setGate(true);
        // Boot: keep splash visible until auth state resolves (prevents AUTH→login→editor flicker)
        setAuthBoot(true);
        try { showBootSplash(true, "Checking session…"); } catch (_) { }
        try { setBootPhase("  AUTH  "); } catch (_) { }
        await delay(700);

        try { setStateText("Checking session…"); } catch (_) { }
        function setStateText(txt) {
            if (authStateText) authStateText.textContent = txt;
        }

        onAuthStateChanged(auth, async (user) => {
            let authShowTimer = null;
            let authSettled = false;

            window.__fb_user = user || null;
            window.__fb_userResolved = true;

            if (!user) {
                console.log("[EDITOR] No session. Showing auth gate.");
                btnEdLogout.style.display = "none";
                if (devicePill) devicePill.style.display = "none";
                try { setBootPhase("LOGIN   "); } catch (_) { }
                await delay(700);
                setStateText("Please log in");
                // Stop boot mode so the login/signup UI is visible.
                setAuthBoot(false);
                try { showBootSplash(false); } catch (_) { }
                setGate(true);
                return;
            }

            console.log("[EDITOR] AUTH UID:", user.uid, "email:", user.email || "(none)");
            try { setBootPhase(" DEVICE "); } catch (_) { }
            await delay(700);
            btnEdLogout.style.display = "inline-flex";
            setStateText(`Logged in: ${user.email || user.uid}`);

            await ensureAccountDoc(db, user);

            // Populate devices UI
            const devs = await refreshDeviceUI(db, user.uid);

            // If active device exists, ensure it's valid; otherwise require selection.
            let active = getActiveDeviceId();

            if (!active) {
                // If only one device exists, auto-activate it.
                if (devs.length === 1) {
                    window.__suppressDirtyConfirms = true;
                    window.__suppressReloadConfirm = true;
                    try { await setDeviceActiveAndLoad(devs[0].id); } finally { window.__suppressDirtyConfirms = false; window.__suppressReloadConfirm = false; }
                    active = getActiveDeviceId();
                    try { await window.loadEventsOnce(); } catch (e) { console.warn('[EDITOR] events load after auto-activate failed:', e); }
                }
            }

            // Device gate: block editor interactions until an active device exists.
            const needsDevice = !active;
            window.__flipeditorSetDeviceGate(needsDevice);

            if (needsDevice) {
                openDevicesModal();
            } else {
                // Ensure the device has baseline data, then LOAD it immediately (no manual reload needed).
                await ensureSeedForDevice(db, user.uid, active);
                if (deviceSelect) deviceSelect.value = active;

                // Suppress discard prompts during auto-load on startup
                window.__suppressDirtyConfirms = true;
                window.__suppressReloadConfirm = true;
                try { await setDeviceActiveAndLoad(active); } finally { window.__suppressDirtyConfirms = false; window.__suppressReloadConfirm = false; }

                // Load events for the active device
                try {
                    try { setBootPhase(" EVENTS "); } catch (_) { }
                    await delay(700);
                    // loadEventsOnce is defined later in the file; wait until it is exported
                    const _t0 = Date.now();
                    while (typeof window.loadEventsOnce !== "function") {
                        if (Date.now() - _t0 > 8000) throw new ReferenceError("loadEventsOnce is not defined");
                        await new Promise(r => setTimeout(r, 50));
                    }
                    await window.loadEventsOnce();
                } catch (e) { console.warn("[EDITOR] events load on startup failed:", e); }
            }

            authSettled = true;
            if (authShowTimer) { clearTimeout(authShowTimer); authShowTimer = null; }
            setAuthBoot(false);
            try { setBootPhase(" READY ✓"); } catch (_) { }
            // await delay(700);
            try { setTimeout(() => showBootSplash(false), 880); } catch (_) { }
            setGate(false);
        });

        // Auth form wiring
        formEdLogin?.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideBanner();
            const email = String(edLoginEmail.value || "").trim();
            const pass = String(edLoginPass.value || "");
            if (!email || !pass) { showBanner("Missing fields", "Email and password required."); return; }
            try {
                await signInWithEmailAndPassword(auth, email, pass);
            } catch (err) {
                console.error("[EDITOR] login failed", err);
                showBanner("Login failed", err?.message || String(err));
            }
        });

        formEdSignup?.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideBanner();
            const email = String(edSignupEmail.value || "").trim();
            const p1 = String(edSignupPass1.value || "");
            const p2 = String(edSignupPass2.value || "");
            if (!email || !p1 || !p2) { showBanner("Missing fields", "Fill out all fields."); return; }
            if (p1.length < 6) { showBanner("Weak password", "Use at least 6 characters."); return; }
            if (p1 !== p2) { showBanner("Passwords do not match", "Confirm password must match."); return; }

            try {
                const cred = await createUserWithEmailAndPassword(auth, email, p1);
                // Ensure account doc now, devices added later.
                await ensureAccountDoc(db, cred.user);
            } catch (err) {
                console.error("[EDITOR] signup failed", err);
                showBanner("Sign up failed", err?.message || String(err));
            }
        });

        btnEdLogout?.addEventListener("click", async () => {
            hideBanner();
            try {
                await signOut(auth);
            } catch (err) {
                console.error("[EDITOR] logout failed", err);
                showBanner("Logout failed", err?.message || String(err));
            }
        });

        // Device-scoped load/save used by editor UI
        async function loadStringifiedJsonDoc(docRef, fieldName, labelForErrors) {
            try {
                const snap = await getDocFromServer(docRef);
                window.__flipboardLastSource = "firestore:server";
                if (!snap.exists()) throw new Error(`${labelForErrors} not found.`);
                const raw = snap.get(fieldName);
                if (typeof raw !== "string" || !raw.trim()) throw new Error(`${labelForErrors} field "${fieldName}" missing or empty.`);
                return JSON.parse(raw);
            } catch (e1) {
                console.warn("[EDITOR] server failed, trying cache:", e1?.code || e1?.message || e1);
            }

            try {
                const snap = await getDocFromCache(docRef);
                window.__flipboardLastSource = "firestore:cache";
                if (!snap.exists()) throw new Error(`${labelForErrors} not found (cache).`);
                const raw = snap.get(fieldName);
                if (typeof raw !== "string" || !raw.trim()) throw new Error(`${labelForErrors} field "${fieldName}" missing (cache).`);
                return JSON.parse(raw);
            } catch (e2) {
                console.warn("[EDITOR] cache failed, trying default getDoc:", e2?.code || e2?.message || e2);
            }

            const snap = await getDoc(docRef);
            window.__flipboardLastSource = "firestore:getDoc";
            if (!snap.exists()) throw new Error(`${labelForErrors} not found.`);
            const raw = snap.get(fieldName);
            if (typeof raw !== "string" || !raw.trim()) throw new Error(`${labelForErrors} field "${fieldName}" missing.`);
            return JSON.parse(raw);
        }

        async function loadBoardPackObjectDoc(docRef, labelForErrors) {
            try {
                const snap = await getDocFromServer(docRef);
                window.__flipboardLastSource = "firestore:server";
                if (!snap.exists()) throw new Error(`${labelForErrors} not found.`);
                const raw = snap.get(FIELD);
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${labelForErrors} field "${FIELD}" missing object payload.`);
                return raw;
            } catch (e1) {
                console.warn("[EDITOR] board pack server failed, trying cache:", e1?.code || e1?.message || e1);
            }

            try {
                const snap = await getDocFromCache(docRef);
                window.__flipboardLastSource = "firestore:cache";
                if (!snap.exists()) throw new Error(`${labelForErrors} not found (cache).`);
                const raw = snap.get(FIELD);
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${labelForErrors} field "${FIELD}" missing object payload (cache).`);
                return raw;
            } catch (e2) {
                console.warn("[EDITOR] board pack cache failed, trying default getDoc:", e2?.code || e2?.message || e2);
            }

            const snap = await getDoc(docRef);
            window.__flipboardLastSource = "firestore:getDoc";
            if (!snap.exists()) throw new Error(`${labelForErrors} not found.`);
            const raw = snap.get(FIELD);
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${labelForErrors} field "${FIELD}" missing object payload.`);
            return raw;
        }

        window.loadStagePack = async function () {
            const user = auth.currentUser;
            if (!user) throw new Error("Not authenticated.");
            const deviceId = getActiveDeviceId();
            if (!deviceId) throw new Error("No active device selected.");
            const info = await getDeviceBoardPackInfo(db, user.uid, deviceId);
            const ref = boardPackDocRef(db, user.uid, info.boardPackId);
            console.log("[EDITOR] load boardPack →", ref.path);
            const loaded = await loadBoardPackObjectDoc(ref, "boardPack");
            return ensurePackDefaults(loaded);
        };

        window.saveStagePack = async function (packObj) {
            const user = auth.currentUser;
            if (!user) throw new Error("Not authenticated.");
            const deviceId = getActiveDeviceId();
            if (!deviceId) throw new Error("No active device selected.");
            const info = await getDeviceBoardPackInfo(db, user.uid, deviceId);
            const ref = boardPackDocRef(db, user.uid, info.boardPackId);
            console.log("[EDITOR] save boardPack →", ref.path);
            const payload = JSON.parse(JSON.stringify(packObj));
            await setDoc(ref, {
                data: payload,
                updatedAt: serverTimestamp()
            }, { merge: true });
        };



        window.loadEventsPack = async function () {
            const user = auth.currentUser;
            if (!user) throw new Error("Not authenticated.");

            const ref = accountEventsRef(db, user.uid);
            console.log("[EDITOR] load account events →", ref.path);

            const snap = await getDoc(ref);

            if (!snap.exists()) {
                const seed = makeSeedEvents();
                await setDoc(ref, {
                    data: JSON.stringify(seed),
                    updatedAt: serverTimestamp()
                }, { merge: true });
                return seed;
            }

            const raw = snap.get("data");
            return raw ? JSON.parse(raw) : makeSeedEvents();
        };

        window.saveEventsPack = async function (eventsObj) {
            const user = auth.currentUser;
            if (!user) throw new Error("Not authenticated.");

            const ref = accountEventsRef(db, user.uid);
            console.log("[EDITOR] save account events →", ref.path);

            await setDoc(ref, {
                data: JSON.stringify(eventsObj),
                updatedAt: serverTimestamp()
            }, { merge: true });
        };

        // Convenience: open devices modal on first boot if needed.
        window.__flipeditorOpenDevices = openDevicesModal;

        return true;
    } catch (err) {
        window.__flipboardFirestoreError = err;
        console.error("[EDITOR] Firestore bootstrap failed:", err);
        return false;
    }
})();


function syncWeatherFooterHeight() {
    try {
        const splitRow = document.querySelector('.split');
        const cb = document.getElementById('chkBoardWeather') || document.getElementById('boardWeather') || document.querySelector('input[type="checkbox"][data-role="boardWeather"]') || document.querySelector('#boardWeatherRow input[type="checkbox"]');
        if (!splitRow) return;
        const on = !!(cb && cb.checked);
        splitRow.classList.toggle('weather-active', on);
    } catch (e) { /* ignore */ }

    // Expose for other script blocks (prevents ReferenceError across IIFEs)
    try { window.syncWeatherFooterHeight = syncWeatherFooterHeight; } catch (e) { }
}

