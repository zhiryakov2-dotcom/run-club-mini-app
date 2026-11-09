/**
 * RUN CLUB — бэкенд для Telegram Mini App на Google Apps Script.
 * ================================================================
 * КАК ПОДКЛЮЧИТЬ (подробно — в README.md):
 *  1. Откройте таблицу «Беговой_клуб_Mini_App_база».
 *  2. Расширения → Apps Script → вставьте этот файл целиком.
 *  3. Пароль администратора уже задан в ADMIN_PASSWORD ниже.
 *  4. Запустите функцию setup() один раз — она создаст недостающие
 *     листы с правильными заголовками.
 *  5. Развернуть → Новое развёртывание → Веб-приложение:
 *     «Выполнять как: Я», «У кого есть доступ: Все».
 *  6. Скопируйте URL вида https://script.google.com/macros/s/.../exec
 *     и вставьте его в script.js в API_URL.
 *
 * ВАЖНО: скрипт должен быть ПРИВЯЗАН к таблице (создан через
 * «Расширения → Apps Script» именно из этой таблицы), тогда
 * SpreadsheetApp.getActiveSpreadsheet() вернёт её саму и ID
 * таблицы нигде прописывать не нужно.
 *
 * Заголовки листов ниже — как в реальной таблице на 06.11.2026.
 * Не меняйте порядок колонок в таблице, иначе запись пойдёт
 * не в те колонки: скрипт пишет строки позиционно.
 */

// Пароль администратора для добавления тренировок в Mini App.
// Придуман простой: runclub2026. Он же вводится в Mini App при
// добавлении тренировки. Это простая защита от случайных добавлений,
// а не банковская безопасность: пароль виден в коде Mini App,
// поэтому не используйте пароль от почты.
const ADMIN_PASSWORD = 'runclub2026';

const SHEETS = {
  events: 'События',      // календарь: тренировки и забеги
  ads: 'Объявления',      // доска объявлений
  members: 'Участники',   // карточки участников
  relays: 'Эстафеты',     // история командных событий
  signups: 'Записи'       // кто записался (заполняется сам)
};

const HEADERS = {
  events: ['ID', 'Название', 'Тип', 'Дата', 'День недели', 'Время', 'Место', 'Описание'],
  ads: ['ID', 'Категория', 'Заголовок', 'Автор', 'Текст', 'Дата', 'Статус'],
  members: ['ID', 'Имя', 'Фото', 'Год вступления', 'Стаж бега', 'Дистанции', 'Цель', 'Темп'],
  relays: ['ID', 'Название', 'Год', 'Команда', 'Участники', 'Дата', 'Результат', 'Фото'],
  signups: ['ID', 'Участник', 'Событие', 'Дата записи', 'Статус']
};

/** Создаёт недостающие листы с заголовками. Запустить один раз вручную. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (key) {
    ensureSheet_(SHEETS[key], HEADERS[key]);
  });
  return 'Готово: листы ' + Object.values(SHEETS).join(', ') + ' проверены.';
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Следующий ID вида 002, 003 — по числу непустых строк листа. */
function nextId_(name) {
  const rows = readSheet_(name);
  let max = 0;
  rows.forEach(function (r) {
    const n = parseInt(String(r['ID'] || '0').replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return ('00' + (max + 1)).slice(-3);
}

/** Время и длительности («10:00», «1:00:00») пишем как текст: иначе
 *  таблица парсит их как дату, и при чтении они превращаются в «30.12.1899».
 *  Апостроф в начале заставляет Sheets хранить значение текстом,
 *  сам апостроф в значении не сохраняется и не показывается. */
function text_(v) {
  const s = String(v || '');
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ? "'" + s : s;
}

/** Читает лист в массив объектов {Заголовок: значение}. Пустые строки пропускает. */
function readSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = [];
  values.forEach(function (row) {
    if (row.every(function (c) { return c === '' || c === null; })) return;
    const obj = {};
    headers.forEach(function (h, i) {
      let v = row[i];
      if (v instanceof Date) {
        // Время («10:00», «1:00:00»), записанное как дата, Sheets хранит
        // как 30.12.1899 — показываем его как время, а не как дату.
        v = (v.getFullYear() === 1899)
          ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm:ss')
          : Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd.MM.yyyy');
      }
      obj[String(h)] = v === null || v === undefined ? '' : String(v);
    });
    rows.push(obj);
  });
  return rows;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET: Mini App запрашивает все данные одним запросом. */
function doGet(e) {
  try {
    const events = readSheet_(SHEETS.events);
    const ads = readSheet_(SHEETS.ads);
    const members = readSheet_(SHEETS.members);
    const relays = readSheet_(SHEETS.relays);
    const signups = readSheet_(SHEETS.signups);

    // Считаем участников по каждому событию: { 'ОФП': {count, names[]} }
    const participants = {};
    signups.forEach(function (s) {
      const ev = s['Событие'];
      if (!ev) return;
      if (!participants[ev]) participants[ev] = { count: 0, names: [] };
      participants[ev].count++;
      if (s['Участник']) participants[ev].names.push(s['Участник']);
    });

    return json_({ ok: true, events: events, ads: ads, members: members, relays: relays, participants: participants });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** POST: добавление/удаление (с паролем админа) и запись на тренировку. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const data = JSON.parse(e.postData.contents || '{}');

    if (data.action === 'addEvent') return json_(addEvent_(data));
    if (data.action === 'join') return json_(join_(data));
    if (data.action === 'addAd') return json_(addAd_(data));
    if (data.action === 'deleteAd') return json_(deleteAd_(data));
    if (data.action === 'addMember') return json_(addMember_(data));
    if (data.action === 'addRelay') return json_(addRelay_(data));
    return json_({ ok: false, error: 'Неизвестное действие: ' + data.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function addEvent_(d) {
  if (String(d.secret || '') !== ADMIN_PASSWORD) {
    return { ok: false, error: 'Неверный пароль администратора' };
  }
  if (!d.title || !d.date) {
    return { ok: false, error: 'Нужны название и дата' };
  }
  const sheet = ensureSheet_(SHEETS.events, HEADERS.events);
  sheet.appendRow([nextId_(SHEETS.events), d.title, d.type || 'Тренировка',
    d.date, d.dayOfWeek || '', text_(d.time), d.place || '', d.description || '']);
  return { ok: true };
}

function join_(d) {
  if (!d.event) return { ok: false, error: 'Не указано событие' };
  const sheet = ensureSheet_(SHEETS.signups, HEADERS.signups);
  const name = d.user || 'Участник';

  // Не записываем одного и того же человека дважды на одно событие.
  // В листе «Записи» нет колонки Telegram ID, поэтому сверяем по имени.
  const rows = readSheet_(SHEETS.signups);
  const exists = rows.some(function (r) {
    return r['Событие'] === d.event && r['Участник'] === name;
  });
  if (exists) return { ok: true, already: true };

  sheet.appendRow([nextId_(SHEETS.signups), name, d.event,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy'), 'Иду']);
  return { ok: true };
}

function addAd_(d) {
  if (String(d.secret || '') !== ADMIN_PASSWORD) {
    return { ok: false, error: 'Неверный пароль администратора' };
  }
  if (!d.title || !d.text) return { ok: false, error: 'Нужны заголовок и текст' };
  const sheet = ensureSheet_(SHEETS.ads, HEADERS.ads);
  sheet.appendRow([nextId_(SHEETS.ads), d.category || 'Общее', d.title, d.author || '',
    d.text, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy'), 'Активно']);
  return { ok: true };
}

/** Удаляет объявление по ID (с паролем админа). Номер строки ищется
 *  по колонке ID: в листе могут быть пустые строки, поэтому номер
 *  строки в таблице и порядковый номер в readSheet_() не совпадают. */
function deleteAd_(d) {
  if (String(d.secret || '') !== ADMIN_PASSWORD) {
    return { ok: false, error: 'Неверный пароль администратора' };
  }
  if (!d.id) return { ok: false, error: 'Не указан ID объявления' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ads);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, error: 'Объявление не найдено' };
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(d.id)) {
      sheet.deleteRow(i + 2);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Объявление не найдено' };
}

function addMember_(d) {
  if (!d.name) return { ok: false, error: 'Нужно имя' };
  const sheet = ensureSheet_(SHEETS.members, HEADERS.members);
  const name = String(d.name).trim();

  // Не добавляем одного и того же человека дважды.
  const rows = readSheet_(SHEETS.members);
  const exists = rows.some(function (r) {
    return String(r['Имя'] || '').trim().toLowerCase() === name.toLowerCase();
  });
  if (exists) return { ok: true, already: true };

  const year = new Date().getFullYear();
  sheet.appendRow([nextId_(SHEETS.members), name, '', year,
    d.experience || '', d.distances || '', d.goal || '', d.tempo || '', d.likes || '']);
  return { ok: true };
}

function addRelay_(d) {
  if (String(d.secret || '') !== ADMIN_PASSWORD) {
    return { ok: false, error: 'Неверный пароль администратора' };
  }
  if (!d.title) return { ok: false, error: 'Нужно название' };
  const sheet = ensureSheet_(SHEETS.relays, HEADERS.relays);
  sheet.appendRow([nextId_(SHEETS.relays), d.title, d.year || '',
    d.team || '', d.members || '', d.date || '', text_(d.result), d.photo || '']);
  return { ok: true };
}
