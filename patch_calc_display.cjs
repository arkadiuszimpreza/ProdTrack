const fs = require('fs');

let content = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8');

const target = `                                      {(() => {
                                        const cv = calcValues[b.id as string] || { pieces: '', length: '', width: '', height: '' };
                                        const p = parseFloat((cv.pieces || '').replace(',', '.'));
                                        const wStr = cv.width !== undefined ? cv.width : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
                                            if (dimMatch && dimMatch[1]) return dimMatch[1].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        const hStr = cv.height !== undefined ? cv.height : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
                                            if (dimMatch && dimMatch[2]) return dimMatch[2].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        const coeffNum = parseFloat(String(b.coefficient || '').replace(/,/g, '.'));
                                        const w = parseFloat(wStr.replace(',', '.'));
                                        const h = parseFloat(hStr.replace(',', '.'));
                                        if (!isNaN(p) && p > 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
                                              const m2 = p * (w / 1000) * (h / 1000);
                                              const kg = m2 * coeffNum;
                                              return <span title={\`\${m2.toFixed(3)} m² = \${kg.toFixed(1)} kg\`}>{\`\${m2.toFixed(3)}\`} m² = {\`\${kg.toFixed(1)}\`} kg</span>;
                                        }
                                        return null;
                                      })()}`;

const replacement = `                                      {(() => {
                                        const cv = calcValues[b.id as string] || { pieces: '', length: '', width: '', height: '', area: '' };
                                        const p = parseFloat((cv.pieces || '').replace(',', '.'));
                                        const a = parseFloat((cv.area || '').replace(',', '.'));
                                        const coeffNum = parseFloat(String(b.coefficient || '').replace(/,/g, '.'));

                                        if (!isNaN(a) && a > 0 && !isNaN(coeffNum) && coeffNum > 0) {
                                            const kg = a * coeffNum;
                                            return <span title={\`\${a.toFixed(3)} m² = \${kg.toFixed(1)} kg\`}>{\`\${a.toFixed(3)}\`} m² = {\`\${kg.toFixed(1)}\`} kg</span>;
                                        }

                                        const wStr = cv.width !== undefined ? cv.width : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
                                            if (dimMatch && dimMatch[1]) return dimMatch[1].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        const hStr = cv.height !== undefined ? cv.height : (() => {
                                          if (b.dimensions) {
                                            const dimMatch = b.dimensions.match(/(\\d+(?:[\\.,]\\d+)?)\\s*[xX×]\\s*(\\d+(?:[\\.,]\\d+)?)/);
                                            if (dimMatch && dimMatch[2]) return dimMatch[2].replace(',', '.');
                                          }
                                          return '';
                                        })();
                                        
                                        const w = parseFloat(wStr.replace(',', '.'));
                                        const h = parseFloat(hStr.replace(',', '.'));
                                        if (!isNaN(p) && p > 0 && !isNaN(coeffNum) && coeffNum > 0 && !isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
                                              const m2 = p * (w / 1000) * (h / 1000);
                                              const kg = m2 * coeffNum;
                                              return <span title={\`\${m2.toFixed(3)} m² = \${kg.toFixed(1)} kg\`}>{\`\${m2.toFixed(3)}\`} m² = {\`\${kg.toFixed(1)}\`} kg</span>;
                                        }
                                        return null;
                                      })()}`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', content);

