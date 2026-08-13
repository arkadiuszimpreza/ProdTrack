const fs = require('fs');
const file = 'src/components/production/BoardDrawingViewer.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldDividers = `{/* We add horizontal dividers to visualize the 6 levels clearly */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                        </div>`;

const newDividers = `{/* Dynamic horizontal dividers */}
                        <div className="absolute inset-0 flex flex-col justify-evenly pointer-events-none opacity-20">
                           {Array.from({ length: (element.locksLength || 0) > 0 ? 5 : 4 }).map((_, i) => (
                             <div key={i} className="w-full h-[1px] bg-stone-800"></div>
                           ))}
                        </div>`;

content = content.replace(oldDividers, newDividers);
fs.writeFileSync(file, content);
