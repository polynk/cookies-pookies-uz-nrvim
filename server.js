// server.js
// SSE server: Node + Express + Firebase Admin SDK
// Použij: npm i express firebase-admin cors
// Export: nasadit na Cloud Run / VPS (s HTTPS)

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());

// Inicializace admin SDK - nastavit env var GOOGLE_APPLICATION_CREDENTIALS
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

// Map: courseId -> { clients: Set(response), unsubscribe: function }
const courseChannels = new Map();

function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/sse', async (req, res) => {
  const token = req.query.token;
  const courseId = req.query.courseId;
  if (!courseId || !token) {
    res.status(400).send('Missing token or courseId');
    return;
  }

  // verify token
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (e) {
    res.status(401).send('Unauthorized');
    return;
  }

  // optional: check if user allowed to read (e.g. course membership) - skip for public feed
  // setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  // register client
  let channel = courseChannels.get(courseId);
  if (!channel) {
    channel = { clients: new Set(), unsubscribe: null };
    // start watching feed subcollection
    const feedRef = db.collection(`courses/${courseId}/feed`).orderBy('createdAt', 'desc');
    const unsubscribe = feedRef.onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        const doc = { id: change.doc.id, ...change.doc.data() };
        const eventType = change.type; // 'added' | 'modified' | 'removed'
        // broadcast to all clients
        channel.clients.forEach(clientRes => {
          sendSSE(clientRes, eventType, doc);
        });
      });
    }, err => {
      console.error('Firestore listener err', err);
      // notify clients about error
      channel.clients.forEach(clientRes => {
        sendSSE(clientRes, 'error', { message: 'Listener error' });
      });
    });
    channel.unsubscribe = unsubscribe;
    courseChannels.set(courseId, channel);
  }

  channel.clients.add(res);

  // keep connection alive with comment messages
  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    channel.clients.delete(res);
    if (channel.clients.size === 0 && channel.unsubscribe) {
      channel.unsubscribe();
      courseChannels.delete(courseId);
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`SSE server running on ${PORT}`));