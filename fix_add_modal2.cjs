const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

const oldSignature = `export function AddLogModal({ employeeId, employeeName, orders, onClose, initialDate }: { employeeId: string, employeeName: string, orders: ProductionOrder[], onClose: () => void, initialDate?: Date }) {`;
const newSignature = `export function AddLogModal({ employeeId, employeeName, employees, orders, onClose, initialDate }: { employeeId?: string, employeeName?: string, employees?: any[], orders: ProductionOrder[], onClose: () => void, initialDate?: Date }) {`;

content = content.replace(oldSignature, newSignature);

// States for employee
const stateInsertPoint = `  const [quantity, setQuantity] = useState(0);`;
const stateNew = `  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId || '');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState(employeeName || '');
  const [quantity, setQuantity] = useState(0);`;
content = content.replace(stateInsertPoint, stateNew);

// Replace employeeId with selectedEmployeeId in handleSave
content = content.replace(/userId: employeeId/g, 'userId: selectedEmployeeId');
content = content.replace(/userName: employeeName/g, 'userName: selectedEmployeeName');

// Add validation
const saveOld = `  const handleSave = async () => {`;
const saveNew = `  const handleSave = async () => {
    if (!selectedEmployeeId) {
      alert("Proszę wybrać pracownika.");
      return;
    }`;
content = content.replace(saveOld, saveNew);

// Replace employee div with select if employees list is provided and no specific employee was passed
const empUIOld = `          {/* Pracownik */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Pracownik</label>
            <div className="flex-1 min-w-0 p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
              {employeeName}
            </div>
          </div>`;
          
const empUINew = `          {/* Pracownik */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-[9px] font-black uppercase tracking-wider text-stone-400 text-left shrink-0">Pracownik</label>
            <div className="flex-1 min-w-0">
              {employeeId && employeeName ? (
                <div className="p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 font-medium text-sm">
                  {employeeName}
                </div>
              ) : (
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => {
                    const emp = employees?.find(em => em.id === e.target.value);
                    setSelectedEmployeeId(e.target.value);
                    setSelectedEmployeeName(emp ? \`\${emp.firstName} \${emp.lastName}\` : '');
                  }}
                  className="w-full p-1.5 px-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-stone-700 text-sm"
                >
                  <option value="">Wybierz pracownika...</option>
                  {employees?.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.lastName} {emp.firstName}</option>
                  ))}
                </select>
              )}
            </div>
          </div>`;

content = content.replace(empUIOld, empUINew);

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);

