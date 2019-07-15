require("dotenv").config();

const puppetter = require("puppeteer");
const path = require("path");
const fs = require("fs-extra");
const nanoid = require("nanoid");
const ora = require("ora");
const yauzl = require("yauzl");

const icons8BaseUrl = "https://icons8.com";
const icons8Email = process.env.ICONS8_EMAIL;
const icons8Password = process.env.ICONS8_PASSWORD;

const api = require("./api");

const login = async browser => {
  const spinner = ora("Logging in").start();

  const page = await browser.newPage();
  await page.goto(icons8BaseUrl);

  await page.click(".login");

  const form = await page.$(".login-form form");
  const emailInput = await form.$('input[name="email"]');
  const passwordInput = await form.$('input[name="password"]');
  const formSubmitButton = await form.$(".submit-button");

  await emailInput.focus();
  await emailInput.type(icons8Email);
  await passwordInput.type(icons8Password);
  await formSubmitButton.click();
  await api.waitForLogin(page);

  await page.close();

  spinner.succeed();
};

const getStyles = async browser => {
  const spinner = ora("Loading styles").start();

  const page = await browser.newPage();
  await page.goto(`${icons8BaseUrl}/icons`);

  await page.click(".expand");

  const packElements = await page.$$(".platform");
  const packs = await Promise.all(
    packElements.map(async packElement => {
      const hrefHandle = await packElement.getProperty("href");
      const href = await hrefHandle.jsonValue();
      const name = href.replace(/.+\//g, "");
      return { name, href };
    })
  );

  await page.close();

  spinner.succeed();

  return packs;
};

const addIconsToCollection = async page => {
  const icons = await page.$$(".to-collection");

  for (const icon of icons) {
    const isSelected = Boolean(await icon.$(".basket"));
    if (!isSelected) {
      await icon.click();
      await api.waitForAddToCollection(page);
    }
  }

  await page.goBack();
};

const changeCollectionName = async (page, name, newName) => {
  await page.click(".collection-toolbar .wrap-dots");
  await page.waitForSelector(".app-popup-content .action-list-item");
  const actionItems = await page.$$(".app-popup-content .action-list-item");
  await actionItems[0].click();
  await page.type(".collection-toolbar .title", newName);
  await page.keyboard.press("Enter");
};

const downloadCollection = async (page, style, category) => {
  const collectionName = `${style.name}-${category}-${nanoid()}`;
  const downloadPath = path.join(__dirname, "downloads");
  await fs.mkdirp(downloadPath);

  await page._client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath
  });

  await selectCollection(page, "Favorites");
  await changeCollectionName(page, "Favorites", collectionName);
  await page.click(".download-collection .button");
  await page.click(`.formats div[keys="svg"]`);
  await page.click(".is-collection-button .button");

  while (
    !(await fs.pathExists(`${downloadPath}/${collectionName}.zip`)) ||
    (await fs.pathExists(`${downloadPath}/${collectionName}.zip.crdownload`))
  ) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const styleFolderPath = path.join(__dirname, "downloads", style.name);
  await fs.mkdirp(styleFolderPath);

  await new Promise((resolve, reject) => {
    yauzl.open(
      `${downloadPath}/${collectionName}.zip`,
      { lazyEntries: true },
      (error, zip) => {
        if (error) {
          reject(error);
        }
        zip.readEntry();

        zip.on("entry", entry => {
          const ws = new fs.createWriteStream(
            `${styleFolderPath}/${entry.fileName}`
          );

          zip.openReadStream(entry, (error, stream) => {
            if (error) {
              reject(error);
            }
            stream.on("end", () => {
              zip.readEntry();
            });
            stream.pipe(ws);
          });
        });

        zip.on("end", () => {
          resolve();
        });
      }
    );
  });

  await fs.remove(`${downloadPath}/${collectionName}.zip`);

  await page.click(".close-collection");
  await page.waitFor(1000);
};

const selectCategory = async (page, name) => {
  const categoryElements = await page.$$(".preview-grid a");
  const categories = await Promise.all(
    categoryElements.map(async categoryElement => {
      const titleElement = await categoryElement.$(".preview-grid-title");
      const titleHandle = await titleElement.getProperty("innerText");
      const title = await titleHandle.jsonValue();
      return { element: categoryElement, title };
    })
  );
  const category = categories.find(({ title }) => title === name);

  if (category) {
    return category.element;
  } else {
    throw new Error(`category with name "${name}" not found`);
  }
};

const downloadStyle = async (
  browser,
  style,
  styleIndex,
  styleLength,
  spinner
) => {
  const page = await browser.newPage();
  await page.goto(style.href);
  await api.waitForLoadCollections(page);

  const categoryElements = await page.$$(".preview-grid a");
  const categoryNames = await Promise.all(
    categoryElements.map(async e => {
      const titleElement = await e.$(".preview-grid-title");
      const titleHandle = await titleElement.getProperty("innerText");
      return titleHandle.jsonValue();
    })
  );

  const getIconContainerHeight = () =>
    page.evaluate(
      `document.querySelector('.app-page .simplebar-scroll-content').scrollHeight`
    );
  const scrollTo = (x, y) =>
    page.evaluate(
      `document.querySelector('.app-page .simplebar-scroll-content').scrollTo(${x}, ${y})`
    );

  let index = 1;
  for (const category of categoryNames) {
    spinner.prefixText = `[style ${styleIndex}/${styleLength}: ${
      style.name
    }, category ${index}/${categoryNames.length}: ${category}]`;
    spinner.text = "Purging collection";

    await purgeIconsFromFavorites(page);
    await selectCollection(page, "Favorites");
    await page.click(".close-collection");

    spinner.text = "Preparing container";

    const categoryElement = await selectCategory(page, category);
    await categoryElement.click();
    await api.waitForLoadIcons(page);
    await page.waitForSelector(".pack-page");

    let height = await getIconContainerHeight();
    let previousHeight = 0;
    while (height > previousHeight) {
      await scrollTo(0, height);
      previousHeight = height;
      await page.waitFor(2000);
      height = await getIconContainerHeight();
    }

    spinner.text = "Selecting icons";

    await addIconsToCollection(page);
    await page.waitForSelector(".icons-new-page");

    spinner.text = "Downloading icons";

    await downloadCollection(page, style, category);

    index++;
  }
};

const selectCollection = async (page, name) => {
  await page.click(".collections .view-all");
  await page.waitFor(1000);
  const collectionElements = await page.$$(".collections .collection");
  const collections = await Promise.all(
    collectionElements.map(async collectionElement => {
      const titleElement = await collectionElement.$(".title");
      const titleHandle = await titleElement.getProperty("innerText");
      const title = await titleHandle.jsonValue();
      return { element: collectionElement, title };
    })
  );
  const collection = collections.find(({ title }) => title === name);

  if (collection) {
    await collection.element.click();
  } else {
    throw new Error(`collection with name "${name}" not found`);
  }
};

const purgeIconsFromFavorites = async page => {
  await selectCollection(page, "Favorites");
  const iconRemoveButtons = await page.$$(".collection-sidebar .remove");
  for (const iconRemoveButton of iconRemoveButtons) {
    await iconRemoveButton.click();
    await page.click(".remove-icon-from-collection-modal .button");
    await api.waitForDeleteFromCollection(page);
  }
  await page.click(".close-collection");
  await page.waitFor(1000);
};

(async () => {
  const browser = await puppetter.launch({
    defaultViewport: {
      width: 1440,
      height: 768
    }
  });

  await login(browser);

  await fs.emptyDir(path.join(__dirname, "downloads"));

  const styles = await getStyles(browser);

  let index = 1;
  for (const style of styles) {
    const spinner = ora(`Downloading "${style.name}" pack`).start();
    await downloadStyle(browser, style, index, styles.length, spinner);
    spinner.succeed();
    index++;
  }

  await browser.close();
})();
