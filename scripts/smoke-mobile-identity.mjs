/**
 * 手機身分列／改密碼煙測（本機 http://localhost:3000）
 */
import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForText(page, text, timeout = 8000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout },
    text
  );
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=390,844'],
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const failures = [];

  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForText(page, '目前身分');

    // 主畫面不應有修改登入密碼
    let text = await bodyText(page);
    if (text.includes('修改登入密碼') && !text.includes('切換身分')) {
      failures.push('教師主畫面不應出現「修改登入密碼」');
    }
    if (!text.includes('目前身分')) failures.push('缺少目前身分列');

    // 開啟切換 → 教務主任
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('切換')
      );
      if (!btn) throw new Error('找不到切換');
      btn.click();
    });
    await waitForText(page, '切換身分');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => (b.innerText || '').trim() === '教務主任'
      );
      if (!btn) throw new Error('找不到教務主任');
      btn.click();
    });
    await waitForText(page, '確認登入');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="password"], input[placeholder*="密碼"]');
      if (!input) throw new Error('找不到密碼欄');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1234');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('確認登入')
      );
      if (!btn) throw new Error('找不到確認登入');
      btn.click();
    });
    await sleep(800);
    await waitForText(page, '吳教務');
    text = await bodyText(page);
    if (!text.includes('教務處') || !text.includes('吳教務')) {
      failures.push(`登入後身分列不正確：${text.slice(0, 200)}`);
    }
    if (text.includes('修改登入密碼')) {
      failures.push('教務主任主畫面不應直接顯示修改登入密碼');
    }

    // 切換 → 修改登入密碼
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('切換')
      );
      btn.click();
    });
    await waitForText(page, '修改登入密碼');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('修改登入密碼')
      );
      if (!btn) throw new Error('找不到修改登入密碼');
      btn.click();
    });
    await sleep(500);
    await waitForText(page, '個人登入密碼');
    text = await bodyText(page);
    if (!text.includes('吳教務')) {
      failures.push('開啟改密碼後應仍為吳教務');
    }
    if (text.includes('教師端・') && !text.includes('教務處')) {
      failures.push('開啟改密碼後身分被切回教師端');
    }

    // 關閉改密碼（點 X，避免「關閉」文案撞到其他按鈕）
    await page.evaluate(() => {
      const modalTitle = [...document.querySelectorAll('span')].find((el) =>
        (el.innerText || '').includes('個人登入密碼')
      );
      const panel = modalTitle?.closest('.bg-slate-900') || document.body;
      const btn = panel.querySelector('button');
      // 標題列第一個 button 是 X
      const closeBtns = [...panel.querySelectorAll('button')];
      const xBtn = closeBtns.find((b) => b.querySelector('svg') && !(b.innerText || '').trim());
      (xBtn || closeBtns.find((b) => (b.innerText || '').trim() === '關閉'))?.click();
    });
    await sleep(500);
    const identityAfterPwd = await page.evaluate(() => {
      const row = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('目前身分')
      );
      return row ? row.innerText.replace(/\s+/g, ' ') : document.body.innerText.slice(0, 200);
    });
    if (!identityAfterPwd.includes('吳教務')) {
      failures.push(`關閉改密碼後身分列應含吳教務：${identityAfterPwd}`);
    }
    text = await bodyText(page);
    if (text.includes('切換身分')) {
      failures.push('關閉改密碼後切換選單應已收起');
    }

    // 桌面導覽列的改密碼按鈕仍應存在於 DOM（手機上為 md:flex 隱藏）
    const desktopPwdExists = await page.evaluate(
      () => !!document.querySelector('button[title="自行修改登入密碼"]')
    );
    if (!desktopPwdExists) {
      failures.push('桌面導覽列的改密碼按鈕不應被移除');
    }

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('切換')
      );
      btn.click();
    });
    await waitForText(page, '系統管理員');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => (b.innerText || '').trim() === '系統管理員'
      );
      btn.click();
    });
    await waitForText(page, '確認登入');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="password"], input[placeholder*="密碼"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'admin');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('確認登入')
      );
      btn.click();
    });
    await sleep(800);
    text = await bodyText(page);
    if (!text.includes('系統管理員')) {
      failures.push('管理員登入後身分列應顯示系統管理員');
    }
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.innerText || '').includes('切換')
      );
      btn.click();
    });
    await waitForText(page, '切換身分');
    text = await bodyText(page);
    // 管理員選單頂部不應有修改登入密碼區塊
    const beforeRoles = text.split('教師端')[0] || '';
    if (beforeRoles.includes('修改登入密碼')) {
      failures.push('系統管理員切換選單不應出現修改登入密碼');
    }

  } catch (err) {
    failures.push(String(err && err.stack ? err.stack : err));
  }

  await browser.close();
  if (failures.length) {
    console.error('smoke-mobile-identity FAIL');
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
  console.log('smoke-mobile-identity OK');
}

main();
