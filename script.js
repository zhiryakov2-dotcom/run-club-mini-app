const API_URL = 'https://google.com';

let clubData = null;
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

async function loadData() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card"><p>Загрузка данных...</p></div>';

  try {
    const res = await fetch(API_URL);
    clubData = await res.json();
    show('home');
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div class="card"><p>Не удалось подключиться к Google Таблице</p></div>';
  }
}

function show(page) {
  const content = document.getElementById('content');
  if (!clubData) return;

  if (page === 'home') {
    const event = (clubData.events && clubData.events.length > 0) ? clubData.events[0] : null;
    if (!event) {
      content.innerHTML = '<div class="card"><p>Нет запланированных тренировок</p></div>';
      return;
    }
    content.innerHTML = `
      <div class="card">
        <h2>🔥 Ближайшая тренировка</h2>
        <h3>${event['Название'] || 'Тренировка'}</h3>
        <p>${event['День недели'] || ''} · ${event['Время'] || ''}</p>
        <p>📍 ${event['Место'] || ''}</p>
        <button id="joinBtn">Я участвую</button>
      </div>`;
    document.getElementById('joinBtn').onclick = () => join(event['Название']);
  } 
  else if (page === 'calendar') {
    const items = clubData.events || [];
    let html = `<h2>📅 Календарь</h2>
      <div class="card">
        <button id="showAddFormBtn" style="background:#2ea44f;">+ Добавить тренировку</button>
      </div>
      <div id="addEventForm" style="display:none;" class="card">
        <h3>Новая тренировка</h3>
        <input id="evTitle" placeholder="Название (напр. ОФП)" style="width:90%;padding:8px;margin:5px 0;"><br>
        <input id="evDate" placeholder="Дата (напр. 15.10.2026)" style="width:90%;padding:8px;margin:5px 0;"><br>
        <input id="evDay" placeholder="День недели (напр. Среда)" style="width:90%;padding:8px;margin:5px 0;"><br>
        <input id="evTime" placeholder="Время (напр. 19:00)" style="width:90%;padding:8px;margin:5px 0;"><br>
        <input id="evPlace" placeholder="Место (напр. Парк)" style="width:90%;padding:8px;margin:5px 0;"><br>
        <input id="evSecret" type="password" placeholder="Пароль администратора" style="width:90%;padding:8px;margin:5px 0;"><br>
        <button id="saveEventBtn" style="margin-top:10px;">Опубликовать</button>
      </div>`;

    html += items.map(e => `
      <div class="card">
        <b>${e['Название'] || ''}</b> (${e['Дата'] || ''})<br>
        <p style="margin:5px 0;">${e['День недели'] || ''} в ${e['Время'] || ''} — ${e['Место'] || ''}</p>
        <small>${e['Описание'] || ''}</small>
      </div>`).join('');

    content.innerHTML = html;

    document.getElementById('showAddFormBtn').onclick = () => {
      const f = document.getElementById('addEventForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };

    document.getElementById('saveEventBtn').onclick = createEvent;
  }
  else if (page === 'training') {
    content.innerHTML = `
      <h2>🏃 Группы</h2>
      <div class="card"><h3>Группа 1: Комфортный бег</h3><p>5–7 км (6:00–6:30 мин/км)</p></div>
      <div class="card"><h3>Группа 2: Средний темп</h3><p>8–12 км (5:00–5:30 мин/км)</p></div>
      <div class="card"><h3>Группа 3: Темповые</h3><p>Интервалы, подготовка к стартам</p></div>`;
  }
  else if (page === 'news') {
    content.innerHTML = '<h2>📌 Объявления</h2>' + (clubData.ads && clubData.ads.length ? clubData.ads.map(a => `
      <div class="card">
        <b>${a['Заголовок'] || ''}</b> (${a['Автор'] || ''})<br>
        <p>${a['Текст'] || ''}</p>
      </div>`).join('') : '<div class="card"><p>Объявлений пока нет</p></div>');
  }
  else if (page === 'users') {
    content.innerHTML = '<h2>👥 Участники</h2>' + (clubData.members && clubData.members.length ? clubData.members.map(m => `
      <div class="card" style="text-align:left;">
        <b>${m['Имя'] || ''}</b><br>
        <small>Темп: ${m['Темп'] || '-'} | Цель: ${m['Цель'] || '-'}</small>
      </div>`).join('') : '<div class="card"><p>Список пуст</p></div>');
  }
}

async function createEvent() {
  const title = document.getElementById('evTitle').value;
  const date = document.getElementById('evDate').value;
  const dayOfWeek = document.getElementById('evDay').value;
  const time = document.getElementById('evTime').value;
  const place = document.getElementById('evPlace').value;
  const secret = document.getElementById('evSecret').value;

  if (!title || !date || !secret) {
    alert('Заполните название, дату и пароль!');
    return;
  }

  const payload = { action: 'addEvent', title, date, dayOfWeek, time, place, secret };

  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    alert('Запрос отправлен! Обновляем...');
    setTimeout(loadData, 1500);
  } catch (err) {
    alert('Ошибка при добавлении события');
  }
}

async function join(eventName) {
  const userName = tg?.initDataUnsafe?.user?.first_name || 'Участник';
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'join', user: userName, event: eventName })
  });
  alert('Вы записались на тренировку!');
}

document.querySelectorAll('#menu button').forEach(btn => {
  btn.addEventListener('click', () => show(btn.dataset.page));
});

loadData();
