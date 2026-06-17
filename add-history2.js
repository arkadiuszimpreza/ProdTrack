const fs = require('fs');

let c = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const tableCode = `      </div>

      {/* SEKCJA B: HISTORIA POBRAŃ */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mt-6">
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-stone-500" size={18} />
            <h3 className="font-black text-stone-800 text-xs uppercase tracking-wider">Księga Przesunięć Międzymagazynowych</h3>
          </div>
          
          <button 
            onClick={handleExportToERP}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors uppercase select-none"
          >
            <FileSpreadsheet size={13} />
            Eksportuj pobrania do ERP (.xlsx)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap table-fixed">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-200 text-[10px] font-black uppercase text-stone-500 select-none">
                <th className="p-2 w-24">Data</th>
                <th className="p-2 w-24">Operacja</th>
                <th className="p-2 w-28">Artykuł-Nr</th>
                <th className="p-2 w-48">Nazwa asortymentu</th>
                <th className="p-2 w-28">Nr Wsadu</th>
                <th className="p-2 w-24 text-right">Ilość</th>
                <th className="p-2 w-32">Konto logowania</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-[11px] font-medium text-stone-700">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-stone-400 font-normal">Brak zarejestrowanych operacji pobrania.</td>
                </tr>
              ) : (
                withdrawals.map(w => (
                  <tr key={w.id} className={cn("hover:bg-stone-50/50 transition-colors", w.type === 'RETURN' && "bg-emerald-50/20 hover:bg-emerald-50/40")}>
                    <td className="p-2 font-semibold text-stone-500">{w.withdrawalDate}</td>
                    <td className="p-2">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-black",
                        w.type === 'WITHDRAWAL' ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"
                      )}>
                        {w.type === 'WITHDRAWAL' ? 'POBRANIE' : 'ZWROT MM'}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-stone-500">{w.articleNumber}</td>
                    <td className="p-2 truncate font-bold text-stone-800" title={w.articleName}>{w.articleName}</td>
                    <td className="p-2 font-black text-stone-900">{w.batchNumber}</td>
                    <td className={cn("p-2 text-right font-black text-sm", w.type === 'WITHDRAWAL' ? "text-indigo-600" : "text-emerald-600")}>
                      {w.type === 'WITHDRAWAL' ? '' : '+'}{w.quantityWithdrawn}
                    </td>
                    <td className="p-2 font-bold text-stone-600 truncate">{w.workerName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}`;

c = c.replace('<div className="flex flex-col md:flex-row gap-6 p-6">', '<div className="flex flex-col max-w-[1600px] mx-auto p-6">\n      <div className="flex flex-col lg:flex-row gap-6 items-start">');

c = c.replace(/\n\s*<\/div>\n\s*<\/div>\n\s*\);\n\}/, '\n' + tableCode + '\n}');

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', c);
