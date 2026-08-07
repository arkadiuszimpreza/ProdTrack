import * as dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const upload = multer({ dest: "uploads/" });

interface PDFElementCoords {
  x: number;
  y: number;
  page: number;
}

async function extractEpsCoordinates(filePath: string): Promise<Record<string, PDFElementCoords>> {
  const coordsMap: Record<string, PDFElementCoords> = {};
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      for (const item of textContent.items as any[]) {
        if (item.str && item.str.trim()) {
          const strClean = item.str.replace(/\s+/g, "").toLowerCase();
          const match = strClean.match(/eps[\.\-]?(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            const normName = `eps.${num}`;
            if (!coordsMap[normName]) {
              coordsMap[normName] = {
                x: item.transform[4],
                y: item.transform[5],
                page: p
              };
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error extracting coordinates with pdfjs:", error);
  }
  return coordsMap;
}

function calculateBoardMaterials(elements: any[]): any[] {
  const pageMaxWidths: Record<number, number> = {};

  elements.forEach(el => {
    const p = el.page || 1;
    let w = el.width || 0;
    let h = el.height || 0;

    if ((!w || !h) && el.detectedDimension) {
      const dimStr = el.detectedDimension.replace(/[^0-9xX]/g, '');
      const dims = dimStr.split(/x|X/).map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
      if (dims.length >= 2) {
        w = Math.max(...dims);
        h = Math.min(...dims);
      } else if (dims.length === 1) {
        h = dims[0];
      }
    }

    el.width = w;
    el.height = h;

    if (w > (pageMaxWidths[p] || 0)) {
      pageMaxWidths[p] = w;
    }
  });

  // Uzupełnienie szerokości dla elementów, które mają tylko wysokość (częste na rysunkach)
  elements.forEach(el => {
    const p = el.page || 1;
    if (!el.width && el.height && pageMaxWidths[p]) {
      el.width = pageMaxWidths[p];
    }
  });

  // Grupowanie elementów po tablicach (POZ lub strona + szerokość)
  const boardGroups: Record<string, any[]> = {};
  elements.forEach(el => {
    const key = el.detectedPoz ? `poz_${el.detectedPoz.trim().toLowerCase()}` : `page_${el.page || 1}_w_${el.width || 0}`;
    if (!boardGroups[key]) boardGroups[key] = [];
    boardGroups[key].push(el);
  });

  const calculatedElements: any[] = [];

  for (const [boardKey, boardEls] of Object.entries(boardGroups)) {
    // Sortowanie elementów w obrębie tablicy od góry do dołu:
    // 1. Domyślnie po 'verticalIndexFromTop' jeśli podany
    // 2. Jeśli nie, po wyciągniętym numerze Y lub numerze EPS w nazwie
    const sorted = [...boardEls].sort((a, b) => {
      if (a.verticalIndexFromTop && b.verticalIndexFromTop) {
        return a.verticalIndexFromTop - b.verticalIndexFromTop;
      }
      if (a.y !== 0 && b.y !== 0) {
        return b.y - a.y; // Y malejące (wyżej w PDF = większe Y)
      }
      return 0;
    });

    const N = sorted.length;

    for (let i = 0; i < N; i++) {
      const el = sorted[i];
      const w = (el.width || 0) / 1000;
      const h = (el.height || 0) / 1000;

      const area = w * h;

      // Określenie pozycji pionowej (top, bottom, middle, single)
      let finalPos: 'top' | 'middle' | 'bottom' | 'single' = 'middle';

      if (N === 1) {
        finalPos = 'single';
      } else {
        if (el.verticalPosition && ['top', 'middle', 'bottom', 'single'].includes(el.verticalPosition.toLowerCase())) {
          finalPos = el.verticalPosition.toLowerCase() as any;
        } else {
          if (i === 0) finalPos = 'top';
          else if (i === N - 1) finalPos = 'bottom';
          else finalPos = 'middle';
        }
      }

      // Profile: 2 profile szerokości, chyba że wysokość <= 300 mm, wtedy 1 profil
      let profiles = 0;
      if (w > 0 && h > 0) {
        const heightMm = el.height || 0;
        if (heightMm <= 300) {
          profiles = w;
        } else {
          profiles = 2 * w;
        }
      }

      // Ramki i Zamki:
      // - 'single' (1 panel): ramka z 4 stron (2*w + 2*h), 0 zamków
      // - 'top' (górny panel): ramka z 3 stron (w + 2*h), 1 zamek (1*w)
      // - 'bottom' (dolny panel): ramka z 3 stron (w + 2*h), 1 zamek (1*w)
      // - 'middle' (środkowy panel): ramka z 2 stron (2*h), 2 zamki (2*w)
      let frame = 0;
      let locks = 0;

      if (w > 0 && h > 0) {
        if (finalPos === 'single') {
          frame = 2 * w + 2 * h;
          locks = 0;
        } else if (finalPos === 'top') {
          frame = w + 2 * h;
          locks = w;
        } else if (finalPos === 'bottom') {
          frame = w + 2 * h;
          locks = w;
        } else if (finalPos === 'middle') {
          frame = 2 * h;
          locks = 2 * w;
        }
      }

      calculatedElements.push({
        ...el,
        verticalPosition: finalPos,
        areaSquareMeters: parseFloat(area.toFixed(3)),
        profilesLength: parseFloat(profiles.toFixed(3)),
        locksLength: parseFloat(locks.toFixed(3)),
        frameLength: parseFloat(frame.toFixed(3))
      });
    }
  }

  return calculatedElements;
}

function getGeminiApiKey(): string | undefined {
  try {
    const devEnvPath = "/app/.dev.env.json";
    if (fs.existsSync(devEnvPath)) {
      const content = fs.readFileSync(devEnvPath, "utf-8");
      const data = JSON.parse(content);
      if (data && data.GEMINI_API_KEY && data.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && data.GEMINI_API_KEY.trim() !== "") {
        return data.GEMINI_API_KEY;
      }
    }
  } catch (err) {
    console.error("Error reading /app/.dev.env.json:", err);
  }
  return process.env.GEMINI_API_KEY;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  // API Route for PDF processing
  app.post("/api/parse-pdf", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
      }
      
      console.log(`Using API key starting with: ${apiKey.substring(0, 5)}... and length: ${apiKey.length}`);

      const ai = new GoogleGenAI({ apiKey });
      const filePath = req.file.path;

      // Najpierw wyodrębniamy współrzędne z pliku PDF za pomocą PDF.js
      const coordsMap = await extractEpsCoordinates(filePath);
      console.log(`Extracted ${Object.keys(coordsMap).length} coordinates from PDF.`);

      // Upload file to Gemini API
      const uploadedFile = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: "application/pdf",
          displayName: `pdf_${Date.now()}`,
        }
      });

      // Zdefiniowanie schematu JSON, którego oczekujemy
      const schema = {
        type: "object",
        properties: {
          elements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                detectedDimension: { type: "string" },
                detectedPoz: { type: "string" },
                width: { type: "integer", description: "Szerokość pojedynczego panelu (EPS) w milimetrach (mm), np. 5700 lub 3300" },
                height: { type: "integer", description: "Wysokość pojedynczego panelu (EPS) w milimetrach (mm), np. 1200 lub 400 lub 300" },
                verticalPosition: { 
                  type: "string", 
                  enum: ["top", "middle", "bottom", "single"],
                  description: "Pozycja pionowa panelu w konstrukcji tablicy: 'top' dla górnego paska na samej górze, 'bottom' dla dolnego paska na samym dole, 'middle' dla paska środkowego, 'single' jeśli tablica składa się z 1 panelu." 
                },
                verticalIndexFromTop: { 
                  type: "integer", 
                  description: "Numer kolejny paska EPS na danej tablicy od góry do dołu, zaczynając od 1 dla najwyższego panelu na górze (1 = top, 2 = kolejny, ..., max = bottom)." 
                }
              },
              required: ["id", "name"]
            }
          },
          pageCount: { type: "integer" }
        },
        required: ["elements", "pageCount"]
      };

      const prompt = `Przeanalizuj dołączony plik PDF (Rysunek Ofertowy / Zlecenie Produkcyjne). 
Wyodrębnij z niego informacje o znakach/tablicach drogowych (panelach EPS). Dla każdego panelu EPS na rysunku znajdź:
1. Nazwę (najczęściej w formacie "eps.X" np. "eps.1", "eps.2", "eps.7").
2. Przypisany wymiar (np. "2700x400mm", "1200x5700mm" lub pojedyncze wymiary wysokości np. "300", "400", "1200"). Zwróć to w polu 'detectedDimension'.
3. Numer pozycji (POZ), np. "POZ.10", "POZ.20". Zwróć to w polu 'detectedPoz'.
4. Dokładną szerokość panelu w mm jako liczbę całkowitą (np. 5700, 3300) w polu 'width'. Uwaga: Panele na tej samej tablicy mają wspólną szerokość (np. u dołu tablicy jest podana łączna szerokość np. 5700 lub 3300, a paski w składzie danej tablicy mają tę samą szerokość).
5. Dokładną wysokość panelu w mm jako liczbę całkowitą (np. 1200, 400, 300) w polu 'height'. Te wartości najczęściej są rozpisane z prawej strony każdego paska (np. 300, 1200, 1200).
6. Określ fizyczną pozycję pionową (układ od góry do dołu) każdego paska w konstrukcji danej tablicy / POZ:
   - 'top': pasek na samej górze tablicy.
   - 'bottom': pasek na samym dole / podstawie tablicy.
   - 'middle': pasek środkowy umieszczony pomiędzy paskiem górnym a dolnym.
   - 'single': jeśli tablica składa się tylko z jednego panelu EPS.
   W polu 'verticalIndexFromTop' podaj numer kolejny paska od góry do dołu (1 = góra, 2 = drugi od góry, itd.).

Zwróć wynik jako JSON z tablicą 'elements', gdzie każdy element to jeden znak z tymi danymi. Dodatkowo podaj 'pageCount' jako liczbę stron rysunku.
Wygeneruj poprawne losowe ID dla każdego elementu np "eps_1_p1_x"
Niech wynik odpowiada podanemu schematowi.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      // Usunięcie pliku tymczasowego
      fs.unlinkSync(filePath);

      // Usunięcie pliku z API
      try {
          await ai.files.delete({name: uploadedFile.name});
      } catch (e) {
          console.error("Failed to delete file from gemini api", e);
      }

      if (!response.text) {
        throw new Error("Empty response from AI");
      }

      const parsedData = JSON.parse(response.text);

      // Wzbogacamy elementy o współrzędne x, y, page pobrane z PDFJS
      if (parsedData.elements && Array.isArray(parsedData.elements)) {
        parsedData.elements = parsedData.elements.map((el: any) => {
          const nameClean = (el.name || "").replace(/\s+/g, "").toLowerCase();
          const match = nameClean.match(/eps[\.\-]?(\d+)/);
          let coords = null;
          if (match) {
            const normName = `eps.${parseInt(match[1], 10)}`;
            coords = coordsMap[normName];
          }
          return {
            ...el,
            x: coords ? coords.x : 0,
            y: coords ? coords.y : 0,
            page: coords ? coords.page : 1
          };
        });

        // Obliczamy metry kwadratowe, profile, zamki i ramki na podstawie współrzędnych i wymiarów
        parsedData.elements = calculateBoardMaterials(parsedData.elements);
      }

      res.json(parsedData);

    } catch (error: any) {
      console.error("Error parsing PDF with Gemini:", error);
      res.status(500).json({ error: "Błąd podczas analizy pliku PDF przez AI.", details: error.message || String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
