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
   6. Объявления показываются новые сверху, у каждого есть кнопка
      удаления (с паролем администратора, как при публикации).
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

// Дата в таблице — точная («15.10.2026») или только месяц
// («Февраль 2027»). parseDate — дата для сортировки: у месяца
// это 1-е число, поэтому забег без точной даты встаёт в свой месяц.
// parseUntil — дата, до которой событие показывается: у точной
// даты — она сама, у месяца — его последний день, поэтому такой
// забег не исчезает в начале месяца, а живёт до его конца.
function parseDateParts(str) {
  const s = String(str || '');
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return { year: +m[3], month: +m[2] - 1, day: +m[1], exact: true };
  const low = s.toLowerCase();
  // Основы названий месяцев — ловят и «февраль», и «февраля».
  const stems = [['январ', 0], ['феврал', 1], ['март', 2], ['апрел', 3],
    ['май', 4], ['мая', 4], ['июн', 5], ['июл', 6], ['август', 7],
    ['сентябр', 8], ['октябр', 9], ['ноябр', 10], ['декабр', 11]];
  for (let i = 0; i < stems.length; i++) {
    if (low.indexOf(stems[i][0]) !== -1) {
      const mo = stems[i][1];
      const ym = s.match(/(\d{4})/);
      let year;
      if (ym) year = +ym[1];
      else {
        const now = new Date();
        year = mo >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
      }
      return { year: year, month: mo, day: 1, exact: false };
    }
  }
  return null;
}

function parseDate(str) {
  const p = parseDateParts(str);
  if (!p) return null;
  const d = new Date(p.year, p.month, p.day);
  return isNaN(d.getTime()) ? null : d;
}

function parseUntil(str) {
  const p = parseDateParts(str);
  if (!p) return null;
  const d = p.exact ? new Date(p.year, p.month, p.day) : new Date(p.year, p.month + 1, 0);
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

// Объявления — новые сверху: сначала по дате (свежие раньше),
// а внутри одной даты — позже добавленные раньше.
function sortedAds() {
  const items = (clubData && clubData.ads) || [];
  return items.map((a, i) => ({ a: a, i: i })).sort((x, y) => {
    const dx = parseDate(x.a['Дата']), dy = parseDate(y.a['Дата']);
    if (dx && dy && dx - dy !== 0) return dy - dx;
    if (dx && !dy) return -1;
    if (!dx && dy) return 1;
    return y.i - x.i;
  }).map(o => o.a);
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

function eventCard(e, withJoin, withEdit, withDelete) {
  const p = participantsOf(e['Название'] || '');
  const isRace = /забег|марафон|полумарафон/i.test((e['Тип'] || '') + ' ' + (e['Название'] || ''));
  const count = p.count ? '<p>👥 Участников: ' + p.count + '</p>' : '';
  const who = (p.names && p.names.length)
    ? '<div class="who">' + p.names.map((n, i) => {
        const name = String(n).trim();
        const initial = esc(name.charAt(0) || '?').toUpperCase();
        // Кликабелен только зарегистрированный участник: по имени
        // ищем его в списке «Участники» — по клику покажем карточку.
        const isMember = (clubData.members || []).some(m =>
          String(m['Имя'] || '').trim().toLowerCase() === name.toLowerCase());
        return '<span class="who-chip' + (isMember ? ' clickable' : '') + '"'
          + (isMember ? ' data-member="' + esc(name) + '"' : '') + '>'
          + '<span class="who-avatar c' + ((i % 5) + 1) + '">' + initial + '</span>' + esc(name) + '</span>';
      }).join('') + '</div>'
    : '';
  const dateParts = [];
  if (e['День недели']) dateParts.push(esc(e['День недели']));
  if (e['Дата']) dateParts.push(esc(e['Дата']));
  if (e['Время']) dateParts.push(esc(e['Время']));
  return '<div class="card">'
    + '<h3>' + (isRace ? '🏅 ' : '') + esc(e['Название'] || 'Тренировка') + '</h3>'
    + (dateParts.length ? '<p>' + dateParts.join(' · ') + '</p>' : '')
    + (e['Место'] ? '<p>📍 ' + esc(e['Место']) + '</p>' : '')
    + (e['Описание'] ? '<p class="muted">' + esc(e['Описание']) + '</p>' : '')
    + count + who
    + (withJoin ? '<button class="joinBtn" data-event="' + esc(e['Название'] || '') + '">Я участвую</button>' : '')
    + ((withEdit || withDelete) ? '<br>' : '')
    + (withEdit ? '<button class="editBtn" data-id="' + esc(e['ID'] || '') + '">✏️ Изменить</button>' : '')
    + (withDelete ? ' <button class="delEventBtn danger" data-id="' + esc(e['ID'] || '') + '" data-title="' + esc(e['Название'] || '') + '">🗑 Удалить</button>' : '')
    + (withDelete ? '<div class="delEventConfirm" style="display:none;"></div>' : '')
    + '</div>';
}

function show(page) {
  currentPage = page;
  hideMemberCard();
  const content = document.getElementById('content');
  if (!clubData) return;

  document.querySelectorAll('#menu button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  if (page === 'home') {
    const events = sortedEvents();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = events.filter(e => { const d = parseUntil(e['Дата']); return !d || d >= today; });
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
    // Календарь — по порядку дат: ближайшие сверху, самые поздние
    // внизу. Добавленное вручную событие встаёт между другими
    // по своей дате — порядок не зависит от того, когда его добавили.
    // Забег без точной даты («Февраль 2027») встаёт в свой месяц.
    // Прошедшие события не показываем: дата прошла — событие ушло
    // из календаря (в таблице оно остаётся). Забег с месяцем без
    // числа живёт до конца этого месяца. События совсем без даты
    // показываем всегда, они идут последними.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const items = sortedEvents().filter(e => {
      const d = parseUntil(e['Дата']);
      return !d || d >= today;
    });
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

    html += items.length ? items.map(e => eventCard(e, true, true, true)).join('') : '<div class="card"><p>Событий пока нет</p></div>';
    content.innerHTML = html;

    document.getElementById('showAddFormBtn').onclick = () => {
      const f = document.getElementById('addEventForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('saveEventBtn').onclick = createEvent;
  }
  else if (page === 'news') {
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : {};
    const authorName = esc(user.first_name || '');
    let html = '<h2>📌 Объявления</h2>'
      + '<div class="card"><button id="showAddAdBtn" class="green">+ Добавить объявление</button></div>'
      + '<div id="addAdForm" style="display:none;" class="card">'
      + '<h3>Новое объявление</h3>'
      + '<input id="adTitle" placeholder="Заголовок (напр. Ищу компанию)">'
      + '<input id="adText" placeholder="Текст объявления">'
      + '<input id="adCategory" placeholder="Категория (напр. Общее)">'
      + '<input id="adAuthor" placeholder="Автор" value="' + authorName + '">'
      + '<input id="adSecret" type="password" placeholder="Пароль администратора">'
      + '<button id="saveAdBtn">Опубликовать</button>'
      + '</div>';

    const ads = sortedAds();
    html += (ads.length ? ads.map(a => '<div class="card"><b>'
      + esc(a['Заголовок'] || '') + '</b>' + (a['Автор'] ? ' (' + esc(a['Автор']) + ')' : '') + '<br><p>'
      + esc(a['Текст'] || '') + '</p>'
      + (a['Дата'] ? '<p class="muted">' + esc(a['Дата']) + '</p>' : '')
      + '<button class="delAdBtn danger" data-ad-id="' + esc(a['ID'] || '') + '" data-ad-title="' + esc(a['Заголовок'] || '') + '">🗑 Удалить</button>'
      + '<div class="delAdConfirm" style="display:none;"></div>'
      + '</div>').join('') : '<div class="card"><p>Объявлений пока нет</p></div>');
    content.innerHTML = html;

    document.getElementById('showAddAdBtn').onclick = () => {
      const f = document.getElementById('addAdForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('saveAdBtn').onclick = createAd;
  }
  else if (page === 'relays') {
    const relays = clubData.relays || [];
    let html = '<h2>🏆 Эстафеты</h2>'
      + '<div class="card"><button id="showAddRelayBtn" class="green">+ Добавить эстафету</button></div>'
      + '<div id="addRelayForm" style="display:none;" class="card">'
      + '<h3>Новая эстафета</h3>'
      + '<input id="relayTitle" placeholder="Название (напр. Московская эстафета)">'
      + '<input id="relayYear" placeholder="Год (напр. 2027)">'
      + '<input id="relayTeam" placeholder="Команда (напр. Команда №1)">'
      + '<input id="relayMembers" placeholder="Участники (напр. Иван, Сергей, Алексей)">'
      + '<input id="relayDate" placeholder="Дата (напр. 15.05.2027)">'
      + '<input id="relayResult" placeholder="Результат (напр. 3:42:10)">'
      + '<input id="relayPhoto" placeholder="Фото (ссылка, необязательно)">'
      + '<input id="relaySecret" type="password" placeholder="Пароль администратора">'
      + '<button id="saveRelayBtn">Опубликовать</button>'
      + '</div>';

    html += (relays.length ? relays.map(r => '<div class="card" style="text-align:left;">'
      + '<b>' + esc(r['Название'] || 'Эстафета') + '</b> (' + esc(r['Год'] || '') + ')<br>'
      + '<p>' + esc(r['Команда'] || '') + '</p>'
      + '<p>' + esc(r['Участники'] || '') + '</p>'
      + (r['Дата'] ? '<p>📅 ' + esc(r['Дата']) + '</p>' : '')
      + (r['Результат'] ? '<p>⏱ Результат: <b>' + esc(r['Результат']) + '</b></p>' : '')
      + (r['Фото'] ? '<p><a href="' + esc(r['Фото']) + '" target="_blank" rel="noopener">📷 Фото</a></p>' : '')
      + '</div>').join('') : '<div class="card"><p>Эстафет пока нет — добавьте лист «Эстафеты» в таблицу.</p></div>');
    content.innerHTML = html;

    document.getElementById('showAddRelayBtn').onclick = () => {
      const f = document.getElementById('addRelayForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('saveRelayBtn').onclick = createRelay;
  }
  else if (page === 'users') {
    const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : {};
    const userName = esc(user.first_name || '');
    let html = '<h2>👥 Участники</h2>'
      + '<div class="card"><button id="showJoinClubBtn" class="green">+ Вступить в клуб</button></div>'
      + '<div id="joinClubForm" style="display:none;" class="card">'
      + '<h3>Вступить в клуб</h3>'
      + '<input id="memberName" placeholder="Имя" value="' + userName + '">'
      + '<input id="memberTempo" placeholder="Темп (напр. 5:30 /км)">'
      + '<input id="memberGoal" placeholder="Цель (напр. 10 км)">'
      + '<input id="memberDistances" placeholder="Дистанции (напр. 5 км, 10 км)">'
      + '<input id="memberExperience" placeholder="Стаж бега (напр. 2 года)">'
      + '<input id="memberLikes" placeholder="Люблю (напр. длительные)">'
      + '<button id="saveMemberBtn">Вступить</button>'
      + '</div>';

    html += (clubData.members && clubData.members.length ? clubData.members.map(m => '<div class="card" style="text-align:left;">'
      + '<b>' + esc(m['Имя'] || '') + '</b><br>'
      + '<small>Темп: ' + esc(m['Темп'] || '-') + ' | Цель: ' + esc(m['Цель'] || '-') + '</small>'
      + (m['Стаж бега'] || m['Стаж'] ? '<br><small>Бегаю: ' + esc(m['Стаж бега'] || m['Стаж']) + '</small>' : '')
      + (m['Год вступления'] ? '<br><small>В клубе с ' + esc(m['Год вступления']) + ' года</small>' : '')
      + (m['Дистанции'] ? '<br><small>Дистанции: ' + esc(m['Дистанции']) + '</small>' : '')
      + (m['Люблю'] ? '<br><small>Люблю: ' + esc(m['Люблю']) + '</small>' : '')
      + '</div>').join('') : '<div class="card"><p>Список пуст</p></div>');
    content.innerHTML = html;

    document.getElementById('showJoinClubBtn').onclick = () => {
      const f = document.getElementById('joinClubForm');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('saveMemberBtn').onclick = joinClub;
  }

  content.querySelectorAll('.joinBtn').forEach(btn => {
    btn.onclick = () => join(btn.dataset.event, btn);
  });
  content.querySelectorAll('.editBtn').forEach(btn => {
    btn.onclick = () => editEvent(btn.dataset.id, btn);
  });
  content.querySelectorAll('.delEventBtn').forEach(btn => {
    btn.onclick = () => deleteEvent(btn.dataset.id, btn.dataset.title, btn);
  });
  content.querySelectorAll('.who-chip.clickable').forEach(chip => {
    chip.onclick = () => showMemberCard(chip.dataset.member);
  });
  content.querySelectorAll('.delAdBtn').forEach(btn => {
    btn.onclick = () => deleteAd(btn.dataset.adId, btn.dataset.adTitle, btn);
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

/** День недели по точной дате («15.02.2027» → «Понедельник»).
 *  Для месяца без числа («Февраль 2027») возвращает пустую строку. */
function weekdayFor(dateStr) {
  const p = parseDateParts(dateStr);
  if (!p || !p.exact) return '';
  return ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
    [new Date(p.year, p.month, p.day).getDay()];
}

/** Карточка зарегистрированного участника — всплывающее окно
 *  поверх текущего экрана. Открывается по клику на чип участника
 *  под карточкой события. Закрывается крестиком или кликом по фону. */
function showMemberCard(name) {
  const m = (clubData.members || []).find(x =>
    String(x['Имя'] || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
  if (!m) return;
  let overlay = document.getElementById('memberModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'memberModal';
    document.body.appendChild(overlay);
  }
  const memberName = String(m['Имя'] || '').trim();
  const initial = esc(memberName.charAt(0) || '?').toUpperCase();
  const color = (memberName.length % 5) + 1;
  overlay.innerHTML = '<div class="memberModalCard">'
    + '<button class="memberModalClose">✕</button>'
    + '<div style="text-align:center"><span class="who-avatar c' + color + '" style="width:48px;height:48px;font-size:22px">' + initial + '</span></div>'
    + '<h3>' + esc(memberName) + '</h3>'
    + '<p>Темп: ' + esc(m['Темп'] || '-') + ' · Цель: ' + esc(m['Цель'] || '-') + '</p>'
    + (m['Стаж бега'] ? '<p>Бегаю: ' + esc(m['Стаж бега']) + '</p>' : '')
    + (m['Год вступления'] ? '<p>В клубе с ' + esc(m['Год вступления']) + ' года</p>' : '')
    + (m['Дистанции'] ? '<p>Дистанции: ' + esc(m['Дистанции']) + '</p>' : '')
    + (m['Люблю'] ? '<p>Люблю: ' + esc(m['Люблю']) + '</p>' : '')
    + '</div>';
  overlay.style.display = 'flex';
  overlay.querySelector('.memberModalClose').onclick = hideMemberCard;
  overlay.onclick = (ev) => { if (ev.target === overlay) hideMemberCard(); };
}

function hideMemberCard() {
  const overlay = document.getElementById('memberModal');
  if (overlay) overlay.style.display = 'none';
}

/** Редактирование события прямо в карточке Календаря.
 *  Открывает встроенную форму с заполненными полями; день недели
 *  сам считается из даты, пароль администратора проверяется на сервере. */
async function editEvent(id, btn) {
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }
  const ev = ((clubData && clubData.events) || []).find(x => String(x['ID']) === String(id));
  if (!ev) { alert('Событие не найдено'); return; }
  const card = btn.closest('.card');
  if (!card) return;

  card.querySelectorAll('.joinBtn, .editBtn').forEach(b => { b.style.display = 'none'; });
  const box = document.createElement('div');
  box.className = 'editBox';
  box.innerHTML =
    '<h4>Изменить событие</h4>'
    + '<input class="edTitle" value="' + esc(ev['Название'] || '') + '" placeholder="Название">'
    + '<input class="edType" value="' + esc(ev['Тип'] || '') + '" placeholder="Тип: Тренировка или Забег">'
    + '<input class="edDate" value="' + esc(ev['Дата'] || '') + '" placeholder="Дата (напр. 15.02.2027 или Февраль 2027)">'
    + '<input class="edDay" value="' + esc(ev['День недели'] || '') + '" placeholder="День недели">'
    + '<input class="edTime" value="' + esc(ev['Время'] || '') + '" placeholder="Время (напр. 19:00)">'
    + '<input class="edPlace" value="' + esc(ev['Место'] || '') + '" placeholder="Место">'
    + '<input class="edDesc" value="' + esc(ev['Описание'] || '') + '" placeholder="Описание">'
    + '<input class="edSecret" type="password" placeholder="Пароль администратора">'
    + '<button class="saveEdit">Сохранить</button>'
    + '<button class="cancelEdit">Отмена</button>';
  card.appendChild(box);

  const dateInput = box.querySelector('.edDate');
  const dayInput = box.querySelector('.edDay');
  dateInput.onchange = () => { dayInput.value = weekdayFor(dateInput.value.trim()); };

  box.querySelector('.saveEdit').onclick = async () => {
    const title = box.querySelector('.edTitle').value.trim();
    const secret = box.querySelector('.edSecret').value;
    if (!title) { alert('Укажите название!'); return; }
    if (!secret) { alert('Введите пароль администратора'); return; }
    const date = dateInput.value.trim();
    try {
      await postPayload({
        action: 'editEvent', id: id,
        title: title,
        type: box.querySelector('.edType').value.trim(),
        date: date,
        dayOfWeek: weekdayFor(date),
        time: box.querySelector('.edTime').value.trim(),
        place: box.querySelector('.edPlace').value.trim(),
        description: box.querySelector('.edDesc').value.trim(),
        secret: secret
      });
      alert('Сохранено! Обновляем...');
      setTimeout(loadData, 1500);
    } catch (err) {
      alert('Ошибка при сохранении');
    }
  };
  box.querySelector('.cancelEdit').onclick = () => { show('calendar'); };
}

async function createAd() {
  const title = document.getElementById('adTitle').value.trim();
  const text = document.getElementById('adText').value.trim();
  const category = document.getElementById('adCategory').value.trim();
  const author = document.getElementById('adAuthor').value.trim();
  const secret = document.getElementById('adSecret').value;

  if (!title || !text || !secret) {
    alert('Заполните заголовок, текст и пароль!');
    return;
  }
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }

  try {
    await postPayload({ action: 'addAd', title, text, category, author, secret });
    alert('Запрос отправлен! Обновляем...');
    setTimeout(loadData, 1500);
  } catch (err) {
    alert('Ошибка при добавлении объявления');
  }
}

// Удаление объявления: кнопка показывает встроенное подтверждение
// с полем пароля админа (window.prompt в Telegram не работает,
// поэтому пароль спрашиваем прямо в карточке). Удалять может
// только админ — тот же пароль, что для публикации объявления.
async function deleteAd(id, title, btn) {
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }
  const card = btn.closest('.card');
  const box = card ? card.querySelector('.delAdConfirm') : null;
  if (!box) return;
  btn.style.display = 'none';
  box.style.display = 'block';
  box.innerHTML = '<p>Удалить объявление «' + esc(title) + '»?</p>'
    + '<input type="password" placeholder="Пароль администратора">'
    + '<button class="confirmDel">Удалить</button> '
    + '<button class="cancelDel">Отмена</button>';
  const input = box.querySelector('input');
  try { input.focus(); } catch (e) { /* не критично */ }
  box.querySelector('.cancelDel').onclick = () => { show('news'); };
  box.querySelector('.confirmDel').onclick = async () => {
    const secret = input.value;
    if (!secret) { alert('Введите пароль администратора'); return; }
    try {
      await postPayload({ action: 'deleteAd', id: id, secret: secret });
      alert('Объявление удалено! Обновляем...');
      setTimeout(loadData, 1200);
    } catch (err) {
      alert('Ошибка при удалении объявления');
      show('news');
    }
  };
}

/** Удаление события из Календаря (с паролем админа): встроенное
 *  подтверждение внутри карточки, как у удаления объявления. */
async function deleteEvent(id, title, btn) {
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }
  const card = btn.closest('.card');
  const box = card ? card.querySelector('.delEventConfirm') : null;
  if (!box) return;
  btn.style.display = 'none';
  box.style.display = 'block';
  box.innerHTML = '<p>Удалить событие «' + esc(title) + '»?</p>'
    + '<input type="password" placeholder="Пароль администратора">'
    + '<button class="confirmDel danger">Удалить</button> '
    + '<button class="cancelDel">Отмена</button>';
  const input = box.querySelector('input');
  try { input.focus(); } catch (e) { /* не критично */ }
  box.querySelector('.cancelDel').onclick = () => { show('calendar'); };
  box.querySelector('.confirmDel').onclick = async () => {
    const secret = input.value;
    if (!secret) { alert('Введите пароль администратора'); return; }
    try {
      await postPayload({ action: 'deleteEvent', id: id, secret: secret });
      alert('Событие удалено! Обновляем...');
      setTimeout(loadData, 1200);
    } catch (err) {
      alert('Ошибка при удалении события');
      show('calendar');
    }
  };
}

async function joinClub() {
  const name = document.getElementById('memberName').value.trim();
  const tempo = document.getElementById('memberTempo').value.trim();
  const goal = document.getElementById('memberGoal').value.trim();
  const distances = document.getElementById('memberDistances').value.trim();
  const experience = document.getElementById('memberExperience').value.trim();
  const likes = document.getElementById('memberLikes').value.trim();

  if (!name) {
    alert('Укажите имя!');
    return;
  }
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }

  try {
    await postPayload({ action: 'addMember', name, tempo, goal, distances, experience, likes });
    alert('Запрос отправлен! Обновляем...');
    setTimeout(loadData, 1500);
  } catch (err) {
    alert('Ошибка. Попробуйте ещё раз.');
  }
}

async function createRelay() {
  const title = document.getElementById('relayTitle').value.trim();
  const year = document.getElementById('relayYear').value.trim();
  const team = document.getElementById('relayTeam').value.trim();
  const members = document.getElementById('relayMembers').value.trim();
  const date = document.getElementById('relayDate').value.trim();
  const result = document.getElementById('relayResult').value.trim();
  const photo = document.getElementById('relayPhoto').value.trim();
  const secret = document.getElementById('relaySecret').value;

  if (!title || !secret) {
    alert('Заполните название и пароль!');
    return;
  }
  if (!API_CONFIGURED) { alert('Приложение не подключено к таблице. Вставьте URL в script.js.'); return; }

  try {
    await postPayload({ action: 'addRelay', title, year, team, members, date, result, photo, secret });
    alert('Запрос отправлен! Обновляем...');
    setTimeout(loadData, 1500);
  } catch (err) {
    alert('Ошибка при добавлении эстафеты');
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
