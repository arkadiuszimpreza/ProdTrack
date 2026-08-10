const fs = require('fs');

let content = fs.readFileSync('src/components/management/AttendanceOEEView.tsx', 'utf-8');

// Update imports
content = content.replace(
  "import { format, startOfMonth, endOfMonth, getISOWeeksInYear, startOfISOWeek, endOfISOWeek, getISOWeek, getDate, getMonth, getYear } from 'date-fns';",
  "import { format, startOfMonth, endOfMonth, getISOWeeksInYear, startOfISOWeek, endOfISOWeek, getISOWeek, getDate, getMonth, getYear, subWeeks } from 'date-fns';"
);

// Update initial state
const oldState = `  const [reportMode, setReportMode] = useState<'month' | 'week'>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getISOWeek(new Date()));`;

const newState = `  const previousWeekDate = subWeeks(new Date(), 1);
  const [reportMode, setReportMode] = useState<'month' | 'week'>('week');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(previousWeekDate.getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getISOWeek(previousWeekDate));`;

content = content.replace(oldState, newState);

fs.writeFileSync('src/components/management/AttendanceOEEView.tsx', content);
