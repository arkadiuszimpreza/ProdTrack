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
  const ordersSnap = await db.collection('orders').where('orderNumber', '==', '156194').get();
  if (ordersSnap.empty) {
    console.log("No order 156194 found.");
  } else {
    ordersSnap.forEach(doc => {
       console.log("ORDER: ", doc.id, doc.data().orderNumber, " totalWeight: ", doc.data().totalWeight, " elements: ", doc.data().elements);
    });
  }

  const orderId = ordersSnap.docs[0]?.id;
  if (!orderId) {
     const erpSnap = await db.collection('orders').where('erpOrderNumber', '==', '156194').get();
     if(!erpSnap.empty) {
         erpSnap.forEach(doc => {
           console.log("ORDER (erp): ", doc.id, doc.data().erpOrderNumber, " totalWeight: ", doc.data().totalWeight);
         })
     }
  }

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
