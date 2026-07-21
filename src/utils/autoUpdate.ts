export function setupAutoUpdate() {
  if ((import.meta as any).env?.DEV) return; // Nie uruchamiaj w trybie deweloperskim

  // Śledzenie ostatniej aktywności użytkownika
  let lastInteraction = Date.now();
  const updateActivity = () => {
    lastInteraction = Date.now();
  };

  ['click', 'keydown', 'touchstart'].forEach(event => 
    window.addEventListener(event, updateActivity, { passive: true })
  );

  if ('serviceWorker' in navigator) {
    let refreshing = false;

    // Podepnij się pod zmianę kontrolera (Service Worker zaktualizowany)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        
        // Wymuś odświeżenie tylko gdy użytkownik jest bezczynny (np. 10 sekund) 
        // lub gdy karta jest w tle, by nie przerywać wprowadzania danych.
        const tryReload = () => {
          const idleTime = Date.now() - lastInteraction;
          if (idleTime > 10000 || document.visibilityState === 'hidden') {
            window.location.reload();
          } else {
            // Spróbuj ponownie za 3 sekundy
            setTimeout(tryReload, 3000);
          }
        };

        tryReload();
      }
    });

    // PWA zazwyczaj sprawdza aktualizacje co 24h lub przy przeładowaniu strony.
    // Dla aplikacji na panelach produkcyjnych chcemy sprawdzać częściej (np. co 15 minut)
    navigator.serviceWorker.ready.then((registration) => {
      setInterval(() => {
        registration.update();
      }, 1000 * 60 * 15); // 15 minut
      
      // Możemy też sprawdzać przy wybudzeniu aplikacji (powrót do karty)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update();
        }
      });
    });
  }
}
