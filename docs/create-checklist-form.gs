/**
 * Скрипт для создания Google Form к таблице чек-листа.
 * Таблица: https://docs.google.com/spreadsheets/d/16OuzYzBTpfI_kmEx2VRpMTUYz8ydAtBWDshxKWl4kiI/
 *
 * СТРОГО: ОДНА СТРОКА ТАБЛИЦЫ = ОДИН ЭКРАН ФОРМЫ.
 * На каждом экране: 5 полей только чтение (из строки) + 3 поля для ввода.
 */

var CHECKLIST_SHEET_NAME = 'Sheet1';
var RESULT_OPTIONS = ['успешно', 'частично успешно', 'сбой/ошибка'];
var STATUS_OPTIONS = ['ожидает выполнения', 'передано на исправление', 'исправлено', 'архив/не будет исправлено'];

function createChecklistForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var data = [];

  sheet = ss.getSheetByName(CHECKLIST_SHEET_NAME) || ss.getSheetByName('Лист1');
  if (sheet) {
    try {
      data = sheet.getDataRange().getValues();
    } catch (err) {
      data = [];
    }
  }
  if (data.length < 2) {
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      try {
        var d = sheets[s].getDataRange().getValues();
        if (d.length >= 2) {
          sheet = sheets[s];
          data = d;
          break;
        }
      } catch (e) {}
    }
  }
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('Нет данных. Минимум: заголовок + 1 строка. Листы: ' + ss.getSheets().map(function(sh) { return sh.getName(); }).join(', '));
    return;
  }

  var rows = data.slice(1);
  var validRows = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] !== '' && rows[i][0] != null) validRows.push(rows[i]);
  }
  if (validRows.length === 0) {
    SpreadsheetApp.getUi().alert('Нет строк с номером в столбце A.');
    return;
  }

  var form = FormApp.create('Чек-лист тестирования — ввод результатов');
  form.setDescription('Выберите строку. Один экран = одна строка таблицы. Поля 1–5 только чтение, поля 6–8 заполняете вы. Даты проставятся автоматически.');
  form.setConfirmationMessage('Спасибо! Результат записан в таблицу.');
  form.setCollectEmail(true);

  var caseItem = form.addListItem();
  caseItem.setTitle('Выберите строку (кейс)');
  caseItem.setRequired(true);

  var choices = [];
  var pageBreaks = [];

  for (var r = 0; r < validRows.length; r++) {
    var row = validRows[r];
    var num = row[0];
    var desc = String(row[1] || '');
    var invoke = String(row[2] || '');
    var scenario = String(row[3] || '');
    var expected = String(row[4] || '');

    var pageBreak = form.addPageBreakItem();
    pageBreak.setTitle('Строка ' + num);
    pageBreaks.push(pageBreak);

    var readOnlyText = [
      '1. Уникальный номер: ' + num,
      '2. Описание функции: ' + desc,
      '3. Способ вызова/активации: ' + invoke,
      '4. Тестовый сценарий: ' + scenario,
      '5. Ожидаемый результат: ' + expected
    ].join('\n\n');

    form.addSectionHeaderItem()
      .setTitle('Данные строки (только чтение)')
      .setHelpText(readOnlyText);

    form.addTextItem()
      .setTitle('6. Фактический результат (кратко, до 100 символов)')
      .setRequired(true);

    form.addParagraphTextItem()
      .setTitle('7. Фактический результат (описание, до 5000 символов)')
      .setRequired(false);

    var statusItem = form.addListItem();
    statusItem.setTitle('8. Статус');
    statusItem.setRequired(true);
    for (var s = 0; s < STATUS_OPTIONS.length; s++) {
      statusItem.createChoice(STATUS_OPTIONS[s]);
    }

    var label = num + ' — ' + (desc.length > 45 ? desc.substring(0, 45) + '…' : desc);
    choices.push(caseItem.createChoice(label, pageBreak));
  }

  caseItem.setChoices(choices);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  try {
    var ssFile = DriveApp.getFileById(ss.getId());
    var parents = ssFile.getParents();
    if (parents.hasNext()) {
      DriveApp.getFileById(form.getId()).moveTo(parents.next());
    }
  } catch (e) {}

  var triggers = ScriptApp.getUserTriggers(ss);
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'onChecklistFormSubmit') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }
  ScriptApp.newTrigger('onChecklistFormSubmit').forSpreadsheet(ss).onFormSubmit().create();

  SpreadsheetApp.getUi().alert(
    'Форма создана.\n\nЗаполнение: ' + form.getPublishedUrl() + '\n\nРедактирование: ' + form.getEditUrl() + '\n\nФорма в той же папке Drive, что и таблица.'
  );
}

function onChecklistFormSubmit(e) {
  if (!e || !e.values) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CHECKLIST_SHEET_NAME) || ss.getSheetByName('Лист1') || ss.getSheets()[0];
  var data;
  try {
    data = sheet.getDataRange().getValues();
  } catch (err) {
    return;
  }

  var caseAnswer = e.values[2];
  if (!caseAnswer) return;
  var numMatch = caseAnswer.match(/^(\d+)\s*[—\-]/) || caseAnswer.match(/^(\d+)/);
  if (!numMatch) return;

  var caseNum = parseInt(numMatch[1], 10);

  var pageIndex = 0;
  var sheetRow = -1;
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === '' || data[r][0] == null) continue;
    if (Number(data[r][0]) === caseNum) {
      sheetRow = r + 1;
      break;
    }
    pageIndex++;
  }
  if (sheetRow < 0) return;

  var baseIdx = 3 + pageIndex * 3;
  var resultBrief = String(e.values[baseIdx] || '').substring(0, 100);
  var resultDesc = String(e.values[baseIdx + 1] || '').substring(0, 5000);
  var status = e.values[baseIdx + 2] || '';
  var email = e.values[1] || Session.getActiveUser().getEmail() || '';
  var now = new Date();

  sheet.getRange(sheetRow, 6).setValue(resultBrief);
  sheet.getRange(sheetRow, 7).setValue(resultDesc);
  sheet.getRange(sheetRow, 8).setValue(status);
  sheet.getRange(sheetRow, 9).setValue(now);
  sheet.getRange(sheetRow, 10).setValue(now);
  sheet.getRange(sheetRow, 11).setValue(email);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Чек-лист').addItem('Создать форму', 'createChecklistForm').addToUi();
}
