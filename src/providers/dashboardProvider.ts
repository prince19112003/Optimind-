// ─────────────────────────────────────────────────────────────────────────────
// src/providers/dashboardProvider.ts  –  Minimalist Webview Dashboard
// KEY DESIGN DECISIONS:
//   1. style-src uses 'unsafe-inline' — required for element.style.X to work
//   2. NO external resources — everything is inline, no font-src needed
//   3. JS script is minimal — only updates the ring and handles postMessage
//   4. retainContextWhenHidden=true — panel stays loaded when switching tabs
// ─────────────────────────────────────────────────────────────────────────────
import * as vscode from 'vscode';

export type DashboardMessage =
    | { type: 'changeProvider'; provider: string }
    | { type: 'changeModel';    model: string }
    | { type: 'pullModel';      model: string }
    | { type: 'setApiKey' }
    | { type: 'analyzeNow' }
    | { type: 'scanWorkspace' }
    | { type: 'healthCheck' }
    | { type: 'refreshModels' }
    | { type: 'applyInline' }
    | { type: 'clearCache' }
    | { type: 'restartExtension' };

export class DashboardProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'optimind-pro.dashboard';
    private _view?: vscode.WebviewView;

    // ── Callbacks wired by CommandManager ────────────────────────────────────
    public onMessage?:      (msg: DashboardMessage) => void;
    public onReady?:        () => void;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _ctx: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._buildHtml();

        // Forward all messages from webview to the extension backend.
        // MUST be wrapped \u2014 an unhandled async throw in onMessage kills the IPC channel permanently.
        webviewView.webview.onDidReceiveMessage(async (msg: DashboardMessage) => {
            try {
                await this.onMessage?.(msg);
            } catch (e: any) {
                // Silently absorb \u2014 errors are handled upstream in CommandManager
            }
        });

        // Give the DOM ~300ms to fully parse before pushing initial state
        setTimeout(() => this.onReady?.(), 300);
    }

    // ── Public API (called by CommandManager) ─────────────────────────────────

    public setScore(score: number, details: string[] = []): void {
        this._post({ type: 'setScore', score, details });
    }

    public setEngineStatus(online: boolean): void {
        this._post({ type: 'engineStatus', online });
    }

    public setLoading(active: boolean): void {
        this._post({ type: 'setLoading', active });
    }

    public startStream(): void {
        this._post({ type: 'startStream' });
    }

    public streamToken(token: string): void {
        this._post({ type: 'streamToken', token });
    }

    public showError(msg: string): void {
        this._post({ type: 'showError', msg });
    }

    public showResult(code: string, complexity: string, reason: string, fix: string, lang: string): void {
        this._post({ type: 'showResult', code, complexity, reason, fix, lang });
    }

    public updateModels(models: string[], recommended: string, safe: string[], allTiers: Record<string, {title: string, desc: string}>, activeModel: string): void {
        this._post({ type: 'updateModels', models, recommended, safe, allTiers, activeModel });
    }

    public updateProvider(provider: string): void {
        this._post({ type: 'updateProvider', provider });
    }

    public updateSystemInfo(info: string): void {
        this._post({ type: 'systemInfo', info });
    }

    public notifyPullComplete(): void {
        this._post({ type: 'pullComplete' });
    }

    public notifyPullError(msg: string): void {
        this._post({ type: 'pullError', msg });
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private _post(data: object): void {
        this._view?.webview.postMessage(data);
    }

    private _buildHtml(): string {
        // No nonce needed for inline styles since we use unsafe-inline.
        // Script still uses a nonce for extra security.
        const scriptNonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}';">
<title>OptiMind</title>
<style>
/* ── Hide Scrollbar (Keep Scrolling) ── */
*::-webkit-scrollbar { display: none; }
* { -ms-overflow-style: none; scrollbar-width: none; }

/* ── Reset & Modern Base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: 'Inter', var(--vscode-font-family, -apple-system, sans-serif);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: transparent;
    padding: 12px 14px 24px;
    overflow-x: hidden;
}

/* ── Typography & Headings ── */
.section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    margin: 20px 0 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.8;
}

/* ── Engine dot glow ── */
.dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #00ff88;
    box-shadow: 0 0 8px #00ff88;
    flex-shrink: 0;
    transition: all 0.5s ease;
}
.dot.offline { background: #ff3366; box-shadow: 0 0 8px #ff3366; }

/* ── Glassmorphism Cards ── */
.glass-panel {
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.03));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

/* ── Health card ── */
.health-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    margin-bottom: 8px;
    transition: transform 0.2s ease;
}
.health-card:hover { transform: translateY(-1px); }

.ring-svg { flex-shrink: 0; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.2)); }
.ring-bg { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 5; }
.ring-fg {
    fill: none;
    stroke: #00ff88;
    stroke-width: 5;
    stroke-linecap: round;
    transform-origin: center;
    transform: rotate(-90deg);
    transition: stroke-dashoffset 1s cubic-bezier(.4,0,.2,1), stroke 0.4s;
    filter: drop-shadow(0 0 4px rgba(0,255,136,0.3));
}
.score-value {
    font-size: 28px;
    font-weight: 900;
    color: #00ff88;
    line-height: 1;
    text-shadow: 0 0 10px rgba(0,255,136,0.2);
    letter-spacing: -0.03em;
    transition: color 0.4s;
}
.score-label { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); margin-top: 4px; opacity: 0.8;}

/* ── System info ── */
.sysinfo {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-top: 6px;
    font-style: italic;
    opacity: 0.6;
}

/* ── Divider ── */
hr { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 16px 0; }

/* ── Buttons (Premium Feel) ── */
.btn {
    display: block;
    width: 100%;
    padding: 10px 14px;
    margin-bottom: 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    display: flex;
    align-items: center;
    gap: 8px;
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.2); opacity: 1 !important; }
.btn:active { transform: translateY(0); }

.btn-primary {
    background: linear-gradient(135deg, var(--vscode-button-background, #0e639c), #007acc);
    color: var(--vscode-button-foreground, #fff);
    border-top: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 4px 10px rgba(14,99,156,0.3);
}
.btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.05));
    color: var(--vscode-button-secondaryForeground, #ccc);
    border: 1px solid rgba(255,255,255,0.05);
}
.btn-secondary:hover { background: rgba(255,255,255,0.1); }

/* ── Inputs & Selects ── */
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
.row-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    min-width: 50px;
    flex-shrink: 0;
}
select, input[type="text"] {
    flex: 1;
    background: var(--vscode-dropdown-background, rgba(0,0,0,0.2));
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
}
option {
    background: var(--vscode-dropdown-background, #252526);
    color: var(--vscode-dropdown-foreground, #ccc);
}
select:focus, input[type="text"]:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007acc);
    box-shadow: 0 0 0 2px rgba(0,122,204,0.2);
}

.btn-pull {
    padding: 6px 12px;
    border-radius: 6px;
    background: linear-gradient(135deg, #0e639c, #007acc);
    color: #fff;
    border: none;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 6px rgba(14,99,156,0.3);
}
.btn-pull:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(14,99,156,0.4); }
.btn-pull:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* ── Result Panes (Terminal Style) ── */
#summary-pane {
    padding: 12px 14px;
    margin-bottom: 12px;
    border-left: 3px solid #007acc;
}
.sum-label { font-weight: 700; color: var(--vscode-foreground); margin-right: 4px; }

.terminal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    background: rgba(0,0,0,0.3);
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.mac-dots { display: flex; gap: 5px; }
.mac-dot { width: 10px; height: 10px; border-radius: 50%; }
.mac-red { background: #ff5f56; } .mac-yellow { background: #ffbd2e; } .mac-green { background: #27c93f; }

pre {
    margin: 0; padding: 12px 14px;
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.6;
    overflow-y: auto; max-height: 240px;
    white-space: pre-wrap; word-wrap: break-word;
    background: rgba(0,0,0,0.15);
}

/* ── Model Cards ── */
.model-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.m-card {
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.02);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex; flex-direction: column; gap: 5px;
    position: relative; overflow: hidden;
}
.m-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); transform: translateY(-1px); }
.m-card.active { border-color: #00ff88; background: rgba(0,255,136,0.05); box-shadow: 0 0 15px rgba(0,255,136,0.1) inset; }

.m-head { display: flex; justify-content: space-between; align-items: center; }
.m-title { font-weight: 800; font-size: 12px; color: var(--vscode-foreground); }
.m-tag { font-size: 9px; font-weight: 800; padding: 3px 6px; border-radius: 5px; text-transform: uppercase; letter-spacing: 0.05em; }
.tag-inst { background: rgba(0,255,136,0.15); color: #00ff88; }
.tag-pull { background: rgba(0,122,204,0.2); color: #569cd6; }
.m-desc { font-size: 10px; color: var(--vscode-descriptionForeground); font-style: italic; line-height: 1.3; }

/* ── Key button ── */
.btn-key {
    width: 100%; padding: 8px;
    border: 1px dashed rgba(255,255,255,0.2); border-radius: 8px;
    background: transparent; color: var(--vscode-foreground);
    font-size: 11px; font-weight: 600; cursor: pointer;
    transition: all 0.2s;
}
.btn-key:hover { background: rgba(255,255,255,0.05); border-color: var(--vscode-focusBorder); }

/* ── Loading overlays ── */
#loading-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    z-index: 99; flex-direction: column; gap: 12px;
    align-items: center; justify-content: center;
}
#loading-overlay.active { display: flex; }
.spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #007acc; border-radius: 50%;
    animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Error banner ── */
#err {
    display: none; background: rgba(255,51,102,0.1);
    border: 1px solid rgba(255,51,102,0.3); border-radius: 6px;
    padding: 8px 12px; font-size: 11px; font-weight: 500;
    color: #ff3366; margin-bottom: 12px; gap: 8px; align-items: flex-start;
    box-shadow: 0 4px 10px rgba(255,51,102,0.1);
}
#err.active { display: flex; }
#err-close { cursor: pointer; margin-left: auto; opacity: 0.7; }
#err-close:hover { opacity: 1; }
</style>
</head>
<body>

<!-- ── Top Bar: Refresh ── -->
<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
  <span style="font-size:13px; font-weight:900; letter-spacing:-0.01em;">OptiMind</span>
  <div style="display:flex; gap:6px;">
    <button id="btn-clear-cache" title="Clear AI Cache" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:var(--vscode-descriptionForeground); font-size:10px; font-weight:700; cursor:pointer; padding:4px 8px; transition:all 0.2s;">🗑️ Cache</button>
    <button id="btn-restart" title="Reload Extension" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:var(--vscode-descriptionForeground); font-size:10px; font-weight:700; cursor:pointer; padding:4px 8px; transition:all 0.2s;">🔄 Restart</button>
  </div>
</div>

<!-- ── Loading Overlay ── -->
<div id="loading-overlay">
    <div class="spinner"></div>
    <span style="font-size:12px; font-weight:600; color:#fff; letter-spacing:0.05em; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Analyzing context...</span>
</div>

<!-- ── Result Panes ── -->
<div id="result-container" style="display:none; margin-bottom:18px;">
  
  <div id="summary-pane" class="glass-panel">
    <div style="font-size:9px; font-weight:800; letter-spacing:0.1em; opacity:0.6; margin-bottom:10px;">ANALYSIS SUMMARY</div>
    <div id="sum-complexity" style="font-size:12px; margin-bottom:6px; line-height:1.4; text-align: justify;"></div>
    <div id="sum-reason"     style="font-size:12px; margin-bottom:6px; line-height:1.4; text-align: justify;"></div>
    <div id="sum-fix"        style="font-size:12px; line-height:1.4; text-align: justify;"></div>
  </div>

  <div class="glass-panel" style="overflow:hidden; border:1px solid rgba(255,255,255,0.08);">
    <div class="terminal-header">
      <div class="mac-dots">
         <div class="mac-dot mac-red"></div>
         <div class="mac-dot mac-yellow"></div>
         <div class="mac-dot mac-green"></div>
      </div>
      <span id="code-lang-tag" style="font-size:10px; font-weight:700; opacity:0.5; text-transform:uppercase;"></span>
    </div>
    <pre id="stream-code" style="scrollbar-width:none; -ms-overflow-style:none;"></pre>
  </div>

  <button class="btn btn-primary" id="btn-apply-inline" style="margin-top:12px; justify-content:center; padding:12px;">✅ Apply Code to Editor</button>
</div>

<!-- ── Streaming progress ── -->
<div id="stream-container" style="display:none; margin-bottom:18px;">
    <div style="font-size:11px; font-weight:800; margin-bottom:8px; color:var(--vscode-descriptionForeground); letter-spacing:0.05em;">AI IS GENERATING…</div>
    <pre id="stream-output" class="glass-panel" style="color:#00ff88; text-shadow: 0 0 5px rgba(0,255,136,0.3); border:1px solid rgba(0,255,136,0.2);"></pre>
</div>

<!-- ── Error Banner ── -->
<div id="err">
    <span id="err-text" style="line-height:1.4;">Error occurred.</span>
    <span id="err-close" title="Dismiss">✕</span>
</div>

<!-- ── Code Health ── -->
<div class="section-title">
    Code Health
    <span class="dot" id="dot" title="Engine status"></span>
</div>

<div class="health-card glass-panel">
    <svg class="ring-svg" width="56" height="56" viewBox="0 0 56 56">
        <circle class="ring-bg" cx="28" cy="28" r="24"/>
        <circle class="ring-fg" id="ring-fg" cx="28" cy="28" r="24"/>
    </svg>
    <div style="flex:1;">
        <div class="score-value" id="score-val">100%</div>
        <div class="score-label">Active file quality</div>
        <div class="sysinfo" id="sysinfo"></div>
    </div>
</div>
<div id="health-details" style="margin-top:10px; display:flex; flex-direction:column; gap:6px; padding:0 4px;">
</div>

<hr>

<!-- ── Actions ── -->
<div class="section-title">Actions</div>
<button class="btn btn-primary"   id="btn-analyze">⚡ Optimize Selected Code</button>
<button class="btn btn-secondary" id="btn-scan">🔍 Scan Workspace for Debt</button>
<button class="btn btn-secondary" id="btn-health">🩺 Check Engine Status</button>

<hr>

<!-- ── AI Provider ── -->
<div class="section-title">AI Provider</div>

<div class="row">
    <span class="row-label">Engine</span>
    <select id="sel-provider">
        <option value="ollama">🖥️ Ollama (Local)</option>
        <option value="openai">🌐 OpenAI</option>
        <option value="gemini">✨ Gemini</option>
        <option value="groq">⚡ Groq (Fastest)</option>
    </select>
</div>

<details id="ollama-section" class="glass-panel" style="padding: 10px 14px; margin-top: 10px; margin-bottom: 20px;">
    <summary style="cursor: pointer; font-size: 12px; font-weight: 800; padding: 4px 0; outline: none; list-style: none; display: flex; align-items: center; justify-content: space-between;">
        <span>🤖 Local Model Configuration</span>
        <span style="font-size: 10px; opacity: 0.4; font-weight: 500;">Click to toggle</span>
    </summary>
    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
        <div class="row" style="justify-content: space-between; margin-bottom: 4px;">
            <span class="row-label" style="font-size:10px; letter-spacing:0.05em; text-transform:uppercase;">Highly Accurate Models</span>
            <span id="btn-refresh-models" title="Refresh install status" style="cursor:pointer; font-size:11px; opacity:0.8;">🔄 Sync</span>
        </div>
        
        <div id="model-grid" class="model-grid">
        </div>

        <div class="row" style="margin-top: 14px;">
            <input type="text" id="inp-custom" placeholder="Custom model e.g. qwen2:7b" />
            <button class="btn-pull" id="btn-pull">⬇️ Pull</button>
        </div>
    </div>
</details>

<div id="cloud-section" style="display:none; margin-top: 10px;">
    <button class="btn-key" id="btn-apikey">🔑 Set API Key (Secure Vault)</button>
</div>

<script nonce="${scriptNonce}">
(function () {
    'use strict';

    // ── VS Code API (must be called exactly once) ──────────────────────────
    const vscode = acquireVsCodeApi();

    // ── Ring constants ─────────────────────────────────────────────────────
    const RADIUS = 21;
    const CIRC = 2 * Math.PI * RADIUS;
    const ringFg = document.getElementById('ring-fg');
    ringFg.style.strokeDasharray  = CIRC + ' ' + CIRC;
    ringFg.style.strokeDashoffset = '0';

    // ── Helper functions ───────────────────────────────────────────────────
    function setScore(pct) {
        const offset = CIRC - (pct / 100) * CIRC;
        ringFg.style.strokeDashoffset = String(offset);
        const el = document.getElementById('score-val');
        if (el) el.textContent = pct + '%';
        const c = pct > 75 ? '#89d185' : pct > 45 ? '#cca700' : '#f48771';
        ringFg.style.stroke = c;
        if (el) el.style.color = c;
    }

    function setEngineStatus(online) {
        const dot = document.getElementById('dot');
        if (!dot) return;
        if (online) {
            dot.className = 'dot';
            dot.title = 'Engine online';
        } else {
            dot.className = 'dot offline';
            dot.title = 'Engine offline — start Ollama';
        }
    }

    function showError(msg) {
        const el = document.getElementById('err');
        const tx = document.getElementById('err-text');
        if (el && tx) { tx.textContent = msg; el.classList.add('active'); }
    }

    function hideError() {
        const el = document.getElementById('err');
        if (el) el.classList.remove('active');
    }

    function setLoading(active) {
        const el = document.getElementById('loading-overlay');
        if (el) {
            if (active) el.classList.add('active');
            else        el.classList.remove('active');
        }
    }

    function setProvider(p) {
        var selEl = document.getElementById('sel-provider');
        if (selEl) selEl.value = p;
        const ol = document.getElementById('ollama-section');
        const cl = document.getElementById('cloud-section');
        if (!ol || !cl) return;
        if (p === 'ollama') {
            ol.style.display = 'block';
            cl.style.display = 'none';
        } else {
            ol.style.display = 'none';
            cl.style.display = 'block';
        }
    }

    // ── Button listeners ────────────────────────────────────────────────────
    function post(type, extra) {
        try { hideError(); } catch(e) {}
        try { vscode.postMessage(Object.assign({ type: type }, extra || {})); } catch(e) {}
    }

    // Safe bind helper \u2014 prevents null crash killing the whole JS context
    function on(id, event, fn) {
        try {
            var el = document.getElementById(id);
            if (el) el.addEventListener(event, fn);
        } catch(e) {}
    }

    on('btn-analyze', 'click', function () { post('analyzeNow'); });
    on('btn-scan',    'click', function () { post('scanWorkspace'); });
    on('btn-health',  'click', function () { post('healthCheck'); });
    on('btn-apikey',  'click', function () { post('setApiKey'); });
    on('err-close',   'click', hideError);

    on('btn-restart', 'click', function () {
        this.textContent = '⏳ Restarting...';
        var self = this;
        setTimeout(function() { post('restartExtension'); }, 300);
    });

    on('btn-clear-cache', 'click', function () {
        post('clearCache');
        this.textContent = '✅ Cleared!';
        var self = this;
        setTimeout(function() { self.textContent = '🗑️ Cache'; }, 2000);
    });

    on('btn-apply-inline', 'click', function () {
        post('applyInline');
        this.textContent = '\u2705 Applied!';
        var self = this;
        setTimeout(function () { self.textContent = '\u2705 Apply Code to Editor'; }, 2000);
    });

    on('sel-provider', 'change', function () {
        var p = this.value;
        setProvider(p);
        post('changeProvider', { provider: p });
    });

    on('btn-refresh-models', 'click', function () {
        this.style.opacity = '0.5';
        var self2 = this;
        setTimeout(function () { self2.style.opacity = '1'; }, 500);
        post('refreshModels');
    });

    on('btn-pull', 'click', function () {
        var inp = document.getElementById('inp-custom');
        var name = inp ? inp.value.trim() : '';
        if (!name) return;
        this.disabled = true;
        this.textContent = '\u23f3';
        hideError();
        post('pullModel', { model: name });
    });

    on('inp-custom', 'keydown', function (e) {
        if (e.key === 'Enter') {
            var btn = document.getElementById('btn-pull');
            if (btn) btn.click();
        }
    });

    // ── Syntax highlighter (basic token coloring) ──────────────────────────
    function highlight(code) {
        try {
            var esc = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            esc = esc.replace(/([0-9]+\.?[0-9]*)/g, '<span style="color:#b5cea8;">$1</span>');
            var kwRe = new RegExp('(\\b)(return|if|else|for|while|const|let|var|function|class|import|export|from|default|new|typeof|void|null|undefined|true|false|int|char|bool|float|double|long|struct|enum|static|async|await|try|catch|throw|interface|type|extends|implements)(\\b)', 'g');
            esc = esc.replace(kwRe, '$1<span style="color:#569cd6;">$2</span>$3');
            return esc;
        } catch(e) { return code; }
    }

    // ── Message listener (from extension backend) ──────────────────────────
    window.addEventListener('message', function (e) {
        var msg = e.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'setScore': {
                setScore(msg.score);
                var hd = document.getElementById('health-details');
                if (hd && msg.details) {
                    hd.innerHTML = '';
                    msg.details.forEach(function(d) {
                        var div = document.createElement('div');
                        div.style.fontSize = '9px';
                        div.style.color = 'var(--vscode-descriptionForeground)';
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.gap = '5px';
                        div.innerHTML = '<span style="opacity:0.5;">•</span> ' + d;
                        hd.appendChild(div);
                    });
                }
                break;
            }
            case 'engineStatus': setEngineStatus(msg.online); break;
            case 'setLoading':  {
                setLoading(msg.active);
                // When loading ends, hide the raw stream progress pane
                if (!msg.active) {
                    var sc = document.getElementById('stream-container');
                    if (sc) sc.style.display = 'none';
                }
                break;
            }
            case 'startStream': {
                // Show streaming progress, hide old result
                var sc = document.getElementById('stream-container');
                if (sc) sc.style.display = 'block';
                var rc = document.getElementById('result-container');
                if (rc) rc.style.display = 'none';
                var so = document.getElementById('stream-output');
                if (so) so.textContent = '';
                // Hide spinner while streaming
                var lo = document.getElementById('loading-overlay');
                if (lo) lo.classList.remove('active');
                break;
            }
            case 'streamToken': {
                var so = document.getElementById('stream-output');
                if (so) {
                    so.textContent += msg.token;
                    so.scrollTop = so.scrollHeight;
                }
                break;
            }
            case 'showResult': {
                // Hide streaming pane, show dual-pane result
                var sc2 = document.getElementById('stream-container');
                if (sc2) sc2.style.display = 'none';
                var rc2 = document.getElementById('result-container');
                if (rc2) rc2.style.display = 'block';

                // Summary lines
                var sc3 = document.getElementById('sum-complexity');
                if (sc3) sc3.innerHTML = msg.complexity ? '📊 <strong>Complexity:</strong> ' + msg.complexity : '';
                var sr  = document.getElementById('sum-reason');
                if (sr)  sr.innerHTML  = msg.reason    ? '⚠️ <strong>Problem:</strong> '    + msg.reason    : '';
                var sf  = document.getElementById('sum-fix');
                if (sf)  sf.innerHTML  = msg.fix       ? '✅ <strong>Fix:</strong> '           + msg.fix       : '';

                // Code pane with syntax highlight
                var codeEl = document.getElementById('stream-code');
                if (codeEl) codeEl.innerHTML = highlight(msg.code || '');
                var lt = document.getElementById('code-lang-tag');
                if (lt) lt.textContent = msg.lang || '';
                break;
            }
            case 'showError':   setLoading(false); showError(msg.msg); break;
            case 'systemInfo':
                var si = document.getElementById('sysinfo');
                if (si) si.textContent = msg.info;
                break;
            case 'updateProvider': setProvider(msg.provider); break;
            case 'updateModels': {
                var grid = document.getElementById('model-grid');
                if (!grid) break;
                grid.innerHTML = '';
                var list = msg.models || [];
                var allTiers = msg.allTiers || {};
                var activeModel = msg.activeModel || msg.recommended;

                Object.keys(allTiers).forEach(function(mId) {
                    var isInstalled = list.includes(mId);
                    var t = allTiers[mId] || { title: mId, desc: '' };
                    var isActive = (mId === activeModel) && isInstalled; 
                    
                    var card = document.createElement('div');
                    card.className = 'm-card';
                    card.setAttribute('data-id', mId);
                    if (isActive) card.classList.add('active');
                    
                    var head = document.createElement('header');
                    head.className = 'm-head';
                    
                    var titleInfo = document.createElement('span');
                    titleInfo.className = 'm-title';
                    titleInfo.textContent = t.title;
                    
                    var tag = document.createElement('span');
                    tag.className = 'm-tag';
                    if (isInstalled) {
                        tag.classList.add('tag-inst');
                        tag.textContent = '✓ Ready';
                    } else {
                        tag.classList.add('tag-pull');
                        tag.textContent = '⬇️ Pull';
                        card.title = 'Click to auto-install this model';
                    }
                    
                    head.appendChild(titleInfo);
                    head.appendChild(tag);
                    
                    var descInfo = document.createElement('div');
                    descInfo.className = 'm-desc';
                    descInfo.textContent = t.desc;
                    
                    card.appendChild(head);
                    card.appendChild(descInfo);
                    
                    card.addEventListener('click', function() {
                        if (card.classList.contains('pulling')) return;
                        
                        if (!isInstalled) {
                            // 1-Click Pull!
                            card.classList.add('pulling');
                            var pullBtn = document.getElementById('btn-pull');
                            document.getElementById('inp-custom').value = mId;
                            if (pullBtn) pullBtn.click();
                        } else {
                            // Select Model!
                            post('changeModel', { model: mId });
                            Array.from(grid.children).forEach(function(c) {
                                c.classList.remove('active');
                            });
                            card.classList.add('active');
                        }
                    });
                    
                    grid.appendChild(card);
                });
                break;
            }
            case 'pullComplete':
                pullBtn.disabled = false;
                pullBtn.textContent = '⬇️ Pull';
                document.getElementById('inp-custom').value = '';
                break;
            case 'pullError':
                pullBtn.disabled = false;
                pullBtn.textContent = '⬇️ Pull';
                showError('Pull failed: ' + (msg.msg || 'unknown error'));
                break;
        }
    });

    // Initial state — tell backend we are ready
    vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
    }
}
