const content=document.getElementById('content');

function show(page){
 const data={
 home:'<div class="card"><h2>🏠 Главная</h2><p>Добро пожаловать в RUN CLUB</p></div>',
 calendar:'<div class="card"><h2>📅 Календарь</h2><p>Здесь будут события из таблицы</p></div>',
 training:'<div class="card"><h2>🏃 Тренировки</h2><p>Здесь будут тренировки</p></div>',
 news:'<div class="card"><h2>📌 Объявления</h2><p>Новости клуба</p></div>',
 users:'<div class="card"><h2>👥 Участники</h2><p>Список участников</p></div>'
 };
 content.innerHTML=data[page];
}

function signup(name){
 alert('Запись на: '+name+'\nСледующий шаг — подключение Google Таблицы');
}
