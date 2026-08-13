const fs = require('fs');
const path = require('path');
const p = path.resolve('src/components/production/OrderLogsView.tsx');
let content = fs.readFileSync(p, 'utf-8');

// 1. EditLogModal state
content = content.replace(
`  const [selectedElementId, setSelectedElementId] = useState(log.elementId || '');
  const [isManual, setIsManual] = useState(log.manual ?? false);
  
  const [startTimeStr, setStartTimeStr] = useState(formatDateForInput(log.startTime));`,
`  const [selectedElementId, setSelectedElementId] = useState(log.elementId || '');
  const [isManual, setIsManual] = useState(log.manual ?? false);
  const [isInProgress, setIsInProgress] = useState(!log.endTime);
  
  const [startTimeStr, setStartTimeStr] = useState(formatDateForInput(log.startTime));`
);

// 2. EditLogModal handleSave
content = content.replace(
`  const handleSave = async () => {

    const start = new Date(startTimeStr);
    const end = endTimeStr ? new Date(endTimeStr) : null;
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime())) {`,
`  const handleSave = async () => {

    const start = new Date(startTimeStr);
    const end = (!isInProgress && endTimeStr) ? new Date(endTimeStr) : null;
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime())) {`
);

// 3. AddLogModal state
content = content.replace(
`  const [selectedElementId, setSelectedElementId] = useState('');
  const [isManual, setIsManual] = useState(true);
  
  const now = new Date();`,
`  const [selectedElementId, setSelectedElementId] = useState('');
  const [isManual, setIsManual] = useState(true);
  const [isInProgress, setIsInProgress] = useState(false);
  
  const now = new Date();`
);

// 4. AddLogModal handleSave
content = content.replace(
`  const handleSave = async () => {
    const start = new Date(startTimeStr);
    const end = endTimeStr ? new Date(endTimeStr) : null;
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime())) {`,
`  const handleSave = async () => {
    const start = new Date(startTimeStr);
    const end = (!isInProgress && endTimeStr) ? new Date(endTimeStr) : null;
    const safeQuantity = isNaN(Number(quantity)) ? 0 : Number(quantity);

    if (isNaN(start.getTime())) {`
);

fs.writeFileSync(p, content, 'utf-8');
console.log('Fixed OrderLogsView state & save');
