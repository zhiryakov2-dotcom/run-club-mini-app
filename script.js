const content = document.getElementById('content');

function show(page){
 const pages={
 home:`<div class="card"><h2>🔥 Ближайшая тренировка</h2><h3>ОФП + бег</h3><p>Среда · 19:00</p><p>📍 Центральный парк</p><button id="join">Я участвую</button></div>`,
 calendar:`<div class="card"><h2>📅 Календарь</h2><p>События клуба</p></div>`,
 training:`<div class="card"><h2>🏃 Тренировки</h2><p>Расписание тренировок</p></div>`,
 news:`<div class="card"><h2>📌 Объявления</h2><p>Новости клуба</p></div>`,
 users:`<div class="card"><h2>👥 Участники</h2><p>Список участников</p></div>`
 };
 content.innerHTML=pages[page] || pages.home;
 const btn=document.getElementById('join');
 if(btn) btn.onclick=()=>alert('Кнопка записи работает');
}

document.querySelectorAll('#menu button').forEach(btn=>{
 btn.addEventListener('click',()=>show(btn.dataset.page));
});

show('home');
