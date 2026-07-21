import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("firebase-applet-config.json"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(collection(db, "purchase_orders"), where("purchaseOrderNumber", "==", "31200"));
  const snap = await getDocs(q);
  snap.forEach(d => console.log(d.id, d.data()));
  process.exit(0);
}
run();
