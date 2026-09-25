// One-off asset generator: captures clean per-language store screenshots.
// Uses puppeteer-core driving the installed Chrome against the live site.
// Output: store-screenshots/<lang>/<lang>-<n>-<screen>.png (phone portrait, <=2:1).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://de-du.netlify.app/';
const LANGS = ['he', 'en', 'fr', 'es', 'ar'];
const OUT = path.join(__dirname, 'store-screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  // 412x820 @2x => 824x1640 px, ratio 1.99 (within Google Play's 2:1 max)
  await page.setViewport({ width: 412, height: 820, deviceScaleFactor: 2 });

  for (const lang of LANGS) {
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });

    // The app follows the device language, so emulate it (later scripts run
    // after earlier ones, so the most recent language wins on each load).
    await page.evaluateOnNewDocument((l) => {
      Object.defineProperty(navigator, 'languages', { get: () => [l], configurable: true });
      Object.defineProperty(navigator, 'language',  { get: () => l,   configurable: true });
    }, lang);
    // Load once to get an origin, set prefs, then reload in the target language.
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('dedu-rules-seen', '1');    // suppress rules auto-popup
      localStorage.setItem('dedu-tutorial-done', '1'); // suppress first-game tutorial
      localStorage.removeItem('dedu-active-game');     // no "resume" prompt
      localStorage.removeItem('dedu-stats');           // new-user state: coin HUD stays hidden
      localStorage.setItem('dedu-theme', 'light');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600); // fonts + i18n settle

    // 1) Home / setup
    await page.screenshot({ path: path.join(dir, `${lang}-1-home.png`) });

    // 2) How to play (illustrated explanation modal)
    await page.evaluate(() => { if (window.showRules) showRules(); });
    await sleep(1400); // let the demo board render its first frame
    await page.screenshot({ path: path.join(dir, `${lang}-2-howtoplay.png`) });
    await page.evaluate(() => { if (window.closeRules) closeRules(); });
    await sleep(300);

    // 3) In-game board (5x5, MEDIUM => ~55% revealed, so some cells stay hidden
    //    and the board reads as a real deduction puzzle rather than a full table)
    await page.evaluate(() => {
      document.querySelector('.option-btn[data-type="size"][data-val="5"]')?.click();
      document.querySelector('.diff-card[data-val="medium"], .option-btn[data-type="diff"][data-val="medium"]')?.click();
      (document.querySelector('[data-i18n="setup.startBtn"]') || document.getElementById('startBtn'))?.click();
    });
    await sleep(900);
    await page.screenshot({ path: path.join(dir, `${lang}-3-game.png`) });

    // 4) Mid-game: fill roughly half the header multipliers correctly.
    //    Silence toasts during scripted fills so the shot stays clean.
    await page.evaluate(() => {
      const _m = window.showMsg; window.showMsg = () => {};
      const targets = [];
      for (let i = 0; i < G.n; i++) { targets.push(['row', i]); targets.push(['col', i]); }
      const half = Math.ceil(G.totalHeaders / 2);
      let done = 0;
      for (const [t, i] of targets) {
        if (done >= half) break;
        const inp = document.getElementById(`hdr-${t}-${i}`);
        if (!inp || inp.readOnly) continue;
        inp.value = (t === 'row' ? G.rowNums[i] : G.colNums[i]);
        validateHeader(t === 'row', i, inp);
        done++;
      }
      window.showMsg = _m;
    });
    await sleep(900);
    await page.screenshot({ path: path.join(dir, `${lang}-4-midgame.png`) });

    // 5) Win screen: fill the remaining headers -> triggers gameWin() modal.
    await page.evaluate(() => {
      const _m = window.showMsg; window.showMsg = () => {};
      for (let i = 0; i < G.n; i++) {
        for (const t of ['row', 'col']) {
          const inp = document.getElementById(`hdr-${t}-${i}`);
          if (!inp || inp.readOnly) continue;
          inp.value = (t === 'row' ? G.rowNums[i] : G.colNums[i]);
          validateHeader(t === 'row', i, inp);
        }
      }
      window.showMsg = _m;
    });
    await sleep(1600); // win modal + star animation
    await page.screenshot({ path: path.join(dir, `${lang}-5-win.png`) });

    console.log(`captured ${lang}`);
  }

  await browser.close();
  console.log('DONE ->', OUT);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
