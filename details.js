import firebaseConfig from './firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getCourseIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

function showLoading() {
    const container = document.getElementById('courseDetail');
    if (!container) return;
    container.innerHTML = '<p>Načítám kurz... ⏳</p>';
}

function showNotFound() {
    const container = document.getElementById('courseDetail');
    if (!container) return;
    container.innerHTML = '<p>Kurz nenalezen.</p>';
}

async function loadCourseDetail() {
    showLoading();
    const id = getCourseIdFromUrl();
    if (!id) {
        showNotFound();
        return;
    }

    try {
        const docRef = doc(db, 'courses', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            showNotFound();
            return;
        }
        const c = docSnap.data();
        const attachmentsHtml = (c.attachments || []).map(a => `<li><a href="${a.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a></li>`).join('');
        document.getElementById('courseDetail').innerHTML = `
            <img src="${c.img || '/attached_assets/default-course.png'}" class="detail-img" alt="${escapeHtml(c.title)}">
            <span class="tag">${escapeHtml(c.cat)}</span>
            <h1>${escapeHtml(c.title)}</h1>
            <p>${escapeHtml(c.desc)}</p>
            <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; margin: 20px 0;">
                <h2 style="font-size: 1.5rem; margin-bottom: 15px; color: var(--mint);">Podrobnosti kurzu</h2>
                <p>${escapeHtml(c.details || '')}</p>
                ${attachmentsHtml ? `<h3>Studijní materiály</h3><ul>${attachmentsHtml}</ul>` : ''}
            </div>
            <span class="price-tag">${escapeHtml(c.price || '')}</span>
            <a href="#" class="btn-buy">KOUPIT KURZ</a>
        `;
    } catch (err) {
        console.error('Chyba při načítání detailu kurzu:', err);
        const container = document.getElementById('courseDetail');
        if (container) container.innerHTML = '<p>Chyba při načítání kurzu.</p>';
    }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

loadCourseDetail();