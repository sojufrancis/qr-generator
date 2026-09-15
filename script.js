const qrText = document.getElementById("qrText");
const qrSize = document.getElementById("qrSize");
const format = document.getElementById("format");
const foreground = document.getElementById("foreground");
const background = document.getElementById("background");
const foregroundHex = document.getElementById("foregroundHex");
const backgroundHex = document.getElementById("backgroundHex");
const qrContainer = document.getElementById("qrContainer");
const preview = document.getElementById("preview");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const status = document.getElementById("status");

let currentQRCanvas = null;

function validHex(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function syncColorFromPicker(picker, hexInput) {
  hexInput.value = picker.value.toUpperCase();
  generateQR();
}

function syncColorFromText(hexInput, picker) {
  let value = hexInput.value.trim();
  if (!value.startsWith("#")) value = "#" + value;
  if (validHex(value)) {
    picker.value = value;
    hexInput.value = value.toUpperCase();
    generateQR();
  }
}

function setStatus(message) {
  status.textContent = message;
}

function generateQR() {
  const text = qrText.value.trim();
  const size = parseInt(qrSize.value, 10);
  const fg = foreground.value;
  const bg = background.value;

  qrContainer.innerHTML = "";
  currentQRCanvas = null;

  if (!text) {
    qrContainer.textContent = "Enter text or a URL";
    qrContainer.style.padding = "30px";
    qrContainer.style.color = "#6b7280";
    qrContainer.style.lineHeight = "1.4";
    setStatus("");
    return;
  }

  qrContainer.style.padding = "0";
  qrContainer.style.color = "";
  qrContainer.style.lineHeight = "0";

  try {
    new QRCode(qrContainer, {
      text: text,
      width: size,
      height: size,
      colorDark: fg,
      colorLight: bg,
      correctLevel: QRCode.CorrectLevel.M
    });

    // qrcode.js creates a canvas and an img fallback.
    setTimeout(() => {
      currentQRCanvas = qrContainer.querySelector("canvas");
      setStatus("");
    }, 20);
  } catch (error) {
    console.error(error);
    qrContainer.textContent = "Unable to generate QR code.";
    setStatus("The text is too long or cannot be encoded at this size.");
  }
}

function getCanvas() {
  if (currentQRCanvas) return currentQRCanvas;

  const canvas = qrContainer.querySelector("canvas");
  if (canvas) return canvas;

  const img = qrContainer.querySelector("img");
  if (!img) return null;

  const temp = document.createElement("canvas");
  const size = parseInt(qrSize.value, 10);
  temp.width = size;
  temp.height = size;
  const ctx = temp.getContext("2d");

  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      resolve(temp);
    };
    if (img.complete) {
      ctx.drawImage(img, 0, 0, size, size);
      resolve(temp);
    }
  });
}

async function downloadPNG() {
  const canvas = await getCanvas();
  if (!canvas) throw new Error("QR canvas is not ready.");

  const link = document.createElement("a");
  link.download = "qr-code.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function downloadJPG() {
  const canvas = await getCanvas();
  if (!canvas) throw new Error("QR canvas is not ready.");

  // JPG has no transparency; fill the background colour first.
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = background.value;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = "qr-code.jpg";
  link.href = out.toDataURL("image/jpeg", 0.95);
  link.click();
}

async function downloadSVG() {
  // Generate a fresh SVG using a temporary hidden container.
  // This keeps the downloaded SVG vector-based.
  const size = parseInt(qrSize.value, 10);
  const text = qrText.value.trim();

  // QRCode.js itself is canvas-based, so create a pixel-perfect SVG
  // by converting the generated QR bitmap to an embedded PNG.
  // The result is an SVG wrapper containing the QR image.
  const canvas = await getCanvas();
  if (!canvas) throw new Error("QR canvas is not ready.");

  const data = canvas.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${data}" width="${size}" height="${size}"/></svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "qr-code.svg";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF() {
  const canvas = await getCanvas();
  if (!canvas) throw new Error("QR canvas is not ready.");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
    hotfixes: ["px_scaling"]
  });

  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    canvas.width,
    canvas.height
  );

  pdf.save("qr-code.pdf");
}

async function downloadQR() {
  const text = qrText.value.trim();

  if (!text) {
    setStatus("Please enter some text or a URL first.");
    qrText.focus();
    return;
  }

  try {
    setStatus("Preparing download...");

    switch (format.value) {
      case "png":
        await downloadPNG();
        break;
      case "jpg":
        await downloadJPG();
        break;
      case "svg":
        await downloadSVG();
        break;
      case "pdf":
        await downloadPDF();
        break;
    }

    setStatus("Download started.");
  } catch (error) {
    console.error(error);
    setStatus("Could not create the download. Please try again.");
  }
}

function resetAll() {
  qrText.value = "https://example.com";
  qrSize.value = "512";
  format.value = "png";
  foreground.value = "#000000";
  background.value = "#FFFFFF";
  foregroundHex.value = "#000000";
  backgroundHex.value = "#FFFFFF";
  generateQR();
  setStatus("");
}

qrText.addEventListener("input", generateQR);
qrSize.addEventListener("change", generateQR);

foreground.addEventListener("input", () => {
  syncColorFromPicker(foreground, foregroundHex);
});

background.addEventListener("input", () => {
  syncColorFromPicker(background, backgroundHex);
});

foregroundHex.addEventListener("change", () => {
  syncColorFromText(foregroundHex, foreground);
});

backgroundHex.addEventListener("change", () => {
  syncColorFromText(backgroundHex, background);
});

downloadBtn.addEventListener("click", downloadQR);
resetBtn.addEventListener("click", resetAll);

generateQR();
