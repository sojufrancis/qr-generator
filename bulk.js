let rows = [];
let heads = [];
let made = [];

const $ = id => document.getElementById(id);
const file = $("file");

function opts(el) {
  el.innerHTML = "";
  heads.forEach((h, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = h;
    el.appendChild(o);
  });
}

function clean(v, fallback) {
  v = String(v || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .slice(0, 100);

  return v || fallback;
}

/* Simple CSV parser supporting quoted values and commas inside quotes. */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");

  const result = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(v => String(v).trim() !== "")) result.push(row);
      row = [];
      value = "";
    } else {
      value += ch;
    }
  }

  if (value !== "" || row.length) {
    row.push(value);
    if (row.some(v => String(v).trim() !== "")) result.push(row);
  }

  return result;
}

function load(matrix) {
  if (!matrix.length) throw Error("File is empty.");

  const width = Math.max(...matrix.map(r => r.length));

  matrix = matrix.map(r => {
    const a = r.slice();
    while (a.length < width) a.push("");
    return a;
  });

  heads = matrix[0].map((x, i) =>
    String(x || "").trim() || "Column " + (i + 1)
  );

  rows = matrix
    .slice(1)
    .filter(r => r.some(x => String(x || "").trim() !== ""));

  if (!rows.length) throw Error("No data rows found.");

  opts($("contentCol"));
  opts($("nameCol"));
  opts($("capCol"));

  const ci = heads.findIndex(x => /url|link|text|content|data/i.test(x));
  const ni = heads.findIndex(x => /name|file|label|id|code/i.test(x));

  $("contentCol").value = ci < 0 ? 0 : ci;
  $("nameCol").value = ni < 0 ? Math.min(1, heads.length - 1) : ni;
  $("capCol").value = ni < 0 ? Math.min(1, heads.length - 1) : ni;

  $("opts").classList.remove("hidden");
  $("status").textContent = "Loaded " + rows.length + " row(s).";
}

file.onchange = async () => {
  try {
    const g = file.files[0];
    if (!g) return;

    const e = g.name.toLowerCase().split(".").pop();

    if (e === "csv") {
      load(parseCSV(await g.text()));

    } else if (e === "xlsx" || e === "xls") {
      const w = XLSX.read(await g.arrayBuffer(), { type: "array" });
      const sheet = w.Sheets[w.SheetNames[0]];
      load(XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: ""
      }));

    } else if (e === "odt") {
      const z = await JSZip.loadAsync(await g.arrayBuffer());
      const entry = z.file("content.xml");

      if (!entry) throw Error("Invalid ODT file.");

      const xml = await entry.async("string");
      const d = new DOMParser().parseFromString(xml, "application/xml");

      const tr = d.getElementsByTagNameNS(
        "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
        "table-row"
      );

      const m = [];

      for (const r of tr) {
        const a = [];
        const cells = r.getElementsByTagNameNS(
          "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
          "table-cell"
        );

        for (const c of cells) {
          a.push(c.textContent.trim());
        }

        if (a.length) m.push(a);
      }

      load(m);

    } else {
      throw Error("Please upload CSV, Excel or ODT.");
    }

  } catch (e) {
    $("status").textContent = "Error: " + e.message;
    console.error(e);
  }
};

function make(text, size, fg, bg) {
  return new Promise((res, rej) => {
    const h = document.createElement("div");
    h.style.position = "fixed";
    h.style.left = "-10000px";
    document.body.appendChild(h);

    try {
      new QRCode(h, {
        text,
        width: size,
        height: size,
        colorDark: fg,
        colorLight: bg,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      h.remove();
      rej(e);
      return;
    }

    setTimeout(() => {
      const c = h.querySelector("canvas");

      if (!c) {
        h.remove();
        rej(new Error("QR code could not be created."));
        return;
      }

      const o = document.createElement("canvas");
      o.width = o.height = size;

      const x = o.getContext("2d");
      x.fillStyle = bg;
      x.fillRect(0, 0, size, size);
      x.drawImage(c, 0, 0, size, size);

      h.remove();
      res(o);
    }, 50);
  });
}

function output(c, label, bg, fg) {
  const extra = label ? Math.max(45, c.width * 0.12) : 0;

  const o = document.createElement("canvas");
  o.width = c.width;
  o.height = c.height + extra;

  const x = o.getContext("2d");
  x.fillStyle = bg;
  x.fillRect(0, 0, o.width, o.height);
  x.drawImage(c, 0, 0);

  if (label) {
    x.fillStyle = fg;
    x.font = "bold " + Math.max(14, c.width * 0.045) + "px Arial";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(label, c.width / 2, c.height + extra / 2, c.width - 20);
  }

  return o;
}

async function generate() {
  made = [];
  $("grid").innerHTML = "";
  $("results").classList.remove("hidden");

  const ci = +$("contentCol").value;
  const ni = +$("nameCol").value;
  const capOn = $("bcapOn").checked;
  const capi = +$("capCol").value;
  const n = rows.length;
  const size = +$("bsize").value;
  const fg = $("bfg").value;
  const bg = $("bbg").value;
  const fmt = $("bfmt").value;

  for (let i = 0; i < n; i++) {
    const text = String(rows[i][ci] || "").trim();

    if (!text) continue;

    $("status").textContent =
      "Generating " + (i + 1) + " of " + n + "...";

    const label = capOn
      ? String(rows[i][capi] || "").trim()
      : "";

    const base = await make(text, size, fg, bg);
    const c = output(base, label, bg, fg);

    const name = clean(rows[i][ni], "qr-" + (i + 1));

    const d = document.createElement("div");
    d.className = "result";
    d.appendChild(c);

    if (label) {
      const q = document.createElement("div");
      q.className = "label";
      q.textContent = label;
      d.appendChild(q);
    }

    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = name + "." + fmt.toLowerCase();
    d.appendChild(nm);

    $("grid").appendChild(d);
    made.push({ name, canvas: c });
  }

  $("count").textContent = made.length;
  $("zip").disabled = !made.length;

  $("status").textContent =
    "Generated " + made.length + " QR code(s).";
}

async function downloadAll() {
  const z = new JSZip();
  const fmt = $("bfmt").value;

  for (const q of made) {
    if (fmt === "PNG") {
      z.file(
        q.name + ".png",
        q.canvas.toDataURL("image/png").split(",")[1],
        { base64: true }
      );

    } else if (fmt === "JPG") {
      z.file(
        q.name + ".jpg",
        q.canvas.toDataURL("image/jpeg", 0.95).split(",")[1],
        { base64: true }
      );

    } else if (fmt === "SVG") {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        q.canvas.width +
        '" height="' +
        q.canvas.height +
        '">' +
        '<image href="' +
        q.canvas.toDataURL("image/png") +
        '" width="100%" height="100%"/>' +
        "</svg>";

      z.file(q.name + ".svg", svg);

    } else {
      const p = new jspdf.jsPDF({
        unit: "px",
        format: [q.canvas.width, q.canvas.height],
        hotfixes: ["px_scaling"]
      });

      p.addImage(
        q.canvas.toDataURL("image/png"),
        "PNG",
        0,
        0,
        q.canvas.width,
        q.canvas.height
      );

      z.file(
        q.name + ".pdf",
        await p.output("arraybuffer")
      );
    }
  }

  const b = await z.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "qr-codes.zip";
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function syncColor(colorId, textId) {
  const color = $(colorId);
  const text = $(textId);

  color.addEventListener("input", () => {
    text.value = color.value.toUpperCase();
  });

  text.addEventListener("change", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value.trim())) {
      color.value = text.value.trim();
    }
  });
}

$("bcapOn").onchange = () => {
  $("capCol").disabled = !$("bcapOn").checked;
};

syncColor("bfg", "bfgh");
syncColor("bbg", "bbgh");

$("generate").onclick = generate;
$("zip").onclick = downloadAll;
