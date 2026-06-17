// Ładujemy niezbędne biblioteki
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Inicjalizacja Gemini API kluczem z pliku .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Definiujemy ścieżki do plików (zwróć uwagę, jak system operuje na folderach)
const CODE_FILE_PATH = path.join(__dirname, '../src/hooks/useWorkManager.ts');
const DOCS_FILE_PATH = path.join(__dirname, '../docs/2-logika-biznesowa-hooks.md');

async function updateDocumentation() {
  console.log(" Uruchamiam proces analizy dokumentacji dla useWorkManager...");

  try {
    // 1. Odczytanie obecnego kodu i starej dokumentacji
    const currentCode = fs.readFileSync(CODE_FILE_PATH, 'utf8');
    const currentDocs = fs.readFileSync(DOCS_FILE_PATH, 'utf8');

    // 2. Przygotowanie Modelu (używamy gemini-2.5-pro, bo jest świetny do kodu)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // 3. Konstrukcja Promptu (Instrukcja dla AI - jak od Dyrektora dla Inżyniera)
    const prompt = `
      Jesteś starszym inżynierem oprogramowania w firmie produkcyjnej.
      Twoim zadaniem jest zaktualizowanie istniejącej dokumentacji w formacie Markdown na podstawie najnowszego kodu źródłowego.
      
      ZASADY:
      - Zwróć TYLKO czysty kod Markdown, bez żadnego wstępu i zakończenia.
      - Zachowaj istniejącą strukturę dokumentacji (nagłówki, listy).
      - Zaktualizuj opisy funkcji, jeśli kod się zmienił.
      - Nie wymyślaj funkcji, których nie ma w kodzie.

      STARA DOKUMENTACJA:
      ${currentDocs}

      NAJNOWSZY KOD ŹRÓDŁOWY:
      ${currentCode}
    `;

    console.log(" Wysyłam dane do Google AI Studio...");

    // 4. Wysłanie zapytania i oczekiwanie na odpowiedź
    const result = await model.generateContent(prompt);
    const newDocs = result.response.text();

    // 5. Zapisanie nowej dokumentacji do pliku
    // Usuwamy ewentualne formatowanie "```markdown" z odpowiedzi modelu
    const cleanDocs = newDocs.replace(/^```markdown\n/i, '').replace(/\n```$/i, '');
    
    fs.writeFileSync(DOCS_FILE_PATH, cleanDocs, 'utf8');
    
    console.log(" Sukces! Dokumentacja została zaktualizowana automatycznie.");

  } catch (error) {
    console.error(" Wystąpił błąd podczas generowania dokumentacji:", error);
  }
}

// Uruchomienie maszyny
updateDocumentation();