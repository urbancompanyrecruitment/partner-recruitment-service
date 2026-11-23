var SHEET_NAME = 'Sign-ups';

function doPost(event) {
  var payload = JSON.parse(event.postData.contents);
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET_SHA256');

  if (!expected || sha256Hex(String(payload.secret || '')) !== expected.toLowerCase()) return respond({ ok: false, error: 'forbidden' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, payload.headers.length).setValues([payload.headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, payload.values.length).setNumberFormat('@').setValues([payload.values]);

    return respond({ ok: true, row: row });
  } finally {
    lock.releaseLock();
  }
}

function sha256Hex(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (byte) {
      return ('0' + (byte & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
