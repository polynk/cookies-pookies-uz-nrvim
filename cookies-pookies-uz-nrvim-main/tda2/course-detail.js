import firebaseConfig from './firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getCourseIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

async function loadCourseDetail() {
    const id = getCourseIdFromUrl();
    if (!id) {
        document.getElementById('courseDetail').innerHTML = '<p>Kurz nenalezen.</p>';
        return;
    }
    const docRef = doc(db, 'courses', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        document.getElementById('courseDetail').innerHTML = '<p>Kurz nenalezen.</p>';
        return;
    }
    const c = docSnap.data();
    document.getElementById('courseDetail').innerHTML = `
        <img src="${c.img}" class="detail-img" alt="${c.title}">
        <span class="tag">${c.cat}</span>
        <h1>${c.title}</h1>
        <p>${c.desc}</p>
        <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; margin: 20px 0;">
            <h2 style="font-size: 1.5rem; margin-bottom: 15px; color: var(--mint);">Podrobnosti kurzu</h2>
            <p>${c.details || ''}</p>
        </div>
        <span class="price-tag">${c.price}</span>
        <a href="#" class="btn-buy">KOUPIT KURZ</a>
    `;
}

loadCourseDetail();
