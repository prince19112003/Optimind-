// ─────────────────────────────────────────────────────────────────────────────
// src/core/analyzer.ts  –  AST-Based Code Analyzer + Security Auditor
// Uses ts-morph lazily (loaded on first use to avoid blocking extension host)
// ─────────────────────────────────────────────────────────────────────────────
import * as vscode from 'vscode';
import { AIClient } from './aiClient';
import { Benchmarker } from './benchmarker';

// ───────────────────────── Types ─────────────────────────────────────────────

export interface AnalysisResult {
    original:    string;
    optimized:   string;
    explanation: string;   // backward compat
    improvement: string;   // e.g. "O(n²) → O(n)" — backward compat
    complexity:  string;   // e.g. "O(n²) → O(1)"
    reason:      string;   // why it was bad
    fix:         string;   // what was changed
    language:    string;
}

export interface SecurityFinding {
    category:    string;
    severity:    'critical' | 'high' | 'medium' | 'low';
    line:        number;
    description: string;
    fix:         string;
}

export interface SecurityAuditResult {
    findings: SecurityFinding[];
    summary:  string;
}

// ─────────── Prompt builders ──────────────────────────────────────────────────

function buildOptimizePrompt(code: string, lang: string, context?: string): string {
    return `You are an elite ${lang} software engineer and code reviewer. Your job is to analyze and improve the provided code by following a strict 3-step priority pipeline.

PIPELINE (execute in order, stop when a fix is made):

STEP 1 \u2014 FIX ERRORS & BUGS (Highest Priority):
- Fix ALL syntax errors, type errors, runtime bugs, undefined variables, off-by-one errors, and logic mistakes.
- Fix incorrect logic even if no syntax error exists.
- If you fix something in this step, proceed to Step 2 as well.

STEP 2 \u2014 OPTIMIZE PERFORMANCE (Medium Priority):
- Only after the code is error-free, look for performance issues:
  - Replace nested loops with formulas or hash maps where possible.
  - Remove redundant recomputations, useless variables, and dead code.
  - Fix memory leaks or unnecessary allocations.

STEP 3 \u2014 IMPROVE READABILITY (Low Priority):
- Only if Steps 1 and 2 had NO changes needed:
  - Rename cryptic variables (e.g., 'x', 'tmp') to meaningful names.
  - Simplify deeply nested conditionals.
  - DO NOT change logic. DO NOT add new features.

STOP CONDITION:
- If the code has NO errors, NO performance issues, and IS already readable \u2014 return it UNCHANGED and set reason to "Already optimized".

OUTPUT RULES:
- NO code comments (no // or /* */ lines) in the "optimized" field.
- Use proper newlines and indentation (format like a real code editor).
- DO NOT add boilerplate, unnecessary classes, or external dependencies.

Return a JSON object ONLY (no markdown, no explanation outside JSON):
{
  "optimized": "<full corrected + optimized code, no comments, properly formatted>",
  "complexity": "<Before \u2192 After e.g. O(n\u00b2) \u2192 O(1), or 'No change'>",
  "reason": "<one sentence: what was wrong OR 'Already optimized'>",
  "fix": "<one sentence: exactly what you changed, or 'No changes needed'>"
}

${context ? `SIBLING CONTEXT (do not redefine these):\n\`\`\`${lang}\n${context}\n\`\`\`\n` : ''}CODE TO ANALYZE:
\`\`\`${lang}
${code}
\`\`\``;
}

function buildSecurityPrompt(code: string, lang: string): string {
    return `You are a senior ${lang} security engineer.
Scan this code for vulnerabilities: SQL injection, XSS, hardcoded secrets, path traversal, command injection, insecure deserialization, SSRF, weak crypto, missing auth checks, race conditions.
Return a JSON object ONLY:
{
  "findings": [
    { "category": "SQL Injection", "severity": "critical", "line": 12, "description": "...", "fix": "..." }
  ],
  "summary": "<1-sentence audit summary>"
}

CODE:
\`\`\`${lang}
${code}
\`\`\``;
}

function buildTestPrompt(code: string, lang: string): string {
    const framework = lang === 'python' ? 'pytest' : lang === 'java' ? 'JUnit 5' : lang === 'cpp' ? 'Catch2' : 'Jest';
    return `Generate comprehensive ${framework} unit tests for this ${lang} code.
Cover: happy path, edge cases, null/undefined inputs, boundary values.
Return only the test code, no explanations.

CODE:
\`\`\`${lang}
${code}
\`\`\``;
}

// ─────────── Response parser ──────────────────────────────────────────────────

function extractJson<T>(raw: string): T {
    // Strip markdown code fences
    let clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

    // Find the first { } block
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        clean = clean.slice(start, end + 1);
    }
    return JSON.parse(clean) as T;
}

// ─────────── Analyzer class ───────────────────────────────────────────────────

export class CodeAnalyzer {

    /** Optimize code using AI */
    async optimize(
        code: string,
        language: string,
        fullFileContext: string = '',
        onToken?: (t: string) => void
    ): Promise<AnalysisResult> {
        let smartCtx = '';
        if (fullFileContext && (language === 'typescript' || language === 'javascript')) {
            smartCtx = this._extractSmartContext(fullFileContext, language);
        }

        const prompt = buildOptimizePrompt(code, language, smartCtx);
        const raw    = await AIClient.generate({ prompt, language, onToken });

        let optimized   = code;  // safe fallback
        let complexity  = '';
        let reason      = '';
        let fix         = '';
        let explanation = '';

        try {
            const parsed = extractJson<{ optimized: string; complexity: string; reason: string; fix: string; explanation?: string; improvement?: string }>(raw);
            optimized   = parsed.optimized   || code;
            complexity  = parsed.complexity  || parsed.improvement || '';
            reason      = parsed.reason      || parsed.explanation || '';
            fix         = parsed.fix         || '';
            explanation = reason; // backward compat
        } catch {
            // If JSON fails, try to extract raw code block
            const match = raw.match(/```[\w]*\n([\s\S]+?)```/);
            if (match) optimized = match[1].trim();
        }

        // Strip any remaining comments from optimized code
        const stripComments = (src: string) =>
            src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*[\r\n]/gm, '');
        if (optimized !== code) optimized = stripComments(optimized);

        let finalComplexity = complexity;

        // Auto-Benchmark performance if JS/TS
        if (optimized && optimized !== code && (language === 'javascript' || language === 'typescript')) {
            const bench = await Benchmarker.compare(code, optimized, language);
            if (bench.percentFaster !== 0 && !bench.error) {
                const spd = bench.percentFaster > 0 ? `⚡ ${bench.percentFaster}% Faster` : `🐌 ${Math.abs(bench.percentFaster)}% Slower`;
                finalComplexity = complexity ? `${complexity}  •  ${spd}` : spd;
            }
        }

        return { original: code, optimized, explanation, improvement: finalComplexity, complexity: finalComplexity, reason, fix, language };
    }

    /** Security audit using AI */
    async securityAudit(code: string, language: string): Promise<SecurityAuditResult> {
        const prompt = buildSecurityPrompt(code, language);
        const raw    = await AIClient.generate({ prompt, language });

        try {
            return extractJson<SecurityAuditResult>(raw);
        } catch {
            return {
                findings: [],
                summary:  'Could not parse security audit response. Raw: ' + raw.slice(0, 200)
            };
        }
    }

    /** Generate unit tests using AI */
    async generateTests(code: string, language: string): Promise<string> {
        const prompt = buildTestPrompt(code, language);
        return AIClient.generate({ prompt, language });
    }

    /** Calculate a heuristic "health score" for the active file */
    calculateScore(code: string, language: string): { score: number, details: string[] } {
        let score = 100;
        const details: string[] = [];
        const lines = code.split('\n');

        // Penalise for common anti-patterns
        const patterns = [
            { regex: /for\s*\(.*\)\s*\{[\s\S]*?for\s*\(/,  penalty: 15, name: 'Nested loops (Complexity)' },
            { regex: /catch\s*\([^)]*\)\s*\{\s*\}/,         penalty: 10, name: 'Empty catch blocks' },
            { regex: /console\.log/g,                        penalty: 2,  name: 'Console logs remaining' },
            { regex: /var\s+/g,                              penalty: 3,  name: 'Legacy "var" usage' },
            { regex: /==(?!=)/g,                             penalty: 2,  name: 'Loose equality (==)' },
            { regex: /TODO|FIXME|HACK/gi,                    penalty: 5,  name: 'Unresolved TODOs' },
            { regex: /password\s*=\s*["'][^"']+["']/i,       penalty: 20, name: 'Hardcoded secrets' },
        ];

        for (const p of patterns) {
            const matches = (code.match(p.regex) || []).length;
            if (matches > 0) {
                score -= Math.min(matches * p.penalty, 25);
                details.push(`${p.name}: Found ${matches}`);
            }
        }

        // Penalise very long files
        if (lines.length > 500) {
            score -= 10;
            details.push('File length (>500 lines)');
        }

        // Language-specific checks
        if (language === 'javascript' || language === 'typescript') {
            if (/\.innerHTML\s*=/.test(code)) {
                score -= 10;
                details.push('DOM XSS risk (.innerHTML)');
            }
            if (/eval\(/.test(code)) {
                score -= 15;
                details.push('Security risk (eval usage)');
            }
        }

        if (details.length === 0) details.push('No major issues found. Code is clean.');

        return { 
            score: Math.max(0, Math.min(100, Math.round(score))),
            details 
        };
    }

    private _extractSmartContext(fullCode: string, lang: string): string {
        try {
            const { Project } = require('ts-morph');
            const project = new Project({ useInMemoryFileSystem: true });
            const sf = project.createSourceFile(`temp.${lang === 'typescript'? 'ts' : 'js'}`, fullCode);
            let skeleton = '';
            sf.getFunctions().forEach((f: any) => skeleton += `function ${f.getName()}() { ... }\n`);
            sf.getClasses().forEach((c: any) => skeleton += `class ${c.getName()} { ... }\n`);
            sf.getInterfaces().forEach((i: any) => skeleton += `interface ${i.getName()} { ... }\n`);
            
            // Safety: Cap context to avoid overloading small local models
            if (skeleton.length > 2000) {
                return skeleton.slice(0, 2000) + '\n... [context truncated]';
            }
            return skeleton.trim();
        } catch { return ''; }
    }

    /** Quick check whether text is actually code (not a markdown doc etc.) */
    isCodeFile(document: vscode.TextDocument): boolean {
        const SUPPORTED = ['javascript', 'typescript', 'python', 'cpp', 'c', 'java', 'go', 'rust'];
        return SUPPORTED.includes(document.languageId);
    }
}
