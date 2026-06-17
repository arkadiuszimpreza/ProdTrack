const fs = require('fs');
let c = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

c = c.replace(/import \{ getFallbackUnit \} from '\.\.\/\.\.\/utils\/erpUnitMap';\n?/g, '');

c = c.replace(/  const getFallbackUnit = [\s\S]*?return '';\n  };\n/, '');

// Inside the newUI, we have getFallbackUnit(b) being called. Let's replace it with b.unit
c = c.replace(/b\.unit \|\| getFallbackUnit\(b\)/g, 'b.unit');

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', c);
