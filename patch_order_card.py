import re

with open('src/components/production/OrderCard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'onShowLogs\?: \(\) => void;',
    'onShowLogs?: () => void;\n  onShowClientLogs?: () => void;',
    content
)

content = re.sub(
    r'onShowLogs,\s*isWorking',
    'onShowLogs,\n  onShowClientLogs,\n  isWorking',
    content
)

button_to_add = '''
                        {order.erpOrderNumber && (
                          <button 
                            onClick={() => { setShowMenu(false); if(onShowClientLogs) onShowClientLogs(); }} 
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-50 hover:text-purple-600 text-left transition-colors"
                          >
                            <Layers size={14} /> Podsumowanie Zlec. Klienta
                          </button>
                        )}
'''

content = re.sub(
    r'<button \n\s*onClick=\{.*? Historia meldunków\n\s*</button>',
    lambda m: m.group(0) + button_to_add,
    content
)

with open('src/components/production/OrderCard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
