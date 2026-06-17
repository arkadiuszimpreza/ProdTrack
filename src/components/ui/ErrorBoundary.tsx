import * as React from 'react';
import { type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * @class ErrorBoundary
 * @description Komponent wyższego rzędu wyłapujący błędy w drzewie komponentów.
 * Specjalnie dostosowany do wyświetlania błędów Firestore w formacie JSON.
 */
export class ErrorBoundary extends (React.Component as any) {
  state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private renderErrorInfo(error: Error) {
    try {
      const errorData = JSON.parse(error.message);
      
      if (errorData && errorData.error) {
        return (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left overflow-hidden">
            <h3 className="text-sm font-bold text-red-800 mb-2 uppercase tracking-wider">Szczegóły błędu systemowego:</h3>
            <div className="space-y-2 text-xs font-mono text-red-700">
              <p><span className="font-bold">Operacja:</span> {errorData.operationType}</p>
              <p><span className="font-bold">Ścieżka:</span> {errorData.path || 'N/A'}</p>
              <p><span className="font-bold">Użytkownik:</span> {errorData.authInfo?.email || 'Niezalogowany'}</p>
              <div className="mt-2 pt-2 border-t border-red-200">
                <p className="break-words font-bold text-red-900">{errorData.error}</p>
              </div>
            </div>
          </div>
        );
      }
    } catch (e) {
      // Not JSON
    }

    return (
      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-left italic text-gray-600 text-sm">
        {error.message}
      </div>
    );
  }

  public render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] p-6">
          <div className="max-w-md w-full bg-white rounded-[32px] shadow-xl p-8 text-center border border-gray-100">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-6">
              <AlertTriangle size={32} />
            </div>
            
            <h1 className="text-2xl font-serif font-bold text-gray-900 mb-2">Wystąpił nieoczekiwany błąd</h1>
            <p className="text-gray-600 mb-6">
              Przepraszamy, coś poszło nie tak podczas przetwarzania danych. Nasz zespół został powiadomiony o problemie.
            </p>

            {this.renderErrorInfo(this.state.error)}

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 w-full py-3 px-6 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4A4A30] transition-colors shadow-md"
              >
                <RefreshCcw size={18} />
                Odśwież aplikację
              </button>
              
              <a
                href="/"
                className="flex items-center justify-center gap-2 w-full py-3 px-6 bg-white text-gray-700 border border-gray-200 rounded-full font-medium hover:bg-gray-50 transition-colors"
              >
                <Home size={18} />
                Wróć do strony głównej
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
