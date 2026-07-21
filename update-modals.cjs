const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

function replaceModal(functionName, modalContent) {
  const regex = new RegExp(`export function ${functionName}\\([\\s\\S]*?\\{\\s*const \\[\\s*[\\s\\S]*?\\n\\}\\n`, 'm');
  // Since the file is big, maybe we can find the start and end manually.
}
