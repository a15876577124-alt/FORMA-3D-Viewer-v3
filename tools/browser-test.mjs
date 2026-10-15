import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

export const browserPath = process.env.FORMA_BROWSER || [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((file) => fs.existsSync(file));

export async function launchBrowser(options = {}) {
  if (!browserPath) throw new Error('找不到 Edge / Chrome；可通过 FORMA_BROWSER 指定已安装的浏览器。');
  return puppeteer.launch({
    executablePath: browserPath,
    headless: process.env.FORMA_TEST_HEADED !== '1',
    protocolTimeout: 180000,
    args: ['--no-first-run', '--no-default-browser-check', '--mute-audio'],
    ...options,
  });
}
