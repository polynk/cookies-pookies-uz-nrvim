import firebaseConfig from './firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getCourseIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function showLoading() {
  const c = document.getElementById('courseDetail');
  if (c) c.innerHTML = '<p>Načítám kurz... ⏳</p>';
}
function showNotFound() {
  const c = document.getElementById('courseDetail');
  if (c) c.innerHTML = '<p>Kurz nenalezen.</p>';
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

async function loadCourseDetailAndFeed() {
  showLoading();
  const id = getCourseIdFromUrl();
  if (!id) { showNotFound(); return; }

  try {
    const dref = doc(db, 'courses', id);
    const snap = await getDoc(dref);
    if (!snap.exists()) { showNotFound(); return; }
    const c = snap.data();

    const attachmentsHtml = (c.attachments || []).map(a => `<li><a href="${a.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a></li>`).join('');
    document.getElementById('courseDetail').innerHTML = `
      <img src="${c.img || '/attached_assets/default-course.png'}" class="detail-img" alt="${escapeHtml(c.title)}">
      <span class="tag">${escapeHtml(c.cat)}</span>
      <h1>${escapeHtml(c.title)}</h1>
      <p>${escapeHtml(c.desc)}</p>
      <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; margin: 20px 0;">
        <h2 style="font-size:1.2rem;color:var(--mint)">Podrobnosti kurzu</h2>
        <p>${escapeHtml(c.details || '')}</p>
        ${attachmentsHtml ? `<h3>Studijní materiály</h3><ul>${attachmentsHtml}</ul>` : ''}
      </div>
      <span class="price-tag">${escapeHtml(c.price || '')}</span>
      <a href="#" class="btn-buy">KOUPIT KURZ</a>

      <hr/>
      <h3>Informační kanál</h3>
      <ul id="courseFeedList" style="list-style:none;padding:0;"></ul>
    `;

    // realtime feed (onSnapshot)
    const feedRef = query(collection(db, `courses/${id}/feed`), orderBy('createdAt', 'desc'));
    onSnapshot(feedRef, (snapshot) => {
      const listEl = document.getElementById('courseFeedList');
      if (!listEl) return;
      // simplest approach: re-render full list (ok pro menší množství)
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (items.length === 0) { listEl.innerHTML = '<li>Žádné příspěvky.</li>'; return; }
      listEl.innerHTML = items.map(i => {
        const time = new Date(i.createdAt?.toDate ? i.createdAt.toDate() : (i.createdAt || Date.now())).toLocaleString();
        const edited = i.edited ? ' (upraveno)' : '';
        const autoTag = i.auto ? ' <small style="color:#aaa">(událost)</small>' : '';
        return `<li id="feed-${i.id}" style="margin-bottom:12px;padding:8px;border-radius:8px;background:#1e1e1e;">
          <div><strong>${escapeHtml(i.authorName || (i.auto ? 'Systém' : 'Lektor'))}</strong> <em style="color:#9aa">${time}${edited}</em>${autoTag}</div>
          <div style="margin-top:6px;">${escapeHtml(i.text || '')}</div>
        </li>`;
      }).join('');
    }, (err) => {
      console.error('Feed snapshot err', err);
      const listEl = document.getElementById('courseFeedList');
      if (listEl) listEl.innerHTML = '<li>Chyba při načítání kanálu.</li>';
    });

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

loadCourseDetailAndFeed();