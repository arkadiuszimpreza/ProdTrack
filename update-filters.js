import fs from 'fs';
import path from 'path';

const filesToUpdate = [
  'src/components/wms/MaterialWithdrawalView.tsx',
  'src/components/wms/InventoryTakingView.tsx',
  'src/components/wms/InventoryApprovalView.tsx',
  'src/components/wms/MaterialReturnsView.tsx',
  'src/components/wms/ReceiveDeliveryModal.tsx'
];

filesToUpdate.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Update type
  content = content.replace(
    /type MaterialFilter = 'ALL' \| 'RU' \| 'PR' \| 'BL' \| 'FA';/g,
    "type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR';"
  );
  
  content = content.replace(
    /type MaterialFilter = 'ALL' \| 'RU' \| 'PR' \| 'BL' \| 'FA' \| 'INNE';/g,
    "type MaterialFilter = 'ALL' | 'RU' | 'PR' | 'BL' | 'FA' | 'SR' | 'INNE';"
  );

  // Update guessPrefix
  const guessPrefixRegex = /if \(n\.includes\('farba'\) \|\| n\.includes\('proszek'\)\) return 'FA';\s*return 'INNE';/g;
  content = content.replace(
    guessPrefixRegex,
    "if (n.includes('farba') || n.includes('proszek')) return 'FA';\n  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';\n  return 'INNE';"
  );
  
  // also ReceiveDeliveryModal has return 'IN'
  const guessPrefixRegexIn = /if \(n\.includes\('farba'\) \|\| n\.includes\('proszek'\)\) return 'FA';\s*return 'IN';/g;
  content = content.replace(
    guessPrefixRegexIn,
    "if (n.includes('farba') || n.includes('proszek')) return 'FA';\n  if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';\n  return 'IN';"
  );

  // Update Buttons
  content = content.replace(
    /\{?\['ALL', 'RU', 'PR', 'BL', 'FA'\]\.map/g,
    "{['ALL', 'RU', 'PR', 'BL', 'FA', 'SR'].map"
  );
  
  content = content.replace(
    /\{?\['ALL', 'RU', 'PR', 'BL', 'FA', 'INNE'\]\.map/g,
    "{['ALL', 'RU', 'PR', 'BL', 'FA', 'SR', 'INNE'].map"
  );

  fs.writeFileSync(file, content, 'utf8');
});

// utils/inventoryExcelParser.ts
const parserFile = 'src/utils/inventoryExcelParser.ts';
if (fs.existsSync(parserFile)) {
  let content = fs.readFileSync(parserFile, 'utf8');
  const guessPrefixRegexParser = /if \(n\.includes\('farba'\)\) return 'FA';\s*return 'INNE';/g;
  content = content.replace(
    guessPrefixRegexParser,
    "if (n.includes('farba')) return 'FA';\n          if (n.includes('śruba') || n.includes('sruba') || n.includes('wkręt') || n.includes('nakrętka') || n.includes('podkładka')) return 'SR';\n          return 'INNE';"
  );
  fs.writeFileSync(parserFile, content, 'utf8');
}
console.log('Update complete');
