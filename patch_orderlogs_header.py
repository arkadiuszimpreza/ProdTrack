import re

with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'interface OrderLogsViewProps \{.*?\n\}',
    '''interface OrderLogsViewProps {
  order: ProductionOrder;
  orders: ProductionOrder[]; // Potrzebne do modala edycji
  employees: Employee[];
  onClose: () => void;
  onShowClientLogs?: (erpOrderNumber: string) => void;
}''',
    content,
    flags=re.DOTALL
)

content = re.sub(
    r'export function OrderLogsView\(\{ order, orders, employees, onClose \}: OrderLogsViewProps\) \{',
    'export function OrderLogsView({ order, orders, employees, onClose, onShowClientLogs }: OrderLogsViewProps) {',
    content
)

header_button = '''
          {order.erpOrderNumber && onShowClientLogs && (
            <button
              onClick={() => {
                onClose();
                onShowClientLogs(order.erpOrderNumber!);
              }}
              className="px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm"
            >
              <Layers size={16} /> Podsumowanie Zlecenia Klienta ({order.erpOrderNumber})
            </button>
          )}
'''

content = re.sub(
    r'(<p className="text-xs text-stone-500 mt-0\.5 font-medium">\{order\.productName\}</p>\s*</div>\s*</div>)',
    r'\1' + header_button,
    content
)

with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
