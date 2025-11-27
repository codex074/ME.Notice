// ==========================================
// ⚙️ ส่วนตั้งค่า (Backend)
// ==========================================
const TELEGRAM_TOKEN = "8026125329:AAHjEkBjOMEVSvhES_74Hrd4nAYfJtWugKE"; 
const CHAT_ID = "-1003372001624"; 
const SHEET_ID = "1IJ9crKC1twGIWQvyvMuSKlh8tcqZ4Q0aoKYdPTvFAe4";

const COL_TIMESTAMP = 1;
const COL_DATE      = 2;
const COL_HN        = 3;
const COL_METYPE    = 4;
const COL_DETAILS   = 5;
const COL_SEVERITY  = 6;
// ==========================================

function doGet(e) {
  return ContentService.createTextOutput("API is running...");
}

function doPost(e) {
  var requestData = JSON.parse(e.postData.contents);
  var action = requestData.action;
  var result = {};

  if (action === 'save') {
    result = saveData(requestData);
  } else if (action === 'getDashboard') {
    result = getDashboardData();
  } else if (action === 'getRecords') {
    result = getRecords();
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveData(data) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { status: "error", message: "Server busy" }; }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Data');
  
  if (!sheet) sheet = ss.insertSheet('Data');
  if (sheet.getLastRow() === 0) {
    const headers = ["Timestamp", "Date", "HN", "ME_Type", "Details", "Severity"];
    sheet.appendRow(headers);
  }

  const nextRow = sheet.getLastRow() + 1;
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  
  // บันทึกข้อมูลลง Sheet
  sheet.getRange(nextRow, COL_TIMESTAMP).setValue(timestamp);
  sheet.getRange(nextRow, COL_DATE).setValue(data.incidentDate);
  sheet.getRange(nextRow, COL_HN).setValue(data.hn);
  sheet.getRange(nextRow, COL_METYPE).setValue(data.meType);
  sheet.getRange(nextRow, COL_DETAILS).setValue(data.meDetails || "-");
  sheet.getRange(nextRow, COL_SEVERITY).setValue(data.severity || "-");

  SpreadsheetApp.flush();
  lock.releaseLock();

  // ส่ง Telegram
  try {
    sendTelegram(data.incidentDate, data.hn, data.meType, data.meDetails, data.severity);
  } catch (e) { console.error(e); }

  return { status: "success" };
}

// ✅ ฟังก์ชันช่วยแปลงวันที่เป็นไทย (เช่น 2023-11-25 -> 25 พ.ย. 2566)
function formatThaiDate(dateString) {
  if (!dateString) return "-";
  var parts = dateString.split("-"); // แยก yyyy-mm-dd
  if (parts.length !== 3) return dateString;

  var year = parseInt(parts[0]) + 543; // แปลง ค.ศ. เป็น พ.ศ.
  var monthIndex = parseInt(parts[1]) - 1;
  var day = parseInt(parts[2]);
  
  var months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  return day + " " + months[monthIndex] + " " + year;
}

function sendTelegram(date, hn, meType, details, severity) {
  if (!CHAT_ID || CHAT_ID.includes("ใส่_CHAT_ID")) return;
  
  // ✅ แปลงวันที่ก่อนส่งข้อความ
  var thaiDate = formatThaiDate(date);

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const text = `🚨 *รายงานอุบัติการณ์ (Med Error)*\n➖➖➖➖➖➖➖➖➖➖\n📅 *วันที่:* ${thaiDate}\n🏥 *HN:* ${hn}\n⚠️ *ประเภท:* ${meType}\n📝 *รายละเอียด:* ${details}\n🔴 *ความรุนแรง:* ${severity}`;
  
  UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: "Markdown" }) });
}

function getDashboardData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Data');
  if (!sheet || sheet.getLastRow() <= 1) return { error: "No Data" };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const typeCounts = {};
  const severityCounts = { "A":0, "B":0, "C":0, "D":0, "E":0, "F":0, "G":0, "H":0, "I":0 };

  data.forEach(row => {
    const type = row[3];
    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    let sev = row[5]; 
    if (sev) {
      sev = sev.toString().split(" ")[0].trim();
      if (severityCounts[sev] !== undefined) severityCounts[sev]++;
    }
  });

  return { typeCounts, severityCounts, total: data.length };
}

function getRecords() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Data');
  if (!sheet || sheet.getLastRow() <= 1) return { data: [] };
  
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  
  const data = values.map(row => ({
    timestamp: row[0],
    date: row[1],
    hn: row[2],
    meType: row[3],
    details: row[4],
    severity: row[5]
  })).reverse(); 

  return { data: data };
}