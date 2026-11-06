const API_URL = 'https://google.com';

let clubData = null;
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

async function init() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card"><p>Загрузка данных...</p></div>';
  try {
    const res = await fetch(API_URL);
    clubData = await res.json();
    show('home');
  } catch (err) {
    content.innerHTML = '<div class="card"><p>Ошибка связи с таблицей</p></div>';
    console.error(err);
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
    content.innerHTML = '<h2>📅 Календарь</h2>' + (items.length ? items.map(e => `
      <div class="card">
        <b>${e['Название'] || 'Событие'}</b> (${e['Дата'] || ''})<br>
        <p style="margin:5px 0;">${e['День недели'] || ''} в ${e['Время'] || ''} — ${e['Место'] || ''}</p>
        <small>${e['Описание'] || ''}</small>
      </div>`).join('') : '<div class="card"><p>Событий пока нет</p></div>');
  }
  else if (page === 'training') {
    content.innerHTML = `
      <h2>🏃 Тренировки</h2>
      <div class="card"><h3>Группа 1: Комфортный бег</h3><p>Дистанция: 5–7 км<br>Темп: 6:00–6:30 мин/км</p></div>
      <div class="card"><h3>Группа 2: Средний темп</h3><p>Дистанция: 8–12 км<br>Темп: 5:00–5:30 мин/км</p></div>
      <div class="card"><h3>Группа 3: Подготовка к стартам</h3><p>Интервалы, темповые отрезки</p></div>`;
  }
  else if (page === 'news') {
    const items = clubData.ads || [];
    content.innerHTML = '<h2>📌 Объявления</h2>' + (items.length ? items.map(a => `
      <div class="card">
        <b>${a['Заголовок'] || ''}</b> (${a['Автор'] || 'Аноним'})<br>
        <p style="margin:8px 0;">${a['Текст'] || ''}</p>
        <small style="color:#888;">${a['Дата'] || ''}</small>
      </div>`).join('') : '<div class="card"><p>Объявлений пока нет</p></div>');
  }
  else if (page === 'users') {
    const items = clubData.members || [];
    content.innerHTML = '<h2>👥 Участники</h2>' + (items.length ? items.map(m => `
      <div class="card" style="text-align: left;">
        <b style="font-size: 16px;">${m['Имя'] || 'Участник'}</b><br>
        <span>🏃 Стаж: ${m['Стаж бега'] || '-'}</span><br>
        <span>🎯 Цель: ${m['Цель'] || '-'}</span><br>
        <span>⚡ Темп: ${m['Темп'] || '-'}</span><br>
        <span>❤️ Люблю: ${m['Люблю'] || '-'}</span>
      </div>`).join('') : '<div class="card"><p>Список пуст</p></div>');
  }
}

async function join(eventName) {
  const userName = tg?.initDataUnsafe?.user?.first_name || 'Участник';
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ action: 'join', user: userName, event: eventName })
    });
    alert('Вы записались на тренировку!');
  } catch (e) {
    alert('Не удалось записаться. Попробуйте еще раз.');
  }
}

document.querySelectorAll('#menu button').forEach(btn => {
  btn.addEventListener('click', () => show(btn.dataset.page));
});

init();
