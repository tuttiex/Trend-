const trendScraper = require('../src/services/trendScraper');

async function checkIsolation() {
    const regions = ['nigeria', 'united states'];
    
    for (const region of regions) {
        console.log(`\n--- ${region.toUpperCase()} ---`);
        const gd = await trendScraper.scrapeGetDayTrends(region);
        const t24 = await trendScraper.scrapeTrends24(region);
        
        console.log(`GetDayTrends (Top 3):`, gd.slice(0, 3).map(t => t.name));
        console.log(`Trends24     (Top 3):`, t24.slice(0, 3).map(t => t.name));
    }
}

checkIsolation();
