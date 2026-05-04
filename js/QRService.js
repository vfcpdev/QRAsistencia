/**
 * Handles QR code generation using the original davidshimjs/qrcode.js library.
 * Responsibility: High-reliability file-level QR generation.
 */
class QRService {
    constructor() {
        this.activeUrls = new Set();
    }

    /**
     * Generates a QR code in the container.
     */
    generateQR(container, text) {
        container.innerHTML = '';
        try {
            // davidshimjs constructor is synchronous and appends elements to container
            return new QRCode(container, {
                text: text,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (err) {
            console.error("QR Generation Error:", err);
            container.innerHTML = '<div style="color:red; font-size:0.7rem;">Error al generar</div>';
            return null;
        }
    }

    /**
     * Consolidates the generated QR into a real File object.
     */
    async getQRFile(container, fileName = 'qrcode.png') {
        return new Promise((resolve) => {
            let attempts = 0;
            const interval = setInterval(() => {
                const canvas = container.querySelector('canvas');
                const img = container.querySelector('img');
                
                // qrcode.js might use canvas or img depending on browser
                const source = canvas || img;
                
                if (source && (source.tagName === 'CANVAS' || (source.src && source.src.length > 100))) {
                    clearInterval(interval);
                    
                    try {
                        let finalCanvas = canvas;
                        
                        // If only image exists, we must draw it to a canvas to get a Blob/File
                        if (!canvas && img) {
                            finalCanvas = document.createElement('canvas');
                            finalCanvas.width = img.width || 256;
                            finalCanvas.height = img.height || 256;
                            const ctx = finalCanvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                        }

                        // Consolidate with white background for visibility
                        const ctx = finalCanvas.getContext('2d');
                        ctx.globalCompositeOperation = 'destination-over';
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

                        finalCanvas.toBlob((blob) => {
                            if (blob) {
                                resolve(new File([blob], fileName, { type: 'image/png' }));
                            } else {
                                resolve(null);
                            }
                        }, 'image/png');
                    } catch (e) {
                        console.error("Consolidation error", e);
                        resolve(null);
                    }
                    return;
                }

                if (attempts++ > 40) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }

    async getQRDataURL(container, fileName = 'qr_code.png') {
        const file = await this.getQRFile(container, fileName);
        if (!file) return null;
        const url = URL.createObjectURL(file);
        this.activeUrls.add(url);
        return url;
    }

    revokeUrls() {
        this.activeUrls.forEach(url => URL.revokeObjectURL(url));
        this.activeUrls.clear();
    }
}
window.QRService = QRService;
