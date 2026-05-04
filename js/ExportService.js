/**
 * Handles data export and import.
 * Responsibility: XLSX processing and File downloads.
 */
class ExportService {
    constructor() {
        // XLSX must be loaded globally
    }

    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', codepage: 65001 }); // Force UTF-8 hint
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
                    
                    if (!rows || rows.length === 0) throw new Error("Archivo vacío");

                    const students = [];
                    rows.forEach((row) => {
                        if (!row || row.length < 2) return;

                        // OPPORTUNISTIC MAPPING: 
                        // Find first column that looks like an ID (numeric/alphanumeric)
                        // Find first column that looks like a Name (longer text)
                        let foundId = "";
                        let foundName = "";

                        row.forEach(cell => {
                            const val = String(cell).trim();
                            if (!val) return;
                            
                            // If it's a number-like string of decent length and we don't have an ID yet
                            if (!foundId && /^[0-9A-Z-]+$/i.test(val) && val.length >= 3 && val.toLowerCase() !== 'id' && val.toLowerCase() !== 'indice') {
                                foundId = val;
                            } else if (!foundName && val.length > 5 && !/^[0-9-]+$/.test(val) && !val.toLowerCase().includes('nombre') && !val.toLowerCase().includes('completo')) {
                                foundName = val;
                            }
                        });

                        // Fallback to simple positional if opportunistic fails
                        if (!foundId || !foundName) {
                            if (row.length >= 3) {
                                foundId = String(row[1] || '').trim();
                                foundName = String(row[2] || '').trim();
                            } else if (row.length === 2) {
                                foundId = String(row[0] || '').trim();
                                foundName = String(row[1] || '').trim();
                            }
                        }

                        // Final check
                        if (foundId && foundName && foundId.toLowerCase() !== 'id') {
                            students.push({ id: foundId, fullName: foundName });
                        }
                    });

                    if (students.length === 0) throw new Error("No se detectaron datos válidos");
                    resolve(students);
                } catch (err) {
                    console.error("Critical Import Error:", err);
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    exportToExcel(studentList, attendanceLogs) {
        const exportData = studentList.map(student => {
            const record = attendanceLogs.find(log => log.id === student.id);
            return {
                'ID / Documento': student.id,
                'Nombre del Estudiante': student.fullName,
                'Estado Final': record ? 'PRESENTE' : 'AUSENTE',
                'Fecha Escaneo': record ? record.date : '',
                'Hora Escaneo': record ? record.time : ''
            };
        });

        // Add Intruders (scans not in list)
        const unknownScans = attendanceLogs.filter(log => !log.matched);
        unknownScans.forEach(log => {
            exportData.push({
                'ID / Documento': log.id,
                'Nombre del Estudiante': 'DATO NO RECONOCIDO',
                'Estado Final': 'DESCONOCIDO',
                'Fecha Escaneo': log.date,
                'Hora Escaneo': log.time
            });
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado_Asistencia");
        XLSX.writeFile(wb, "Reporte_General_Asistencia.xlsx");
    }
}
window.ExportService = ExportService;
