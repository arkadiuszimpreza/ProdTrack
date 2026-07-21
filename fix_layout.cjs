const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

// Replace w-1/3 text-right with w-[100px] text-left shrink-0
content = content.replace(/w-1\/3 text-\[10px\] font-black uppercase tracking-wider text-stone-400 text-right/g, 'w-24 text-[10px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0');

// For "Czas pracy" label (emerald)
content = content.replace(/w-1\/3 text-\[10px\] font-black uppercase tracking-wider text-emerald-600\/70 text-right pt-3/g, 'w-24 text-[10px] font-black uppercase tracking-wider text-emerald-600/70 text-left pt-3 shrink-0');

// Replace w-2/3 with flex-1
// Be careful not to replace it globally where it's not needed, but in our modal it's mostly w-2/3
// Actually, let's just do an exact match replacement for the modals.

// Let's replace 'w-2/3 ' with 'flex-1 min-w-0 ' in the context of the modals.
// We can just use a global replace for 'className="w-2/3 ' or 'className="w-2/3"'
content = content.replace(/className="w-2\/3 /g, 'className="flex-1 min-w-0 ');
content = content.replace(/className="w-2\/3"/g, 'className="flex-1 min-w-0"');

// Wait, the grid grid-cols-2 inside Czas pracy might also need adjustment? No, flex-1 will give it more space.
// grid-cols-2 might be a bit tight for datetime-local. Let's change grid-cols-2 to flex flex-col gap-3 or grid grid-cols-1 sm:grid-cols-2. Actually, flex-1 is much wider than w-2/3, maybe it will fit.
// But to be sure, let's change grid-cols-2 to flex flex-col gap-2 or grid grid-cols-1 if we want it stacked, but side by side is better if it fits. With flex-1 it's much wider so it should fit better.
// Actually, let's make max-w-lg to max-w-xl so there is more space.
content = content.replace(/max-w-lg/g, 'max-w-xl');

// And remove the "text-right" from the labels if it's there
// Actually, my first replace regex covers that.

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);

