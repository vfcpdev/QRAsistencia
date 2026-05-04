var AppController = class {
    constructor(model, scannerService, qrService, exportService) {
        this.model = model;
        this.scanner = scannerService;
        this.qrService = qrService;
        this.exportService = exportService;
        this.lastScannedId = null;
        this.lastScannedTime = 0;
        this.audioCtx = null;
        this.setupEventListeners();
        this.renderInitialUI();
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e.currentTarget));
        });

        document.addEventListener('click', (e) => {
            const id = e.target.id || e.target.closest('button')?.id;
            if (id === 'btn-activate-camera') this.toggleCamera();
            if (id === 'btn-export-attendance') this.exportData();
            if (id === 'btn-download-all-qr') this.downloadAllQRs();
            if (id === 'btn-reset-data') this.fullReset();
            if (id === 'btn-clear-students') this.clearStudents();
            if (id === 'btn-reset-attendance') this.resetAttendanceToday();
        });

        document.getElementById('excel-input')?.addEventListener('change', (e) => this.handleImport(e));
    }

    initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    handleNavigation(navItem) {
        this.initAudio(); // Initialize audio on first navigation/click
        const tabId = navItem.getAttribute('data-tab');
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        navItem.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');
    }

    async handleImport(e) {
        this.initAudio();
        const file = e.target.files[0];
        if (!file) return;
        try {
            const students = await this.exportService.parseExcel(file);
            this.model.setStudents(students);
            this.renderInitialUI();
            this.showToast(`✅ ${students.length} alumnos cargados`);
        } catch (err) { 
            console.error("Import failure:", err);
            this.showToast('Error al cargar archivo', 'error'); 
        } finally {
            e.target.value = ''; // Reset to allow re-uploading same file
        }
    }

    renderInitialUI() {
        this.updateStats();
        this.updateAttendanceTable();
        this.renderLiveScannerList();
        this.showFileStatus();
        this.generateStudentQRCards();
    }

    async toggleCamera() {
        this.initAudio();
        const btn = document.getElementById('btn-activate-camera');
        const status = document.getElementById('modal-status');
        
        if (this.scanner.isScanning) {
            this.scanner.stop();
            if (btn) btn.innerText = '🚀 Iniciar Escáner';
            if (status) status.innerText = 'Estado: Inactivo';
            this.showToast('Escáner detenido', 'info');
        } else {
            if (status) status.innerText = '⌛ Solicitando permisos...';
            try {
                await this.scanner.start();
                if (btn) btn.innerText = '🛑 Detener Cámara';
                if (status) status.innerText = '🟢 Cámara Activa';
                this.showToast('Escáner activado');
            } catch (e) {
                console.error("Camera Activation Error:", e);
                if (status) status.innerHTML = `<span style="color:var(--danger)">❌ ${e.message}</span>`;
                this.showToast(e.message, 'error');
                if (btn) btn.innerText = '🚀 Reintentar Escáner';
            }
        }
    }

    handleScan(data) {
        const sanitized = this.model.sanitizeID(data);
        const now = new Date();
        const dateStr = now.toLocaleDateString();

        // Anti-bounce
        if (this.lastScannedId === sanitized && (Date.now() - this.lastScannedTime) < 3000) return;

        const student = this.model.getStudentById(data);
        const statusEl = document.getElementById('modal-status');

        if (!student) {
            this.playAudio(220, 0.4);
            this.showToast('⚠️ No registrado', 'error');
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)">⚠️ NO REGISTRADO</span>';
            return;
        }

        // Check duplicates
        if (this.model.logs.some(l => l.id === student.id && l.date === dateStr)) {
            this.playAudio(330, 0.3);
            this.showToast(`⚠️ ${student.fullName} ya registrado`, 'info');
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--accent)">❌ YA REGISTRADO</span>';
            return;
        }

        // Success
        this.model.addLog({ id: student.id, fullName: student.fullName, date: dateStr, time: now.toLocaleTimeString(), matched: true });
        this.lastScannedId = sanitized;
        this.lastScannedTime = Date.now();

        this.playAudio(880, 0.2);
        
        // Selective UI update (Do NOT call renderInitialUI here to avoid QR card regeneration)
        this.updateStats();
        this.updateAttendanceTable();
        this.renderLiveScannerList();
        
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--secondary)">✅ ${student.fullName}</span>`;
        if (window.confetti) confetti({ particleCount: 60, spread: 50, origin: { y: 0.8 } });
    }

    playAudio(freq, duration) {
        try {
            this.initAudio();
            const osc = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            osc.connect(g); g.connect(this.audioCtx.destination);
            osc.frequency.value = freq;
            g.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
            osc.start(); osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {}
    }

    async downloadAllQRs() {
        if (this.model.students.length === 0) {
            this.showToast('No hay alumnos para exportar', 'error');
            return;
        }

        const btn = document.getElementById('btn-download-all-qr');
        const originalText = btn.innerText;
        btn.innerText = '⏳ Generando ZIP...';
        btn.disabled = true;

        try {
            const zip = new JSZip();
            const folder = zip.folder("Codigos_QR");
            
            // Create a hidden container for rendering
            const hiddenContainer = document.createElement('div');
            hiddenContainer.style.position = 'fixed';
            hiddenContainer.style.left = '-9999px';
            document.body.appendChild(hiddenContainer);

            const promises = this.model.students.map(async s => {
                const div = document.createElement('div');
                hiddenContainer.appendChild(div);
                
                await this.qrService.generateQR(div, s.id);
                const fileName = `QR_${s.id}_${s.fullName.replace(/[^a-z0-9]/gi, '_')}.png`;
                const file = await this.qrService.getQRFile(div, fileName);
                
                if (file) {
                    folder.file(fileName, file);
                }
                hiddenContainer.removeChild(div);
            });

            await Promise.all(promises);
            document.body.removeChild(hiddenContainer);

            const content = await zip.generateAsync({type:"blob"});
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `QRAttendance_QRs_${new Date().toISOString().split('T')[0]}.zip`;
            link.click();
            
            this.showToast('✅ ZIP generado correctamente');
        } catch (err) {
            console.error("ZIP Error", err);
            this.showToast('Error al generar ZIP', 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    fullReset() {
        if (confirm('🚨 ¿Borrar todos los datos?')) { this.model.clearData(); window.location.reload(); }
    }

    clearStudents() {
        if (confirm('🗑️ ¿Borrar alumnos?')) { this.model.clearStudents(); this.renderInitialUI(); }
    }

    resetAttendanceToday() {
        if (confirm('🧹 ¿Limpiar asistencia de hoy?')) { this.model.clearLogs(); this.renderInitialUI(); }
    }

    updateStats() {
        const stats = this.model.getStats();
        document.getElementById('count-students').innerText = stats.total;
        document.getElementById('count-present').innerText = stats.present;
        document.getElementById('percent-present').innerText = `${stats.percentage}%`;
    }

    updateAttendanceTable() {
        const tbody = document.querySelector('#attendance-table tbody');
        if (!tbody) return;
        tbody.innerHTML = this.model.students.length === 0 ? '<tr><td colspan="5">Sin datos</td></tr>' : '';
        this.model.students.forEach(s => {
            const log = this.model.logs.find(l => l.id === s.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${s.id}</td><td>${s.fullName}</td><td>${log ? log.date : '--'}</td><td>${log ? log.time : '--'}</td><td>${log ? 'Presente' : 'Ausente'}</td>`;
            tbody.appendChild(tr);
        });
    }

    renderLiveScannerList() {
        const list = document.getElementById('scanner-live-list');
        const count = document.getElementById('scanner-list-count');
        if (!list || !count) return;
        list.innerHTML = '';
        let presentCount = 0;
        this.model.students.forEach(s => {
            const isPresent = this.model.logs.some(l => l.id === s.id);
            if (isPresent) presentCount++;
            const item = document.createElement('div');
            item.className = `scanner-student-item ${isPresent ? 'present' : ''}`;
            item.innerHTML = `<div><b>${s.fullName}</b><br><small>${s.id}</small></div><div class="status-dot"></div>`;
            list.appendChild(item);
        });
        count.innerText = `${presentCount}/${this.model.students.length}`;
    }

    async generateStudentQRCards() {
        const grid = document.getElementById('qr-preview-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (this.model.students.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">No hay alumnos cargados. Ve al Dashboard para importar.</div>';
            return;
        }

        // Sequential generation to avoid saturating the browser resources
        for (const s of this.model.students) {
            const item = document.createElement('div');
            item.className = 'qr-item';
            item.innerHTML = `
                <div style="font-weight:700; color:var(--text-main); margin-bottom: 0.5rem;">${s.fullName}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 1rem;">ID: ${s.id}</div>
                <div class="qr-target" style="margin:1rem 0; display:flex; justify-content:center; background: white; padding: 10px; border-radius: 12px; min-height: 256px;">
                    <div style="display:flex; align-items:center; color:var(--primary); font-size:0.8rem;">⌛ Preparando...</div>
                </div>
                <div style="display:grid; gap:0.5rem;">
                    <a class="btn btn-primary btn-dl" style="font-size:0.75rem; opacity:0.3; pointer-events:none;">⏳ Generando PNG...</a>
                    <button class="btn btn-secondary btn-sim" style="font-size:0.75rem; border: 1px solid var(--glass-border); background: transparent; color: var(--text-muted);">⚡ Simular</button>
                </div>
            `;
            grid.appendChild(item);
            
            const target = item.querySelector('.qr-target');
            const dl = item.querySelector('.btn-dl');
            
            // Generate QR
            const qrInstance = this.qrService.generateQR(target, s.id);
            
            if (qrInstance) {
                // Wait for image and activate download
                const fileName = `QR_${s.id}_${s.fullName.replace(/\s+/g, '_')}.png`;
                const url = await this.qrService.getQRDataURL(target, fileName);
                if (url) {
                    dl.href = url;
                    dl.download = fileName;
                    dl.style.opacity = '1';
                    dl.style.pointerEvents = 'auto';
                    dl.innerHTML = '⬇️ Descargar PNG';
                } else {
                    dl.innerText = '❌ Tiempo agotado';
                    dl.style.color = 'var(--danger)';
                }
            } else {
                dl.innerText = '❌ Error';
                dl.style.color = 'var(--danger)';
            }
            
            item.querySelector('.btn-sim').onclick = () => this.handleScan(s.id);
            
            // Tiny pause to keep UI responsive and allow the browser to "breathe"
            await new Promise(r => setTimeout(r, 50));
        }
    }

    showFileStatus() {
        const el = document.getElementById('file-status');
        if (el) {
            el.style.display = this.model.students.length > 0 ? 'block' : 'none';
            el.innerText = `✓ ${this.model.students.length} alumnos cargados`;
        }
    }

    exportData() {
        this.exportService.exportToExcel(this.model.students, this.model.logs);
        this.showToast('✅ Reporte exportado');
    }

    showToast(msg, type = 'success') {
        const t = document.getElementById('toast');
        const m = document.getElementById('toast-msg');
        if (t && m) { t.className = `toast show ${type}`; m.innerText = msg; setTimeout(() => t.classList.remove('show'), 3000); }
    }
}

// Final bootstrap (Non-module version)
window.addEventListener('load', () => {
    try {
        const video = document.getElementById("qr-video");
        const canvas = document.getElementById("qr-canvas");
        
        if (!video || !canvas) return;

        const model = new AttendanceModel();
        const qr = new QRService();
        const exportSrv = new ExportService();
        
        // Atomic setup
        const app = new AppController(model, null, qr, exportSrv);
        const scanner = new ScannerService(video, canvas, (data) => app.handleScan(data));
        app.scanner = scanner;

        // Security Audit Check
        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            app.showToast('⚠️ Advertencia: La cámara podría no funcionar sin HTTPS', 'error');
            const status = document.getElementById('modal-status');
            if (status) status.innerHTML = '<span style="color:var(--danger)">⚠️ Se requiere HTTPS para la cámara</span>';
        }
        
        window.app = app;
        console.log("QRAttendance Ready.");
    } catch (e) {
        console.error("System Failure:", e);
    }
});
