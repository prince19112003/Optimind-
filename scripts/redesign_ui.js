const fs = require('fs');

const path = 'src/providers/dashboardProvider.ts';
let content = fs.readFileSync(path, 'utf8');

const newUI = `<style>
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
    background: rgba(0,0,0,0.2);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
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

<!-- ── Loading Overlay ── -->
<div id="loading-overlay">
    <div class="spinner"></div>
    <span style="font-size:12px; font-weight:600; color:#fff; letter-spacing:0.05em; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Analyzing context...</span>
</div>

<!-- ── Result Panes ── -->
<div id="result-container" style="display:none; margin-bottom:18px;">
  
  <div id="summary-pane" class="glass-panel">
    <div style="font-size:9px; font-weight:800; letter-spacing:0.1em; opacity:0.6; margin-bottom:10px;">ANALYSIS SUMMARY</div>
    <div id="sum-complexity" style="font-size:12px; margin-bottom:6px; line-height:1.4;"></div>
    <div id="sum-reason"     style="font-size:12px; margin-bottom:6px; line-height:1.4;"></div>
    <div id="sum-fix"        style="font-size:12px; line-height:1.4;"></div>
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
    <pre id="stream-code"></pre>
  </div>

  <button class="btn btn-primary" id="btn-apply-inline" style="margin-top:12px; justify-content:center; padding:12px;">\u2705 Apply Code to Editor</button>
</div>

<!-- ── Streaming progress ── -->
<div id="stream-container" style="display:none; margin-bottom:18px;">
    <div style="font-size:11px; font-weight:800; margin-bottom:8px; color:var(--vscode-descriptionForeground); letter-spacing:0.05em;">AI IS GENERATING\u2026</div>
    <pre id="stream-output" class="glass-panel" style="color:#00ff88; text-shadow: 0 0 5px rgba(0,255,136,0.3); border:1px solid rgba(0,255,136,0.2);"></pre>
</div>

<!-- ── Error Banner ── -->
<div id="err">
    <span id="err-text" style="line-height:1.4;">Error occurred.</span>
    <span id="err-close" title="Dismiss">\u2715</span>
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
<button class="btn btn-primary"   id="btn-analyze">\u26A1 Optimize Selected Code</button>
<button class="btn btn-secondary" id="btn-scan">\uD83D\uDD0D Scan Workspace for Debt</button>
<button class="btn btn-secondary" id="btn-health">\uD83E\uDE7A Check Engine Status</button>

<hr>

<!-- ── AI Provider ── -->
<div class="section-title">AI Provider</div>

<div class="row">
    <span class="row-label">Engine</span>
    <select id="sel-provider">
        <option value="ollama">\uD83D\uDDA5\uFE0F Ollama (Local)</option>
        <option value="openai">\uD83C\uDF10 OpenAI</option>
        <option value="gemini">\u2728 Gemini</option>
    </select>
</div>

<details id="ollama-section" class="glass-panel" style="padding: 10px 14px; margin-top: 10px; margin-bottom: 20px;">
    <summary style="cursor: pointer; font-size: 12px; font-weight: 800; padding: 4px 0; outline: none; list-style: none; display: flex; align-items: center; justify-content: space-between;">
        <span>\uD83E\uDD16 Local Model Configuration</span>
        <span style="font-size: 10px; opacity: 0.4; font-weight: 500;">Click to toggle</span>
    </summary>
    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
        <div class="row" style="justify-content: space-between; margin-bottom: 4px;">
            <span class="row-label" style="font-size:10px; letter-spacing:0.05em; text-transform:uppercase;">Highly Accurate Models</span>
            <span id="btn-refresh-models" title="Refresh install status" style="cursor:pointer; font-size:11px; opacity:0.8;">\uD83D\uDD04 Sync</span>
        </div>
        
        <div id="model-grid" class="model-grid">
        </div>

        <div class="row" style="margin-top: 14px;">
            <input type="text" id="inp-custom" placeholder="Custom model e.g. qwen2:7b" />
            <button class="btn-pull" id="btn-pull">\u2B07\uFE0F Pull</button>
        </div>
    </div>
</details>

<div id="cloud-section" style="display:none; margin-top: 10px;">
    <button class="btn-key" id="btn-apikey">\uD83D\uDD11 Set API Key (Secure Vault)</button>
</div>`;

const startIndex = content.indexOf('<style>');
const endIndex = content.indexOf('<script nonce="${scriptNonce}">');

if(startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + newUI + "\n\n" + content.substring(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log('UI Overhauled Successfully');
} else {
    console.log('Could not find boundaries');
}
