const fs = require('fs');

let content = fs.readFileSync('src/components/production/BoardDrawingViewer.tsx', 'utf8');

if (content.endsWith('</div>    </div>}')) {
    content = content.replace('</div>    </div>}', '</div>    </div>  );\n}');
} else if (content.endsWith('</div>    </div>\n}')) {
    content = content.replace('</div>    </div>\n}', '</div>    </div>\n  );\n}');
} else {
    // If it's something else
    content = content.replace(/<\/div>\s*<\/div>\s*}/g, '</div>    </div>  );\n}');
}
fs.writeFileSync('src/components/production/BoardDrawingViewer.tsx', content);
