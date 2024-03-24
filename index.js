import * as fs from 'fs';
import * as psl from 'psl';
import * as puppeteer from 'puppeteer';

async function retrieveAnchorLinks(page) {
    return await page.evaluate(() => {
        const anchorList = document.querySelectorAll('a');

        return Array.from(anchorList).map((anchor) => {
            return anchor.href;
        });
    });
}

async function visit(host) {
    host = new URL(host);
    const hostDomain = psl.parse(host.hostname).domain;
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-sandbox',
            '--no-zygote',
            '--deterministic-fetch',
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials'
        ],
    });

    const pagesToVisit = [host.href];
    const visitedPages = [];

    // Iterating web pages to visit
    while (pagesToVisit.length > 0) {
        // FIFO queue of pages to crawl
        const pageToVisit = new URL(pagesToVisit.shift());
        const page = await browser.newPage();
        let anchors = [];
        let pageHTML = '';

        // Mark current page as visited
        visitedPages.push(`${pageToVisit.origin}${pageToVisit.pathname}`);

        try {
            // Load page with puppeteer
            await page.goto(pageToVisit.href, {
                waitUntil: 'domcontentloaded'
            });

            // Set page selector
            let pageSelector = '.tpc, footer, .footer, .footer-bottom';
            if (pageToVisit.href == 'https://sequence.day/blogs') {
                pageSelector = 'section#blogs-row-section .grid';
            }

            // Wait until page has been loaded
            await page.waitForSelector(pageSelector, {
                timeout: 10000
            });

            // Retrieve the anchor URLs
            anchors = await retrieveAnchorLinks(page);

            // if (pageToVisit.href == 'https://sequence.day/blogs') {
            //     await page.click('section#blogs-row-section .flex.items-center.justify-center.gap-4 button:last-child');
            //     anchors.push(...await retrieveAnchorLinks(page));
            // }

            // Retrieve the entire page as HTML
            pageHTML = await page.evaluate(() => {
                return document.documentElement.outerHTML
            });
        } catch (e) {
            console.error(`Failed to Open ${pageToVisit.href}`);
            console.error(e);
            continue;
        }

        try {
            anchors.forEach(anchorURL => {
                if (anchorURL) {
                    anchorURL = anchorURL.replace('www.', '');
                    anchorURL = new URL(anchorURL);
                    anchorURL.hash = '';

                    // Filter anchor URLs by domain
                    if (anchorURL.hostname && anchorURL.host == hostDomain) {
                        // Adding the anchor URL to the queue of web pages to crawl, if it wasn't yet crawled
                        if (!visitedPages.includes(`${anchorURL.origin}${anchorURL.pathname}`) && !pagesToVisit.includes(anchorURL.href)) {
                            pagesToVisit.push(anchorURL.href);
                        }
                    }
                }
            });
        } catch (e) {
            console.error(`${e.code} ${e.input}`);
        }

        try {
            // Assemble result dir and filename
            const pathnameSplit = pageToVisit.pathname.split('/');
            const lastPath = pathnameSplit.pop();
            const filename = lastPath ? `${lastPath}.html` : 'index.html';
            let pathname = '';
            while (pathnameSplit.length > 0) {
                const currentPath = pathnameSplit.shift();
                if (currentPath) {
                    pathname += `/${currentPath}`;
                }
            }
            const saveDir = `result/${pageToVisit.hostname}/${pathname}`;

            // Create dir if it doesn't exist
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, {
                    recursive: true
                });
            }

            // Write HTML to file
            fs.writeFile(`${saveDir}/${filename}`, pageHTML, (err) => {
                if (!err) {
                    console.log(`Saved ${pageToVisit.href}`);
                } else {
                    console.error(err);
                }
            });
        } catch (e) {
            console.error(`Failed to Save ${pageToVisit.href} (${e.code})`);
            console.error(e);
            continue;
        }
    }

    await browser.close();
}

function main() {
    // visit('https://cmlabs.co')
    //     .catch((e) => {
    //         console.error(e);
    //     });
    visit('https://sequence.day')
        .catch((e) => {
            console.error(e);
        });
}

main();