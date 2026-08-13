const fs = require('fs');
const path = require('path');
const p = path.resolve('src/hooks/useManualEntry.tsx');
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(
`  endTime: Date;`,
`  endTime: Date | null;`
);

content = content.replace(
`        const start = entry.startTime;
        const end = entry.endTime;
            
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }
            
        const duration = Math.floor((end.getTime() - start.getTime()) / 1000);`,
`        const start = entry.startTime;
        const end = entry.endTime;
            
        let duration = 0;
        if (end) {
            if (end < start) {
                end.setDate(end.getDate() + 1);
            }
            duration = Math.floor((end.getTime() - start.getTime()) / 1000);
        }`
);

content = content.replace(
`          endTime: Timestamp.fromDate(end),`,
`          endTime: end ? Timestamp.fromDate(end) : null,`
);

fs.writeFileSync(p, content, 'utf-8');
console.log('Fixed useManualEntry');
