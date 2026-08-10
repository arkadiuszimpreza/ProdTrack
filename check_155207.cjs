const admin = require('firebase-admin');
const { readFileSync } = require('fs');

const serviceAccount = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function main() {
  const ordersSnap = await db.collection('orders').where('orderNumber', '==', '155207').get();
  if (ordersSnap.empty) {
    console.log("No order 155207 found.");
  } else {
    ordersSnap.forEach(doc => {
       const data = doc.data();
       console.log("ORDER: ", doc.id, " orderNumber: ", data.orderNumber, " targetQty: ", data.targetQuantity, " erpQty: ", data.erpReportedQuantity, " appQty: ", data.appReportedQuantity);
    });
  }

  const orderId = ordersSnap.docs[0]?.id;
  
  if (orderId) {
    const logsSnap2 = await db.collection('workLogs').where('orderId', '==', orderId).get();
    console.log(`Logs exactly matching orderId ${orderId}: ${logsSnap2.size}`);
    logsSnap2.forEach(d => {
       const data = d.data();
       console.log(`Log ID: ${d.id}, qtyReported: ${data.quantityReported}, qty: ${data.quantity}, elementId: ${data.elementId}, date: ${data.startTime?.toDate ? data.startTime.toDate() : data.startTime?.seconds}`);
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
