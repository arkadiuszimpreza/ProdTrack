import React from 'react';
import { motion } from 'motion/react';
import { Clock, RefreshCw, LogOut } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile } from '../../types';
import { cn } from '../../utils/firestore-helpers';

interface PendingApprovalViewProps {
  user: FirebaseUser;
  profile: UserProfile | null;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  onLogout: () => void;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  user,
  profile,
  onRefresh,
  isRefreshing,
  onLogout,
}) => {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center border border-stone-100"
      >
        <div className="w-20 h-20 bg-amber-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-amber-200">
          <Clock size={40} className="animate-pulse" />
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-amber-800 text-xs font-bold uppercase tracking-wider mb-4">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          Oczekiwanie na autoryzację
        </div>

        <h1 className="text-2xl font-black text-stone-900 mb-2 tracking-tight">Konto wymaga akceptacji</h1>
        
        <p className="text-stone-600 text-sm mb-6 leading-relaxed">
          Twoje konto w domenie <span className="font-semibold text-stone-800">@erplast.pl</span> zostało pomyślnie zarejestrowane. Administrator systemu musi nadać Ci odpowiednie uprawnienia (np. Operator, Magazynier), zanim uzyskasz dostęp do zasobów fabrycznych.
        </p>

        <div className="bg-stone-50 rounded-2xl p-4 mb-6 border border-stone-100 text-left">
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">Zalogowany użytkownik</div>
          <div className="text-sm font-bold text-stone-800 truncate">{profile?.displayName || user.displayName || 'Użytkownik'}</div>
          <div className="text-xs text-stone-500 truncate">{profile?.email || user.email}</div>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-md active:scale-95 disabled:opacity-60 text-sm"
          >
            <RefreshCw size={16} className={cn(isRefreshing && "animate-spin")} />
            {isRefreshing ? 'Sprawdzanie statusu...' : 'Sprawdź status ponownie'}
          </button>

          <button 
            onClick={onLogout} 
            className="w-full flex items-center justify-center gap-2 py-3 bg-stone-100 text-stone-700 rounded-2xl font-bold hover:bg-stone-200 transition-all text-sm active:scale-95"
          >
            <LogOut size={16} />
            Wyloguj
          </button>
        </div>
      </motion.div>
    </div>
  );
};
