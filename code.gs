// ==========================================
// ⚙️ ส่วนตั้งค่า (Backend)
// ==========================================
const SHEET_ID = "18TK6Iv0LhbcGuaZj9g4W1uGTkB9Sfhlx2s-lMStagSc";
const FOLDER_ID = "1NoiBEZ4jjk67IDAiVK0hT2EfQrd9PDMq"; 

const TELEGRAM_TOKEN = "8026125329:AAHjEkBjOMEVSvhES_74Hrd4nAYfJtWugKE"; 
const CHAT_ID = "-1003372001624"; 

const COL_TIMESTAMP = 1;
const COL_DATE      = 2;
const COL_HN        = 3;
const COL_METYPE    = 4;
const COL_DETAILS   = 5;
const COL_SEVERITY  = 6;
const COL_REPORTER  = 7;
const COL_IMAGE     = 8; 

// ==========================================

function doGet(e) {
  return ContentService.createTextOutput("API is running...");
}

function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var result = {};

    if (action === 'save') {
      result = saveData(requestData);
    } else if (action === 'update') {
      result = updateData(requestData);
    } else if (action === 'delete') {
      result = deleteData(requestData);
    } else if (action === 'getDashboard') {
      result = getDashboardData();
    } else if (action === 'getRecords') {
      result = getRecords();
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: "Server Error: " + err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ✅ ฟังก์ชันจัดการรูปภาพ + ตั้งชื่อไฟล์ตามต้องการ
function processImageArray(images, hn, incidentDate) {
  if (!images || !Array.isArray(images) || images.length === 0) return "-";
  
  let urls = [];
  var folder = DriveApp.getFolderById(FOLDER_ID);

  // เตรียมส่วนประกอบชื่อไฟล์
  // 1. วันที่: ตัดขีดออก (เช่น 2025-11-28 -> 20251128)
  let datePart = (incidentDate || "").toString().replace(/-/g, ""); 
  // 2. HN: เปลี่ยน / เป็น - (เพื่อไม่ให้ error ชื่อไฟล์)
  let hnPart = (hn || "NoHN").toString().replace(/\//g, "-"); 

  images.forEach((img, index) => {
    if (img.data) { // กรณีเป็นรูปใหม่ที่อัปโหลดเข้ามา
      try {
        var decoded = Utilities.base64Decode(img.data);
        
        // ✅ ตั้งชื่อไฟล์: ME_Date_HN_ID (ID รัน 01, 02...)
        let idPart = ("0" + (index + 1)).slice(-2); // รันเลข 01-99
        let fileName = `ME_${datePart}_${hnPart}_${idPart}`; // นามสกุลไฟล์จะถูกจัดการโดย MIME Type อัตโนมัติ หรือ Google Drive จัดการเอง

        var blob = Utilities.newBlob(decoded, img.mime, fileName);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        urls.push(file.getUrl());
      } catch (err) {
        console.error("Upload Error: " + err.message);
      }
    } else if (img.url) { // กรณีเป็นรูปเดิม (URL)
      urls.push(img.url);
    }
  });

  return urls.join(",");
}

function saveData(data) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { status: "error", message: "Server busy" }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('Data');
    if (!sheet) sheet = ss.insertSheet('Data');
    
    if (sheet.getLastRow() === 0) {
      const headers = ["Timestamp", "Date", "HN", "ME_Type", "Details", "Severity", "Reporter", "Image Evidence"];
      sheet.appendRow(headers);
    }

    const nextRow = sheet.getLastRow() + 1;
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    
    // ✅ ส่ง incidentDate ไปด้วยเพื่อใช้ตั้งชื่อไฟล์
    let imageUrls = processImageArray(data.images, data.hn, data.incidentDate);

    sheet.getRange(nextRow, COL_TIMESTAMP).setValue(timestamp);
    sheet.getRange(nextRow, COL_DATE).setValue(data.incidentDate);
    sheet.getRange(nextRow, COL_HN).setValue(data.hn);
    sheet.getRange(nextRow, COL_METYPE).setValue(data.meType);
    sheet.getRange(nextRow, COL_DETAILS).setValue(data.meDetails || "-");
    sheet.getRange(nextRow, COL_SEVERITY).setValue(data.severity || "-");
    sheet.getRange(nextRow, COL_REPORTER).setValue(data.reporter || "-");
    sheet.getRange(nextRow, COL_IMAGE).setValue(imageUrls);

    SpreadsheetApp.flush();
    try { sendTelegram(data.incidentDate, data.hn, data.meType, data.meDetails, data.severity, data.reporter, imageUrls); } catch (e) {}

    return { status: "success" };
  } catch (error) { return { status: "error", message: error.toString() }; } finally { lock.releaseLock(); }
}

function updateData(data) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { status: "error", message: "Server busy" }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('Data');
    const rowId = parseInt(data.rowId);

    // ✅ ส่ง incidentDate ไปด้วยเพื่อใช้ตั้งชื่อไฟล์ (กรณีอัปรูปเพิ่มตอนแก้ไข)
    let imageUrls = processImageArray(data.images, data.hn, data.incidentDate);

    sheet.getRange(rowId, COL_DATE).setValue(data.incidentDate);
    sheet.getRange(rowId, COL_HN).setValue(data.hn);
    sheet.getRange(rowId, COL_METYPE).setValue(data.meType);
    sheet.getRange(rowId, COL_DETAILS).setValue(data.meDetails || "-");
    sheet.getRange(rowId, COL_SEVERITY).setValue(data.severity || "-");
    sheet.getRange(rowId, COL_REPORTER).setValue(data.reporter || "-");
    sheet.getRange(rowId, COL_IMAGE).setValue(imageUrls);

    SpreadsheetApp.flush();
    // ไม่ส่ง Telegram ตอนแก้ไข (ตามที่คุณขอไว้)

    return { status: "success" };
  } catch (error) { return { status: "error", message: error.toString() }; } finally { lock.releaseLock(); }
}

function deleteData(data) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { status: "error", message: "Server busy" }; }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('Data');
    const rowId = parseInt(data.rowId);
    sheet.deleteRow(rowId);
    return { status: "success" };
  } catch (error) { return { status: "error", message: error.toString() }; } finally { lock.releaseLock(); }
}

function formatThaiDate(dateString) {
  if (!dateString) return "-";
  var parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  var year = parseInt(parts[0]) + 543;
  var monthIndex = parseInt(parts[1]) - 1;
  var day = parseInt(parts[2]);
  var months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return day + " " + months[monthIndex] + " " + year;
}

function escapeHtml(text) {
  if (!text) return "-";
  return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sendTelegram(date, hn, meType, details, severity, reporter, imageUrls) {
  if (!CHAT_ID || !TELEGRAM_TOKEN) return;
  var thaiDate = formatThaiDate(date);
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  
  let imageText = "";
  if (imageUrls && imageUrls !== "-" && imageUrls.trim() !== "") {
    let count = imageUrls.split(',').length;
    let firstImg = imageUrls.split(',')[0];
    imageText = `\n📸 <b>หลักฐาน:</b> <a href="${firstImg}">ดูรูปภาพ (${count} รูป)</a>`;
  }

  const text = `🚨 <b>รายงานอุบัติการณ์ (Med Error)</b>
➖➖➖➖➖➖➖➖➖➖
📅 <b>วันที่:</b> ${thaiDate}
🏥 <b>HN/AN:</b> ${escapeHtml(hn)}
⚠️ <b>ประเภท:</b> ${escapeHtml(meType)}
📝 <b>รายละเอียด:</b> ${escapeHtml(details)}
🔴 <b>ความรุนแรง:</b> ${escapeHtml(severity)}
👤 <b>ผู้รายงาน:</b> ${escapeHtml(reporter)}${imageText}`;
  
  try {
    UrlFetchApp.fetch(url, { 
      method: "post", 
      contentType: "application/json", 
      muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: "HTML", disable_web_page_preview: false }) 
    });
  } catch(e) {}
}

function getDashboardData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Data');
  if (!sheet || sheet.getLastRow() <= 1) return { typeCounts: {}, severityCounts: {}, total: 0 };
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
  
  const data = values.map((row, index) => ({
    rowId: index + 2, 
    timestamp: row[0],
    date: row[1],
    hn: row[2],
    meType: row[3],
    details: row[4],
    severity: row[5],
    reporter: row[6] || "-",
    imageUrl: row[7] || "-" 
  })).reverse();
  
  return { data: data };
}

function doAuth() {
  DriveApp.getFiles(); 
  SpreadsheetApp.openById(SHEET_ID);
  UrlFetchApp.fetch("https://google.com"); 
}
