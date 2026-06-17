const fs = require('fs');
let c = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

c = c.replace(/\{\/\* LEWY PANEL - ASORTYMENT \*\/\}[\\s\\S]*?\{\/\* PRAWA KOLUMNA \*\/\}/, `{/* LEWY PANEL - ASORTYMENT */}
      <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-stone-100 bg-stone-50">
            <h3 className="font-black text-stone-800 text-sm uppercase tracking-wider mb-3">Wybierz Materiał</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Wyszukaj z dostępnych..."
                  value={searchArticle}
                  onChange={(e) => setSearchArticle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              {searchArticle && (
                <button 
                  onClick={() => setSearchArticle('')}
                  className="w-10 h-10 flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 rounded-xl transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex gap-1.5 mt-3 overflow-x-auto custom-scrollbar pb-1">
              {['ALL', 'RU', 'PR', 'BL', 'FA', 'SR'].map(f => (
                <button
                  key={f}
                  onClick={() => setMaterialFilter(f as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                    materialFilter === f 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-stone-200/50 text-stone-500 hover:bg-stone-200"
                  )}
                >
                  {f === 'ALL' ? 'WSZYSTKO' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredArticles.length === 0 ? (
              <div className="text-center p-6 text-stone-400 text-xs font-semibold">
                Brak materiałów spełniających kryteria na placu
              </div>
            ) : (
              filteredArticles.map(a => (
                  <button
                    key={a.articleNumber}
                    onClick={() => {
                      setSelectedArticle(a.articleNumber);
                      setWithdrawalQuantities({});
                      setCalcValues({});
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all border",
                      selectedArticle === a.articleNumber 
                        ? "bg-indigo-50 border-indigo-200 shadow-sm" 
                        : "bg-white border-transparent hover:border-stone-200 hover:bg-white"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-2">
                        <div className="text-[10px] font-mono font-bold text-stone-500">{a.articleNumber}</div>
                        <div className={cn("text-xs font-black truncate mt-0.5", selectedArticle === a.articleNumber ? "text-indigo-900" : "text-stone-700")} title={a.articleName}>
                          {a.articleName}
                        </div>
                      </div>
                      <ChevronRight size={16} className={cn("shrink-0 mt-2 transition-transform", selectedArticle === a.articleNumber ? "text-indigo-600 translate-x-1" : "text-stone-300")} />
                    </div>
                  </button>
                ))
            )}
          </div>
        </div>
      </div>

      {/* PRAWA KOLUMNA */}`);
      
c = c.replace(/await batchWrite\.commit\(\);\s*alert\(\`Pomyślnie wydano \$\{totalEnteredQty\} jednostek do produkcji!\`\);\s*setWithdrawalQuantities\(\{\}\);\s*setSelectedArticle[\s\S]*?className=\{cn\(/, `await batchWrite.commit();
      alert(\`Pomyślnie wydano \${totalEnteredQty} jednostek do produkcji!\`);
      
      setWithdrawalQuantities({});
      setSelectedArticle(null);
      setCalcValues({});
    } catch (err) {
      console.error(err);
      alert('Wystąpił błąd zapisu dokumentu pobrania.');
    }
  };

  const handleExportToERP = () => {
    if (withdrawals.length === 0) return alert('Brak pobrań do wyeksportowania!');
    
    const exportData = withdrawals.map(w => ({
      'Data Pobrania': w.withdrawalDate,
      'Nr Artykułu': w.articleNumber,
      'Nazwa': w.articleName,
      'Nr Wsadu': w.batchNumber,
      'Ilość Pobrana': w.quantityWithdrawn,
      'Operacja': w.type === 'WITHDRAWAL' ? 'Pobranie' : 'Zwrot',
      'Pracownik': w.workerName
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pobrania");
    XLSX.writeFile(wb, \`Eksport_Pobran_\${new Date().toISOString().slice(0,10)}.xlsx\`);
  };

  if (loading) return <div className="p-8 text-center text-stone-400 font-bold text-sm">Ładowanie pobrań...</div>;

  const activeBatches = batches.filter(b => b.numericQuantity > 0 && b.articleNumber === selectedArticle);
  // sort by deliveryDate or creation etc
  activeBatches.sort((a,b) => {
    const qA = a.deliveryDate || '';
    const qB = b.deliveryDate || '';
    return qA.localeCompare(qB);
  });

  const filteredArticles = availableArticles.filter(a => {
    const isMatched = a.articleName.toLowerCase().includes(searchArticle.toLowerCase()) || 
                      a.articleNumber.toLowerCase().includes(searchArticle.toLowerCase());
    if (!isMatched) return false;
    if (materialFilter === 'ALL') return true;
    return guessPrefix(a.articleName) === materialFilter;
  });

  return (
    <div className="flex flex-col md:flex-row gap-6 p-6">
      
      {/* LEWY PANEL - ASORTYMENT */}
      <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-stone-100 bg-stone-50">
            <h3 className="font-black text-stone-800 text-sm uppercase tracking-wider mb-3">Wybierz Materiał</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Wyszukaj z dostępnych..."
                  value={searchArticle}
                  onChange={(e) => setSearchArticle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              {searchArticle && (
                <button 
                  onClick={() => setSearchArticle('')}
                  className="w-10 h-10 flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 rounded-xl transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex gap-1.5 mt-3 overflow-x-auto custom-scrollbar pb-1">
              {['ALL', 'RU', 'PR', 'BL', 'FA', 'SR'].map(f => (
                <button
                  key={f}
                  onClick={() => setMaterialFilter(f as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                    materialFilter === f 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-stone-200/50 text-stone-500 hover:bg-stone-200"
                  )}
                >
                  {f === 'ALL' ? 'WSZYSTKO' : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredArticles.length === 0 ? (
              <div className="text-center p-6 text-stone-400 text-xs font-semibold">
                Brak materiałów spełniających kryteria na placu
              </div>
            ) : (
              filteredArticles.map(a => (
                  <button
                    key={a.articleNumber}
                    onClick={() => {
                      setSelectedArticle(a.articleNumber);
                      setWithdrawalQuantities({});
                      setCalcValues({});
                    }}
                    className={cn(`);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', c);
