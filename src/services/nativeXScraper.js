/**
 * nativeXScraper.js
 * 
 * Nigeria scraper — uses a dedicated session silo (cache/x_auth_ng.json)
 * that is pre-configured to show Nigerian trends.
 * 
 * SELF-CORRECTING: If it detects a mismatch at runtime, it will automatically 
 * teleport back to Nigeria using the Keyboard "Magnet" navigation.
 */

const { chromium } = require('playwright');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class NativeXScraper {
    constructor() {
        this.authToken = process.env.TWITTER_AUTH_TOKEN;
        this.storagePath = path.join(process.cwd(), 'cache', 'x_auth_ng.json');
        this.cacheBase = path.join(process.cwd(), 'cache');

        if (!fs.existsSync(this.cacheBase)) {
            fs.mkdirSync(this.cacheBase, { recursive: true });
        }
    }

    async randomDelay(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async dismissCookieBanner(page) {
        try {
            await page.evaluate(() => {
                const searchTerms = ['Accept all cookies', 'Refuse non-essential', 'cookie consent'];
                const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                const targetBtn = allButtons.find(b => {
                    const text = b.innerText;
                    return searchTerms.some(term => text && text.includes(term));
                });
                if (targetBtn) {
                    let container = targetBtn;
                    while (container.parentElement && container.tagName !== 'BODY' && !window.getComputedStyle(container).position.includes('fixed')) {
                        container = container.parentElement;
                    }
                    if (container && container.tagName !== 'BODY') container.remove();
                }
            });
            await this.randomDelay(1000, 2000);
        } catch (error) {}
    }

    async teleportToNigeria(page) {
        try {
            logger.info('NativeXScraper: Regional mismatch detected. Initiating "Self-Correction" to Nigeria...');
            await this.dismissCookieBanner(page);

            await page.goto('https://x.com/settings/explore', { waitUntil: 'load', timeout: 30000 });
            await this.randomDelay(3000, 5000);

            const checkbox = page.locator('input[type="checkbox"]').first();
            if (await checkbox.count() > 0 && await checkbox.isChecked()) {
                logger.info('NativeXScraper: Unchecking location tracking...');
                await checkbox.click();
                await this.randomDelay(2000, 4000);
            }

            const exploreRow = page.getByText('Explore locations');
            if (await exploreRow.isVisible()) {
                await exploreRow.click();
                await this.randomDelay(2000, 4000);

                const searchBox = await page.waitForSelector('[placeholder="Search locations"]', { timeout: 10000 });
                logger.info('NativeXScraper: Searching for "Nigeria (country)"...');
                await searchBox.click({ clickCount: 3 }); // Select existing text
                await page.keyboard.press('Backspace');
                await searchBox.type('Nigeria (country)', { delay: 100 });
                await this.randomDelay(3000, 5000);

                // Keyboard Magnet selection
                logger.info('NativeXScraper: Using Keyboard Magnet selection...');
                await page.keyboard.press('ArrowDown');
                await this.randomDelay(500, 800);
                await page.keyboard.press('Enter');
                await this.randomDelay(4000, 6000);

                // Verify selection in UI
                const updatedLocation = await page.innerText('[role="button"]:has-text("Explore locations")');
                logger.info(`NativeXScraper: UI shows location is now: ${updatedLocation}`);

                await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'load', timeout: 60000 });
                await this.randomDelay(3000, 5000);
                logger.info('NativeXScraper: Self-Correction complete.');
            }
        } catch (error) {
            logger.error(`NativeXScraper: Teleport failed: ${error.message}`);
        }
    }

    async getTrends() {
        if (!this.authToken) return [];

        let browser;
        try {
            browser = await chromium.launch({ headless: true });
            const contextOptions = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 }
            };

            if (fs.existsSync(this.storagePath)) contextOptions.storageState = this.storagePath;

            const context = await browser.newContext(contextOptions);
            if (!fs.existsSync(this.storagePath)) {
                await context.addCookies([{ name: 'auth_token', value: this.authToken, domain: '.x.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' }]);
            }

            const page = await context.newPage();
            await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'load', timeout: 60000 });
            await this.randomDelay(2000, 4000);

            const headerText = await page.evaluate(() => {
                const h2 = document.querySelector('[role="main"] h2');
                return h2 ? h2.innerText : '';
            });

            if (!headerText.toLowerCase().includes('nigeria')) {
                await this.teleportToNigeria(page);
                await context.storageState({ path: this.storagePath });
            } else {
                logger.info(`NativeXScraper: Region confirmed: ${headerText}.`);
            }

            await page.waitForSelector('[data-testid="trend"]', { timeout: 30000 });
            await page.mouse.wheel(0, 300);
            await this.randomDelay(1000, 2000);

            const trends = await page.$$eval('[data-testid="trend"]', (elements) => {
                return elements.map(el => {
                    const spans = Array.from(el.querySelectorAll('span')).map(s => s.innerText.trim()).filter(t => t.length > 0);
                    let name = '', vol = '';
                    const vMatch = spans.find(t => t.toLowerCase().includes('posts'));
                    if (vMatch) vol = vMatch;

                    const pNames = spans.filter(t => !/^\d+$/.test(t) && !t.toLowerCase().includes('posts') && !t.includes('Trending') && !t.includes('·'));
                    if (pNames.length > 0) name = pNames[0];
                    else if (spans.length > 1) name = spans[1];

                    return { name, volStr: vol };
                });
            });

            const processed = trends.filter(t => t.name).map((t, index) => ({
                name: t.name,
                tweet_volume: this.parseVolume(t.volStr),
                rank: index + 1
            }));

            logger.info(`NativeXScraper: ✅ Scraped ${processed.length} Nigeria trends.`);
            await browser.close();
            return processed;

        } catch (error) {
            logger.error(`NativeXScraper Error: ${error.message}`);
            if (browser) await browser.close();
            return [];
        }
    }

    parseVolume(volStr) {
        if (!volStr) return 0;
        const clean = volStr.toLowerCase().replace(/posts/g, '').replace(/,/g, '').trim();
        if (clean.includes('k')) return Math.floor(parseFloat(clean) * 1000);
        if (clean.includes('m')) return Math.floor(parseFloat(clean) * 1000000);
        const num = parseInt(clean, 10);
        return isNaN(num) ? 0 : num;
    }
}

module.exports = new NativeXScraper();
