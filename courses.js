// Firebase
import firebaseConfig from './firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fetchCourses() {
    const querySnapshot = await getDocs(collection(db, "courses"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function renderCourses(list) {
    const grid = document.getElementById('courseGrid');
    grid.innerHTML = list.map(c => `
        <a href="course-detail.html?id=${c.id}" class="course-card">
            <img src="${c.img}" alt="${c.title}">
            <span class="course-tag">${c.cat}</span>
            <h3>${c.title}</h3>
            <p>${c.desc}</p>
            <div class="course-footer">
                <span class="price">${c.price}</span>
                <div class="btn-small">DETAIL</div>
            </div>
        </a>
    `).join('');
}

async function main() {
    const courses = await fetchCourses();
    renderCourses(courses);
    document.getElementById('searchInput').oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = courses.filter(c => 
            c.title.toLowerCase().includes(val) || 
            c.cat.toLowerCase().includes(val) ||
            c.desc.toLowerCase().includes(val)
        );
        renderCourses(filtered);
    };
}

main();