const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.goto('http://127.0.0.1:8000/');
  
  await page.waitForSelector('#match-name');
  await page.type('#match-name', 'Test Match');
  
  console.log('Clicking submit');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 1000));
  
  const h2 = await page.$eval('h2', el => el.innerText).catch(() => 'No h2 found');
  console.log('Current page header:', h2);
  
  await browser.close();
})();
