import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const moves = {
  'LiveWorkView': 'production',
  'HistoryView': 'production',
  'OrderCard': 'production',
  'OperatorPanel': 'production',
  'ActiveTimer': 'production',
  'OrderLogsView': 'production',
  'OrderElementEditor': 'production',

  'ArticleRegistryView': 'wms',
  'ExpectedDeliveriesView': 'wms',
  'InventoryYardView': 'wms',
  'MaterialWithdrawalView': 'wms',
  'InventoryTakingView': 'wms',
  'InventoryApprovalView': 'wms',
  'WMSImportView': 'wms',
  'ManualReceiptsView': 'wms',
  'ReceiveDeliveryModal': 'wms',
  'ImportResolutionModal': 'wms',
  'BatchMatchSummaryModal': 'wms',

  'ReportsView': 'management',
  'ManualEntryForm': 'management',
  'BulkManualEntryForm': 'management',

  'EmployeeManagementView': 'administracja',
  'WorkStationManagementView': 'administracja',
  'DocsView': 'administracja',

  'ErrorBoundary': 'common',
  'ElementSelectionModal': 'common',
  'MultiOrderSelectModal': 'common',
  'SearchableSelect': 'common',
  'MainDashboard': 'common',
  'RFIDLogin': 'common'
};

const srcDir = path.join(__dirname, 'src');

// Fix old imports BEFORE moving, or adjust them during? 
// It's easier to first read the file, fix its OUTWARD imports based on the fact it WILL move 1 level deeper,
// and THEN fix INWARD imports for other components.

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(getFiles(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

let files = getFiles(srcDir);

// 1. Move files physically and keep track of new paths
const oldToNew = {};
Object.entries(moves).forEach(([comp, folder]) => {
  const oldPath = path.join(srcDir, 'components', `${comp}.tsx`);
  const newDir = path.join(srcDir, 'components', folder);
  const newPath = path.join(newDir, `${comp}.tsx`);
  
  if (fs.existsSync(oldPath)) {
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    fs.renameSync(oldPath, newPath);
    oldToNew[oldPath] = newPath;
  }
});

// Refresh file list now that they are moved
files = getFiles(srcDir);

// 2. Update imports in all files
files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Did this file move? (Are we inside one of the new component sub-folders?)
  const isMovedComponent = Object.values(moves).some(folder => {
    return filePath.startsWith(path.join(srcDir, 'components', folder) + path.sep);
  });

  if (isMovedComponent) {
    // The file moved 1 level deeper. We need to fix its relative imports to non-components.
    // e.g., '../types' -> '../../types'
    // '../firebase' -> '../../firebase'
    // '../hooks/...' -> '../../hooks/...'
    // '../utils/...' -> '../../utils/...'
    content = content.replace(/from\s+['"]\.\.\/(types|firebase|hooks|utils|contexts|assets)(.*?)['"]/g, "from '../../$1$2'");
    content = content.replace(/import\s+['"]\.\.\/(types|firebase|hooks|utils|contexts|assets)(.*?)['"]/g, "import '../../$1$2'");
    
    // UI folder is in src/components/ui, so it used to be './ui/...' and now it's '../ui/...'
    content = content.replace(/from\s+['"]\.\/ui\/(.*?)['"]/g, "from '../ui/$1'");
    // icons or similar loose assets if imported with ./
    content = content.replace(/from\s+['"]\.\/(.*?)\.(png|svg|jpg)['"]/g, "from '../$1.$2'");
  }

  // Now fix imports OF the moved components (both from moved components and from App.tsx, etc.)
  const importRegex = /(import\s+.*?from\s+['"])(.*?)(['"])/g;
  
  content = content.replace(importRegex, (match, p1, importPath, p3) => {
    const basename = importPath.split('/').pop();
    const compName = basename.replace(/\.tsx?$/, '');

    // Is it importing one of our moved components?
    if (moves[compName]) {
      const newFolder = moves[compName];
      const newAbsolutePath = path.join(srcDir, 'components', newFolder, `${compName}.tsx`);
      
      const fileDir = path.dirname(filePath);
      let newRelativePath = path.relative(fileDir, newAbsolutePath);
      
      newRelativePath = newRelativePath.replace(/\.tsx$/, '');
      
      if (!newRelativePath.startsWith('.')) {
         newRelativePath = './' + newRelativePath;
      }
      
      // Edge case on windows, converting \ to /
      newRelativePath = newRelativePath.split(path.sep).join('/');
      
      return `${p1}${newRelativePath}${p3}`;
    }
    
    return match;
  });

  if (content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log("Refactoring complete");
