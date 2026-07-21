import { createServer as createViteServer } from "vite";
console.log("Before vite:", process.env.GEMINI_API_KEY);
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
console.log("After vite:", process.env.GEMINI_API_KEY);
process.exit(0);
