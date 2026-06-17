const fs = require('fs');
const content = `
export const parseArticleRegistry = async (file: File): Promise<InventoryArticle[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rows.length === 0) throw new Error('Plik Excel jest pusty.');

        const articles: InventoryArticle[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const indexErp = getVal(row, ['indeks', 'index', 'indykator', 'articlenumber', 'numerartykul', 'numerartykulu', 'kod', 'kodartykulu']) || getVal(row, ['indeks']);
          const nameErp = getVal(row, ['nazwa', 'name', 'opis', 'articlename', 'nazwaartykulu', 'nazwaartykul']);
          const unit = getVal(row, ['jm', 'jednostka', 'unit']);
          
          if (!indexErp && !nameErp) continue;

          articles.push({
            id: String(indexErp || nameErp).trim().replace(/[\\\\/]/g, '_'), 
            articleNumber: String(indexErp || '').trim(),
            articleName: String(nameErp || 'Brak nazwy').trim(),
            unit: String(unit || '').trim()
          });
        }
        resolve(articles);
      } catch (err: any) {
        reject(new Error('Błąd podczas parsowania pliku Katalogu: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Błąd odczytu pliku (FileReader)'));
    reader.readAsArrayBuffer(file);
  });
};
`;
fs.appendFileSync('src/utils/inventoryExcelParser.ts', content);
console.log('Appended successfully');
