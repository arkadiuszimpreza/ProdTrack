const fs = require('fs');
let file = fs.readFileSync('src/components/administracja/BoardDrawingsManager.tsx', 'utf8');

file = file.replace(/const formData = new FormData\(\);.*?const response = await fetch\("\/api\/parse-pdf", \{\s*method: "POST",\s*body: formData,\s*\}\);/s, 
`const user = auth.currentUser;
      if (!user) {
        addLog("Błąd: Użytkownik niezalogowany.");
        setLoading(false);
        return;
      }
      const token = await getIdToken(user);
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      addLog(\`Wysyłam plik do serwera na analizę AI...\`);
      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${token}\`
        },
        body: formData,
      });`);

fs.writeFileSync('src/components/administracja/BoardDrawingsManager.tsx', file);
