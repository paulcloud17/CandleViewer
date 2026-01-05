/**
 * dateUtils.js
 * Utility pro práci s datumy
 */

/**
 * Formátuje datum do YYYY-MM-DD
 * @param {Date} date - Date objekt
 * @returns {string}
 */
export function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return '';
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}

/**
 * Parse datum string do Date objektu
 * @param {string} dateString - Datum string (YYYY-MM-DD)
 * @returns {Date|null}
 */
export function parseDate(dateString) {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    return isNaN(date) ? null : date;
}

/**
 * Vrátí dnešní datum jako YYYY-MM-DD
 * @returns {string}
 */
export function getToday() {
    return formatDate(new Date());
}

/**
 * Vrátí datum před N dny
 * @param {number} days - Počet dnů zpět
 * @returns {string}
 */
export function getDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDate(date);
}

/**
 * Vypočítá rozdíl mezi dvěma daty ve dnech
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {number}
 */
export function getDaysDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start) || isNaN(end)) return 0;
    
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Validuje, zda je datum string ve správném formátu
 * @param {string} dateString - Datum string
 * @returns {boolean}
 */
export function isValidDate(dateString) {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    return !isNaN(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
}

/**
 * Formátuje datum pro zobrazení uživateli
 * @param {string} dateString - YYYY-MM-DD
 * @param {string} locale - Locale (default 'cs-CZ')
 * @returns {string}
 */
export function formatDateForDisplay(dateString, locale = 'cs-CZ') {
    const date = new Date(dateString);
    
    if (isNaN(date)) return dateString;
    
    return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
