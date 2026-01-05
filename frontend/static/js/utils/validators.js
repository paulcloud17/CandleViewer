/**
 * validators.js
 * Validační funkce pro formulářové vstupy
 */

/**
 * Validuje ticker symbol
 * @param {string} symbol - Ticker symbol
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateSymbol(symbol) {
    if (!symbol || symbol.trim() === '') {
        return { valid: false, error: 'Symbol je povinný' };
    }

    const trimmed = symbol.trim().toUpperCase();

    // Ticker symboly jsou obvykle 1-5 znaků, povolujeme i "-" pro crypto (BTC-USD)
    if (!/^[A-Z0-9\-\.]{1,10}$/.test(trimmed)) {
        return { 
            valid: false, 
            error: 'Symbol může obsahovat pouze písmena, čísla, "-" a "."' 
        };
    }

    return { valid: true };
}

/**
 * Validuje datum range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return { valid: false, error: 'Obě data jsou povinná' };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end)) {
        return { valid: false, error: 'Neplatný formát data' };
    }

    if (start > end) {
        return { valid: false, error: 'Datum začátku musí být před datem konce' };
    }

    // Kontrola, že data nejsou v budoucnosti
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (end > today) {
        return { valid: false, error: 'Datum konce nesmí být v budoucnosti' };
    }

    // Varování pro příliš dlouhé období
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 3650) { // 10 let
        return { 
            valid: true, 
            warning: 'Období delší než 10 let může trvat déle' 
        };
    }

    return { valid: true };
}

/**
 * Validuje počáteční kapitál
 * @param {string|number} capital - Kapitál
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateCapital(capital) {
    const num = parseFloat(capital);

    if (isNaN(num)) {
        return { valid: false, error: 'Kapitál musí být číslo' };
    }

    if (num <= 0) {
        return { valid: false, error: 'Kapitál musí být větší než 0' };
    }

    if (num > 1000000000) { // 1 miliarda
        return { valid: false, error: 'Kapitál je příliš vysoký' };
    }

    return { valid: true };
}

/**
 * Validuje nahraný soubor
 * @param {File} file - File objekt
 * @returns {Object} - {valid: boolean, error?: string}
 */
export function validateFile(file) {
    if (!file) {
        return { valid: false, error: 'Žádný soubor nebyl vybrán' };
    }

    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.csv', '.json'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
        return { 
            valid: false, 
            error: 'Povolené formáty: .csv, .json' 
        };
    }

    // Kontrola velikosti souboru (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        return { 
            valid: false, 
            error: 'Soubor je příliš velký (max 10MB)' 
        };
    }

    if (file.size === 0) {
        return { valid: false, error: 'Soubor je prázdný' };
    }

    return { valid: true };
}

/**
 * Validuje kompletní formulář
 * @param {Object} formData - Data z formuláře
 * @returns {Object} - {valid: boolean, errors: Object}
 */
export function validateForm(formData) {
    const errors = {};
    let isValid = true;

    // Symbol
    const symbolValidation = validateSymbol(formData.symbol);
    if (!symbolValidation.valid) {
        errors.symbol = symbolValidation.error;
        isValid = false;
    }

    // Date range
    const dateValidation = validateDateRange(formData.startDate, formData.endDate);
    if (!dateValidation.valid) {
        errors.dateRange = dateValidation.error;
        isValid = false;
    } else if (dateValidation.warning) {
        errors.dateRangeWarning = dateValidation.warning;
    }

    // Capital
    const capitalValidation = validateCapital(formData.initialCapital);
    if (!capitalValidation.valid) {
        errors.capital = capitalValidation.error;
        isValid = false;
    }

    // File (pokud je poskytnut)
    if (formData.tradesFile) {
        const fileValidation = validateFile(formData.tradesFile);
        if (!fileValidation.valid) {
            errors.file = fileValidation.error;
            isValid = false;
        }
    }

    return { valid: isValid, errors };
}
