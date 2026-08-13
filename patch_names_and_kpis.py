import re

# Update ClientOrderSummaryView.tsx
with open('src/components/management/ClientOrderSummaryView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update elementName construction in ClientOrderSummaryView.tsx
old_elem_name_code = """      const elementName = eId === 'whole_order'
        ? `Praca ogólna (${orderName})`
        : `${element?.name || elemAcc.logs.find(l => l.elementName)?.elementName || 'Element'} (${orderName})`;"""

new_elem_name_code = """      const rawName = element?.name || elemAcc.logs.find(l => l.elementName)?.elementName;
      let namePart = '';
      if (rawName && rawName.trim().toLowerCase() !== 'element') {
        namePart = rawName;
      } else if (order?.productName) {
        namePart = order.productName;
      } else {
        namePart = 'Wyrób';
      }

      const elementName = eId === 'whole_order'
        ? (order?.productName ? `${order.productName} (${orderName})` : `Praca ogólna (${orderName})`)
        : `${namePart} (${orderName})`;"""

content = content.replace(old_elem_name_code, new_elem_name_code)

# 2. Add KPI summary cards section in ClientOrderSummaryView.tsx right inside max-w-7xl before filter switch
target_marker = '{/* PRZEŁĄCZNIK ŹRÓDŁA MELDUNKÓW */}'

kpi_cards = """{/* GŁÓWNE KARTY TONAZU DLA ZLECENIA KLIENTA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                  <Scale size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Waga Planowana (Całość)</p>
                  <p className="text-lg font-black text-stone-900 font-mono tracking-tight">
                    {totalPlannedWeight.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} <span className="text-xs font-bold text-stone-500">kg</span>
                  </p>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Waga Rzeczywista (Hala)</p>
                  <p className="text-lg font-black text-emerald-700 font-mono tracking-tight">
                    {totalActualWeight.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} <span className="text-xs font-bold text-emerald-600">kg</span>
                  </p>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                  <BarChart2 size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Realizacja Tonażu</p>
                  <p className="text-lg font-black text-amber-700 font-mono tracking-tight">
                    {totalPlannedWeight > 0 ? ((totalActualWeight / totalPlannedWeight) * 100).toFixed(1) : '0.0'} <span className="text-xs font-bold text-amber-600">%</span>
                  </p>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                  <Package size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Zlecenia Produkcyjne</p>
                  <p className="text-lg font-black text-blue-900 font-mono tracking-tight">
                    {clientOrders.length} <span className="text-xs font-bold text-blue-600">ZP</span>
                  </p>
                </div>
              </div>
            </div>

            {/* PRZEŁĄCZNIK ŹRÓDŁA MELDUNKÓW */}"""

content = content.replace(target_marker, kpi_cards)

with open('src/components/management/ClientOrderSummaryView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)


# Also update OrderLogsView.tsx
with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content_olv = f.read()

old_olv_elem_name = """      const elementName = eId === 'whole_order'
        ? 'Praca ogólna na zleceniu'
        : (element?.name || elemAcc.logs.find(l => l.elementName)?.elementName || 'Element');"""

new_olv_elem_name = """      const rawName = element?.name || elemAcc.logs.find(l => l.elementName)?.elementName;
      let namePart = '';
      if (rawName && rawName.trim().toLowerCase() !== 'element') {
        namePart = rawName;
      } else if (order.productName) {
        namePart = order.productName;
      } else {
        namePart = 'Element';
      }

      const elementName = eId === 'whole_order'
        ? (order.productName ? `Praca ogólna - ${order.productName}` : 'Praca ogólna na zleceniu')
        : namePart;"""

content_olv = content_olv.replace(old_olv_elem_name, new_olv_elem_name)

with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content_olv)

