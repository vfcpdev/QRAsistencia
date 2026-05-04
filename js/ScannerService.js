var ScannerService = class {
    constructor(video, canvas, onScan) {
        this.video = video;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        this.onScan = onScan;
        this.isScanning = false;
        this.detector = null;
        this.animationFrameId = null;
        this.lastScanTime = 0;
        this.scanLock = false;

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true, alpha: false });

        if ('BarcodeDetector' in window) {
            try {
                this.detector = new BarcodeDetector({ formats: ['qr_code'] });
            } catch (e) {}
        }
    }

    async start() {
        if (this.isScanning) return;

        // 1. Check for secure context
        if (!window.isSecureContext) {
            const err = new Error("El acceso a la cámara requiere una conexión segura (HTTPS o localhost).");
            err.name = "SecurityError";
            throw err;
        }

        // 2. Check for mediaDevices support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const err = new Error("Tu navegador no soporta el acceso a la cámara.");
            err.name = "NotSupportedError";
            throw err;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: "environment", 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 } 
                }
            });
            this.video.srcObject = stream;
            this.video.setAttribute("playsinline", true);
            
            // Wait for video metadata to be loaded
            return new Promise((resolve, reject) => {
                this.video.onloadedmetadata = async () => {
                    try {
                        await this.video.play();
                        this.isScanning = true;
                        this._tick();
                        resolve(true);
                    } catch (e) {
                        reject(e);
                    }
                };
                this.video.onerror = () => reject(new Error("Error al cargar el video"));
            });
        } catch (err) {
            console.error("Camera Error Details:", err);
            
            let userMessage = "Error desconocido al activar la cámara.";
            
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                userMessage = "Permiso denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.";
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                userMessage = "No se encontró ninguna cámara en este dispositivo.";
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                userMessage = "La cámara está siendo usada por otra aplicación.";
            } else if (err.name === 'OverconstrainedError') {
                userMessage = "La cámara no cumple con los requisitos de resolución.";
            } else if (err.name === 'SecurityError') {
                userMessage = "Contexto no seguro. Se requiere HTTPS.";
            }

            const customErr = new Error(userMessage);
            customErr.name = err.name;
            throw customErr;
        }
    }

    async checkPermissions() {
        try {
            if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
            const result = await navigator.permissions.query({ name: 'camera' });
            return result.state; // 'granted', 'denied', or 'prompt'
        } catch (e) {
            return 'unknown';
        }
    }

    stop() {
        this.isScanning = false;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }

    _tick() {
        if (!this.isScanning) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            const width = this.video.videoWidth;
            const height = this.video.videoHeight;

            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
            }

            // High-quality draw
            this.ctx.drawImage(this.video, 0, 0, width, height);

            const now = performance.now();
            if (!this.scanLock && now - this.lastScanTime > 100) {
                this.scanLock = true;
                this._detectQR(width, height).finally(() => {
                    this.scanLock = false;
                    this.lastScanTime = now;
                });
            }
        }
        this.animationFrameId = requestAnimationFrame(() => this._tick());
    }

    async _detectQR(width, height) {
        try {
            // Stage 1: Native (if available)
            if (this.detector) {
                const barcodes = await this.detector.detect(this.video);
                if (barcodes.length > 0) {
                    this.onScan(barcodes[0].rawValue);
                    this._drawSuccessBox(barcodes[0].boundingBox);
                    return;
                }
            }

            // Stage 2: jsQR Raw (Fastest and most compatible)
            this.offscreenCtx.drawImage(this.video, 0, 0, width, height);
            const imageData = this.offscreenCtx.getImageData(0, 0, width, height);
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth"
            });

            if (code) {
                this.onScan(code.data);
                this._drawSuccessBox(code.location);
            }
        } catch (e) {
            console.error("Detection error:", e);
        }
    }

    _drawSuccessBox(location) {
        if (!location) return;
        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = "#10b981";
        
        if (location.topLeftCorner) {
            this.ctx.beginPath();
            this.ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            this.ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            this.ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            this.ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            this.ctx.closePath();
            this.ctx.stroke();
        } else if (location.x !== undefined) {
            this.ctx.strokeRect(location.x, location.y, location.width, location.height);
        }
        this.ctx.restore();
    }


window.ScannerService = ScannerService;
window.ScannerService = ScannerService;
