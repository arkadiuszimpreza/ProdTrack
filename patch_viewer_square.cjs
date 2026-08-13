const fs = require('fs');
const file = 'src/components/production/BoardDrawingViewer.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace getPieChartStyle logic
const oldStyleTarget = `  const getPieChartStyle = (element: BoardDrawingElement, completedOps: string[] = []) => {
    const isMultiPanel = (element.locksLength || 0) > 0;
    const totalOps = isMultiPanel ? 5 : 4;
    const opNames = isMultiPanel 
      ? ['Wycinanie tab WS', 'Wklejanie zamków', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic']
      : ['Wycinanie tab WS', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic'];
    
    const step = 100 / totalOps;
    let gradient = 'conic-gradient(';
    
    opNames.forEach((opName, index) => {
      const isCompleted = completedOps.includes(opName);
      // We will use semi-transparent background to let the canvas show through?
      // Actually, since it's a marker, we can use a solid color but we can add a border to separate slices.
      // A conic-gradient doesn't support borders between slices easily, but we can fake it with transparent gaps if we want.
      // Let's use simple colors.
      const color = isCompleted ? '#10b981' : 'rgba(255,255,255,0.8)';
      const start = index * step;
      const end = (index + 1) * step;
      // Add a tiny gap by adjusting percentages? No, let's keep it simple.
      gradient += \`\${color} \${start}%, \${color} \${end}%\`;
      if (index < opNames.length - 1) gradient += ', ';
    });
    gradient += ')';
    
    return { background: gradient };
  };`;

const newStyleTarget = `  const getSquareProgressStyle = (element: BoardDrawingElement, completedOps: string[] = []) => {
    const isMultiPanel = (element.locksLength || 0) > 0;
    const opNames = isMultiPanel 
      ? ['Wycinanie tab WS', 'Wklejanie zamków', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic', 'Pakowanie (nowa operacja)']
      : ['Wycinanie tab WS', 'Wklejanie profila tablicy WS', 'Oklejanie tab WS', 'Oprawanie tablic', 'Pakowanie (nowa operacja)'];
    
    const totalOps = opNames.length;
    const step = 100 / totalOps;
    
    let gradient = 'linear-gradient(to top, ';
    
    opNames.forEach((opName, index) => {
      const isCompleted = completedOps.includes(opName);
      const color = isCompleted ? '#10b981' : 'rgba(255,255,255,0.95)';
      const start = index * step;
      const end = (index + 1) * step;
      
      // Using distinct color blocks for each step
      gradient += \`\${color} \${start}%, \${color} \${end}%\`;
      if (index < opNames.length - 1) gradient += ', ';
    });
    gradient += ')';
    
    return { background: gradient };
  };`;

content = content.replace(oldStyleTarget, newStyleTarget);

// 2. Change the render marker
const oldMarkerTarget = `                      <button
                        key={element.id}
                        onClick={() => onElementClick(element)}
                        className={\`absolute transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center transition-all shadow-lg group cursor-pointer z-10 \${selectedElementIds.includes(element.id) ? 'border-emerald-600 scale-110 shadow-emerald-500/50 ring-4 ring-emerald-300' : 'border-stone-400 hover:scale-105'}\`}
                        style={{ 
                          left: \`\${leftPercent}%\`, 
                          top: \`\${topPercent}%\`,
                          ...getPieChartStyle(element, completedOperations[element.id] || [])
                        }}
                      >
                        <div className="w-1/2 h-1/2 bg-white rounded-full absolute shadow-inner" />
                        <div 
                          className="hidden group-hover:block absolute top-full mt-2 bg-stone-900 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-20 pointer-events-none"`;

const newMarkerTarget = `                      <button
                        key={element.id}
                        onClick={() => onElementClick(element)}
                        className={\`absolute transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-md border-2 flex items-center justify-center transition-all shadow-lg group cursor-pointer z-10 \${selectedElementIds.includes(element.id) ? 'border-emerald-600 scale-110 shadow-emerald-500/50 ring-4 ring-emerald-300' : 'border-stone-400 hover:scale-105'}\`}
                        style={{ 
                          left: \`\${leftPercent}%\`, 
                          top: \`\${topPercent}%\`,
                          ...getSquareProgressStyle(element, completedOperations[element.id] || [])
                        }}
                      >
                        {/* We add horizontal dividers to visualize the 6 levels clearly */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                           <div className="w-full h-px bg-stone-800"></div>
                        </div>

                        <div 
                          className="hidden group-hover:block absolute top-full mt-2 bg-stone-900 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-20 pointer-events-none"`;

content = content.replace(oldMarkerTarget, newMarkerTarget);

fs.writeFileSync(file, content);
