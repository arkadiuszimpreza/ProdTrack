const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/components/wms/MaterialWithdrawalView.tsx',
  'src/components/wms/InventoryApprovalView.tsx',
  'src/components/wms/InventoryZeroingView.tsx',
  'src/components/wms/InventoryTakingView.tsx',
  'src/components/wms/WeightCoefficientsView.tsx',
  'src/components/wms/MaterialReturnsView.tsx',
  'src/components/wms/ReceiveDeliveryModal.tsx',
  'src/components/wms/InventoryYardView.tsx'
];

for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Update guessPrefix
  content = content.replace(/if\s*\(\s*n\.includes\('blacha'\)\s*\|\|\s*n\.includes\('płyta'\)\s*\)\s*return\s*'BL';/g, 
    "if (n.includes('płyta') || n.includes('plyta')) return 'PL';\n  if (n.includes('blacha')) return 'BL';");

  // 2. Update MaterialFilter types
  content = content.replace(/'ALL'\s*\|\s*'RU'\s*\|\s*'PR'\s*\|\s*'BL'\s*\|\s*'FA'\s*\|\s*'SR'/g, 
    "'ALL' | 'RU' | 'PR' | 'BL' | 'PL' | 'FA' | 'SR'");

  // 3. Update arrays for mapping UI filters
  content = content.replace(/\['ALL',\s*'RU',\s*'PR',\s*'BL',\s*'FA',\s*'SR'\]/g, 
    "['ALL', 'RU', 'PR', 'BL', 'PL', 'FA', 'SR']");

  // 4. Update InventoryYardView specific getBatchType
  if (file.includes('InventoryYardView')) {
    content = content.replace(/const getBatchType = \(batchNumber: string, articleName: string\) => \{([^]+?)const fromName = guessPrefix\(articleName\);/m, 
      `const getBatchType = (batchNumber: string, articleName: string) => {\n    const fromName = guessPrefix(articleName);\n    if (fromName === 'PL') return 'PL';$1`);
    
    // Update the includes list in getBatchType
    content = content.replace(/\['RU', 'PR', 'BL', 'FA', 'SR'\]\.includes\(pfx\)/g, 
      "['RU', 'PR', 'BL', 'PL', 'FA', 'SR'].includes(pfx)");
  }

  // Write changes back
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated ' + file);
}
