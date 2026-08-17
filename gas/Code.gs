const SPREADSHEET_ID = '1G_7dukgBGVF2gAyZvTQikjcHMfmmPsg7zQT2avHWPUU';
const RESPONSE_SHEET = 'Responses';
const FUNNEL_SHEET = 'Funnel';
const DEFAULT_APP_VERSION = '3.5.0';

const TYPE_ORDER = ['TR','TP','TG','RT','RP','RG','PT','PR','PG','GT','GR','GP'];
const FUNNEL_EVENTS = ['page_view','start','question_progress','result_view','response_saved','image_save','share_click','share_success','x_intent_open'];

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');

    if (payload.action === 'saveResponse') {
      saveResponse_(payload.data || {});
    } else if (payload.action === 'funnel') {
      saveFunnel_(payload.data || {});
    } else if (payload.action === 'funnelBatch') {
      saveFunnelBatch_(Array.isArray(payload.data) ? payload.data : []);
    } else {
      throw new Error('Unknown action');
    }

    return ContentService.createTextOutput('OK');
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput('ERROR');
  }
}

function saveResponse_(data) {
  const type = normalizeType_(data.type);
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const appVersion = clean_(data.appVersion || DEFAULT_APP_VERSION, 32);

  if (TYPE_ORDER.indexOf(type) < 0) throw new Error('Invalid type');
  if (answers.length !== 22) throw new Error('Answers must contain 22 items');

  const suppliedSessionId = cleanSession_(data.sessionId);
  const sessionId = suppliedSessionId || ('resp_' + Utilities.getUuid().replace(/-/g, ''));
  const source = oneOf_(String(data.source || '').toLowerCase(), ['direct','x','other'], 'other');
  const deviceClass = oneOf_(String(data.deviceClass || '').toLowerCase(), ['mobile','desktop','other'], 'other');
  const referrer = referrerHost_(data.referrer);
  const now = new Date();
  const scores = data.scores || {};
  const values = {
    Timestamp: now,
    Name: clean_(data.name, 80),
    T: number_(scores.T),
    R: number_(scores.R),
    P: number_(scores.P),
    G: number_(scores.G),
    Primary: type.charAt(0),
    Secondary: type.charAt(1),
    AppVersion: appVersion,
    Type: type,
    SessionId: sessionId
  };

  for (let i = 0; i < 22; i++) {
    values['Q' + (i + 1)] = normalizeAnswer_(answers[i]);
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const responseSheet = ss.getSheetByName(RESPONSE_SHEET);
  if (!responseSheet) throw new Error('Responses sheet not found');
  let funnelSheet = ss.getSheetByName(FUNNEL_SHEET);
  if (!funnelSheet) {
    funnelSheet = ss.insertSheet(FUNNEL_SHEET);
    funnelSheet.appendRow(['timestamp','session_id','event','source','type','question_index','app_version','share_method','referrer','device_class','success','note']);
    funnelSheet.setFrozenRows(1);
  }
  const headers = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getDisplayValues()[0];
  const row = headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    responseSheet.getRange(responseSheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    funnelSheet.getRange(funnelSheet.getLastRow() + 1, 1, 1, 12).setValues([[
      now,
      sessionId,
      'response_saved',
      source,
      type,
      22,
      appVersion,
      '',
      referrer,
      deviceClass,
      true,
      suppliedSessionId ? 'saved_with_response' : 'saved_with_response_synthetic_session'
    ]]);
  } finally {
    lock.releaseLock();
  }
}

function saveFunnel_(data) {
  saveFunnelBatch_([data]);
}

function saveFunnelBatch_(items) {
  if (!Array.isArray(items)) throw new Error('Invalid funnel batch');
  const batch = items.slice(0, 50);
  if (!batch.length) return;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(FUNNEL_SHEET);
  if (!sheet) {
    const setupLock = LockService.getScriptLock();
    setupLock.waitLock(15000);
    try {
      sheet = ss.getSheetByName(FUNNEL_SHEET);
      if (!sheet) {
        sheet = ss.insertSheet(FUNNEL_SHEET);
        sheet.appendRow(['timestamp','session_id','event','source','type','question_index','app_version','share_method','referrer','device_class','success','note']);
        sheet.setFrozenRows(1);
      }
    } finally {
      setupLock.releaseLock();
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cache = CacheService.getScriptCache();
    const now = new Date();
    const rows = [];
    batch.forEach(function(data) {
      try {
        const row = normalizeFunnelRow_(data || {}, now, cache);
        if (row) rows.push(row);
      } catch (err) {
        console.error('Skipped invalid funnel event', err);
      }
    });
    if (!rows.length) return;
    const firstRow = sheet.getLastRow() + 1;
    sheet.getRange(firstRow, 1, rows.length, 12).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

function normalizeFunnelRow_(data, serverNow, cache) {
  const event = String(data.event || '').trim();
  const appVersion = clean_(data.appVersion || DEFAULT_APP_VERSION, 32);
  if (FUNNEL_EVENTS.indexOf(event) < 0) throw new Error('Invalid funnel event');

  const sessionId = cleanSession_(data.sessionId);
  if (!sessionId) throw new Error('Invalid session id');

  const type = normalizeType_(data.type);
  const questionIndex = clampQuestion_(data.questionIndex);
  const source = oneOf_(String(data.source || '').toLowerCase(), ['direct','x','other'], 'other');
  const shareMethod = oneOf_(String(data.shareMethod || '').toLowerCase(), ['web_share','x_intent','download'], '');
  const deviceClass = oneOf_(String(data.deviceClass || '').toLowerCase(), ['mobile','desktop','other'], 'other');
  const success = data.success === true ? true : data.success === false ? false : '';
  const referrer = referrerHost_(data.referrer);
  const note = clean_(data.note, 120);

  if (event === 'page_view' || event === 'start' || event === 'result_view' || event === 'question_progress') {
    const dedupeKey = ['f2', appVersion, sessionId, event, questionIndex].join('|');
    if (cache.get(dedupeKey)) return null;
    cache.put(dedupeKey, '1', 21600);
  }

  let timestamp = serverNow;
  const clientTs = Number(data.clientTs);
  if (Number.isFinite(clientTs)) {
    const candidate = new Date(clientTs);
    if (!isNaN(candidate.getTime()) && Math.abs(serverNow.getTime() - candidate.getTime()) <= 86400000) {
      timestamp = candidate;
    }
  }

  return [timestamp, sessionId, event, source, type, questionIndex, appVersion, shareMethod, referrer, deviceClass, success, note];
}

function normalizeType_(value) {
  const m = String(value || '').toUpperCase().match(/TR|TP|TG|RT|RP|RG|PT|PR|PG|GT|GR|GP/);
  return m ? m[0] : '';
}

function normalizeAnswer_(value) {
  const m = String(value || '').trim().toUpperCase().match(/^[A-E]/);
  return m ? m[0] : '';
}

function number_(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clean_(value, max) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function cleanSession_(value) {
  const s = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(s) ? s : '';
}

function clampQuestion_(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(22, Math.floor(n))) : '';
}

function oneOf_(value, allowed, fallback) {
  return allowed.indexOf(value) >= 0 ? value : fallback;
}

function referrerHost_(value) {
  const m = String(value || '').trim().match(/^https?:\/\/([^\/?#]+)/i);
  return m ? clean_(m[1].toLowerCase(), 100) : '';
}
