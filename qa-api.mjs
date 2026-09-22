export default async function run(page) {
  const initial = await page
    .locator(".preview img")
    .first()
    .evaluate((image) => ({
      src: image.currentSrc,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
  await page.getByText("ເພີ່ມຮູບໂລໂກ້", { exact: true }).click();
  await page.locator(".sprite-logo").nth(1).click();
  await page.getByRole("button", { name: "Create QR Code" }).click();
  await page.waitForFunction(
    () => {
      const image = document.querySelector(".preview img");
      const src = image && (image.currentSrc || image.getAttribute("src"));
      return (
        !!image &&
        !!src &&
        (src.includes("api.qrcode-monkey.com") ||
          src.startsWith("data:image")) &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
      );
    },
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".preview > .loading-screen")
        ?.classList.contains("active"),
    { timeout: 30000 },
  );
  return {
    initial,
    logo: await page.locator(".logo-preview img").getAttribute("src"),
    generated: await page.locator(".preview img").evaluateAll((images) =>
      images.map((image) => ({
        attr: image.getAttribute("src"),
        ngSrc: image.getAttribute("ng-src"),
        src: image.currentSrc,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    ),
  };
}
