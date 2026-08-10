const fs = require('fs');
let file = fs.readFileSync('src/components/administracja/BoardDrawingsManager.tsx', 'utf8');

file = file.replace(
  "import { auth } from '../../firebase';",
  "import { auth, db } from '../../firebase';"
);

fs.writeFileSync('src/components/administracja/BoardDrawingsManager.tsx', file);
