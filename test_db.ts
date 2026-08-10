import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const q = query(collection(db, 'orders'), where('orderNumber', '==', '155207'));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("No order 155207 found");
    return;
  }
  const orderId = snap.docs[0].id;
  const order = snap.docs[0].data();
  console.log("Order found: ", orderId, "targetQty:", order.targetQuantity, "erpQty:", order.erpReportedQuantity, "appQty:", order.appReportedQuantity, "reportedQty:", order.reportedQuantity);

  const q2 = query(collection(db, 'workLogs'), where('orderId', '==', orderId));
  const snap2 = await getDocs(q2);
  console.log("Found logs: ", snap2.size);
  let totalQty = 0;
  snap2.forEach(d => {
     const data = d.data();
     const qty = data.quantityReported || data.quantity || 0;
     totalQty += qty;
     console.log(`Log ${d.id}: qty=${data.quantity}, qtyRep=${data.quantityReported}, elId=${data.elementId}, date=${data.startTime?.seconds}`);
  });
  console.log("Total qty in logs:", totalQty);
}

run().then(() => process.exit(0));
