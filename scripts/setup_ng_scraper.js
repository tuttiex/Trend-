/**
 * setup_ng_scraper.js
 * 
 * ONE-TIME SETUP: Permanently locks the Nigeria session silo (cache/x_auth_ng.json).
 * 
 * Run this ONCE:  node scripts/setup_ng_scraper.js
 * 
 * This script launches a VISIBLE browser so you can see what's happening.
 * After it successfully sets the location to "Nigeria" it saves the
 * session to cache/x_auth_ng.json. The Nigeria scraper will then load that
 * session instantly on every future run — no location switching needed.
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN;
const STORAGE_PATH = path.join(process.cwd(), 'cache', 'x_auth_ng.json');
const REGION = 'Nigeria';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
    if (!AUTH_TOKEN) {
        console.error('❌ TWITTER_AUTH_TOKEN is not set in .env. Aborting.');
        process.exit(1);
    }

    console.log('🚀 Launching browser (visible) for one-time Nigeria setup...');
    const browser = await chromium.launch({ headless: false, slowMo: 100 });

    const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    };

    if (fs.existsSync(STORAGE_PATH)) {
        console.log('📂 Found existing Nigeria silo. Loading it...');
        contextOptions.storageState = STORAGE_PATH;
    }

    const context = await browser.newContext(contextOptions);

    if (!fs.existsSync(STORAGE_PATH)) {
        console.log('🍪 Injecting auth cookie...');
        await context.addCookies([{
            name: 'auth_token',
            value: AUTH_TOKEN,
            domain: '.x.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None'
        }]);
    }

    const page = await context.newPage();

    // Step 1: Go to Explore Settings directly
    console.log('⚙️  Navigating to x.com/settings/explore...');
    await page.goto('https://x.com/settings/explore', { waitUntil: 'load', timeout: 60000 });
    await delay(4000);

    // Step 2: Uncheck "Show content in this location" if checked
    try {
        const checkbox = page.locator('input[type="checkbox"]').first();
        if (await checkbox.isChecked()) {
            console.log('☑️  Unchecking location tracking...');
            await checkbox.click();
            await delay(2000);
        }
    } catch (e) {
        console.log('ℹ️  Checkbox not found or already unchecked.');
    }

    // Step 3: Click "Explore locations"
    console.log('📍 Clicking "Explore locations"...');
    const exploreRow = page.getByText('Explore locations');
    await exploreRow.waitFor({ timeout: 10000 });
    await exploreRow.click();
    await delay(3000);

    // Step 4: Type the region name
    console.log(`🔍 Typing "${REGION}" in search box...`);
    const searchBox = await page.waitForSelector('[placeholder="Search locations"]', { timeout: 10000 });
    await searchBox.type(REGION, { delay: 150 });
    await delay(5000);

    // Step 5: Keyboard navigation to select first result
    console.log('⌨️  Pressing ArrowDown + Enter to select first result...');
    await page.keyboard.press('ArrowDown');
    await delay(800);
    await page.keyboard.press('Enter');
    await delay(6000);

    // Step 6: Verify on trending page
    console.log('✅ Navigating to trending page to verify...');
    await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'load', timeout: 60000 });
    await delay(4000);

    const headerText = await page.evaluate(() => {
        const h2 = document.querySelector('[role="main"] h2');
        return h2 ? h2.innerText : 'Could not read header';
    });
    console.log(`📍 Current header: "${headerText}"`);

    // Step 7: Save session
    await context.storageState({ path: STORAGE_PATH });
    console.log(`\n✅ Nigeria session silo saved to: ${STORAGE_PATH}`);
    console.log('🎉 Setup complete! Run your Nigeria scraper normally from now on.');

    await browser.close();
}

setup().catch(err => {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
});
