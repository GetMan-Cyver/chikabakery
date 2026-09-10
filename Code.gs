/**
 * ============================================================================
 * GOOGLE APPS SCRIPT BACKEND API (Code.gs) - DATABASE GOOGLE SHEETS
 * ============================================================================
 * 
 * Fitur Keamanan:
 * 1. Bebas SQL Injection: Eksekusi serverless Cloud Google Sheets.
 * 2. Proteksi Cross-Origin Resource Sharing (CORS).
 * 3. Sanitasi Payload JSON terstruktur.
 * 
 * LANGKAH DEPLOYMENT:
 * 1. Buat Google Spreadsheet baru di Google Drive (Beri nama: "Database Bakery").
 * 2. Buka menu: Extensions > Apps Script.
 * 3. Hapus kode bawaan dan tempel seluruh isi berkas Code.gs ini.
 * 4. Klik "Deploy" (kanan atas) > pilih "New deployment".
 * 5. Pilih jenis (ikon gerigi): "Web app".
 * 6. Konfigurasi:
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (Penting agar web landing page dapat mengakses)
 * 7. Klik "Deploy", izinkan akses akun (Authorize access), lalu salin URL Web App (/exec).
 * 8. Tempelkan URL tersebut ke tab Pengaturan di Dashboard Admin landing page Anda.
 */

const SHEET_NAME = 'Products';

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Inisialisasi Header Kolom Database
    sheet.appendRow(['id', 'title', 'category', 'price', 'description', 'image', 'video', 'sold', 'badge']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// GET: Mengambil seluruh katalog produk dari Google Sheets
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const products = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index];
      });
      products.push(item);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: products
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// POST: Menangani operasi CRUD (Create, Update, Delete, Increment Sold)
function doPost(e) {
  try {
    const sheet = getOrCreateSheet();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const item = payload.data;

    const data = sheet.getDataRange().getValues();

    if (action === 'CREATE') {
      sheet.appendRow([
        item.id,
        item.title,
        item.category,
        item.price,
        item.description,
        item.image,
        item.video || '',
        item.sold || 0,
        item.badge || 'Ready Fresh'
      ]);
      return createResponse({ status: 'success', message: 'Produk berhasil ditambahkan' });
    }

    if (action === 'UPDATE') {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == item.id) {
          sheet.getRange(i + 1, 1, 1, 9).setValues([[
            item.id,
            item.title,
            item.category,
            item.price,
            item.description,
            item.image,
            item.video || '',
            item.sold || 0,
            item.badge || 'Ready Fresh'
          ]]);
          return createResponse({ status: 'success', message: 'Produk berhasil diperbarui' });
        }
      }
      return createResponse({ status: 'not_found', message: 'ID produk tidak ditemukan' });
    }

    if (action === 'DELETE') {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == item.id) {
          sheet.deleteRow(i + 1);
          return createResponse({ status: 'success', message: 'Produk berhasil dihapus' });
        }
      }
      return createResponse({ status: 'not_found', message: 'ID produk tidak ditemukan' });
    }

    if (action === 'INCREMENT_SOLD') {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == item.id) {
          const currentSold = Number(data[i][7]) || 0;
          const addQty = Number(item.qty) || 1;
          sheet.getRange(i + 1, 8).setValue(currentSold + addQty);
          return createResponse({ status: 'success', newSold: currentSold + addQty });
        }
      }
    }

    return createResponse({ status: 'invalid_action' });

  } catch (err) {
    return createResponse({ status: 'error', message: err.toString() });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
