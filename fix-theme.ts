import * as fs from 'fs';
import * as path from 'path';

const dir = process.cwd();
const walkSync = (currentDirPath: string, callback: (path: string, stat: any) => void) => {
    fs.readdirSync(currentDirPath).forEach((name) => {
        const filePath = path.join(currentDirPath, name);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && filePath.endsWith('.tsx')) {
            callback(filePath, stat);
        } else if (stat.isDirectory() && name !== 'node_modules') {
            walkSync(filePath, callback);
        }
    });
}

walkSync(dir, (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Backgrounds - Move from extreme blacks to premium readable slate tones
    content = content.replace(/bg-\[#050505\]/g, 'bg-slate-950');
    content = content.replace(/bg-\[#030303\]/g, 'bg-slate-950');
    content = content.replace(/bg-\[#0a0a0a\]/g, 'bg-slate-900');
    content = content.replace(/bg-\[#111827\]/g, 'bg-slate-900'); 
    content = content.replace(/bg-\[#0F172A\]/g, 'bg-slate-950');
    content = content.replace(/bg-black\/50/g, 'bg-slate-900\/50');
    content = content.replace(/bg-black\/60/g, 'bg-slate-900\/60');
    
    // Remove extreme cyan -> revert to reliable blue tones
    content = content.replace(/bg-\[#00E5FF\]\/(\d+)/g, 'bg-blue-500/$1');
    content = content.replace(/bg-\[#00E5FF\]/g, 'bg-blue-600');
    content = content.replace(/text-\[#00E5FF\]\/(\d+)/g, 'text-blue-400/$1');
    content = content.replace(/text-\[#00E5FF\]/g, 'text-blue-400');
    content = content.replace(/border-\[#00E5FF\]\/(\d+)/g, 'border-blue-500/$1');
    content = content.replace(/border-\[#00E5FF\]/g, 'border-blue-500');
    content = content.replace(/border-t-\[#00E5FF\]\/(\d+)/g, 'border-t-blue-500/$1');

    content = content.replace(/from-\[#00A3FF\] to-\[#0055FF\]/g, 'from-blue-600 to-indigo-700');

    // Clean up excessive glowing shadows
    content = content.replace(/shadow-\[0_0_[^\]]+#00E5FF[^\]]*\]/g, 'shadow-lg');
    content = content.replace(/shadow-\[0_10px_40px_rgba\(0,163,255,0\.4\)\]/g, 'shadow-xl');

    // Readable text colors (moving up one step in lightness)
    content = content.replace(/text-gray-600/g, 'text-slate-500');
    content = content.replace(/text-gray-500/g, 'text-slate-400');
    content = content.replace(/text-gray-400/g, 'text-slate-300');
    content = content.replace(/text-black/g, 'text-white'); 
    content = content.replace(/border-gray-800/g, 'border-slate-700');
    content = content.replace(/border-gray-700/g, 'border-slate-600');

    // Improve border and spacing visibility
    content = content.replace(/border-white\/5/g, 'border-white\/10');
    
    // Tone down aggressive blur transitions
    content = content.replace(/blur\(8px\)/g, 'blur(2px)');
    
    // Catch extremely small fonts just in case
    content = content.replace(/text-\[10px\]/g, 'text-xs');
    content = content.replace(/text-\[11px\]/g, 'text-sm');

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    }
});
