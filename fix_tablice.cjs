const fs = require('fs');

let content = fs.readFileSync('src/components/production/OperatorPanelTablice.tsx', 'utf8');

content = content.replace(
    '<table className="w-full text-left text-sm">',
    '<div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap">'
);

fs.writeFileSync('src/components/production/OperatorPanelTablice.tsx', content);
