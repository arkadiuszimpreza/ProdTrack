import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Jeśli identyfikator bazy to stary ID z AI Studio, używamy domyślnej bazy (default)
const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId.startsWith('ai-studio-')) 
  ? '(default)' 
  : (firebaseConfig.firestoreDatabaseId || '(default)');

// Używamy initializeFirestore z experimentalForceLongPolling, aby ominąć potencjalne problemy z połączeniem
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, dbId);

// Test połączenia przy inicjalizacji (wymagane przez instrukcje Firebase)
async function testConnection() {
  try {
    // Próba odczytu nieistniejącego dokumentu wymusza komunikację z serwerem
    await getDocFromServer(doc(db, '_connection_test_', 'initial'));
    console.log("Firestore connection test: Success");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('Could not reach'))) {
      console.error("Firestore connectivity error:", error.message);
      console.error("Please check your Firebase configuration and internet connection.");
    }
  }
}

testConnection();
