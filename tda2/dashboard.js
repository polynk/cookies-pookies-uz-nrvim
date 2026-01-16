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

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    // pokud není přihlášen, přesměruj na úvodní stránku
    window.location.href = 'index.html';
    return;
  }

  // zkontrolujeme custom claims (role) pomocí ID tokenu
  try {
    const tokenRes = await user.getIdTokenResult(true);
    userIsTeacher = !!(tokenRes && tokenRes.claims && tokenRes.claims.role === 'teacher');
  } catch (e) {
    console.warn('Nelze načíst ID token claims:', e);
  }

  if (!userIsTeacher) {
    // pokud uživatel není lektor, přesměruj na úvodní stránku
    window.location.href = 'index.html';
    return;
  }

  // načti kurzy po ověření
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
        <button onclick="openFeedManager('${c.id}')" class="btn btn-blue">Spravovat kanál</button>
        <button onclick="deleteCourseConfirm('${c.id}')" class="btn btn-delete">Smazat</button>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>\"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"}[m]));
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

// course form submit (create/update)
document.getElementById('courseForm').onsubmit = async (e) => {
  e.preventDefault();

  // simple auth check (rules may still block if not authorized)
  if (!currentUser || !userIsTeacher) {
    alert('Nemáš oprávnění. Přihlaste se jako lektor.');
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
    if (err && err.code && err.code.includes('permission')) {
      alert('Chyba: Nedostatečná oprávnění. Zkontroluj Firestore/Storage pravidla a že jsi přihlášen(a) jako teacher.');
    } else {
      alert('Chyba při ukládání: ' + (err.message || err));
    }
  }
};

function sanitizeFilename(name) {
  return name.replace(/[^
\w.-]/g, '_');
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

// --- Feed management (teacher UI) ---
async function openFeedManager(courseId) {
  // otevři modal pro správu kanálu
  const feedModal = document.getElementById('feedModal');
  if (!feedModal) return alert('Feed modal nenalezen.');
  feedModal.style.display = 'flex';
  document.getElementById('feedCourseId').value = courseId;
  await loadFeedForCourse(courseId);
}

async function loadFeedForCourse(courseId) {
  const list = document.getElementById('feedList');
  list.innerHTML = '<li>Načítám...</li>';
  try {
    const q = query(collection(db, `courses/${courseId}/feed`), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (items.length === 0) list.innerHTML = '<li>Žádné příspěvky.</li>';
    else list.innerHTML = items.map(i => renderFeedItem(i)).join('');
  } catch (e) {
    console.error('Chyba při načítání feedu:', e);
    list.innerHTML = '<li>Chyba při načítání feedu.</li>';
  }
}

function renderFeedItem(i) {
  const time = new Date(i.createdAt?.toDate ? i.createdAt.toDate() : (i.createdAt || Date.now())).toLocaleString();
  const edited = i.edited ? ' (upraveno)' : '';
  return `
    <li id="feed-${i.id}">
      <strong>${escapeHtml(i.authorName || 'Lektor')}</strong> <em>${time}${edited}</em>
      <div>${escapeHtml(i.text || '')}</div>
      <div style="margin-top:6px;">
        <button onclick="editFeedPrompt('${i.courseId || ''}', '${i.id}')}" class="btn btn-edit">Upravit</button>
        <button onclick="deleteFeedConfirm('${i.courseId || ''}', '${i.id}')}" class="btn btn-delete">Smazat</button>
      </div>
    </li>
  `;
}

async function addFeedPost() {
  if (!currentUser || !userIsTeacher) return alert('Nemáš oprávnění.');
  const courseId = document.getElementById('feedCourseId').value;
  const text = document.getElementById('feedText').value.trim();
  if (!text) return alert('Zadej text.');
  try {
    await addDoc(collection(db, `courses/${courseId}/feed`), {
      type: 'post',
      text,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email || 'Lektor',
      createdAt: serverTimestamp(),
      edited: false
    });
    document.getElementById('feedText').value = '';
    await loadFeedForCourse(courseId);
  } catch (e) {
    console.error('Chyba při přidávání příspěvku:', e);
    alert('Chyba při přidávání příspěvku.');
  }
}

function editFeedPrompt(courseId, postId) {
  const el = document.getElementById('feed-' + postId);
  const text = el ? el.querySelector('div').innerText : '';
  const newText = prompt('Upravit příspěvek:', text);
  if (newText !== null) editFeedPost(courseId, postId, newText);
}

async function editFeedPost(courseId, postId, newText) {
  if (!currentUser || !userIsTeacher) return alert('Nemáš oprávnění.');
  try {
    const p = doc(db, `courses/${courseId}/feed/${postId}`);
    await updateDoc(p, { text: newText, edited: true, updatedAt: serverTimestamp() });
    await loadFeedForCourse(courseId);
  } catch (e) {
    console.error('Chyba při editaci příspěvku:', e);
    alert('Chyba při editaci.');
  }
}

async function deleteFeedConfirm(courseId, postId) {
  if (!confirm('Opravdu smazat příspěvek?')) return;
  await deleteFeedPost(courseId, postId);
}

async function deleteFeedPost(courseId, postId) {
  if (!currentUser || !userIsTeacher) return alert('Nemáš oprávnění.');
  try {
    await deleteDoc(doc(db, `courses/${courseId}/feed/${postId}`));
    await loadFeedForCourse(courseId);
  } catch (e) {
    console.error('Chyba při mazání příspěvku:', e);
    alert('Chyba při mazání.');
  }
}

// Expose functions to window
window.openModal = openModal;
window.closeModal = closeModal;
window.deleteCourseConfirm = deleteCourseConfirm;
window.editCourse = editCourse;
window.openFeedManager = openFeedManager;
window.addFeedPost = addFeedPost;
window.editFeedPost = editFeedPost;
window.deleteFeedPost = deleteFeedPost;

// initial load fallback
loadCourses();
