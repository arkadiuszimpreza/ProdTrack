import re

with open('src/components/management/ClientOrderSummaryView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix getStatsForLogs
old_get_stats = r'    const elemMap = new Map<string, ElementAcc>\(\);\n\n    completedLogs\.forEach.*?    return \{\n      elements,\n      totalSeconds,\n      totalLaborCost,\n      totalQuantity,\n      totalWorkedWeight\n    \};\n  \};'

new_get_stats = """    const elemMap = new Map<string, ElementAcc>();

    completedLogs.forEach(log => {
      // Grupujemy po kombinacji orderId + elementId aby waga była z konkretnego zlecenia
      const oId = log.orderId || 'unknown_order';
      const eId = log.elementId || 'whole_order';
      const key = `${oId}_${eId}`;

      if (!elemMap.has(key)) elemMap.set(key, { logs: [], workerMap: new Map() });
      const elemAcc = elemMap.get(key)!;
      elemAcc.logs.push(log);

      const uid = log.userId;
      if (!elemAcc.workerMap.has(uid)) {
        elemAcc.workerMap.set(uid, { userId: uid, userName: log.userName, totalSeconds: 0, totalQuantity: 0 });
      }
      const wa = elemAcc.workerMap.get(uid)!;
      wa.totalSeconds += (log.duration || 0);
      wa.totalQuantity += (log.quantityReported || 0);
    });

    const elements: ElementStat[] = [];

    elemMap.forEach((elemAcc, key) => {
      const [oId, eId] = key.split('_');
      let element: any = undefined;
      let baseWeight = 0;
      let orderName = 'Zlecenie';
      
      const order = clientOrders.find(o => o.id === oId);
      if (order) {
        orderName = order.orderNumber;
        if (eId === 'whole_order') {
           // Waga całej sztuki (suma elementów lub totalWeight)
           baseWeight = (order.elements && order.elements.length > 0) 
             ? order.elements.reduce((s, el) => s + (el.weight || 0), 0)
             : (order.totalWeight || 0);
        } else {
           element = order.elements?.find(e => e.id === eId);
           if (element) {
              baseWeight = element.weight || 0;
           }
        }
      }

      const totalSec = Array.from(elemAcc.workerMap.values()).reduce((s, w) => s + w.totalSeconds, 0);
      const totalQty = Array.from(elemAcc.workerMap.values()).reduce((s, w) => s + w.totalQuantity, 0);
      
      // Mnożymy wagę bazową (1 sztuki/elementu) przez zaraportowaną ilość
      const weight = baseWeight * totalQty;

      const laborCost = (totalSec / 3600) * HOURLY_RATE;
      const costPerKg = weight > 0 ? laborCost / weight : null;

      const workers: WorkerStat[] = Array.from(elemAcc.workerMap.values())
        .sort((a, b) => b.totalSeconds - a.totalSeconds);

      const elementName = eId === 'whole_order'
        ? `Praca ogólna (${orderName})`
        : `${element?.name || elemAcc.logs.find(l => l.elementName)?.elementName || 'Element'} (${orderName})`;

      elements.push({
        elementId: key, // unikany klucz
        elementName,
        weight,
        isWholeOrder: eId === 'whole_order',
        totalSeconds: totalSec,
        totalQuantity: totalQty,
        laborCost,
        costPerKg,
        workers,
      });
    });

    elements.sort((a, b) => b.totalSeconds - a.totalSeconds);

    const totalSeconds = elements.reduce((s, e) => s + e.totalSeconds, 0);
    const totalLaborCost = elements.reduce((s, e) => s + e.laborCost, 0);
    const totalQuantity = elements.reduce((s, e) => s + e.totalQuantity, 0);
    const totalWorkedWeight = elements.reduce((s, e) => s + e.weight, 0);

    return {
      elements,
      totalSeconds,
      totalLaborCost,
      totalQuantity,
      totalWorkedWeight
    };
  };"""

content = re.sub(old_get_stats, new_get_stats, content, flags=re.DOTALL)

# 2. Replace totalOrderWeight with global weights
old_total_weight = r'  const totalOrderWeight = useMemo\(\(\) => \{.*?\n  \}, \[clientOrders\]\);'

new_total_weight = """  const { totalPlannedWeight, totalActualWeight } = useMemo(() => {
    let planned = 0;
    let actual = 0;
    clientOrders.forEach(o => {
      // 1. Waga 1 sztuki całego wyrobu (suma elementów lub waga wpisana ręcznie)
      const unitWeight = (o.elements && o.elements.length > 0) 
        ? o.elements.reduce((sum, el) => sum + (el.weight || 0), 0) 
        : (o.totalWeight || 0);
      
      // 2. Waga planowana (waga sztuki * ilość zaplanowana)
      planned += unitWeight * (o.targetQuantity || 1);
      
      // 3. Waga rzeczywista (waga sztuki * ilość zaraportowana na hali)
      const reportedQty = o.appReportedQuantity ?? o.reportedQuantity ?? 0;
      actual += unitWeight * reportedQty;
    });
    return { totalPlannedWeight: planned, totalActualWeight: actual };
  }, [clientOrders]);"""

content = re.sub(old_total_weight, new_total_weight, content, flags=re.DOTALL)


# 3. Add global weights to the Header
header_old = r'            <p className="text-xs text-stone-500 mt-0\.5 font-medium">Ilość zleceń prod: \{clientOrders\.length\}</p>\n          </div>\n        </div>\n      </div>'

header_new = """            <div className="flex items-center gap-4 mt-1">
              <p className="text-xs text-stone-500 font-medium">Ilość zleceń: {clientOrders.length}</p>
              <div className="w-1 h-1 rounded-full bg-stone-300" />
              <p className="text-xs text-stone-500 font-medium flex items-center gap-1">
                Waga Planowana: <span className="font-bold text-stone-700">{totalPlannedWeight.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kg</span>
              </p>
              <div className="w-1 h-1 rounded-full bg-stone-300" />
              <p className="text-xs text-stone-500 font-medium flex items-center gap-1">
                Waga Rzeczywista (Hala): <span className="font-bold text-emerald-600">{totalActualWeight.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} kg</span>
              </p>
            </div>
          </div>
        </div>
      </div>"""

content = re.sub(header_old, header_new, content)

with open('src/components/management/ClientOrderSummaryView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
