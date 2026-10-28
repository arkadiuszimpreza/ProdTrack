import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DeviceEnvironmentProvider } from './contexts/DeviceEnvironmentContext';
import { setupAutoUpdate } from './utils/autoUpdate';

// Inicjalizacja automatycznych aktualizacji dla paneli PWA
setupAutoUpdate();

// Prośba do przeglądarki o "trwałe" przechowywanie danych strony. Sesja logowania Firebase
// leży w IndexedDB — bez tego przeglądarka (szczególnie na TV/tabletach z małym dyskiem)
// może ją usunąć przy braku miejsca, co wygląda jak samoistne wylogowanie.
// Przeglądarka może odmówić (zwraca false) — wtedy działa wszystko jak dotąd.
navigator.storage?.persist?.()
  .then((granted) => console.info(`Trwałe przechowywanie danych: ${granted ? 'przyznane' : 'nieprzyznane'}`))
  .catch(() => { /* starsze przeglądarki — bez znaczenia dla działania aplikacji */ });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceEnvironmentProvider>
      <App />
    </DeviceEnvironmentProvider>
  </StrictMode>,
);
