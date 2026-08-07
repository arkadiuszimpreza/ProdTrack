import re

with open('src/components/common/MainDashboard.tsx', 'r') as f:
    content = f.read()

# Add state
state_old = "  const [showBOModal, setShowBOModal] = useState(false);"
state_new = """  const [showBOModal, setShowBOModal] = useState(false);
  
  // Stan dla widoków analitycznych (pełna lista zleceń)
  const [analyticalOrders, setAnalyticalOrders] = useState<ProductionOrder[] | null>(null);
  const [isFetchingAnalytical, setIsFetchingAnalytical] = useState(false);"""
content = content.replace(state_old, state_new)

# Add useEffect
effect_old = "  // 1. Wyszukiwanie LOKALNE"
effect_new = """  // Pobieranie wszystkich zleceń z bazy, gdy wejdziemy w widok analityczny
  useEffect(() => {
    const isAnalyticalView = ['tonnage-stats', 'element-stats', 'reports', 'timeline'].includes(view);
    
    if (isAnalyticalView && !analyticalOrders && !isFetchingAnalytical) {
      setIsFetchingAnalytical(true);
      const fetchAllOrders = async () => {
        try {
          const q = query(collection(db, 'orders'));
          const snap = await getDocs(q);
          const all = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ProductionOrder[];
          setAnalyticalOrders(all);
        } catch (error) {
          console.error("Błąd pobierania wszystkich zleceń dla analityki:", error);
        } finally {
          setIsFetchingAnalytical(false);
        }
      };
      fetchAllOrders();
    }
  }, [view, analyticalOrders, isFetchingAnalytical]);

  const ordersForAnalyticalViews = analyticalOrders || props.orders;

  // 1. Wyszukiwanie LOKALNE"""
content = content.replace(effect_old, effect_new)

# Replace props
content = content.replace("<ElementStatsView orders={props.orders}", "<ElementStatsView orders={ordersForAnalyticalViews}")
content = content.replace("<TonnageStatsView orders={props.orders}", "<TonnageStatsView orders={ordersForAnalyticalViews}")
content = content.replace("orders={props.orders} />\n              ) : view === 'timeline'", "orders={ordersForAnalyticalViews} />\n              ) : view === 'timeline'")
content = content.replace("<EmployeeTimelineView orders={props.orders}", "<EmployeeTimelineView orders={ordersForAnalyticalViews}")

with open('src/components/common/MainDashboard.tsx', 'w') as f:
    f.write(content)
