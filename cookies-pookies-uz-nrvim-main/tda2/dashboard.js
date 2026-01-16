// dashboard.js — upraveno pro Firestore + Storage a Auth (role-based)
// Poznámka: importy používají CDN Firebase modular SDK (9.x). Uprav verze pokud potřebuješ.
import firebaseConfig from './firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc, doc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

let courses = []; // lokální cache
let currentUser = null;
let userIsTeacher = false;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  userIsTeacher = !!(user && user?.accessToken && user?.role) // fallback (not reliable)
  // Preferované: použít custom claims z ID token (see notes) — zde si necháme UI fungovat i když token není ready
  // Po přihlášení načíst kurzy
  loadCourses();
});

// load courses from Firestore
async function loadCourses() {
  try {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    courses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error('Chyba při načítání kurzů:', err);
    alert('Chyba: Nelze načíst kurzy. Zkontroluj pravidla Firestore a připojení.');
  }
}

function render() {
  const body = document.getElementById('courseBody');
  if (!body) return;
  body.innerHTML = courses.map(c => `
    <tr>
      <td>${escapeHtml(c.title || '')}</td>
      <td>${escapeHtml(c.cat || '')}</td>
      <td class="actions">
        <button onclick="editCourse('${c.id}')" class="btn btn-edit">Upravit</button>
        <button onclick="deleteCourseConfirm('${c.id}')" class="btn btn-delete">Smazat</button>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

function openModal(id = null) {
  const modal = document.getElementById('courseModal');
  const modalTitle = document.getElementById('modalTitle');
  const form = document.getElementById('courseForm');
  form.reset();
  document.getElementById('courseId').value = '';

  if (id) {
    const c = courses.find(x => x.id === id);
    if (!c) return alert('Kurz nenalezen v lokální cache.');
    document.getElementById('courseId').value = c.id;
    document.getElementById('title').value = c.title || '';
    document.getElementById('desc').value = c.desc || '';
    document.getElementById('cat').value = c.cat || '';
    document.getElementById('price').value = c.price || '';
    document.getElementById('details').value = c.details || '';
    modalTitle.innerText = 'Upravit kurz';
  } else {
    modalTitle.innerText = 'Přidat kurz';
  }

  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('courseModal');
  if (modal) modal.style.display = 'none';
}

document.getElementById('courseForm').onsubmit = async (e) => {
  e.preventDefault();

  // simple auth check (rules may still block if not authorized)
  if (!currentUser) {
    alert('Nejsi přihlášen. Přihlaš se prosím, aby ses mohl(a) upravovat kurzy.');
    return;
  }

  const id = document.getElementById('courseId').value || null;
  const title = document.getElementById('title').value.trim();
  const desc = document.getElementById('desc').value.trim();
  const cat = document.getElementById('cat').value.trim();
  const price = document.getElementById('price').value.trim();
  const details = document.getElementById('details').value.trim();
  const imgFile = document.getElementById('imgFile').files[0];
  const attachments = Array.from(document.getElementById('attachments').files || []);

  if (!title || !cat) {
    alert('Název a kategorie jsou povinné.');
    return;
  }

  try {
    let docRef;
    if (id) {
      docRef = doc(db, 'courses', id);
      await updateDoc(docRef, { title, desc, cat, price, details, updatedAt: serverTimestamp() });
    } else {
      // include owner (uid) — useful for rules
      const added = await addDoc(collection(db, 'courses'), {
        title, desc, cat, price, details,
        owner: currentUser.uid,
        createdAt: serverTimestamp()
      });
      docRef = doc(db, 'courses', added.id);
    }

    // Upload thumbnail image
    if (imgFile) {
      const path = `courses/${docRef.id}/thumb_${Date.now()}_${sanitizeFilename(imgFile.name)}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, imgFile);
      const url = await getDownloadURL(sRef);
      await updateDoc(docRef, { img: url });
    }

    // Upload attachments (multiple)
    if (attachments.length > 0) {
      const existing = (courses.find(c => c.id === docRef.id)?.attachments) || [];
      const attUrls = existing.slice();
      for (const f of attachments) {
        const p = `courses/${docRef.id}/attachments/${Date.now()}_${sanitizeFilename(f.name)}`;
        const sRef = storageRef(storage, p);
        await uploadBytes(sRef, f);
        const url = await getDownloadURL(sRef);
        attUrls.push({ name: f.name, url });
      }
      await updateDoc(docRef, { attachments: attUrls });
    }

    alert('Kurz uložen.');
    closeModal();
    await loadCourses();
  } catch (err) {
    console.error('Chyba při ukládání kurzu:', err);
    // konkrétní zpráva pro Missing/insufficient permissions
    if (err && err.code && err.code.includes('permission')) {
      alert('Chyba: Nedostatečná oprávnění. Zkontroluj Firestore/Storage pravidla a že jsi přihlášen(a) jako teacher.');
    } else {
      alert('Chyba při ukládání: ' + (err.message || err));
    }
  }
};

function sanitizeFilename(name) {
  return name.replace(/[^\w.-]/g, '_');
}

async function deleteCourseConfirm(id) {
  if (!confirm('Opravdu smazat?')) return;
  try {
    await deleteDoc(doc(db, 'courses', id));
    await loadCourses();
  } catch (err) {
    console.error('Chyba při mazání:', err);
    alert('Chyba při mazání: ' + (err.message || err));
  }
}

function editCourse(id) { openModal(id); }

// expose functions for inline onclick handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.deleteCourseConfirm = deleteCourseConfirm;
window.editCourse = editCourse;

// initial load (if auth state already known, onAuthStateChanged handler zavolá loadCourses)
loadCourses();