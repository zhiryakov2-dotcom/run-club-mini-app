/* RUN CLUB Mini App — исправленная версия.
   Что было сломано и что исправлено:
   1. API_URL был 'https://google.com' — заглушка. fetch возвращал HTML
      главной Google, res.json() падал, и приложение всегда показывало
      «Не удалось подключиться к Google Таблице». Бэкенда не было вовсе.
      Теперь здесь URL веб-приложения Google Apps Script (Code.gs),
      а если он не вставлен — показывается понятная подсказка, а не
      общая ошибка.
   2. В index.html не подключался telegram-web-app.js, поэтому
      window.Telegram был undefined. Теперь скрипт подключён.
   3. Добавлен раздел «Эстафеты» (был в описании и в таблице,
      но не было экрана в приложении).
   4. Запись на тренировку теперь передаёт Telegram ID — бэкенд
      не записывает одного человека дважды. Счётчик участников
      на главной берётся из таблицы «Записи».
   5. Все данные из таблицы экранируются перед вставкой в HTML.
*/

// !!! ВСТАВЬТЕ СЮДА URL развёрнутого веб-приложения из Apps Script:
// Развернуть → Новое развёртывание → Веб-приложение → скопировать URL.
// Выглядит так: https://script.google.com/macros/s/AKfyc.../exec
const API_URL = 'https://script.google.com/macros/s/AKfycbwiELdnnc73FlwNmKewLHWXNf2-y2TBL3D3pvgg_bMc6I4ZiUIwyP0aSF4nWpnD28iV/exec';

const API_CONFIGURED = typeof API_URL === 'string' && API_URL.indexOf('https://script.google.com/macros/s/') === 0;

let clubData = null;
let currentPage = 'home';
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  try { tg.ready(); tg.expand(); } catch (e) { /* не критично */ }
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Дата в таблице — в виде «15.10.2026». Парсим для сортировки.
function parseDate(str) {
  const m = String(str || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function sortedEvents() {
  const items = (clubData && clubData.events) || [];
  return items.slice().sort((a, b) => {
    const da = parseDate(a['Дата']), db = parseDate(b['Дата']);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
}

function participantsOf(eventName) {
  if (!clubData || !clubData.participants) return { count: 0, names: [] };
  return clubData.participants[eventName] || { count: 0, names: [] };
}

async function loadData() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card"><p>Загрузка данных...</p></div>';

  // Режим проверки вёрстки без бэкенда: откройте index.html?demo=1
  const demo = new URLSearchParams(window.location.search).get('demo') === '1';

  if (!API_CONFIGURED && !demo) {
    content.innerHTML = '<div class="card"><p><b>Приложение не подключено к таблице.</b></p>'
      + '<p class="muted">В script.js не вставлен URL веб-приложения Google Apps Script. '
      + 'Разверните Code.gs (инструкция в README.md) и вставьте URL в API_URL.</p></div>';
    return;
  }

  try {
    const res = await fetch(demo ? 'api-example.json' : API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('Пустой ответ');
    if (data.ok === false) throw new Error(data.error || 'Ошибка сервера');
    clubData = data;
    show(currentPage);
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div class="card"><p><b>Не удалось подключиться к Google Таблице</b></p>'
      + '<p class="muted">Проверьте, что веб-приложение в Apps Script развёрнуто '
      + 'с доступом «Все» (Anyone), а в script.js вставлен актуальный URL /exec. '
      + 'После нового развёртывания URL меняется — вставьте новый.</p>'
      + '<p class="muted">Технически: ' + esc(err.message || err) + '</p>'
      + '<button onclick="loadData()">Попробовать снова</button></div>';
  }
}

function eventCard(e, withJoin) {
  const p = participantsOf(e['Название'] || '');
  const count = p.count ? '<p>👥 Участников: ' + p.count + '</p>' : '';
  return '<div class="card">'
    + '<h3>' + esc(e['Название'] || 'Тренировка') + '</h3>'
    + '<p>' + esc(e['День недели'] || '') + (e['Дата'] ? ' · ' + esc(e['Дата']) : '') + (e['Время'] ? ' · ' + esc(e['Время']) : '') + '</p>'
    + (e['Место'] ? '<p>📍 ' + esc(e['Место']) + '</p>' : '')
    + (e['Описание'] ? '<p class="muted">' + esc(e['Описание']) + '</p>' : '')
    + count
    + (withJoin ? '<button class="joinBtn" data-event="' + esc(e['Название'] || '') + '">Я участвую</button>' : '')
    + '</div>';
}

function show(page) {
  currentPage = page;
  const content = document.getElementById('content');
  if (!clubData) return;

  document.querySelectorAll('#menu button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  if (page === 'home') {
    const events = sortedEvents();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = events.filter(e => { const d = parseDate(e['Дата']); return !d || d >= today; });
    const next = upcoming[0] || events[0] || null;
    const race = upcoming.find(e => /забег|марафон|полумарафон|старт/i.test((e['Тип'] || '') + ' ' + (e['Название'] || '')));
    const relays = clubData.relays || [];
    const lastRelay = relays[relays.length - 1];

    let html = '';
    if (next) {
      html += '<h2>🔥 Ближайшая тренировка</h2>' + eventCard(next, true);
    } else {
      html += '<div class="card"><p>Нет запланированных тренировок</p></div>';
    }
    if (race && race !== next) {
      html += '<h2>🏅 Следующий забег</h2>' + eventCard(race, true);
    }
    if (lastRelay) {
      html += '<h2>🏆 Эстафета</h2><div class="card">'
        + '<h3>' + esc(lastRelay['Название'] || 'Эстафета') + '</h3>'
        + '<p>' + esc(lastRelay['Год'] || '') + ' · ' + esc(lastRelay['Команда'] || '') + '</p>'
        + (lastRelay['Результат'] ? '<p>Результат: <b>' + esc(lastRelay['Результат']) + '</b></p>' : '')
        + '<button data-goto="relays">История эстафет</button></div>';
    }
    content.innerHTML = html;
  }
  else if (page === 'calendar') {
    const items = sortedEvents();
    let html = '<h2>📅 Календарь</h2>'
      + '<div class="card"><button id="showAddFormBtn" class="green">+ Добавить тренировку</button></div>'
      + '<div id="addEventForm" style="display:none;" class="card">'
      + '<h3>Новая тренировка</h3>'
      + '<input id="evTitle" placeholder="Название (напр. ОФП)">'
      + '<input id="evDate" placeholder="Дата (напр. 15.10.2026)">'
      + '<input id="evDay" placeholder="День недели (напр. Среда)">'
      + '<input id="evTime" placeholder="Время (напр. 19:00)">'
      + '<input id="evPlace" placeholder="Место (напр. Парк)">'
      + '<input id="evType" placeholder="Тип: Тренировка или Забег">'
      + '<input id="evDesc" placeholder="Описание (необязательно)">'
      + '<input id="evSecret" type="password" placeholder="Пароль администратора">'
      + '<button id="saveEventBtn">Опубликовать</button>'
      + '</div>';

    html += items.length ? items.map(e => eventCard(e, true)).join('') : '<div class="card"><p>Событий пока нет</p></div>';
    content.innerHTML = html;

    document.getElementById('showAddFormBtn').onclick = () => {
      const f = document.getElementById('addEventForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('saveEventBtn').onclick = createEvent;
  }
  else if (page === 'training') {
    content.innerHTML = '<h2>🏃 Группы</h2>'
      + '<div class="card"><h3>Группа 1: Комфортный бег</h3><p>5–7 км (6:00–6:30 мин/км)</p></div>'
      + '<div class="card"><h3>Группа 2: Средний темп</h3><p>8–12 км (5:00–5:30 мин/км)</p></div>'
      + '<div class="card"><h3>Группа 3: Темповые</h3><p>Интервалы, подготовка к стартам</p></div>'
      + '<p class="muted">Каждый выбирает группу сам — без делений на «элиту».</p>';
  }
  else if (page === 'news') {
    content.innerHTML = '<h2>📌 Объявления</h2>' + (clubData.ads && clubData.ads.length ? clubData.ads.map(a => '<div class="card"><b>'
      + esc(a['Заголовок'] || '') + '</b>' + (a['Автор'] ? ' (' + esc(a['Автор']) + ')' : '') + '<br><p>'
      + esc(a['Текст'] || '') + '</p></div>').join('') : '<div class="card"><p>Объявлений пока нет</p></div>');
  }
  else if (page === 'relays') {
    const relays = clubData.relays || [];
    content.innerHTML = '<h2>🏆 Эстафеты</h2>' + (relays.length ? relays.map(r => '<div class="card" style="text-align:left;">'
      + '<b>' + esc(r['Название'] || 'Эстафета') + '</b> (' + esc(r['Год'] || '') + ')<br>'
      + '<p>' + esc(r['Команда'] || '') + '</p>'
      + '<p>' + esc(r['Участники'] || '') + '</p>'
      + (r['Дата'] ? '<p>📅 ' + esc(r['Дата']) + '</p>' : '')
      + (r['Результат'] ? '<p>⏱ Результат: <b>' + esc(r['Результат']) + '</b></p>' : '')
      + (r['Фото'] ? '<p><a href="' + esc(r['Фото']) + '" target="_blank" rel="noopener">📷 Фото</a></p>' : '')
      + '</div>').join('') : '<div class="card"><p>Эстафет пока нет — добавьте лист «Эстафеты» в таблицу.</p></div>');
  }
  else if (page === 'users') {
    content.innerHTML = '<h2>👥 Участники</h2>' + (clubData.members && clubData.members.length ? clubData.members.map(m => '<div class="card" style="text-align:left;">'
      + '<b>' + esc(m['Имя'] || '') + '</b><br>'
      + '<small>Темп: ' + esc(m['Темп'] || '-') + ' | Цель: ' + esc(m['Цель'] || '-') + '</small>'
      + (m['Стаж бега'] || m['Стаж'] ? '<br><small>Бегаю: ' + esc(m['Стаж бега'] || m['Стаж']) + '</small>' : '')
      + (m['Год вступления'] ? '<br><small>В клубе с ' + esc(m['Год вступления']) + ' года</small>' : '')
      + (m['Дистанции'] ? '<br><small>Дистанции: ' + esc(m['Дистанции']) + '</small>' : '')
      + (m['Люблю'] ? '<br><small>Люблю: ' + esc(m['Люблю']) + '</small>' : '')
      + '</div>').join('') : '<div class="card"><p>Список пуст</p></div>');
  }

  content.querySelectorAll('.joinBtn').forEach(btn => {
    btn.onclick = () => join(btn.dataset.event, btn);
  });
  content.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = () => show(btn.dataset.goto);
  });
}

async function postPayload(payload) {
  // Apps Script отдаёт POST через редирект, поэтому ответ прочитать
  // нельзя — используем no-cors и обновляем данные отдельным GET.
  await fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
}

async function createEvent() {
  const title = document.getElementById('evTitle').value.trim();
  const date = document.getElementById('evDate').value.trim();
  const dayOfWeek = document.getElementById('evDay').value.trim();
  const time = document.getElementById('evTime').value.trim();
  const place = document.getElementById('evPlace').value.trim();
  const type = document.getElementById('evType').value.trim();
  const description = document.getElementById('evDesc').value.trim();
  const secret = document.getElementById('evSecret').value;

  if (!title || !date || !secret) {
    alert('Заполните название, дату и пароль!');
    return;
  }
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }

  try {
    await postPayload({ action: 'addEvent', title, date, dayOfWeek, time, place, type, description, secret });
    alert('Запрос отправлен! Обновляем...');
    setTimeout(loadData, 1500);
  } catch (err) {
    alert('Ошибка при добавлении события');
  }
}

async function join(eventName, btn) {
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : {};
  const userName = user.first_name || 'Участник';
  if (btn) { btn.disabled = true; btn.textContent = 'Записываю...'; }
  try {
    await postPayload({
      action: 'join',
      user: userName,
      userId: user.id || '',
      username: user.username || '',
      event: eventName
    });
    alert('Вы записались на тренировку!');
    setTimeout(loadData, 1200);
  } catch (err) {
    alert('Ошибка записи. Попробуйте ещё раз.');
    if (btn) { btn.disabled = false; btn.textContent = 'Я участвую'; }
  }
}

document.querySelectorAll('#menu button').forEach(btn => {
  btn.addEventListener('click', () => show(btn.dataset.page));
});

loadData();
