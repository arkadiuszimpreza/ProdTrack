import re

with open('src/components/common/MainDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
content = re.sub(
    r'import \{ OrderLogsView \} from \'\.\./production/OrderLogsView\';',
    'import { OrderLogsView } from \'../production/OrderLogsView\';\nimport { ClientOrderSummaryView } from \'../management/ClientOrderSummaryView\';',
    content
)

# Add state
content = re.sub(
    r'const \[viewingOrderLogs, setViewingOrderLogs\] = useState<ProductionOrder \| null>\(null\);',
    'const [viewingOrderLogs, setViewingOrderLogs] = useState<ProductionOrder | null>(null);\n  const [viewingClientOrderSummary, setViewingClientOrderSummary] = useState<string | null>(null);',
    content
)

# Add component
client_summary_comp = '''
                {viewingClientOrderSummary && (
                  <ClientOrderSummaryView
                    erpOrderNumber={viewingClientOrderSummary}
                    orders={[...props.orders, ...archivedOrders]}
                    employees={props.employees}
                    onClose={() => setViewingClientOrderSummary(null)}
                  />
                )}
'''
content = re.sub(
    r'(\{viewingOrderLogs && \(\s*<OrderLogsView.*?\/>\s*\)\})',
    lambda m: m.group(1) + client_summary_comp,
    content,
    flags=re.DOTALL
)

# Add prop to OrderCard
content = re.sub(
    r'onShowLogs=\{.*?\}',
    lambda m: m.group(0) + '\n                          onShowClientLogs={() => setViewingClientOrderSummary(order.erpOrderNumber!)}',
    content
)

with open('src/components/common/MainDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
