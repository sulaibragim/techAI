import * as fs from 'fs';
import * as path from 'path';

const files = [
  'components/JobDetail.tsx',
  'components/CallsList.tsx',
  'components/VoiceAssistant.tsx',
  'components/MessagesList.tsx',
  'components/Dashboard.tsx',
  'components/Navigation.tsx',
  'components/JobsList.tsx'
];

files.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/text-\[6px\]/g, 'text-[10px]');
    content = content.replace(/text-\[7px\]/g, 'text-[10px]');
    content = content.replace(/text-\[(?:8|9|10)px\]/g, 'text-xs');
    content = content.replace(/text-\[(?:11|12)px\]/g, 'text-sm');
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
