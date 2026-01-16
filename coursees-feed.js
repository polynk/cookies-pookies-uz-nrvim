// course-feed.js (klient) — připojí se k /sse a aktualizuje UI
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

async function startFeedSSE(courseId, sseUrlBase) {
  const auth = getAuth();
  const user = auth.currentUser;
  // pokud nepotřebuješ autorizaci pro čtení, token není nutný
  let token = null;
  if (user) token = await user.getIdToken(/* forceRefresh= */ false);
  const url = `${sseUrlBase}/sse?courseId=${encodeURIComponent(courseId)}&token=${encodeURIComponent(token || '')}`;

  const evtSource = new EventSource(url);
  evtSource.onopen = () => console.log('SSE connected');
  evtSource.onerror = (e) => {
    console.error('SSE error', e);
    // můžeš fallbacknout na polling nebo Firestore onSnapshot
  };

  evtSource.addEventListener('added', (e) => {
    const data = JSON.parse(e.data);
    appendFeedItem(data);
  });
  evtSource.addEventListener('modified', (e) => {
    const data = JSON.parse(e.data);
    updateFeedItem(data);
  });
  evtSource.addEventListener('removed', (e) => {
    const data = JSON.parse(e.data);
    removeFeedItem(data.id);
  });

  // fallback: generic message handler
  evtSource.onmessage = (e) => console.log('message:', e.data);
}

// UI helpers (implemetuj podle layoutu)
function appendFeedItem(item) {
  const ul = document.getElementById('courseFeedList');
  if (!ul) return;
  const li = document.createElement('li');
  li.id = `feed-${item.id}`;
  li.innerHTML = `<strong>${escapeHtml(item.authorName || 'Lektor')}</strong>
    <em>${new Date(item.createdAt?.seconds ? item.createdAt.seconds*1000 : item.createdAt).toLocaleString()}</em>
    <div>${escapeHtml(item.text || '')}${item.edited ? ' (upraveno)' : ''}</div>`;
  ul.prepend(li);
}
function updateFeedItem(item) {
  const li = document.getElementById('feed-' + item.id);
  if (!li) return appendFeedItem(item);
  li.querySelector('div').innerText = item.text + (item.edited ? ' (upraveno)' : '');
}
function removeFeedItem(id) {
  const li = document.getElementById('feed-' + id);
  if (li) li.remove();
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

// export
window.startFeedSSE = startFeedSSE;