const apiUrl = "https://api-icons.icons8.com/siteApi";

const matchResponse = (url, method) => response => {
  const requestUrl = response.url();
  const requestMethod = response.request().method();

  const matchesUrl = new RegExp(url).test(requestUrl);
  if (method) {
    const matchesMethod = method === requestMethod;
    return matchesUrl && matchesMethod;
  }

  return matchesUrl;
};

const waitForLogin = page => page.waitForResponse(`${apiUrl}/auth/login`);

const waitForLoadCollection = page =>
  page.waitForResponse(
    matchResponse(`^${apiUrl}/icons/collections/.*$`, "GET")
  );

const waitForLoadCollections = page =>
  page.waitForResponse(matchResponse(`^${apiUrl}/icons/collections.*$`, "GET"));

const waitForCreateCollection = page =>
  page.waitForResponse(matchResponse(`${apiUrl}/icons/collections`, "PUT"));

const waitForUpdateCollection = page =>
  page.waitForResponse(
    matchResponse(`${apiUrl}/icons/collections/.*$`, "POST")
  );

const waitForAddToCollection = page =>
  page.waitForResponse(
    matchResponse(`^${apiUrl}/icons/collections/.*/icons$`, "PUT")
  );

const waitForDeleteFromCollection = page =>
  page.waitForResponse(
    matchResponse(`^${apiUrl}/icons/collections/.*/icons/.*$`, "DELETE")
  );

const waitForLoadIcons = page =>
  page.waitForResponse(matchResponse(`^${apiUrl}/icons/packs/demarcation.*$`));

https: module.exports = {
  waitForLogin,
  waitForLoadCollection,
  waitForLoadCollections,
  waitForCreateCollection,
  waitForUpdateCollection,
  waitForAddToCollection,
  waitForDeleteFromCollection,
  waitForLoadIcons
};
