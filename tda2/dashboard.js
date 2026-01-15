let courses = JSON.parse(localStorage.getItem('courses')) || [
            { id: 'web-dev', title: 'Web Development Bootcamp', cat: 'Programování', desc: 'Od HTML až po React.' },
            { id: 'art', title: 'Digital Art Masterclass', cat: 'Design', desc: 'Kreslete jako profík.' }
        ];

        function render() {
            const body = document.getElementById('courseBody');
            body.innerHTML = courses.map(c => `
                <tr>
                    <td>${c.title}</td>
                    <td>${c.cat}</td>
                    <td class="actions">
                        <button onclick="editCourse('${c.id}')" class="btn btn-edit">Upravit</button>
                        <button onclick="deleteCourse('${c.id}')" class="btn btn-delete">Smazat</button>
                    </td>
                </tr>
            `).join('');
            localStorage.setItem('courses', JSON.stringify(courses));
        }

        function logout() {
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'login.html';
        }

        function openModal(id = null) {
            document.getElementById('courseModal').style.display = 'flex';
            if (id) {
                const c = courses.find(x => x.id === id);
                document.getElementById('courseId').value = c.id;
                document.getElementById('title').value = c.title;
                document.getElementById('desc').value = c.desc;
                document.getElementById('cat').value = c.cat;
                document.getElementById('modalTitle').innerText = 'Upravit kurz';
            } else {
                document.getElementById('courseForm').reset();
                document.getElementById('courseId').value = '';
                document.getElementById('modalTitle').innerText = 'Přidat kurz';
            }
        }

        function closeModal() { document.getElementById('courseModal').style.display = 'none'; }

        document.getElementById('courseForm').onsubmit = (e) => {
            e.preventDefault();
            const id = document.getElementById('courseId').value;
            const newCourse = {
                id: id || 'id-' + Date.now(),
                title: document.getElementById('title').value,
                desc: document.getElementById('desc').value,
                cat: document.getElementById('cat').value
            };
            if (id) {
                const idx = courses.findIndex(x => x.id === id);
                courses[idx] = newCourse;
            } else {
                courses.push(newCourse);
            }
            closeModal();
            render();
        };

        function deleteCourse(id) {
            if (confirm('Opravdu smazat?')) {
                courses = courses.filter(x => x.id !== id);
                render();
            }
        }

        function editCourse(id) { openModal(id); }

        render();