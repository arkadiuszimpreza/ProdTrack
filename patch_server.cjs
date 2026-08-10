const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf8');

// Add firebase-admin initialization at the top imports
file = file.replace(
  'import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";',
  'import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";\nimport * as admin from "firebase-admin";\n\nif (!admin.apps.length) {\n  try {\n    admin.initializeApp();\n  } catch (error) {\n    console.error("Firebase admin initialization error", error);\n  }\n}'
);

// Add auth middleware
file = file.replace(
  'const upload = multer({ dest: "uploads/" });',
  `const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf files are allowed!'));
    }
  }
});

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Brak tokenu autoryzacji" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Błąd weryfikacji tokenu:", error);
    return res.status(401).json({ error: "Nieprawidłowy token autoryzacji" });
  }
};`
);

// Update route definition
file = file.replace(
  'app.post("/api/parse-pdf", upload.single("pdf"), async (req, res) => {',
  'app.post("/api/parse-pdf", requireAuth, upload.single("pdf"), async (req, res) => {'
);

fs.writeFileSync('server.ts', file);
