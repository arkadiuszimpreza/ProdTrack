const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

// Replace the line that references selectedEmployeeId in EditLogModal (line 908 approx)
// The EditLogModal doesn't have selectedEmployeeId state, it has log.userId or we can add state.
// Let's see what is inside EditLogModal for the handleSave

content = content.replace('    if (!selectedEmployeeId) {\n      alert("Proszę wybrać pracownika.");\n      return;\n    }', '');

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);
