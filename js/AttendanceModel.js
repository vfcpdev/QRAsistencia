/**
 * Handles the data layer for students and attendance logs.
 * Responsibility: Persistent Storage & State.
 */
class AttendanceModel {
    constructor() {
        this.STORAGE_KEYS = {
            STUDENTS: 'qr_att_v3_students',
            LOGS: 'qr_att_v3_logs'
        };
        this.students = this._load(this.STORAGE_KEYS.STUDENTS) || [];
        this.logs = this._load(this.STORAGE_KEYS.LOGS) || [];
    }

    _load(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            console.error(`Error loading ${key} from storage`, e);
            return null;
        }
    }

    _save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    setStudents(studentList) {
        this.students = studentList;
        this._save(this.STORAGE_KEYS.STUDENTS, this.students);
    }

    addLog(entry) {
        this.logs.unshift(entry);
        this._save(this.STORAGE_KEYS.LOGS, this.logs);
    }

    clearData() {
        localStorage.removeItem(this.STORAGE_KEYS.STUDENTS);
        localStorage.removeItem(this.STORAGE_KEYS.LOGS);
        this.students = [];
        this.logs = [];
    }

    clearStudents() {
        this.students = [];
        this._save(this.STORAGE_KEYS.STUDENTS, this.students);
    }

    clearLogs() {
        this.logs = [];
        this._save(this.STORAGE_KEYS.LOGS, this.logs);
    }

    getStudentById(id) {
        const sanitized = this.sanitizeID(id);
        return this.students.find(s => this.sanitizeID(s.id) === sanitized);
    }

    sanitizeID(val) {
        return String(val || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    getStats() {
        const presentCount = this.students.filter(s => 
            this.logs.some(log => this.sanitizeID(log.id) === this.sanitizeID(s.id))
        ).length;

        return {
            total: this.students.length,
            present: presentCount,
            percentage: this.students.length > 0 ? Math.round((presentCount / this.students.length) * 100) : 0
        };
    }
}
window.AttendanceModel = AttendanceModel;
