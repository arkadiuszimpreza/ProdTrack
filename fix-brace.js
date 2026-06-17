const fs = require('fs');
let lines = fs.readFileSync('src/components/wms/MaterialWithdrawalView.tsx', 'utf8').split('\n');

// Find where filteredArticles.map closes
let mapCloseIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('))}')) {
    if (lines[i+1] && lines[i+1].includes('</div>')) {
      if (lines[i+2] && lines[i+2].includes(')}')) {
        mapCloseIdx = i; // Found it!
        break;
      }
    }
  }
}

if (mapCloseIdx > -1) {
  lines[mapCloseIdx] = '                ))}';
  lines[mapCloseIdx+1] = '            )}';
  lines[mapCloseIdx+2] = '          </div>';
  lines.splice(mapCloseIdx+3, 1); // remove the extra div closing or brace?
  
  // wait, let's just make it strictly:
  //                 ))}
  //             </div>
  //           )}
  // wait, the JSX is:
  // <div className="flex-1 ...">
  //   {filteredArticles.length === 0 ? (
  //      <div>...</div>
  //   ) : (
  //      <div className="space-y-1">  // WE ADD THIS!
  //         {filteredArticles.map(...)}
  //      </div>                       // SO WE CAN CLOSE IT HERE!
  //   )}
  // </div>
}
fs.writeFileSync('src/components/wms/MaterialWithdrawalView.tsx', lines.join('\n'));
