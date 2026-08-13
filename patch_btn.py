import re

with open('src/components/production/OrderLogsView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

btn_html = """              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-700">Filtruj typ meldunków w tabeli:</span>
                <button
                  type="button"
                  onClick={handleRecalculate}
                  title="Przelicz ilość z Hali na podstawie widocznych meldunków"
                  className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  <RefreshCw size={14} /> Przelicz APP
                </button>
              </div>"""

content = content.replace(
    '''              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-stone-700">Filtruj typ meldunków w tabeli:</span>
              </div>''',
    btn_html
)

with open('src/components/production/OrderLogsView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
