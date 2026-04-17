const fs = require('fs');
const path = 'src/providers/dashboardProvider.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace just the problematic string-regex line (line 607 with backtick)
// AND the keywords regex line (line 611 with \b which also has issues inside template literal)
// by replacing entire highlight function block with a safe version using new RegExp
const oldBlock = `    // ── Syntax highlighter (basic token coloring) ─────────────────────
    function highlight(code) {
        var esc = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // strings
        esc = esc.replace(/(\"[^\"\\\\\\n]*\"|'[^'\\\\\\n]*'|\`[^\`\\\\]*\`)/g, '<span style="color:#ce9178;">$1</span>');
        // numbers
        esc = esc.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span style="color:#b5cea8;">$1</span>');
        // keywords
        var kw = /\\b(return|if|else|for|while|const|let|var|function|class|import|export|from|default|new|this|typeof|void|null|undefined|true|false|int|char|bool|float|double|long|short|unsigned|signed|struct|enum|include|define|public|private|protected|static|async|await|try|catch|throw|interface|type|extends|implements|override|inline|auto|template|namespace)\\b/g;
        esc = esc.replace(kw, '<span style="color:#569cd6;">$1</span>');
        // return as special
        return esc;
    }`;

const newBlock = `    // ── Syntax highlighter (basic token coloring) ─────────────────────
    function highlight(code) {
        var esc = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        esc = esc.replace(/(""(?:[^""\\\\]|\\\\.)*""|'(?:[^'\\\\]|\\\\.)*')/g, '<span style="color:#ce9178;">$1</span>');
        esc = esc.replace(/([0-9]+\\.?[0-9]*)/g, '<span style="color:#b5cea8;">$1</span>');
        var kwRe = new RegExp('(\\\\b)(return|if|else|for|while|const|let|var|function|class|import|export|from|default|new|typeof|void|null|undefined|true|false|int|char|bool|float|double|long|struct|enum|static|async|await|try|catch|throw|interface|type|extends|implements)(\\\\b)', 'g');
        esc = esc.replace(kwRe, '$1<span style="color:#569cd6;">$2</span>$3');
        return esc;
    }`;

if (content.includes('function highlight(code)')) {
    // Replace the whole block by finding start and end
    const start = content.indexOf('    // \u2500\u2500 Syntax highlighter');
    const end = content.indexOf('\n    }', start) + '\n    }'.length;
    if (start !== -1 && end > start) {
        content = content.slice(0, start) + newBlock + content.slice(end);
        fs.writeFileSync(path, content, 'utf8');
        console.log('Fixed highlight function successfully');
    } else {
        console.log('Could not find end of highlight function');
    }
} else {
    console.log('highlight function not found');
}
