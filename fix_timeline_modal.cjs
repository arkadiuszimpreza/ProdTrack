const fs = require('fs');
const path = require('path');
const p = path.resolve('src/components/production/OrderLogsView.tsx');
let content = fs.readFileSync(p, 'utf-8');

// 1. previewDurationHours replacements
content = content.replaceAll(
`  const previewDurationHours = () => {
    if (!startTimeStr || !endTimeStr) return 0;
    const s = new Date(startTimeStr).getTime();
    const e = new Date(endTimeStr).getTime();
    if (e < s) return 0;
    return ((e - s) / 3600000).toFixed(1);
  };`,
`  const previewDurationHours = () => {
    if (!startTimeStr) return 0;
    const s = new Date(startTimeStr).getTime();
    const e = isInProgress ? Date.now() : (endTimeStr ? new Date(endTimeStr).getTime() : 0);
    if (!e || e < s) return 0;
    return ((e - s) / 3600000).toFixed(1);
  };`
);

// 2. UI replacement
content = content.replaceAll(
`              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                  <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                </div>
              </div>`,
`              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Rozpoczęcie</label>
                  <input type="datetime-local" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" required />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black uppercase tracking-wider text-emerald-600/70 ml-1">Zakończenie</label>
                    <label className="flex items-center gap-1 cursor-pointer mr-1">
                      <input type="checkbox" checked={isInProgress} onChange={(e) => setIsInProgress(e.target.checked)} className="w-3 h-3 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300" />
                      <span className="text-[9px] font-bold text-emerald-700">W toku</span>
                    </label>
                  </div>
                  {!isInProgress ? (
                    <input type="datetime-local" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} className="w-full p-1.5 px-2 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-stone-700" />
                  ) : (
                    <div className="w-full p-1.5 px-2 bg-emerald-100/50 border border-emerald-200 border-dashed rounded-lg text-xs font-bold text-emerald-600 flex items-center justify-center h-[34px]">
                      Teraz...
                    </div>
                  )}
                </div>
              </div>`
);

fs.writeFileSync(p, content, 'utf-8');
console.log('Fixed OrderLogsView');
