const fs = require('fs');

let content = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const target = `                                      {(() => {
                                        const cv = calcValues[b.id as string] || { pieces: '', length: '', width: '', height: '' };
                                        const p = parseFloat((cv.pieces || '').replace(',', '.'));`;

const replacement = `                                      {(() => {
                                        const cv = calcValues[b.id as string] || { pieces: '', length: '', width: '', height: '', area: '' };
                                        const p = parseFloat((cv.pieces || '').replace(',', '.'));
                                        const a = parseFloat((cv.area || '').replace(',', '.'));`;

content = content.replace(target, replacement);

const target2 = `                                        const coeffNum = parseFloat(String(b.coefficient || '').replace(/,/g, '.'));
                                        const w = parseFloat(wStr.replace(',', '.'));
                                        const h = parseFloat(hStr.replace(',', '.'));
                                        if (!isNaN(p) && p > 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {`;

const replacement2 = `                                        const coeffNum = parseFloat(String(b.coefficient || '').replace(/,/g, '.'));
                                        const w = parseFloat(wStr.replace(',', '.'));
                                        const h = parseFloat(hStr.replace(',', '.'));
                                        if (!isNaN(a) && a > 0 && !isNaN(coeffNum) && coeffNum > 0) {
                                            const kg = a * coeffNum;
                                            return <span title={\`\${a.toFixed(3)} m² = \${kg.toFixed(1)} kg\`}>{\`\${a.toFixed(3)}\`} m² = {\`\${kg.toFixed(1)}\`} kg</span>;
                                        } else if (!isNaN(p) && p > 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {`;

content = content.replace(target2, replacement2);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', content);

