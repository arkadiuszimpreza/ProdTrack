const fs = require('fs');

let content = fs.readFileSync('src/components/production/OrderLogsView.tsx', 'utf8');

const oldStr = `export function AddLogModal({ employeeId, employeeName, orders, onClose }: { employeeId: string, employeeName: string, orders: ProductionOrder[], onClose: () => void }) {
  const [quantity, setQuantity] = useState(0);
  const [category, setCategory] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedElementId, setSelectedElementId] = useState('');
  const [isManual, setIsManual] = useState(true);
  
  const now = new Date();`;

const newStr = `export function AddLogModal({ employeeId, employeeName, orders, onClose, initialDate }: { employeeId: string, employeeName: string, orders: ProductionOrder[], onClose: () => void, initialDate?: Date }) {
  const [quantity, setQuantity] = useState(0);
  const [category, setCategory] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedElementId, setSelectedElementId] = useState('');
  const [isManual, setIsManual] = useState(true);
  
  const now = initialDate || new Date();`;

content = content.replace(oldStr, newStr);

fs.writeFileSync('src/components/production/OrderLogsView.tsx', content);

