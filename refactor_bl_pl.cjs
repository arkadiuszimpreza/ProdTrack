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

  // Replace type === 'BL'
  content = content.replace(/type === 'BL'/g, "(type === 'BL' || type === 'PL')");
  
  // Replace type !== 'BL'
  content = content.replace(/type !== 'BL'/g, "(type !== 'BL' && type !== 'PL')");

  // Replace materialType === 'BL'
  content = content.replace(/materialType === 'BL'/g, "(materialType === 'BL' || materialType === 'PL')");
  
  // Replace materialType !== 'BL'
  content = content.replace(/materialType !== 'BL'/g, "(materialType !== 'BL' && materialType !== 'PL')");

  // Replace prefix === 'BL'
  content = content.replace(/prefix === 'BL'/g, "(prefix === 'BL' || prefix === 'PL')");
  
  // Replace guessPrefix(...) === 'BL'
  content = content.replace(/(guessPrefix\([^)]+\))\s*===\s*'BL'/g, "['BL', 'PL'].includes($1)");
  
  // Replace guessPrefix(...) !== 'BL'
  content = content.replace(/(guessPrefix\([^)]+\))\s*!==\s*'BL'/g, "!['BL', 'PL'].includes($1)");

  // Write changes back
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated references in ' + file);
}
