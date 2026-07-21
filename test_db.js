import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("firebase-applet-config.json"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const { doc, getDoc, collection, getDocs, query, where } = await import("firebase/firestore");

  const inventorySnap = await getDocs(collection(db, 'inventoryBatches'));
  const batchesSums = {};
  
  inventorySnap.docs.forEach(doc => {
    const batch = doc.data();
    if (batch.sourcePurchaseOrderId === 'PO-32084-60') {
      console.log("Found batch for PO-32084-60 during calculation:", doc.id, {
        batchNumber: batch.batchNumber,
        initialQuantity: batch.initialQuantity,
        numericQuantity: batch.numericQuantity,
        sourcePurchaseOrderId: batch.sourcePurchaseOrderId
      });
    }
    if (batch.sourcePurchaseOrderId) {
      const qty = batch.initialQuantity ?? batch.numericQuantity ?? 0;
      batchesSums[batch.sourcePurchaseOrderId] = (batchesSums[batch.sourcePurchaseOrderId] || 0) + qty;
    }
  });

  console.log("CALCULATED SUM FOR PO-32084-60:", batchesSums['PO-32084-60']);
  process.exit(0);
}
run();
