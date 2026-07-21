import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DeviceEnvironmentProvider } from './contexts/DeviceEnvironmentContext';
import { setupAutoUpdate } from './utils/autoUpdate';

// Inicjalizacja automatycznych aktualizacji dla paneli PWA
setupAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceEnvironmentProvider>
      <App />
    </DeviceEnvironmentProvider>
  </StrictMode>,
);
