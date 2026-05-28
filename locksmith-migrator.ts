import * as fs from 'fs';
import * as path from 'path';

// 1. types.ts
const typesPath = path.resolve('types.ts');
let typesStr = fs.readFileSync(typesPath, 'utf8');
typesStr = typesStr.replace(/export interface Appliance \{[\s\S]*?\}/, `export interface LockDetails {
  type: 'Automotive' | 'Residential' | 'Commercial' | 'Secure / Safe' | 'Other';
  brand: string;
  modelOrYear: string;
}`);
typesStr = typesStr.replace(/appliance: Appliance/g, 'lockDetails: LockDetails');
fs.writeFileSync(typesPath, typesStr);

// 2. Global replacements across components
const componentsDir = path.resolve('components');
const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
files.forEach(f => {
  const fp = path.resolve(componentsDir, f);
  let content = fs.readFileSync(fp, 'utf8');
  
  // Case sensitive replaces
  content = content.replace(/appliance/g, 'lockDetails');
  content = content.replace(/Appliance/g, 'LockDetails');
  content = content.replace(/modelNumber/g, 'modelOrYear');
  
  fs.writeFileSync(fp, content);
});

let appContent = fs.readFileSync('App.tsx', 'utf8');
appContent = appContent.replace(/appliance/g, 'lockDetails');
fs.writeFileSync('App.tsx', appContent);

console.log("Migration basic complete");
