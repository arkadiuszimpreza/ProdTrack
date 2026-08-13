import re

with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add states
content = content.replace(
    "const [confirmMultiDeleteDialog, setConfirmMultiDeleteDialog] = useState(false);",
    "const [confirmMultiDeleteDialog, setConfirmMultiDeleteDialog] = useState(false);\n  const [confirmRecalculateDialog, setConfirmRecalculateDialog] = useState(false);\n  const [isRecalculating, setIsRecalculating] = useState(false);"
)

# 2. Replace handleRecalculate
old_recalc_pattern = r'  const handleRecalculate = async \(\) => \{.*?alert\(\'Błąd podczas przeliczania\.\'\);\s*\}\s*\};'

new_recalc = """  const handleRecalculate = () => {
    setConfirmRecalculateDialog(true);
  };

  const executeRecalculate = async () => {
    setIsRecalculating(true);
    try {
      let totalAppQty = 0;
      let elementsState = order.elements ? [...order.elements].map(e => ({...e, reportedQuantity: 0})) : [];

      logs.filter(l => l.quantityReported && l.quantityReported > 0).forEach(log => {
        let weightedDelta = log.quantityReported || 0;
        
        if (log.elementId && elementsState.length > 0) {
          const targetElement = elementsState.find((el: any) => el.id === log.elementId);
          if (targetElement) {
            const totalWeight = elementsState.reduce((sum: number, el: any) => sum + (el.weight || 0), 0);
            if (totalWeight > 0) {
              weightedDelta = (log.quantityReported || 0) * ((targetElement.weight || 0) / totalWeight);
            }
            targetElement.reportedQuantity = (targetElement.reportedQuantity || 0) + (log.quantityReported || 0);
          }
        }
        totalAppQty += weightedDelta;
      });

      const newAppTotal = Number(totalAppQty.toFixed(3));
      const newStatus = calculateOrderStatus(
        order.erpReportedQuantity || order.reportedQuantity || 0,
        newAppTotal,
        order.targetQuantity || 1,
        false,
        elementsState.length > 0 ? elementsState : undefined
      );

      const updateData: any = {
        appReportedQuantity: newAppTotal,
        status: newStatus
      };
      if (elementsState.length > 0) {
        updateData.elements = elementsState;
      }

      await updateDoc(doc(db, 'orders', order.id), updateData);
      setConfirmRecalculateDialog(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRecalculating(false);
    }
  };"""

content = re.sub(old_recalc_pattern, new_recalc, content, flags=re.DOTALL)

# 3. Add markup next to confirmMultiDeleteDialog
modal_markup = """      {confirmRecalculateDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-2">Przelicz ilość APP</h3>
              <p className="text-stone-600 text-sm">
                Czy na pewno chcesz przeliczyć wkład i status zlecenia na podstawie historii meldunków? Użyj tego, jeśli suma meldunków z Hali nie zgadza się ze statusem ZP.
              </p>
            </div>
            <div className="bg-stone-50 p-4 border-t border-stone-100 flex justify-end gap-3">
              <button
                onClick={() => setConfirmRecalculateDialog(false)}
                className="px-4 py-2 font-bold text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-colors text-sm"
                disabled={isRecalculating}
              >
                Anuluj
              </button>
              <button
                onClick={executeRecalculate}
                className="px-4 py-2 font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors shadow-sm flex items-center gap-2 text-sm"
                disabled={isRecalculating}
              >
                {isRecalculating ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <RefreshCw size={16} />}
                Przelicz Zlecenie
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmMultiDeleteDialog && ("""

content = content.replace('{confirmMultiDeleteDialog && (', modal_markup)

with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

