'use strict';

// Approximate festival dates (month is 0-indexed)
// For MVP, use fixed calendar adjusted to current year
function getFestivals(year) {
    return [
        { name: 'Diwali', month: 9, day: 20, windowDays: 7, storeTypes: ['grocery', 'general', 'clothing', 'electronics'] },
        { name: 'Holi', month: 2, day: 1, windowDays: 5, storeTypes: ['grocery', 'general', 'clothing'] },
        { name: 'Dussehra', month: 9, day: 2, windowDays: 5, storeTypes: ['grocery', 'general', 'clothing'] },
        { name: 'Navratri', month: 9, day: 3, windowDays: 9, storeTypes: ['grocery', 'general', 'clothing'] },
        { name: 'Ganesh Chaturthi', month: 7, day: 27, windowDays: 10, storeTypes: ['grocery', 'general'] },
        { name: 'Eid ul-Fitr', month: 2, day: 31, windowDays: 5, storeTypes: ['grocery', 'general', 'clothing', 'restaurant'] },
        { name: 'Eid ul-Adha', month: 5, day: 7, windowDays: 5, storeTypes: ['grocery', 'general', 'restaurant'] },
        { name: 'Christmas', month: 11, day: 25, windowDays: 7, storeTypes: ['grocery', 'general', 'clothing', 'electronics'] },
        { name: 'New Year', month: 11, day: 31, windowDays: 3, storeTypes: ['grocery', 'general', 'restaurant'] },
        { name: 'Onam', month: 7, day: 29, windowDays: 10, storeTypes: ['grocery', 'general'] },
        { name: 'Pongal', month: 0, day: 14, windowDays: 4, storeTypes: ['grocery', 'general'] },
        { name: 'Baisakhi', month: 3, day: 13, windowDays: 3, storeTypes: ['grocery', 'general'] },
    ].map(f => ({
        ...f,
        date: new Date(year, f.month, f.day),
    }));
}

/**
 * Get festivals coming up within `withinDays` days from today,
 * optionally filtered by store type.
 */
function getUpcomingFestivals(withinDays = 30, storeType = null) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 86400000);
    const year = now.getFullYear();

    // Check current year and next year's festivals
    const all = [...getFestivals(year), ...getFestivals(year + 1)];

    return all.filter(f => {
        const isUpcoming = f.date >= now && f.date <= cutoff;
        const matchesStore = !storeType || storeType === 'general' || f.storeTypes.includes(storeType);
        return isUpcoming && matchesStore;
    });
}

/**
 * Get the date range for the same festival window in the previous year.
 */
function getLastYearWindow(festival) {
    const start = new Date(festival.date);
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() - Math.floor(festival.windowDays / 2));
    const end = new Date(start);
    end.setDate(end.getDate() + festival.windowDays);
    return { start, end };
}

module.exports = { getUpcomingFestivals, getLastYearWindow };
