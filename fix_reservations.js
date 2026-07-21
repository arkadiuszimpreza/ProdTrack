const fs = require('fs');
let code = fs.readFileSync('src/components/wms/MaterialReservationsView.tsx', 'utf-8');
const start = code.indexOf('import { parseMaterialDimensions');
const end = code.indexOf('export function MaterialReservationsView');
if (start !== -1 && end !== -1) {
  code = code.substring(0, start) + 'import { parseMaterialDimensions } from "../../utils/materialUtils";\n\n' + code.substring(end);
  fs.writeFileSync('src/components/wms/MaterialReservationsView.tsx', code);
}
