/**
 * @file src/components/ErrorBoundary.tsx
 * @description Komponent łapiący błędy krytyczne, szczególnie te związane z Firestore.
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Zabezpiecza aplikację przed całkowitym zawieszeniem w przypadku wystąpienia błędu krytycznego.
 * Wykrywa błędy Firestore i wyświetla czytelny komunikat dla użytkownika z możliwością odświeżenia strony.
 * 
 * @param children - Komponenty podrzędne, które mają być chronione.
 */
export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('Firestore Error')) {
        setHasError(true);
        setErrorMsg(event.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={24} />
            <h2 className="text-xl font-bold">Błąd Systemu</h2>
          </div>
          <p className="text-gray-600 mb-4">Wystąpił problem z dostępem do bazy danych. Sprawdź uprawnienia lub połączenie.</p>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">{errorMsg}</pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 w-full py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Odśwież aplikację
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
