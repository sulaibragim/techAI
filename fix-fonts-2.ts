import * as fs from 'fs';
import * as path from 'path';

const files = [
  'components/JobDetail.tsx',
  'components/CallsList.tsx',
  'components/VoiceAssistant.tsx',
  'components/MessagesList.tsx',
  'components/Dashboard.tsx',
  'components/Navigation.tsx',
  'components/JobsList.tsx',
  'components/Sidebar.tsx',
  'components/JobWizard.tsx',
  'components/WorkroomDashboard.tsx',
  'App.tsx'
];

files.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/font-black/g, 'font-bold');
    
    // Also change tracking-[0.4em] and similar extreme letter spacing to tracking-widest
    content = content.replace(/tracking-\[0\.[3-6]em\]/g, 'tracking-widest');
    content = content.replace(/tracking-\[0\.[1-2]em\]/g, 'tracking-wider');
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
