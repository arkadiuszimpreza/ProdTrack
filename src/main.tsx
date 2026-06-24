import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { DeviceEnvironmentProvider } from './contexts/DeviceEnvironmentContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceEnvironmentProvider>
      <App />
    </DeviceEnvironmentProvider>
  </StrictMode>,
);
