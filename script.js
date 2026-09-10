/**
 * LE PETIT LEVAIN - VANILLA JAVASCRIPT CONTROLLER (script.js)
 *
 * Modul Fitur:
 * 1. Sanitasi & Keamanan (Anti-XSS, Safe HTTPS URLs, Normalisasi Nomor WA)
 * 2. Pemesanan Cepat WhatsApp (Auto Format, Popup Blocker Fallback)
 * 3. Sistem CRUD Produk Dinamis & Sinkronisasi Google Sheets Apps Script
 * 4. Perlindungan Anti-Brute Force Admin Lockout
 */

// ==========================================
// 1. CYBERSECURITY & DEFENSE UTILITIES
// ==========================================

/**
 * Sanitasi string untuk mencegah Cross-Site Scripting (XSS)
 */
function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Normalisasi format nomor WhatsApp ke kode negara internasional (628...)
 * Mencegah WhatsApp API menolak nomor lokal 08...
 */
function normalizeWhatsAppNumber(phone) {
  if (!phone) return "6285393865990";
  let cleaned = phone.toString().replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

/**
 * Memastikan URL multimedia hanya memakai protokol HTTP/HTTPS
 * Mencegah skrip jahat (javascript:, data:base64, file:, etc.)
 */
function validateSafeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return "";
  } catch (e) {
    return "";
  }
}

/**
 * Format angka mata uang Rupiah (IDR)
 */
function formatIDR(number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(number);
}

// ==========================================
// 2. STATE & DEFAULT SEED DATA
// ==========================================

const DEFAULT_PRODUCTS = [];

const state = {
  products: [], // Mulai dengan array kosong,
  activeCategory: "Semua",
  storeWhatsApp: "6285393865990",
  gasEndpoint:
    "https://script.google.com/macros/s/AKfycbxUOxjloxYX-Yfs75yAB6YQ8kiOnUex6e3RqbYYTuFaU5fR0l0LuMoYS_8wdFnAEPuoeA/exec",
  isAdminAuthenticated: false,
  adminPinHash: "laveite123@",
  failedLoginAttempts: 0,
  isLockedOut: false,
  selectedProductForCheckout: null,
  confirmCallback: null,
};

// ==========================================
// 3. UI NOTIFICATION & CONFIRMATION
// ==========================================

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  const bgClass =
    type === "success"
      ? "bg-emerald-700 text-white"
      : type === "error"
        ? "bg-rose-700 text-white"
        : "bg-stone-800 text-stone-100";
  toast.className = `${bgClass} px-4 py-3 rounded-2xl shadow-xl text-xs font-medium flex items-center gap-2 transition-all duration-300 toast-enter pointer-events-auto max-w-xs`;
  toast.innerHTML = `<span>${sanitizeText(message)}</span>`;

  const container = document.getElementById("toastContainer");
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-x-4");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openCustomConfirm(title, message, onConfirm) {
  document.getElementById("confirmModalTitle").textContent = title;
  document.getElementById("confirmModalMessage").textContent = message;
  state.confirmCallback = onConfirm;
  document.getElementById("confirmModal").classList.remove("hidden");
}

document.getElementById("btnConfirmYes").addEventListener("click", () => {
  if (state.confirmCallback) state.confirmCallback();
  document.getElementById("confirmModal").classList.add("hidden");
  state.confirmCallback = null;
});

document.getElementById("btnConfirmNo").addEventListener("click", () => {
  document.getElementById("confirmModal").classList.add("hidden");
  state.confirmCallback = null;
});

// ==========================================
// 4. CATALOGUE RENDERING & FILTERING
// ==========================================

function renderCategoryButtons() {
  const container = document.getElementById("categoryFilterContainer");
  const categories = [
    "Semua",
    "Sourdough",
    "Viennoiserie",
    "Patisserie",
    "Hampers",
  ];

  container.innerHTML = categories
    .map((cat) => {
      const isActive = state.activeCategory === cat;
      const cls = isActive
        ? "bg-bakery-800 text-white shadow-sm"
        : "bg-white text-stone-600 border border-stone-300 hover:bg-stone-100";
      return `<button class="category-filter-btn px-4 py-1.5 rounded-full text-xs font-semibold transition ${cls}" data-category="${cat}">
            ${cat}
        </button>`;
    })
    .join("");

  container.querySelectorAll(".category-filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      state.activeCategory = e.currentTarget.getAttribute("data-category");
      renderCategoryButtons();
      renderProductCatalog();
    });
  });
}

function renderProductCatalog() {
  const grid = document.getElementById("productGrid");
  const emptyState = document.getElementById("emptyCatalogState");

  const filtered = state.products.filter((p) => {
    if (state.activeCategory === "Semua") return true;
    return p.category.toLowerCase() === state.activeCategory.toLowerCase();
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  grid.innerHTML = filtered
    .map((item) => {
      const hasVideo = Boolean(item.video && item.video.trim() !== "");
      const safeImg =
        validateSafeUrl(item.image) ||
        "https://placehold.co/600x450/B8823B/FFFFFF?text=Fresh+Bake";
      const safeTitle = sanitizeText(item.title);
      const safeDesc = sanitizeText(item.description);
      const safeBadge = sanitizeText(item.badge || "Fresh");

      return `
        <div class="product-card bg-white rounded-3xl overflow-hidden border border-bakery-200/90 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group">
            <div class="relative aspect-4/3 overflow-hidden bg-stone-100">
                <img src="${safeImg}" alt="${safeTitle}" 
                     class="product-card-img w-full h-full object-cover"
                     onerror="this.src='https://placehold.co/600x450/B8823B/FFFFFF?text=Artisan+Bread'">
                
                <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span class="px-2.5 py-1 rounded-full bg-stone-900/80 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-wider">
                        ${safeBadge}
                    </span>
                    ${
                      hasVideo
                        ? `
                    <button class="btn-play-video px-2.5 py-1 rounded-full bg-bakery-600/90 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1 hover:bg-bakery-700 transition" data-id="${item.id}">
                        <i data-lucide="play" class="w-3 h-3 fill-current"></i> Video
                    </button>`
                        : ""
                    }
                </div>

                <div class="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-stone-800 text-[11px] font-bold shadow-sm flex items-center gap-1">
                    <i data-lucide="flame" class="w-3.5 h-3.5 text-amber-500"></i>
                    <span>Terjual ${Number(item.sold) || 0}</span>
                </div>
            </div>

            <div class="p-6 flex-1 flex flex-col justify-between">
                <div>
                    <span class="text-[11px] uppercase tracking-wider text-bakery-600 font-bold">${sanitizeText(item.category)}</span>
                    <h3 class="font-serif text-xl font-bold text-stone-900 mt-1 mb-2 group-hover:text-bakery-700 transition">${safeTitle}</h3>
                    <p class="text-xs text-stone-500 line-clamp-2 leading-relaxed">${safeDesc}</p>
                </div>

                <div class="pt-5 mt-4 border-t border-stone-100 flex items-center justify-between">
                    <div>
                        <span class="text-[10px] text-stone-400 block uppercase font-semibold">Harga Satuan</span>
                        <span class="font-serif font-bold text-lg text-bakery-900">${formatIDR(item.price)}</span>
                    </div>

                    <button class="btn-direct-buy px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5" data-id="${item.id}">
                        <i data-lucide="message-circle" class="w-4 h-4"></i>
                        <span>Beli via WA</span>
                    </button>
                </div>
            </div>
        </div>`;
    })
    .join("");

  document.querySelectorAll(".btn-direct-buy").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      openCheckoutModal(id);
    });
  });

  document.querySelectorAll(".btn-play-video").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      openMediaModal(id);
    });
  });

  updateStatsCounter();
  if (window.lucide) lucide.createIcons();
}

function updateStatsCounter() {
  const total = state.products.reduce(
    (acc, curr) => acc + (Number(curr.sold) || 0),
    0,
  );
  const counterEl = document.getElementById("totalSoldCounter");
  if (counterEl) {
    counterEl.textContent = `${total.toLocaleString("id-ID")}+`;
  }
}

// ==========================================
// 5. WHATSAPP CHECKOUT LOGIC
// ==========================================

function openCheckoutModal(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  state.selectedProductForCheckout = product;
  document.getElementById("orderProductId").value = product.id;
  document.getElementById("orderQty").value = 1;
  document.getElementById("waFallbackContainer").classList.add("hidden");

  const previewContainer = document.getElementById("checkoutProductPreview");
  const safeImg =
    validateSafeUrl(product.image) ||
    "https://placehold.co/100x100/B8823B/FFFFFF?text=Bake";

  previewContainer.innerHTML = `
        <img src="${safeImg}" alt="${sanitizeText(product.title)}" class="w-16 h-16 rounded-xl object-cover border border-bakery-200">
        <div>
            <h4 class="font-serif font-bold text-stone-900 text-sm">${sanitizeText(product.title)}</h4>
            <p class="text-xs text-bakery-700 font-semibold">${formatIDR(product.price)} / pcs</p>
            <p class="text-[11px] text-stone-400">Total Terjual: ${product.sold} pcs</p>
        </div>
    `;

  updateCheckoutPrice();
  document.getElementById("checkoutModal").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function updateCheckoutPrice() {
  if (!state.selectedProductForCheckout) return;
  const qty = parseInt(document.getElementById("orderQty").value, 10) || 1;
  const total = state.selectedProductForCheckout.price * qty;
  document.getElementById("checkoutTotalPrice").textContent = formatIDR(total);
}

document.getElementById("btnQtyPlus").addEventListener("click", () => {
  const input = document.getElementById("orderQty");
  let val = parseInt(input.value, 10) || 1;
  if (val < 50) {
    input.value = val + 1;
    updateCheckoutPrice();
  }
});

document.getElementById("btnQtyMinus").addEventListener("click", () => {
  const input = document.getElementById("orderQty");
  let val = parseInt(input.value, 10) || 1;
  if (val > 1) {
    input.value = val - 1;
    updateCheckoutPrice();
  }
});

document
  .getElementById("btnCloseCheckoutModal")
  .addEventListener("click", () => {
    document.getElementById("checkoutModal").classList.add("hidden");
    state.selectedProductForCheckout = null;
  });

// document.getElementById("orderForm").addEventListener("submit", (e) => {
//   e.preventDefault();
//   const product = state.selectedProductForCheckout;
//   if (!product) return;

//   const name = document.getElementById("orderBuyerName").value.trim();
//   const phone = document.getElementById("orderBuyerPhone").value.trim();
//   const method = document.getElementById("orderDeliveryMethod").value;
//   const address = document.getElementById("orderAddress").value.trim();
//   const qty = parseInt(document.getElementById("orderQty").value, 10) || 1;
//   const totalPrice = formatIDR(product.price * qty);

//   const message = `*PESANAN BARU - LE PETIT LEVAIN BAKERY* 🥐
// --------------------------------------------
// *Detail Produk:*
// • Nama Roti: ${product.title}
// • Jumlah: ${qty} pcs
// • Subtotal: ${totalPrice}

// *Data Pembeli:*
// • Nama: ${name}
// • No. WhatsApp: ${phone}
// • Metode Pengambilan: ${method}
// • Alamat / Catatan: ${address || "-"}
// --------------------------------------------
// _Pesanan dibuat otomatis via Landing Page Resmi Le Petit Levain._`;

//   // Increment local counter
//   product.sold = (Number(product.sold) || 0) + qty;
//   renderProductCatalog();

//   // Sync to Google Sheets if connected
//   if (state.gasEndpoint) {
//     syncWithGasBackend("INCREMENT_SOLD", { id: product.id, qty: qty });
//   }

//   const targetWaNumber = normalizeWhatsAppNumber(state.storeWhatsApp);
//   const encodedMsg = encodeURIComponent(message);
//   const waUrl = `https://wa.me/${targetWaNumber}?text=${encodedMsg}`;

//   // Emulate user click on virtual link to bypass popup blocker
//   const virtualLink = document.createElement("a");
//   virtualLink.href = waUrl;
//   virtualLink.target = "_blank";
//   virtualLink.rel = "noopener noreferrer";
//   document.body.appendChild(virtualLink);
//   virtualLink.click();
//   document.body.removeChild(virtualLink);

//   // Fallback UI in case browser completely halts pop-up
//   const fallbackContainer = document.getElementById("waFallbackContainer");
//   const directWaFallback = document.getElementById("btnDirectWaFallback");
//   directWaFallback.href = waUrl;
//   fallbackContainer.classList.remove("hidden");

//   showToast("Membuka WhatsApp Toko...", "success");
// });

// ==========================================
// 6. MULTIMEDIA MODAL CONTROLLER
// ==========================================

// Pengubahan dengan
// Tangani event submit form pesanan
document.getElementById("orderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const product = state.selectedProductForCheckout;
  if (!product) return;

  const name = document.getElementById("orderBuyerName").value.trim();
  const phone = document.getElementById("orderBuyerPhone").value.trim();
  const method = document.getElementById("orderDeliveryMethod").value;
  const address = document.getElementById("orderAddress").value.trim();
  const qty = parseInt(document.getElementById("orderQty").value, 10) || 1;
  const totalPrice = formatIDR(product.price * qty);

  // 1. Tambah data terjual secara lokal di antarmuka web
  product.sold = (Number(product.sold) || 0) + qty;
  renderProductCatalog();
  if (state.isAdminAuthenticated) {
    renderAdminProductsTable();
  }

  // 2. Kirim update penambahan jumlah terjual ke database Google Sheets
  if (state.gasEndpoint) {
    syncWithGasBackend("INCREMENT_SOLD", {
      id: product.id,
      qty: qty,
    });
  }

  // 3. Format dan buka link WhatsApp
  const message =
    `*PESANAN BARU - CHIKAWA BAKERY* 🥐\n` +
    `--------------------------------------------\n` +
    `*Detail Produk:*\n` +
    `• Nama Roti: ${product.title}\n` +
    `• Jumlah: ${qty} pcs\n` +
    `• Subtotal: ${totalPrice}\n\n` +
    `*Data Pembeli:*\n` +
    `• Nama: ${name}\n` +
    `• No. WhatsApp: ${phone}\n` +
    `• Metode Pengambilan: ${method}\n` +
    `• Alamat / Catatan: ${address || "-"}\n` +
    `--------------------------------------------`;

  const targetWaNumber = normalizeWhatsAppNumber(state.storeWhatsApp);
  const waUrl = `https://wa.me/${targetWaNumber}?text=${encodeURIComponent(message)}`;

  // Buka WhatsApp
  const virtualLink = document.createElement("a");
  virtualLink.href = waUrl;
  virtualLink.target = "_blank";
  virtualLink.rel = "noopener noreferrer";
  document.body.appendChild(virtualLink);
  virtualLink.click();
  document.body.removeChild(virtualLink);

  // Tutup modal checkout
  document.getElementById("checkoutModal").classList.add("hidden");
  showToast(
    "Pesanan diteruskan ke WhatsApp & data tersinkronisasi!",
    "success",
  );
});

// Batas Pengubahan

function openMediaModal(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const modal = document.getElementById("mediaModal");
  const content = document.getElementById("mediaModalContent");
  document.getElementById("mediaModalTitle").textContent = product.title;
  document.getElementById("mediaModalDesc").textContent = product.description;

  const safeVideo = validateSafeUrl(product.video);
  if (safeVideo && safeVideo.endsWith(".mp4")) {
    document.getElementById("mediaModalType").textContent = "MP4 Video";
    content.innerHTML = `
            <video controls autoplay loop class="max-h-[70vh] w-full object-contain">
                <source src="${safeVideo}" type="video/mp4">
            </video>`;
  } else if (safeVideo && safeVideo.includes("youtube.com")) {
    document.getElementById("mediaModalType").textContent = "YouTube";
    content.innerHTML = `<iframe src="${safeVideo}" class="w-full h-96" frameborder="0" allowfullscreen></iframe>`;
  } else {
    document.getElementById("mediaModalType").textContent = "High-Res Photo";
    const safeImg = validateSafeUrl(product.image);
    content.innerHTML = `<img src="${safeImg}" alt="${sanitizeText(product.title)}" class="max-h-[70vh] w-full object-contain">`;
  }

  modal.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

document.getElementById("btnCloseMediaModal").addEventListener("click", () => {
  document.getElementById("mediaModal").classList.add("hidden");
  document.getElementById("mediaModalContent").innerHTML = "";
});

// ==========================================
// 7. ADMIN DASHBOARD & SECURITY LOCKOUT
// ==========================================

const btnOpenAdmin = document.getElementById("btnOpenAdmin");
const adminModal = document.getElementById("adminModal");
const adminAuthSection = document.getElementById("adminAuthSection");
const adminMainView = document.getElementById("adminMainView");
const adminPinForm = document.getElementById("adminPinForm");
const adminPinInput = document.getElementById("adminPinInput");
const attemptsLeftEl = document.getElementById("attemptsLeft");
const lockoutAlert = document.getElementById("lockoutAlert");
const lockoutTimerEl = document.getElementById("lockoutTimer");

btnOpenAdmin.addEventListener("click", () => {
  adminModal.classList.remove("hidden");
  if (state.isAdminAuthenticated) {
    adminAuthSection.classList.add("hidden");
    adminMainView.classList.remove("hidden");
    renderAdminProductsTable();
  } else {
    adminAuthSection.classList.remove("hidden");
    adminMainView.classList.add("hidden");
    adminPinInput.value = "";
    adminPinInput.focus();
  }
  if (window.lucide) lucide.createIcons();
});

document.getElementById("btnCloseAdminModal").addEventListener("click", () => {
  adminModal.classList.add("hidden");
});

adminPinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.isLockedOut) {
    showToast("Akses terkunci! Mohon tunggu timer selesai.", "error");
    return;
  }

  const enteredPin = adminPinInput.value.trim();
  if (enteredPin === state.adminPinHash) {
    state.isAdminAuthenticated = true;
    state.failedLoginAttempts = 0;
    adminAuthSection.classList.add("hidden");
    adminMainView.classList.remove("hidden");
    showToast("Login Administrator Berhasil!", "success");
    renderAdminProductsTable();
  } else {
    state.failedLoginAttempts++;
    const remaining = 5 - state.failedLoginAttempts;
    if (remaining <= 0) {
      state.isLockedOut = true;
      lockoutAlert.classList.remove("hidden");
      let timeLeft = 30;
      lockoutTimerEl.textContent = timeLeft;
      const interval = setInterval(() => {
        timeLeft--;
        lockoutTimerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(interval);
          state.isLockedOut = false;
          state.failedLoginAttempts = 0;
          attemptsLeftEl.textContent = "5";
          lockoutAlert.classList.add("hidden");
          showToast("Kunci keamanan terbuka. Silakan coba kembali.", "info");
        }
      }, 1000);
    } else {
      attemptsLeftEl.textContent = remaining;
      showToast(`PIN salah! Sisa kesempatan: ${remaining}`, "error");
    }
  }
});

// Admin Tabs Controller
const tabBtnProducts = document.getElementById("tabBtnProducts");
const tabBtnSettings = document.getElementById("tabBtnSettings");
const tabContentProducts = document.getElementById("tabContentProducts");
const tabContentSettings = document.getElementById("tabContentSettings");

function switchAdminTab(activeTab) {
  [tabBtnProducts, tabBtnSettings].forEach((btn) => {
    btn.className =
      "pb-2 border-b-2 border-transparent text-stone-500 hover:text-stone-800";
  });
  [tabContentProducts, tabContentSettings].forEach((c) =>
    c.classList.add("hidden"),
  );

  if (activeTab === "products") {
    tabBtnProducts.className =
      "pb-2 border-b-2 border-bakery-700 text-bakery-800 font-bold";
    tabContentProducts.classList.remove("hidden");
  } else if (activeTab === "settings") {
    tabBtnSettings.className =
      "pb-2 border-b-2 border-bakery-700 text-bakery-800 font-bold";
    tabContentSettings.classList.remove("hidden");
  }
  if (window.lucide) lucide.createIcons();
}

tabBtnProducts.addEventListener("click", () => switchAdminTab("products"));
tabBtnSettings.addEventListener("click", () => switchAdminTab("settings"));

// Settings Handlers
document.getElementById("settingWaNumber").value = state.storeWhatsApp;
document.getElementById("settingGasUrl").value = state.gasEndpoint;

document.getElementById("btnSaveGasConfig").addEventListener("click", () => {
  const rawWa = document.getElementById("settingWaNumber").value.trim();
  const cleanWa = normalizeWhatsAppNumber(rawWa);
  const rawGas = document.getElementById("settingGasUrl").value.trim();

  if (cleanWa) {
    state.storeWhatsApp = cleanWa;
    document.getElementById("settingWaNumber").value = cleanWa;
  }
  state.gasEndpoint = validateSafeUrl(rawGas);
  showToast("Konfigurasi berhasil disimpan!", "success");
});

document
  .getElementById("btnSyncFromGas")
  .addEventListener("click", async () => {
    const url = state.gasEndpoint;
    const statusEl = document.getElementById("gasSyncStatus");
    if (!url) {
      showToast("Masukkan URL Apps Script terlebih dahulu!", "error");
      return;
    }

    statusEl.innerHTML = `<span class="text-bakery-600 animate-pulse">Menghubungi Google Sheets Cloud...</span>`;

    try {
      const res = await fetch(url);
      const json = await res.json();
      if (
        json.status === "success" &&
        Array.isArray(json.data) &&
        json.data.length > 0
      ) {
        state.products = json.data.map((p) => ({
          id: String(p.id),
          title: sanitizeText(p.title),
          category: sanitizeText(p.category),
          price: Number(p.price) || 0,
          description: sanitizeText(p.description),
          image: validateSafeUrl(p.image),
          video: validateSafeUrl(p.video),
          sold: Number(p.sold) || 0,
          badge: sanitizeText(p.badge || "Ready Fresh"),
        }));
        renderProductCatalog();
        renderAdminProductsTable();
        statusEl.innerHTML = `<span class="text-emerald-600 font-semibold">Tersinkronisasi ${state.products.length} produk dari Google Sheets!</span>`;
        showToast("Sinkronisasi data Google Sheets berhasil!", "success");
      } else {
        statusEl.innerHTML = `<span class="text-amber-600 font-semibold">Terkoneksi, namun Sheet masih kosong.</span>`;
      }
    } catch (err) {
      statusEl.innerHTML = `<span class="text-rose-600 font-semibold">Gagal koneksi: ${sanitizeText(err.message)}</span>`;
      showToast("Gagal menghubungi Web App Google Apps Script.", "error");
    }
  });

// ==========================================
// 8. CRUD PRODUCTS CONTROLLER
// ==========================================

function renderAdminProductsTable() {
  const tbody = document.getElementById("adminProductsTableBody");
  document.getElementById("adminProductCount").textContent =
    state.products.length;

  tbody.innerHTML = state.products
    .map((item) => {
      const safeImg =
        validateSafeUrl(item.image) ||
        "https://placehold.co/80x80/B8823B/FFFFFF?text=Bread";
      return `
        <tr class="hover:bg-stone-50 transition">
            <td class="p-3"><img src="${safeImg}" alt="${sanitizeText(item.title)}" class="w-10 h-10 rounded-lg object-cover border border-stone-200"></td>
            <td class="p-3 font-semibold text-stone-800">${sanitizeText(item.title)}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px] font-semibold">${sanitizeText(item.category)}</span></td>
            <td class="p-3 font-mono font-medium">${formatIDR(item.price)}</td>
            <td class="p-3 font-bold text-amber-600">${item.sold} pcs</td>
            <td class="p-3 text-right space-x-1">
                <button class="btn-edit-prod p-1.5 rounded-lg bg-stone-100 hover:bg-bakery-100 text-stone-700 hover:text-bakery-800 transition" data-id="${item.id}" title="Ubah Produk">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn-delete-prod p-1.5 rounded-lg bg-stone-100 hover:bg-rose-100 text-stone-700 hover:text-rose-700 transition" data-id="${item.id}" title="Hapus Produk">
                    <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                </button>
            </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".btn-edit-prod").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      openEditProductForm(id);
    });
  });

  tbody.querySelectorAll(".btn-delete-prod").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      deleteProduct(id);
    });
  });

  if (window.lucide) lucide.createIcons();
}

const productFormModal = document.getElementById("productFormModal");
const crudProductForm = document.getElementById("crudProductForm");
const btnOpenAddProduct = document.getElementById("btnOpenAddProduct");
const btnCloseProductForm = document.getElementById("btnCloseProductForm");
const btnCancelCrud = document.getElementById("btnCancelCrud");

btnOpenAddProduct.addEventListener("click", () => {
  document.getElementById("productFormTitle").textContent =
    "Tambah Produk Baru";
  document.getElementById("crudProductId").value = "";
  crudProductForm.reset();
  document.getElementById("crudSold").value = 0;
  productFormModal.classList.remove("hidden");
});

function openEditProductForm(id) {
  const item = state.products.find((p) => p.id === id);
  if (!item) return;

  document.getElementById("productFormTitle").textContent = "Ubah Produk";
  document.getElementById("crudProductId").value = item.id;
  document.getElementById("crudTitle").value = item.title;
  document.getElementById("crudCategory").value = item.category;
  document.getElementById("crudPrice").value = item.price;
  document.getElementById("crudDescription").value = item.description;
  document.getElementById("crudImage").value = item.image;
  document.getElementById("crudVideo").value = item.video || "";
  document.getElementById("crudSold").value = item.sold || 0;
  document.getElementById("crudBadge").value = item.badge || "Ready Fresh";

  productFormModal.classList.remove("hidden");
}

btnCloseProductForm.addEventListener("click", () =>
  productFormModal.classList.add("hidden"),
);
btnCancelCrud.addEventListener("click", () =>
  productFormModal.classList.add("hidden"),
);

crudProductForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const existingId = document.getElementById("crudProductId").value;
  const title = sanitizeText(document.getElementById("crudTitle").value.trim());
  const category = document.getElementById("crudCategory").value;
  const price = parseFloat(document.getElementById("crudPrice").value) || 0;
  const description = sanitizeText(
    document.getElementById("crudDescription").value.trim(),
  );
  const rawImage = document.getElementById("crudImage").value.trim();
  const rawVideo = document.getElementById("crudVideo").value.trim();
  const sold = parseInt(document.getElementById("crudSold").value, 10) || 0;
  const badge = document.getElementById("crudBadge").value;

  const safeImage = validateSafeUrl(rawImage);
  if (!safeImage) {
    showToast("URL Gambar harus diawali https://", "error");
    return;
  }
  const safeVideo = rawVideo ? validateSafeUrl(rawVideo) : "";

  if (existingId) {
    const index = state.products.findIndex((p) => p.id === existingId);
    if (index !== -1) {
      const updated = {
        id: existingId,
        title,
        category,
        price,
        description,
        image: safeImage,
        video: safeVideo,
        sold,
        badge,
      };
      state.products[index] = updated;
      if (state.gasEndpoint) syncWithGasBackend("UPDATE", updated);
      showToast("Produk berhasil diperbarui!", "success");
    }
  } else {
    const newProduct = {
      id: "prod-" + Date.now(),
      title,
      category,
      price,
      description,
      image: safeImage,
      video: safeVideo,
      sold,
      badge,
    };
    state.products.unshift(newProduct);
    if (state.gasEndpoint) syncWithGasBackend("CREATE", newProduct);
    showToast("Produk berhasil ditambahkan!", "success");
  }

  productFormModal.classList.add("hidden");
  renderProductCatalog();
  renderAdminProductsTable();
});

function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;

  openCustomConfirm(
    "Hapus Produk?",
    `Apakah Anda yakin ingin menghapus "${product.title}"?`,
    () => {
      state.products = state.products.filter((p) => p.id !== id);
      if (state.gasEndpoint) syncWithGasBackend("DELETE", { id });
      renderProductCatalog();
      renderAdminProductsTable();
      showToast("Produk telah dihapus.", "info");
    },
  );
}

// async function syncWithGasBackend(action, itemData) {
//   if (!state.gasEndpoint) return;
//   try {
//     await fetch(state.gasEndpoint, {
//       method: "POST",
//       mode: "no-cors",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ action: action, data: itemData }),
//     });
//   } catch (err) {
//     console.warn("Sync notice:", err);
//   }
// }

// ==========================================
// Ganti ini untuk total penjual otomatis ke Google Sheets via Apps Script
// Pastikan fungsi syncWithGasBackend mengirim payload JSON yang benar
async function syncWithGasBackend(action, itemData) {
  if (!state.gasEndpoint) return;
  try {
    await fetch(state.gasEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, data: itemData }),
    });
  } catch (err) {
    console.warn("Gagal sinkronisasi data ke Google Sheets:", err);
  }
}

// Initial Boot
window.addEventListener("DOMContentLoaded", () => {
  renderCategoryButtons();
  // Langsung panggil data dari Google Sheet saat halaman dibuka
  fetchProductsFromGas();
  if (window.lucide) lucide.createIcons();
});

// ===============================================
// 9. FUNGSI OTOMATIS PERBAHARUAN TAMPILAN KATALOG
// ===============================================
async function fetchProductsFromGas() {
  if (!state.gasEndpoint) return;

  const grid = document.getElementById("productGrid");
  const emptyState = document.getElementById("emptyCatalogState");

  // Tampilkan indikator loading awal
  if (grid && state.products.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="inline-block w-8 h-8 border-4 border-bakery-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-sm font-medium text-stone-500">Memuat katalog langsung dari Google Sheets...</p>
      </div>
    `;
    if (emptyState) emptyState.classList.add("hidden");
  }

  try {
    const res = await fetch(state.gasEndpoint);
    if (!res.ok) throw new Error("Gagal mengambil respon dari Google Sheets");

    const json = await res.json();
    const rawData = Array.isArray(json) ? json : json.data || [];

    if (rawData.length > 0) {
      state.products = rawData.map((p) => ({
        id: String(p.id),
        title: sanitizeText(p.title),
        category: sanitizeText(p.category),
        price: Number(p.price) || 0,
        description: sanitizeText(p.description || p.desc),
        image: validateSafeUrl(p.image || p.media),
        video: validateSafeUrl(p.video || ""),
        sold: Number(p.sold) || 0,
        badge: sanitizeText(p.badge || "Ready Fresh"),
      }));

      // Render katalog dan perbarui filter kategori dinamis
      renderCategoryButtons();
      renderProductCatalog();
      if (state.isAdminAuthenticated) {
        renderAdminProductsTable();
      }
    } else {
      state.products = [];
      renderProductCatalog();
    }
  } catch (err) {
    console.error("Koneksi Google Sheets gagal:", err);
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12 text-rose-600 text-sm">
          Gagal memuat produk dari Google Sheets. Pastikan izin Web App disetel ke "Anyone".
        </div>
      `;
    }
  }
}

// Registrasi Service Worker PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("PWA Service Worker terpasang:", reg.scope))
      .catch((err) => console.warn("PWA Service Worker gagal:", err));
  });
}
