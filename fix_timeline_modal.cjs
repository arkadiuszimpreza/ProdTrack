const fs = require('fs');

let content = fs.readFileSync('src/components/management/EmployeeTimelineView.tsx', 'utf8');

const oldStr = `<AddLogModal 
          employeeId={addingLogForEmployee.id}
          employeeName={\`\${addingLogForEmployee.firstName} \${addingLogForEmployee.lastName}\`}
          orders={[...orders, ...historicalOrders]}
          onClose={() => {
            setAddingLogForEmployee(null);
            fetchLogsForDate(selectedDate);
          }}
        />`;

const newStr = `<AddLogModal 
          employeeId={addingLogForEmployee.id}
          employeeName={\`\${addingLogForEmployee.firstName} \${addingLogForEmployee.lastName}\`}
          orders={[...orders, ...historicalOrders]}
          initialDate={selectedDate}
          onClose={() => {
            setAddingLogForEmployee(null);
            fetchLogsForDate(selectedDate);
          }}
        />`;

content = content.replace(oldStr, newStr);

fs.writeFileSync('src/components/management/EmployeeTimelineView.tsx', content);

