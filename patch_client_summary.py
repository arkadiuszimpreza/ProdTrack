import re

with open('src/components/management/ClientOrderSummaryView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Props interface
content = re.sub(
    r'interface ClientOrderSummaryViewProps \{.*?\n\}',
    '''interface ClientOrderSummaryViewProps {
  erpOrderNumber: string;
  orders: ProductionOrder[];
  employees: Employee[];
  onClose: () => void;
}''',
    content,
    flags=re.DOTALL
)

# Replace component signature
content = re.sub(
    r'export function ClientOrderSummaryView\(\{ order, orders, employees, onClose \}: ClientOrderSummaryViewProps\) \{',
    '''export function ClientOrderSummaryView({ erpOrderNumber, orders, employees, onClose }: ClientOrderSummaryViewProps) {
  const clientOrders = useMemo(() => orders.filter(o => o.erpOrderNumber === erpOrderNumber), [orders, erpOrderNumber]);''',
    content
)

# Replace fetchLogs inside useEffect
fetch_logs_replacement = '''const fetchLogs = async () => {
      try {
        if (clientOrders.length === 0) {
           setLogs([]);
           setLoading(false);
           return;
        }
        
        const allLogs: WorkLog[] = [];
        
        for (let i = 0; i < clientOrders.length; i += 10) {
           const chunk = clientOrders.slice(i, i + 10).map(o => o.id);
           const q = query(collection(db, 'workLogs'), where('orderId', 'in', chunk));
           const snap = await getDocs(q);
           snap.forEach(doc => {
             allLogs.push({ ...doc.data(), id: doc.id } as WorkLog);
           });
        }
        
        setLogs(allLogs);
      } catch (error) {
        console.error("Błąd podczas pobierania meldunków:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [erpOrderNumber, clientOrders, editingLog]); // Odśwież po zamknięciu edycji'''

content = re.sub(
    r'const fetchLogs = async \(\) => \{.*?\}, \[order\.id, editingLog\]\); // Odśwież po zamknięciu edycji',
    fetch_logs_replacement,
    content,
    flags=re.DOTALL
)

# Replace getStatsForLogs to use clientOrders
# In getStatsForLogs, it currently looks for `order.elements`. We need to search across all `clientOrders`.
stats_replacement = '''
    elemMap.forEach((elemAcc, eId) => {
      let element: any = undefined;
      let baseWeight = 0;
      
      if (eId === 'whole_order') {
         baseWeight = clientOrders.reduce((sum, o) => sum + (o.totalWeight || 0), 0);
      } else {
         for (const o of clientOrders) {
            const el = o.elements?.find(e => e.id === eId);
            if (el) {
               element = el;
               baseWeight = el.weight || 0;
               break;
            }
         }
      }
'''
content = re.sub(
    r'elemMap\.forEach\(\(elemAcc, eId\) => \{\s*const element = order\.elements\?\.find\(e => e\.id === eId\);\s*const baseWeight = eId === \'whole_order\'\s*\?\s*\(order\.totalWeight \|\| 0\)\s*:\s*\(element\?\.weight \|\| 0\);',
    stats_replacement,
    content,
    flags=re.DOTALL
)

# Replace manualStats and hallStats dependencies
content = re.sub(r'\}, \[logs, order\]\);', r'}, [logs, clientOrders]);', content)

# Replace calculateContribution to use the order it belongs to
contribution_replacement = '''
  const calculateContribution = (log: WorkLog) => {
    const qty = log.quantityReported || 0;
    if (qty === 0) return { pct: 0, targetLabel: 'Zlecenia', weightedIncrement: 0 };

    const logOrder = clientOrders.find(o => o.id === log.orderId);
    let target = logOrder?.targetQuantity || 1;
    let targetLabel = 'Zlecenia';
    let weightedIncrement = qty;

    if (log.elementId && logOrder?.elements && logOrder.elements.length > 0) {
      const element = logOrder.elements.find(e => e.id === log.elementId);
      if (element) {
        const totalWeightPerUnit = logOrder.elements.reduce((sum, el) => sum + (el.weight || 0), 0);
        if (totalWeightPerUnit > 0) {
          weightedIncrement = qty * (element.weight / totalWeightPerUnit);
        }
        targetLabel = 'Całego Zlecenia (Wagowo)';
      }
    }

    const pct = (weightedIncrement / target) * 100;
    return { pct, targetLabel, weightedIncrement };
  };
'''
content = re.sub(
    r'const calculateContribution = \(log: WorkLog\) => \{.*?\n  \};\n',
    contribution_replacement,
    content,
    flags=re.DOTALL
)


# Replace totalOrderWeight
content = re.sub(
    r'const totalOrderWeight = useMemo\(\(\) => \{.*?\n  \}, \[order\]\);',
    '''const totalOrderWeight = useMemo(() => {
    return clientOrders.reduce((sum, o) => sum + (o.totalWeight || o.elements?.reduce((s, el) => s + (el.weight || 0), 0) || 0), 0);
  }, [clientOrders]);''',
    content,
    flags=re.DOTALL
)

# Replace the title in the header
content = re.sub(
    r'<h2 className="text-xl font-black tracking-tight text-stone-900 mt-1">Meldunki dla \{order\.orderNumber\}</h2>',
    r'<h2 className="text-xl font-black tracking-tight text-stone-900 mt-1">Podsumowanie ERP: {erpOrderNumber}</h2>',
    content
)
content = re.sub(
    r'<span className="text-\[10px\] font-black uppercase tracking-widest text-stone-400 bg-stone-100 px-2 py-1 rounded-md">\{order\.productName\}</span>',
    r'<span className="text-[10px] font-black uppercase tracking-widest text-stone-400 bg-stone-100 px-2 py-1 rounded-md">{clientOrders.length} Zleceń</span>',
    content
)


with open('src/components/management/ClientOrderSummaryView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
