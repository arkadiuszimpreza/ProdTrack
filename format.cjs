const fs = require('fs');

let content = fs.readFileSync('src/components/production/BoardDrawingViewer.tsx', 'utf8');

// I will just replace the end manually.
let index = content.lastIndexOf('</TransformWrapper>');
let endContent = `        </TransformWrapper>
      </div>
    </div>
  );
}`;
content = content.slice(0, index) + endContent;
fs.writeFileSync('src/components/production/BoardDrawingViewer.tsx', content);
