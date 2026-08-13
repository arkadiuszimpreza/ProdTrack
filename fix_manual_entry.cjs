const fs = require('fs');
const path = require('path');
const p = path.resolve('src/components/management/ManualEntryForm.tsx');
let content = fs.readFileSync(p, 'utf-8');

content = content.replace(
`    endTime: Date, 
    assortmentCategory: string,`,
`    endTime: Date | null, 
    assortmentCategory: string,`
);

content = content.replace(
`  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));`,
`  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isInProgress, setIsInProgress] = useState(false);`
);

content = content.replace(
`  const calculateHoursFromRange = () => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle overnight if needed, though usually not for manual entry
    
    return diffMinutes / 60;
  };`,
`  const calculateHoursFromRange = () => {
    if (!startTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    let endH, endM;

    if (isInProgress) {
        const now = new Date();
        endH = now.getHours();
        endM = now.getMinutes();
    } else {
        if (!endTime) return 0;
        const parts = endTime.split(':').map(Number);
        endH = parts[0];
        endM = parts[1];
    }
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle overnight
    
    return diffMinutes / 60;
  };`
);

content = content.replace(
`    let finalEndTime: Date;

    const [year, month, day] = date.split('-').map(Number);

    if (entryMode === 'duration') {`,
`    let finalEndTime: Date | null = null;

    const [year, month, day] = date.split('-').map(Number);

    if (entryMode === 'duration') {`
);

content = content.replace(
`    } else {
      finalHours = calculateHoursFromRange();
      if (finalHours <= 0) return;

      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      
      // Tworzymy daty startu i końca w czasie lokalnym
      finalStartTime = new Date(year, month - 1, day, startH, startM, 0);
      finalEndTime = new Date(year, month - 1, day, endH, endM, 0);
      
      if (finalEndTime < finalStartTime) {
        finalEndTime.setDate(finalEndTime.getDate() + 1);
      }
    }`,
`    } else {
      finalHours = calculateHoursFromRange();
      if (finalHours <= 0 && !isInProgress) return;

      const [startH, startM] = startTime.split(':').map(Number);
      finalStartTime = new Date(year, month - 1, day, startH, startM, 0);
      
      if (isInProgress) {
         finalEndTime = null;
      } else {
         const [endH, endM] = endTime.split(':').map(Number);
         finalEndTime = new Date(year, month - 1, day, endH, endM, 0);
         if (finalEndTime < finalStartTime) {
           finalEndTime.setDate(finalEndTime.getDate() + 1);
         }
      }
    }`
);

content = content.replace(
`                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                      Zakończenie
                    </label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      required={entryMode === 'range'}
                    />
                  </div>`,
`                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                        Zakończenie
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer mr-2">
                        <input type="checkbox" checked={isInProgress} onChange={(e) => setIsInProgress(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300" />
                        <span className="text-xs font-bold text-emerald-700">Meldunek w toku</span>
                      </label>
                    </div>
                    {!isInProgress ? (
                      <input 
                        type="time" 
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        required={entryMode === 'range'}
                      />
                    ) : (
                      <div className="w-full p-4 bg-emerald-50 border border-emerald-200 border-dashed rounded-2xl text-emerald-600 font-bold flex items-center justify-center">
                        Teraz...
                      </div>
                    )}
                  </div>`
);

content = content.replace(
`                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                      Do godziny
                    </label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      required={entryMode === 'range'}
                    />
                  </div>`,
`                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-black uppercase tracking-wider text-stone-400 ml-1">
                        Do godziny
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer mr-2 mt-1">
                        <input type="checkbox" checked={isInProgress} onChange={(e) => setIsInProgress(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300" />
                        <span className="text-xs font-bold text-emerald-700">W toku</span>
                      </label>
                    </div>
                    {!isInProgress ? (
                      <input 
                        type="time" 
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        required={entryMode === 'range' && !isInProgress}
                      />
                    ) : (
                      <div className="w-full p-4 bg-emerald-50 border border-emerald-200 border-dashed rounded-2xl text-emerald-600 font-bold flex items-center justify-center">
                        Teraz...
                      </div>
                    )}
                  </div>`
);


fs.writeFileSync(p, content, 'utf-8');
console.log('Fixed ManualEntryForm');
