const fs = require('fs');
let code = fs.readFileSync('src/utils/materialUtils.ts', 'utf8');

// We need to add parsing for kątownik, ceownik, dwuteownik, pręt

const addCode = `
  const katownikMatch = normName.match(/k.townik.*?(\\d+)\\s*(?:x|×)\\s*(\\d+)\\s*(?:x|×)\\s*([\\d,.]+)/);
  if (katownikMatch) {
    let w = parseInt(katownikMatch[1], 10);
    let h = parseInt(katownikMatch[2], 10);
    if (h > w) { const t = w; w = h; h = t; }
    
    return {
      parsedType: 'katownik',
      dim1: w.toString().padStart(3, '0'),
      dim2: h.toString().padStart(3, '0'), 
      thickness: parseFloat(katownikMatch[3].replace(',', '.')) || 0,
      rawDim1: w.toString(),
      rawDim2: h.toString(),
      rawThickness: katownikMatch[3]
    };
  }

  const ceownikMatch = normName.match(/ceownik.*?(\\d+)/);
  if (ceownikMatch) {
    return {
      parsedType: 'ceownik',
      dim1: parseInt(ceownikMatch[1], 10).toString().padStart(3, '0'),
      dim2: '',
      thickness: 0,
      rawDim1: ceownikMatch[1],
      rawDim2: '',
      rawThickness: '-'
    };
  }

  const dwuteownikMatch = normName.match(/dwuteownik.*?(\\d+)/);
  if (dwuteownikMatch) {
    return {
      parsedType: 'dwuteownik',
      dim1: parseInt(dwuteownikMatch[1], 10).toString().padStart(3, '0'),
      dim2: '',
      thickness: 0,
      rawDim1: dwuteownikMatch[1],
      rawDim2: '',
      rawThickness: '-'
    };
  }

  const pretMatch = normName.match(/pr.t.*?fi\\s*(\\d+)/);
  if (pretMatch) {
    return {
      parsedType: 'pret',
      dim1: parseInt(pretMatch[1], 10).toString().padStart(3, '0'),
      dim2: '',
      thickness: 0,
      rawDim1: pretMatch[1],
      rawDim2: '',
      rawThickness: '-'
    };
  }
`;

code = code.replace("if (normName.includes('blacha')", addCode + "\n  if (normName.includes('blacha')");

fs.writeFileSync('src/utils/materialUtils.ts', code);
