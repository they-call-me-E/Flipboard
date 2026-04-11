import "./app.js";

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

function init() {
    loadEditorTheme();

    const btn = document.getElementById("themeToggle");
    if (btn && !btn.__themeBound) {
        btn.addEventListener("click", function () {
            const current = document.body.getAttribute("data-theme") || "dark";
            applyEditorTheme(current === "light" ? "dark" : "light");
        });
        btn.__themeBound = true;
    }
}

function applyEditorTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = next === "light" ? "☀ Light" : "🌙 Dark";
    try { localStorage.setItem("flipeditor_theme", next); } catch (_) { }
}

function loadEditorTheme() {
    let saved = "dark";
    try { saved = localStorage.getItem("flipeditor_theme") || "dark"; } catch (_) { }
    applyEditorTheme(saved);
}