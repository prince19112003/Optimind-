// ─────────────────────────────────────────────────────────────────────────────
// src/core/aiClient.ts  –  Unified AI Client (Ollama + OpenAI + Gemini + Groq)
// Supports streaming, circuit-breaker fallback, semantic cache, and model pull.
// ─────────────────────────────────────────────────────────────────────────────
import * as vscode from 'vscode';
import * as crypto  from 'crypto';
import axios        from 'axios';

export type Provider = 'ollama' | 'openai' | 'gemini' | 'groq';

export interface GenerateOptions {
    prompt:    string;
    language?: string;
    onToken?:  (token: string) => void;   // streaming callback
}

function cfg<T>(key: string): T {
    return vscode.workspace.getConfiguration('optimind-pro').get<T>(key)!;
}

// ── Semantic Cache ──────────────────────────────────────────────────────────────────
const _cache = new Map<string, string>();
let _cacheHits = 0;
let _cacheMisses = 0;

function _cacheKey(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

function _cacheGet(key: string): string | undefined {
    return cfg<boolean>('cacheEnabled') ? _cache.get(key) : undefined;
}

function _cacheSet(key: string, value: string): void {
    if (!cfg<boolean>('cacheEnabled')) return;
    _cache.set(key, value);
    // Cap cache at 50 entries (LRU-lite: delete oldest)
    if (_cache.size > 50) {
        _cache.delete(_cache.keys().next().value!);
    }
}

export function getCacheStats() { return { hits: _cacheHits, misses: _cacheMisses, size: _cache.size }; }
export function clearCache()    { _cache.clear(); _cacheHits = 0; _cacheMisses = 0; }

// ── Circuit Breaker ───────────────────────────────────────────────────────────────
let _failures = 0;
const FAILURE_THRESHOLD = 3;

function recordSuccess() { _failures = 0; }
function recordFailure() { _failures++; }
function isOpen()        { return _failures >= FAILURE_THRESHOLD; }

// ── AI Client ────────────────────────────────────────────────────────────────
export class AIClient {

    // ── Generate (main entry point) ───────────────────────────────────────────
    static async generate(opts: GenerateOptions): Promise<string> {
        if (isOpen()) {
            const choice = await vscode.window.showWarningMessage(
                `OptiMind: AI engine has failed ${_failures} times. Switch provider?`,
                'Switch to OpenAI', 'Switch to Gemini', 'Keep Trying'
            );
            if (choice === 'Switch to OpenAI') {
                await vscode.workspace.getConfiguration('optimind-pro')
                    .update('provider', 'openai', vscode.ConfigurationTarget.Global);
            } else if (choice === 'Switch to Gemini') {
                await vscode.workspace.getConfiguration('optimind-pro')
                    .update('provider', 'gemini', vscode.ConfigurationTarget.Global);
            }
            // Reset so next call goes through
            _failures = 0;
        }

        const provider = cfg<Provider>('provider');
        
        // ── Semantic Cache Check ─────────────────────────────────────────────
        // Skip cache for streaming (onToken) calls to allow live token display
        if (!opts.onToken) {
            const cacheKey = _cacheKey(opts.prompt);
            const cached   = _cacheGet(cacheKey);
            if (cached) {
                _cacheHits++;
                return cached;
            }
            _cacheMisses++;
            
            try {
                let result: string;
                if      (provider === 'ollama')  result = await this._ollama(opts);
                else if (provider === 'openai')  result = await this._openai(opts);
                else if (provider === 'groq')    result = await this._groq(opts);
                else                             result = await this._gemini(opts);
                _cacheSet(cacheKey, result);
                recordSuccess();
                return result;
            } catch (err: any) {
                recordFailure();
                throw this._formatError(err, provider);
            }
        }
        try {
            let result: string;
            if      (provider === 'ollama')  result = await this._ollama(opts);
            else if (provider === 'openai')  result = await this._openai(opts);
            else if (provider === 'groq')    result = await this._groq(opts);
            else                             result = await this._gemini(opts);
            recordSuccess();
            return result;
        } catch (err: any) {
            recordFailure();
            throw this._formatError(err, provider);
        }
    }

    private static _formatError(err: any, provider: string): Error {
        let details = err.message;
        if (err.response?.data) {
            if (typeof err.response.data === 'string') {
                try { details = JSON.parse(err.response.data).error || details; } catch { details = err.response.data; }
            } else if (err.response.data.error && typeof err.response.data.error === 'string') {
                details = err.response.data.error;
            }
        }
        if (err.response?.status === 500 && details.includes('500')) {
            details += ' (Likely "Out of Memory" or Context Limit Exceeded on local GPU)';
        }
        return new Error(`[${provider}] ${details}`);
    }

    // ── Health check ──────────────────────────────────────────────────────────
    static async isOllamaOnline(): Promise<boolean> {
        try {
            const url = cfg<string>('ollamaUrl');
            await axios.get(`${url}/api/tags`, { timeout: 3000 });
            return true;
        } catch { return false; }
    }

    // ── List local Ollama models ──────────────────────────────────────────────
    static async getOllamaModels(): Promise<string[]> {
        try {
            const url = cfg<string>('ollamaUrl');
            const res = await axios.get(`${url}/api/tags`, { timeout: 5000 });
            return (res.data?.models ?? []).map((m: any) => m.name as string);
        } catch { return []; }
    }

    // ── Pull a model with progress callback ───────────────────────────────────
    private static _pullController: AbortController | null = null;

    static abortPull(): void {
        if (this._pullController) {
            this._pullController.abort();
            this._pullController = null;
        }
    }

    static async pullModel(
        model: string,
        onProgress: (pct: number, status: string) => void
    ): Promise<void> {
        this.abortPull();
        this._pullController = new AbortController();
        const url  = cfg<string>('ollamaUrl');
        const resp = await axios.post(
            `${url}/api/pull`,
            { name: model, stream: true },
            { responseType: 'stream', timeout: 0, signal: this._pullController.signal }
        );

        return new Promise((resolve, reject) => {
            let buf = '';
            resp.data.on('data', (chunk: Buffer) => {
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const obj = JSON.parse(line);
                        const pct = obj.total
                            ? Math.round((obj.completed / obj.total) * 100)
                            : 0;
                        let stat = obj.status ?? '';
                        if (obj.total) {
                            const gbTotal = (obj.total / 1e9).toFixed(2);
                            const gbDone  = ((obj.completed || 0) / 1e9).toFixed(2);
                            stat += ` [${gbDone}GB / ${gbTotal}GB]`;
                        }
                        onProgress(pct, stat);
                        if (obj.status === 'success') resolve();
                    } catch { /* incomplete JSON */ }
                }
            });
            resp.data.on('end',   resolve);
            resp.data.on('error', reject);
        });
    }

    // ── Ollama provider ───────────────────────────────────────────────────────
    private static async _ollama(opts: GenerateOptions): Promise<string> {
        const url   = cfg<string>('ollamaUrl');
        const model = cfg<string>('defaultModel');

        if (opts.onToken) {
            // Streaming mode
            const resp = await axios.post(
                `${url}/api/generate`,
                { model, prompt: opts.prompt, stream: true, options: { num_ctx: 16000 } },
                { responseType: 'stream', timeout: 120_000 }
            );
            return new Promise((resolve, reject) => {
                let full = '';
                let buf  = '';
                resp.data.on('data', (chunk: Buffer) => {
                    buf += chunk.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const obj = JSON.parse(line);
                            if (obj.response) {
                                full += obj.response;
                                opts.onToken!(obj.response);
                            }
                        } catch { /* incomplete JSON */ }
                    }
                });
                resp.data.on('end',   () => resolve(full));
                resp.data.on('error', reject);
            });
        } else {
            // Non-streaming mode
            const resp = await axios.post(
                `${url}/api/generate`,
                { model, prompt: opts.prompt, stream: false, options: { num_ctx: 16000 } },
                { timeout: 120_000 }
            );
            return resp.data?.response ?? '';
        }
    }

    // ── OpenAI provider ───────────────────────────────────────────────────────
    private static async _openai(opts: GenerateOptions): Promise<string> {
        const key   = await this._getSecret('openai');
        const model = cfg<string>('openaiModel');
        const resp  = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model,
                messages: [
                    { role: 'system', content: 'You are an expert code optimizer. Return raw optimized code only, no explanations.' },
                    { role: 'user',   content: opts.prompt }
                ],
                stream: false
            },
            {
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                timeout: 60_000
            }
        );
        return resp.data?.choices?.[0]?.message?.content ?? '';
    }

    // ── Google Gemini provider ───────────────────────────────────────────────────────────────
    private static async _gemini(opts: GenerateOptions): Promise<string> {
        const key   = await this._getSecret('gemini');
        const model = cfg<string>('geminiModel');
        const resp  = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            { contents: [{ parts: [{ text: opts.prompt }] }] },
            { timeout: 60_000 }
        );
        return resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // ── Groq provider (OpenAI-compatible, ultra-fast inference) ────────────────────
    private static async _groq(opts: GenerateOptions): Promise<string> {
        const key   = await this._getSecret('groq');
        const model = cfg<string>('groqModel');
        const resp  = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model,
                messages: [
                    { role: 'system', content: 'You are an elite code optimizer. Return exact JSON as instructed. No markdown.' },
                    { role: 'user',   content: opts.prompt }
                ],
                temperature: 0.1,
                max_tokens: 4096,
                stream: false
            },
            {
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                timeout: 30_000    // Groq is fast — 30s is generous
            }
        );
        return resp.data?.choices?.[0]?.message?.content ?? '';
    }

    // ── Secret storage ────────────────────────────────────────────────────────
    private static _secrets?: vscode.SecretStorage;
    static setSecretStorage(s: vscode.SecretStorage) { this._secrets = s; }

    static async saveSecret(provider: string, key: string): Promise<void> {
        await this._secrets?.store(`optimind-pro.${provider}.apiKey`, key);
    }

    private static async _getSecret(provider: string): Promise<string> {
        const key = await this._secrets?.get(`optimind-pro.${provider}.apiKey`);
        if (!key) throw new Error(`No API key for ${provider}. Run "Set API Key" command.`);
        return key;
    }
}
