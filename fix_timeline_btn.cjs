const fs = require('fs');

let content = fs.readFileSync('src/components/management/EmployeeTimelineView.tsx', 'utf8');

const stateInsert = `  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);`;
const stateNew = `  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [isAddingGlobalLog, setIsAddingGlobalLog] = useState(false);`;
content = content.replace(stateInsert, stateNew);

const btnInsert = `          <button 
            onClick={() => fetchLogsForDate(selectedDate)}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            title="Odśwież"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>`;
          
const btnNew = `          <button 
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
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>`;
          
content = content.replace(btnInsert, btnNew);

const modalInsert = `      {addingLogForEmployee && (
        <AddLogModal 
          employeeId={addingLogForEmployee.id}
          employeeName={\`\${addingLogForEmployee.firstName} \${addingLogForEmployee.lastName}\`}
          orders={[...orders, ...historicalOrders]}
          initialDate={selectedDate}
          onClose={() => {
            setAddingLogForEmployee(null);
            fetchLogsForDate(selectedDate);
          }}
        />
      )}`;
      
const modalNew = `      {addingLogForEmployee && (
        <AddLogModal 
          employeeId={addingLogForEmployee.id}
          employeeName={\`\${addingLogForEmployee.firstName} \${addingLogForEmployee.lastName}\`}
          orders={[...orders, ...historicalOrders]}
          initialDate={selectedDate}
          onClose={() => {
            setAddingLogForEmployee(null);
            fetchLogsForDate(selectedDate);
          }}
        />
      )}
      
      {isAddingGlobalLog && (
        <AddLogModal 
          employees={employees}
          orders={[...orders, ...historicalOrders]}
          initialDate={selectedDate}
          onClose={() => {
            setIsAddingGlobalLog(false);
            fetchLogsForDate(selectedDate);
          }}
        />
      )}`;

content = content.replace(modalInsert, modalNew);

fs.writeFileSync('src/components/management/EmployeeTimelineView.tsx', content);

