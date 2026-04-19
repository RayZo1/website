// ═══════════════════════════════════════════════════════════
//  Ace Web Portal — Client Application
//  SPA: login, dashboard, configs, admin
// ═══════════════════════════════════════════════════════════

// --- Configuration ---
// Set this to your API URL (justrunmyapp or localhost for dev)
const API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://a14093-4e0b.f.jrnm.app"; // Your justrunmyapp URL

// --- State ---
let token = null;
let isAdmin = false;
let currentUser = null;
let configs = [];
let selectedConfigId = null;
let selectedFile = null;

// ═══════════════════════════════════════════════════════════
//  API Helpers
// ═══════════════════════════════════════════════════════════

async function api(method, path, body = null, isFormData = false) {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (!isFormData) headers["Content-Type"] = "application/json";

    const opts = { method, headers };
    if (body) {
        opts.body = isFormData ? body : JSON.stringify(body);
    }

    try {
        const res = await fetch(`${API_BASE}${path}`, opts);
        if (res.status === 401) {
            doLogout();
            return { success: false, message: "Session expired" };
        }
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return await res.json();
        }
        // For file downloads
        if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
            return { success: true, blob: await res.blob(), filename: getFilenameFromResponse(res) };
        }
        const text = await res.text();
        return { success: res.ok, message: text };
    } catch (err) {
        return { success: false, message: "Connection error" };
    }
}

function getFilenameFromResponse(res) {
    const cd = res.headers.get("content-disposition") || "";
    const match = cd.match(/filename="?(.+?)"?$/);
    return match ? match[1] : "ace-latest.zip";
}

// ═══════════════════════════════════════════════════════════
//  View Router
// ═══════════════════════════════════════════════════════════

function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const view = document.getElementById(`view-${name}`);
    if (view) view.classList.add("active");

    if (name === "dashboard") loadDashboard();
    if (name === "configs") loadConfigs();
    if (name === "admin") loadAdmin();
}

function showStatus(id, msg, type = "error") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.classList.remove("hidden");
    if (type === "success") {
        setTimeout(() => el.classList.add("hidden"), 3000);
    }
}

function hideStatus(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════
//  Login
// ═══════════════════════════════════════════════════════════

async function doLogin() {
    const keyInput = document.getElementById("login-key");
    const key = keyInput.value.trim();
    if (!key) return showStatus("login-error", "Enter a license key", "error");

    hideStatus("login-error");
    const btn = document.getElementById("btn-login");
    btn.disabled = true;
    btn.textContent = "Logging in...";

    const res = await api("POST", "/api/web/login", { license: key });

    btn.disabled = false;
    btn.textContent = "Login";

    if (!res.success) {
        return showStatus("login-error", res.message || res.detail || "Login failed", "error");
    }

    token = res.token;
    isAdmin = res.admin;
    currentUser = res;
    keyInput.value = "";

    if (isAdmin) {
        showView("admin");
    } else {
        showView("dashboard");
    }
}

function doLogout() {
    token = null;
    isAdmin = false;
    currentUser = null;
    configs = [];
    selectedConfigId = null;
    showView("login");
}

// Enter key on login
document.getElementById("login-key").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
});

// ═══════════════════════════════════════════════════════════
//  Dashboard
// ═══════════════════════════════════════════════════════════

async function loadDashboard() {
    const res = await api("GET", "/api/web/me");
    if (!res || res.admin) return;

    document.getElementById("dash-license").textContent = res.license || "—";
    document.getElementById("dash-type").textContent = (res.type || "—").toUpperCase();
    document.getElementById("dash-expiry").textContent = res.expiry || "—";
    document.getElementById("dash-hwid").textContent = res.hwid || "—";
}

async function downloadLatest() {
    const statusEl = document.getElementById("download-status");
    statusEl.textContent = "Downloading...";
    statusEl.classList.remove("hidden");

    try {
        const headers = { "Authorization": `Bearer ${token}` };
        const res = await fetch(`${API_BASE}/api/web/download`, { headers });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            statusEl.textContent = data.detail || "No builds available";
            return;
        }

        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") || "";
        const match = cd.match(/filename="?(.+?)"?$/);
        const filename = match ? match[1] : "ace-latest.zip";

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);

        statusEl.textContent = "Download started!";
        setTimeout(() => statusEl.classList.add("hidden"), 2000);
    } catch {
        statusEl.textContent = "Download failed";
    }
}

// ═══════════════════════════════════════════════════════════
//  Configs
// ═══════════════════════════════════════════════════════════

async function loadConfigs() {
    const res = await api("GET", "/api/web/configs");
    configs = res.configs || [];
    renderConfigList();

    if (selectedConfigId) {
        const exists = configs.find(c => c.id === selectedConfigId);
        if (exists) {
            selectConfig(selectedConfigId);
        } else {
            selectedConfigId = null;
            showConfigEmpty();
        }
    } else {
        showConfigEmpty();
    }
}

function renderConfigList() {
    const list = document.getElementById("config-list");
    const countInfo = configs.length >= 10 ? " (max)" : "";

    document.getElementById("btn-new-config").disabled = configs.length >= 10;

    if (configs.length === 0) {
        list.innerHTML = `<div style="padding: 16px; color: var(--text-dim); font-size: 12px; text-align: center;">No configs yet</div>`;
        return;
    }

    list.innerHTML = configs.map(c => `
        <div class="config-item ${c.id === selectedConfigId ? 'active' : ''}" onclick="selectConfig(${c.id})">
            <span class="config-item-name">${escHtml(c.name)}</span>
            ${c.is_active ? '<span class="config-item-badge">ACTIVE</span>' : ''}
        </div>
    `).join("");
}

function showConfigEmpty() {
    document.getElementById("config-empty").classList.remove("hidden");
    document.getElementById("config-editor").classList.add("hidden");
}

async function selectConfig(id) {
    selectedConfigId = id;
    renderConfigList();

    const res = await api("GET", `/api/web/configs/${id}`);
    if (!res || res.detail) {
        showConfigEmpty();
        return;
    }

    document.getElementById("config-empty").classList.add("hidden");
    document.getElementById("config-editor").classList.remove("hidden");
    document.getElementById("config-name").value = res.name || "";
    document.getElementById("config-text").value = res.config_text || "";

    const activateBtn = document.getElementById("btn-activate");
    if (res.is_active) {
        activateBtn.textContent = "Active ✓";
        activateBtn.disabled = true;
        activateBtn.className = "btn btn-small btn-accent";
    } else {
        activateBtn.textContent = "Set Active";
        activateBtn.disabled = false;
        activateBtn.className = "btn btn-small btn-secondary";
    }

    hideStatus("config-status");
}

async function createConfig() {
    if (configs.length >= 10) return;

    const res = await api("POST", "/api/web/configs", {
        name: `Config ${configs.length + 1}`,
        config_text: "",
    });

    if (res.success) {
        selectedConfigId = res.id;
        await loadConfigs();
    }
}

async function saveConfig() {
    if (!selectedConfigId) return;

    const name = document.getElementById("config-name").value.trim();
    const config_text = document.getElementById("config-text").value;

    const res = await api("PUT", `/api/web/configs/${selectedConfigId}`, { name, config_text });

    if (res.success) {
        showStatus("config-status", "Saved", "success");
        loadConfigs();
    } else {
        showStatus("config-status", res.detail || res.message || "Save failed", "error");
    }
}

async function deleteConfig() {
    if (!selectedConfigId) return;
    if (!confirm("Delete this config?")) return;

    const res = await api("DELETE", `/api/web/configs/${selectedConfigId}`);
    if (res.success) {
        selectedConfigId = null;
        showConfigEmpty();
        loadConfigs();
    }
}

async function activateConfig() {
    if (!selectedConfigId) return;

    const res = await api("PUT", `/api/web/configs/${selectedConfigId}/activate`);
    if (res.success) {
        showStatus("config-status", "Config activated", "success");
        loadConfigs();
        selectConfig(selectedConfigId);
    }
}

// ═══════════════════════════════════════════════════════════
//  Admin
// ═══════════════════════════════════════════════════════════

async function loadAdmin() {
    await loadServerConfig();
    await loadLicenses();
}

async function loadServerConfig() {
    const res = await api("GET", "/api/admin/server-config");
    if (!res) return;

    document.getElementById("stat-total").textContent = res.total_licenses || 0;
    document.getElementById("stat-active").textContent = res.active_count || 0;
    document.getElementById("stat-banned").textContent = res.banned_count || 0;
    document.getElementById("stat-version").textContent = res.version || "—";

    document.getElementById("srv-version").value = res.version || "";
    document.getElementById("srv-config").value = res.config_text || "";
    document.getElementById("srv-script").value = res.script_text || "";

    const buildEl = document.getElementById("current-build");
    if (res.latest_build) {
        const date = new Date(res.latest_build.uploaded_at * 1000).toLocaleString();
        buildEl.innerHTML = `Current build: <strong>${escHtml(res.latest_build.filename)}</strong> (${res.latest_build.version}) — uploaded ${date}`;
    } else {
        buildEl.innerHTML = "No builds uploaded yet.";
    }
}

async function loadLicenses() {
    const res = await api("GET", "/api/admin/licenses");
    const tbody = document.getElementById("license-tbody");

    if (!res.licenses || res.licenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-dim); padding: 24px;">No licenses</td></tr>`;
        return;
    }

    tbody.innerHTML = res.licenses.map(l => {
        const statusBadge = l.banned
            ? '<span class="badge badge-banned">Banned</span>'
            : (l.time_left === "Expired" ? '<span class="badge badge-expired">Expired</span>' : '<span class="badge badge-active">Active</span>');

        return `<tr>
            <td class="key-cell" onclick="copyToClipboard('${l.key}')" title="Click to copy">${l.key}</td>
            <td>${l.type.toUpperCase()}</td>
            <td>${l.time_left}</td>
            <td style="font-size:11px; color:var(--text-muted)">${l.hwid}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    ${l.banned
                        ? `<button class="btn btn-small btn-secondary" onclick="unbanLicense('${l.key}')">Unban</button>`
                        : `<button class="btn btn-small btn-danger" onclick="banLicense('${l.key}')">Ban</button>`
                    }
                    <button class="btn btn-small btn-secondary" onclick="resetHwid('${l.key}')">Reset</button>
                    <button class="btn btn-small btn-danger" onclick="deleteLicense('${l.key}')">×</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function switchAdminTab(tab, btnEl) {
    document.querySelectorAll(".admin-section").forEach(s => s.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`admin-${tab}`).classList.remove("hidden");
    btnEl.classList.add("active");
}

async function generateLicense() {
    const duration = document.getElementById("gen-duration").value;
    const res = await api("POST", "/api/admin/licenses", { duration });

    if (res.success) {
        copyToClipboard(res.key);
        loadLicenses();
        loadServerConfig();
    }
}

async function banLicense(key) {
    await api("PUT", `/api/admin/licenses/${key}/ban`);
    loadLicenses();
    loadServerConfig();
}

async function unbanLicense(key) {
    await api("PUT", `/api/admin/licenses/${key}/unban`);
    loadLicenses();
    loadServerConfig();
}

async function resetHwid(key) {
    await api("PUT", `/api/admin/licenses/${key}/resetwid`);
    loadLicenses();
}

async function deleteLicense(key) {
    if (!confirm(`Delete license ${key}?`)) return;
    await api("DELETE", `/api/admin/licenses/${key}`);
    loadLicenses();
    loadServerConfig();
}

async function updateVersion() {
    const version = document.getElementById("srv-version").value.trim();
    if (!version) return;
    const res = await api("PUT", "/api/admin/version", { version });
    if (res.success) {
        showStatus("server-status", `Version updated to ${version}`, "success");
        loadServerConfig();
    }
}

async function updateServerConfig() {
    const config = document.getElementById("srv-config").value;
    const res = await api("PUT", "/api/admin/config", { config });
    if (res.success) showStatus("server-status", "Default config saved", "success");
}

async function updateScript() {
    const script = document.getElementById("srv-script").value;
    const res = await api("PUT", "/api/admin/script", { script });
    if (res.success) showStatus("server-status", `Script saved (${res.size} chars)`, "success");
}

// ═══════════════════════════════════════════════════════════
//  Upload
// ═══════════════════════════════════════════════════════════

(function initUpload() {
    const zone = document.getElementById("upload-zone");
    const fileInput = document.getElementById("upload-file");
    if (!zone || !fileInput) return;

    zone.addEventListener("click", () => fileInput.click());

    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            selectedFile = e.dataTransfer.files[0];
            updateFileDisplay();
        }
    });

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            selectedFile = fileInput.files[0];
            updateFileDisplay();
        }
    });
})();

function updateFileDisplay() {
    const zone = document.getElementById("upload-zone");
    const content = zone.querySelector(".upload-content");
    if (selectedFile) {
        const sizeMB = (selectedFile.size / 1024 / 1024).toFixed(1);
        content.innerHTML = `<span class="upload-icon">📦</span><p><strong>${escHtml(selectedFile.name)}</strong> (${sizeMB} MB)</p>`;
    }
}

async function uploadBuild() {
    if (!selectedFile) return showStatus("upload-status", "Select a .zip file first", "error");

    const version = document.getElementById("upload-version").value.trim();
    if (!version) return showStatus("upload-status", "Enter a version number", "error");

    if (!selectedFile.name.endsWith(".zip")) {
        return showStatus("upload-status", "Only .zip files allowed", "error");
    }

    const btn = document.getElementById("btn-upload");
    btn.disabled = true;
    btn.textContent = "Uploading...";
    hideStatus("upload-status");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("version", version);

    const res = await api("POST", "/api/admin/upload", formData, true);

    btn.disabled = false;
    btn.textContent = "Upload";

    if (res.success) {
        showStatus("upload-status", `Uploaded ${res.filename} (${res.version})`, "success");
        selectedFile = null;
        document.getElementById("upload-file").value = "";
        document.getElementById("upload-version").value = "";
        const zone = document.getElementById("upload-zone");
        zone.querySelector(".upload-content").innerHTML = `<span class="upload-icon">📦</span><p>Drag & drop a <strong>.zip</strong> file here, or click to select</p>`;
        loadServerConfig();
    } else {
        showStatus("upload-status", res.detail || res.message || "Upload failed", "error");
    }
}

// ═══════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════

function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    });
}

// ═══════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════

showView("login");
