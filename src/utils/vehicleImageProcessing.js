const getBackgroundRemovalPublicPath = () => {
  const appBase = import.meta.env.BASE_URL || "/";
  const normalizedBase = appBase.endsWith("/") ? appBase : `${appBase}/`;
  const assetPath = `${normalizedBase}background-removal/`;

  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(assetPath, window.location.origin).href;
  }

  return assetPath;
};

const createBackgroundRemovalConfig = () => {
  return {
    publicPath: getBackgroundRemovalPublicPath(),
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 0.92,
    },
    debug: false,
  };
};

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read image."));

    reader.readAsDataURL(file);
  });

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error("Could not convert image."));

    reader.readAsDataURL(blob);
  });

const getRemoveBackground = async () => {
  const mod = await import("@imgly/background-removal");
  const removeBackground = mod.default || mod.removeBackground;

  if (typeof removeBackground !== "function") {
    throw new Error("Background removal package did not expose a remove function.");
  }

  return { mod, removeBackground };
};

export async function processVehicleImage(
  file,
  { removeBackground = true } = {},
) {
  if (!file) {
    throw new Error("No vehicle image file was provided.");
  }

  if (!file.type?.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (!removeBackground) {
    return {
      dataUrl: await readFileAsDataUrl(file),
      backgroundRemoved: false,
      usedOriginal: true,
      warning: null,
    };
  }

  try {
    const { removeBackground: removeVehicleBackground } =
      await getRemoveBackground();
    const resultBlob = await removeVehicleBackground(
      file,
      createBackgroundRemovalConfig(),
    );
    const resultDataUrl = await blobToDataUrl(resultBlob);

    return {
      dataUrl: resultDataUrl,
      backgroundRemoved: true,
      usedOriginal: false,
      warning: null,
    };
  } catch (error) {
    console.warn(
      "[Vehicle Image] Background removal failed. Falling back to original image.",
      error,
    );

    return {
      dataUrl: await readFileAsDataUrl(file),
      backgroundRemoved: false,
      usedOriginal: true,
      warning:
        "Background removal failed, so the original image was saved instead. Check model assets/offline setup.",
    };
  }
}

export async function preloadVehicleImageProcessing() {
  try {
    const { mod } = await getRemoveBackground();

    if (typeof mod.preload === "function") {
      await mod.preload(createBackgroundRemovalConfig());
    }

    return true;
  } catch (error) {
    console.warn("[Vehicle Image] Background removal preload failed.", error);
    return false;
  }
}
