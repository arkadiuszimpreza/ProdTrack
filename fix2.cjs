const fs = require('fs');

let content = fs.readFileSync('src/components/production/BoardDrawingViewer.tsx', 'utf8');

if (content.endsWith('</div>    </div>  );\n}')) {
   // Already fixed? Let's check
} else if (content.endsWith('</div>    </div>\n}')) {
   content = content.replace('</div>    </div>\n}', '</div>    </div>\n  );\n}');
} else {
   content = content.replace(/<\/div>\s*<\/div>\s*}/, '</div>    </div>\n  );\n}');
}
fs.writeFileSync('src/components/production/BoardDrawingViewer.tsx', content);
