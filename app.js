/**
 * FRONTEND LOGIC - MASTER VERSION
 * Fitur: Caching, Auto-Sanitize Number, Dynamic Filtering, Queue Anti-Ban WA
 */

let CONFIG = {
    GAS_URL: localStorage.getItem('WA_GAS_URL') || '',
    WAHA_URL: localStorage.getItem('WA_WAHA_URL') || ''
};

let globalData = [];
let filteredData = [];

const elRefresh = document.getElementById('btn-refresh');
const elClearCache = document.getElementById('btn-clear-cache');
const elSettings = document.getElementById('btn-settings');
const elFilterWilayah = document.getElementById('filter-wilayah');
const elFilterJabatan = document.getElementById('filter-jabatan');
const elTargetCount = document.getElementById('target-count');
const elBtnSend = document.getElementById('btn-send');
const elPesan = document.getElementById('pesan-text');

const Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
    timerProgressBar: true, background: '#fefefe', color: '#000000'
});

document.addEventListener('DOMContentLoaded', async () => {
    checkConfig();
    await loadData();
    setupEventListeners();
});

function setupEventListeners() {
    elRefresh.addEventListener('click', () => loadData(true));
    
    elClearCache.addEventListener('click', () => {
        Swal.fire({
            title: 'Hapus Cache?', text: "Data lokal dan pengaturan API akan dihapus.", icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#03754c', cancelButtonColor: '#e74c3c', confirmButtonText: 'Ya, Hapus!'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.clear();
                globalData = [];
                updateUI();
                Swal.fire('Terhapus!', 'Cache berhasil dibersihkan. Halaman akan dimuat ulang.', 'success')
                    .then(() => location.reload());
            }
        });
    });

    elSettings.addEventListener('click', openSettings);
    elFilterWilayah.addEventListener('change', applyFilters);
    elFilterJabatan.addEventListener('change', applyFilters);
    elBtnSend.addEventListener('click', confirmBroadcast);
}

async function openSettings() {
    const { value: formValues } = await Swal.fire({
        title: 'Konfigurasi API',
        html:
            `<div style="text-align:left; font-size:14px; margin-bottom:5px;">Google Apps Script URL:</div>`+
            `<input id="swal-gas" class="swal2-input" value="${CONFIG.GAS_URL}" placeholder="https://script.google.com/.../exec">` +
            `<div style="text-align:left; font-size:14px; margin-bottom:5px; margin-top:15px;">WAHA Base URL (Ngrok):</div>`+
            `<input id="swal-waha" class="swal2-input" value="${CONFIG.WAHA_URL}" placeholder="https://xxx.ngrok-free.dev">`,
        focusConfirm: false,
        confirmButtonColor: '#03754c',
        preConfirm: () => {
            let wahaUrl = document.getElementById('swal-waha').value.trim();
            if(wahaUrl.endsWith('/')) wahaUrl = wahaUrl.slice(0, -1); // Auto hapus slash di akhir
            return {
                gas: document.getElementById('swal-gas').value.trim(),
                waha: wahaUrl
            }
        }
    });

    if (formValues) {
        CONFIG.GAS_URL = formValues.gas;
        CONFIG.WAHA_URL = formValues.waha;
        localStorage.setItem('WA_GAS_URL', CONFIG.GAS_URL);
        localStorage.setItem('WA_WAHA_URL', CONFIG.WAHA_URL);
        Toast.fire({ icon: 'success', title: 'Konfigurasi Tersimpan!' });
        if(CONFIG.GAS_URL) loadData(true);
    }
}

function checkConfig() {
    if (!CONFIG.GAS_URL || !CONFIG.WAHA_URL) {
        Swal.fire({
            icon: 'info', title: 'Selamat Datang!',
            text: 'Silakan atur URL Google Apps Script dan WAHA terlebih dahulu.',
            confirmButtonColor: '#FF9c08'
        }).then(openSettings);
    }
}

async function loadData(forceRefresh = false) {
    if (!CONFIG.GAS_URL) return;

    const cachedData = localStorage.getItem('WA_CONTACTS');
    if (cachedData && !forceRefresh) {
        globalData = JSON.parse(cachedData);
        Toast.fire({ icon: 'info', title: 'Memuat dari Cache...' });
        applyFilters();
        return;
    }

    Swal.fire({
        title: 'Mengambil Data...', text: 'Menyinkronkan dengan Google Sheets',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const response = await fetch(CONFIG.GAS_URL);
        const result = await response.json();
        
        if (result.status === 'success') {
            globalData = result.data;
            localStorage.setItem('WA_CONTACTS', JSON.stringify(globalData));
            applyFilters();
            Swal.fire({ icon: 'success', title: 'Sukses!', text: `Berhasil memuat ${globalData.length} kontak.`, confirmButtonColor: '#03754c' });
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Gagal Sinkronisasi', text: error.message });
    }
}

function applyFilters() {
    const wilayah = elFilterWilayah.value;
    const jabatan = elFilterJabatan.value;

    filteredData = globalData.filter(row => {
        let passWilayah = false;
        if (wilayah === 'semua') passWilayah = true;
        else if (wilayah === 'kelurahan' && row.KELURAHAN && row.KELURAHAN.trim() !== '') passWilayah = true;
        else if (wilayah === 'kecamatan' && (!row.KELURAHAN || row.KELURAHAN.trim() === '')) passWilayah = true;
        else passWilayah = true; 

        let passJabatan = false;
        const jab = (row.JABATAN || '').toLowerCase();
        
        if (jabatan === 'semua') {
            passJabatan = true;
        } else if (jabatan === 'inti') {
            const keywords = ['ketua', 'sekretaris', 'bendahara'];
            passJabatan = keywords.some(kw => jab.includes(kw));
        } else if (jabatan === 'ketua_saja') {
            passJabatan = jab.includes('ketua') && !jab.includes('wakil');
        }

        // Pastikan nomor HP ada dan valid
        const validPhone = formatPhoneForWaha(row.NO_HP);
        return passWilayah && passJabatan && validPhone !== null;
    });

    updateUI();
}

function updateUI() {
    elTargetCount.innerText = filteredData.length;
    elTargetCount.style.transform = 'scale(1.3)';
    setTimeout(() => { elTargetCount.style.transform = 'scale(1)'; }, 200);
}

function formatPhoneForWaha(phone) {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, ''); 
    if (p.startsWith('0')) p = '62' + p.substring(1);
    if (p.startsWith('8')) p = '628' + p.substring(1);
    if (!p.startsWith('62') || p.length < 9) return null; 
    return `${p}@c.us`;
}

async function confirmBroadcast() {
    const text = elPesan.value.trim();
    if (!text) {
        Swal.fire({ icon: 'warning', title: 'Pesan Kosong', text: 'Silakan isi pesan broadcast Anda!', confirmButtonColor: '#FF9c08' });
        return;
    }
    if (filteredData.length === 0) {
        Swal.fire({ icon: 'error', title: 'Target Kosong', text: 'Tidak ada target kontak yang sesuai filter.', confirmButtonColor: '#e74c3c' });
        return;
    }

    const result = await Swal.fire({
        title: 'Konfirmasi Broadcast',
        html: `Anda akan mengirim pesan ke <b>${filteredData.length}</b> pengurus.<br><br>Sistem akan mengirim secara bertahap (delay 2-4 detik) untuk mencegah blokir WhatsApp.`,
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#03754c', cancelButtonColor: '#e74c3c',
        confirmButtonText: 'Ya, Mulai Broadcast!'
    });

    if (result.isConfirmed) {
        startBroadcastQueue(text);
    }
}

async function startBroadcastQueue(templateText) {
    const overlay = document.getElementById('progress-overlay');
    const bar = document.getElementById('progress-bar');
    const pText = document.getElementById('progress-text');
    const logger = document.getElementById('log-container');
    
    overlay.classList.remove('hidden');
    logger.innerHTML = '';
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filteredData.length; i++) {
        const contact = filteredData[i];
        const chatId = formatPhoneForWaha(contact.NO_HP);
        const personalizedText = templateText.replace(/{NAMA}/g, contact.NAMA_LENGKAP || 'Saudara/i');

        try {
            const response = await fetch(`${CONFIG.WAHA_URL}/api/sendText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    chatId: chatId,
                    text: personalizedText,
                    session: "default"
                })
            });

            if (response.ok) {
                successCount++;
                logToUI(logger, `✅ Terkirim: ${contact.NAMA_LENGKAP} (${chatId})`, 'log-success');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            failCount++;
            logToUI(logger, `❌ Gagal: ${contact.NAMA_LENGKAP} (${error.message})`, 'log-error');
        }

        const percent = Math.round(((i + 1) / filteredData.length) * 100);
        bar.style.width = percent + '%';
        pText.innerText = `${i + 1} / ${filteredData.length} Diproses`;

        if (i < filteredData.length - 1) {
            const delay = Math.floor(Math.random() * 2000) + 2000;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    setTimeout(() => {
        overlay.classList.add('hidden');
        Swal.fire({
            title: 'Broadcast Selesai!',
            html: `✅ Berhasil: <b>${successCount}</b><br>❌ Gagal: <b>${failCount}</b>`,
            icon: successCount > 0 ? 'success' : 'error',
            confirmButtonColor: '#03754c'
        });
    }, 1000);
}

function logToUI(container, msg, className) {
    const div = document.createElement('div');
    div.className = `log-item ${className}`;
    div.innerText = msg;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
