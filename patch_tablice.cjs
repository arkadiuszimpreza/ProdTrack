const fs = require('fs');

let content = fs.readFileSync('src/components/production/OperatorPanelTablice.tsx', 'utf8');

// 1. Search input header
content = content.replace(
    '<div className="flex justify-between items-end">',
    '<div className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-4">'
);
content = content.replace(
    'className="pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-80 font-medium"',
    'className="pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full sm:w-80 font-medium"'
);
content = content.replace(
    '<div className="relative">',
    '<div className="relative w-full sm:w-auto">'
);

// 2. Split view (Drawing + Side panel)
content = content.replace(
    '<div className="max-w-7xl mx-auto flex gap-6 h-[calc(100vh-12rem)]">',
    '<div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-12rem)]">'
);
content = content.replace(
    '<div className="flex-1 bg-white rounded-3xl border border-stone-200 overflow-hidden flex flex-col shadow-sm">',
    '<div className="flex-1 bg-white rounded-3xl border border-stone-200 overflow-hidden flex flex-col shadow-sm min-h-[500px] lg:min-h-0">'
);
content = content.replace(
    '<div className="w-96 bg-white rounded-3xl border border-stone-200 shadow-sm flex flex-col">',
    '<div className="w-full lg:w-96 bg-white rounded-3xl border border-stone-200 shadow-sm flex flex-col shrink-0">'
);

// 3. Table wrapper overflow
content = content.replace(
    '<table className="w-full text-sm">',
    '<div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap">'
);
content = content.replace(
    '</table>',
    '</table></div>'
);

// 4. Header padding
content = content.replace(
    '<header className="bg-white border-b border-stone-200 p-4 md:px-8 md:py-4 flex items-center justify-between sticky top-0 z-40">',
    '<header className="bg-white border-b border-stone-200 p-4 md:px-8 md:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-40">'
);

fs.writeFileSync('src/components/production/OperatorPanelTablice.tsx', content);
