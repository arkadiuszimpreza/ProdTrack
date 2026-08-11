const fs = require('fs');
let content = fs.readFileSync('src/components/management/EmployeeTimelineView.tsx', 'utf8');

const target = `          <button 
            onClick={() => fetchLogsForDate(selectedDate)}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            title="Odśwież"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin text-indigo-600" : ""} />
          </button>`;

const replacement = `          <button 
            onClick={() => setIsAddingGlobalLog(true)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white font-semibold text-xs rounded-lg shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus size={16} />
            Dodaj meldunek
          </button>
          <button 
            onClick={() => fetchLogsForDate(selectedDate)}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            title="Odśwież"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin text-indigo-600" : ""} />
          </button>`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/management/EmployeeTimelineView.tsx', content);
