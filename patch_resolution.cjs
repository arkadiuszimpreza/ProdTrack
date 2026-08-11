const fs = require('fs');
const file = 'src/components/production/BoardDrawingViewer.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const outputScale = window.devicePixelRatio || 1;",
  "const outputScale = (window.devicePixelRatio || 1) * 4; // Zwiększona rozdzielczość dla ostrego przybliżenia"
);

fs.writeFileSync(file, content);
