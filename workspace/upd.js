import fs from 'fs';

let content = fs.readFileSync('src/components/wms/InventoryTakingView.tsx', 'utf8');

content = content.replace( // Try with \n instead if needed
  "  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});\n  const [isProcessing, setIsProcessing] = useState(false);",
  `  const [actualQuantities, setActualQuantities] = useState<Record<string, string>>({});\n  const [isProcessing, setIsProcessing] = useState(false);\n\n  const [calcModes, setCalcModes] = useState<Record<string, boolean>>({});\n  const [calcValues, setCalcValues] = useState<Record<string, { pieces: string; length: string }>>({});\n\n  const extractLengthFromDimensions = (dim?: string): string => {\n    if (!dim) return '';\n    const match = dim.match(/L[\\s\\.\\=]*(\\d+[\\,\\.]\\d+|\\d+)/i);\n    if (match && match[1]) {\n      return match[1].replace(',', '.');\n    }\n    return '';\n  };`
);

content = content.replace(
  "const isDrafted = b.draftQuantity !== undefined && b.draftQuantity !== null;",
  `const isDrafted = b.draftQuantity !== undefined && b.draftQuantity !== null;
                    const canUseCalc = ['RU', 'PR', 'BL'].includes(guessPrefix(b.articleName || ''));
                    const useCalc = calcModes[b.id as string] || false;
                    const cv = calcValues[b.id as string] || { pieces: '', length: extractLengthFromDimensions(b.dimensions) };`
);

fs.writeFileSync('src/components/wms/InventoryTakingView.tsx', content, 'utf8');
console.log('Update taking done');
