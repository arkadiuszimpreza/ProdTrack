const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

content = content.replace(/className="p-5 space-y-4 overflow-y-auto"/g, 'className="p-4 space-y-2 overflow-y-auto"');

content = content.replace(/className="w-24 text-\[10px\] font-black uppercase tracking-wider text-stone-400 text-left shrink-0"/g, 'className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0"');
content = content.replace(/className="w-24 text-\[10px\] font-black uppercase tracking-wider text-emerald-600\/70 text-left pt-3 shrink-0"/g, 'className="w-24 text-[9px] font-black uppercase tracking-wider text-emerald-600/70 text-left shrink-0 mt-2"');

content = content.replace(/className="w-24 text-\[10px\] font-black uppercase tracking-wider text-stone-400 text-left shrink-0 pt-3"/g, 'className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0 mt-2"');

// And remove items-start from flex containers that should probably just be items-center to save space
content = content.replace(/className="flex items-start gap-4"/g, 'className="flex items-center gap-4"');

// Reduce gap in grid
content = content.replace(/grid-cols-2 gap-3/g, 'grid-cols-2 gap-2');

// Fix pt-3 in some labels inside items-center now
content = content.replace(/mt-2"/g, '"'); // Let's remove mt-2 since items-center will center it.

// P-3 -> p-2 inside Czas pracy
content = content.replace(/p-3 bg-emerald-50\/50/g, 'p-2 bg-emerald-50/50');
content = content.replace(/space-y-3/g, 'space-y-1.5');

// For inputs, change p-2 to p-1.5 px-2
content = content.replace(/p-2 bg-stone-50/g, 'p-1.5 px-2 bg-stone-50');
content = content.replace(/p-2 bg-white/g, 'p-1.5 px-2 bg-white');
content = content.replace(/py-2 bg-stone-50/g, 'py-1.5 bg-stone-50');

// Reduce gap-4 to gap-3
content = content.replace(/gap-4">/g, 'gap-3">');

// Reduce my-8 to my-4 for the modal container
content = content.replace(/max-w-xl my-8/g, 'max-w-xl my-4');

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);

