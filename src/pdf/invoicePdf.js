import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BASE_URL = import.meta.env?.BASE_URL || "/";
const LOGO_URL = `${BASE_URL}assets/levince-logo.png`;
const ZERO_DECIMAL_CURRENCIES = new Set(["TWD", "JPY", "KRW", "IDR", "VND"]);

const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);
const tableRed = rgb(0.6163553, 0.1158337, 0.1298752);
const receiptRed = rgb(0.6953332, 0.1536742, 0.1277461);
const lineGrey = rgb(0.625, 0.6249999, 0.6249999);
const headerDividerGrey = rgb(0.7762491, 0.8099242, 0.8313821);
const footerGrey = rgb(0.301773, 0.3018176, 0.3017576);
const emailColor = black;
const TABLE_ROWS_PER_PAGE = 19;
const TABLE_DESCRIPTION_MAX_WIDTH = 195;
const TABLE_TEXT_SIZE = 10;
const TABLE_ROW_HEIGHT = 20.75;
const TABLE_DASHED_BOUNDARIES = 17;
const REMARK_LINE_HEIGHT = 12;

function newItemId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanFilename(value) {
  return String(value || "invoice")
    .replace(/[^a-z0-9 _.-]/gi, "")
    .trim()
    .replace(/\s+/g, "_");
}

export function getCurrentInvoiceDate() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function parseAmount(value) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatMoney(value, currency) {
  const amount = parseAmount(value);
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(String(currency || "").trim().toUpperCase()) ? 0 : 2;
  const formatted = Math.abs(amount).toLocaleString("en-MY", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return amount < 0 ? `(${formatted})` : formatted;
}

function fitTextToWidth(text, maxWidth, font, size, options = {}) {
  const minSize = options.minSize ?? 8;
  const suffix = options.suffix ?? "...";
  let fontSize = size;
  const value = String(text || "");

  while (fontSize > minSize && font.widthOfTextAtSize(value, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }

  if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) {
    return { text: value, size: fontSize, width: font.widthOfTextAtSize(value, fontSize) };
  }

  let trimmed = value;
  while (trimmed && font.widthOfTextAtSize(`${trimmed}${suffix}`, fontSize) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  const fitted = trimmed ? `${trimmed.trimEnd()}${suffix}` : "";
  return { text: fitted, size: fontSize, width: font.widthOfTextAtSize(fitted, fontSize) };
}

function splitLongWordToWidth(word, maxWidth, font, size) {
  const chunks = [];
  let chunk = "";

  String(word || "")
    .split("")
    .forEach((character) => {
      const nextChunk = `${chunk}${character}`;
      if (!chunk || font.widthOfTextAtSize(nextChunk, size) <= maxWidth) {
        chunk = nextChunk;
        return;
      }

      chunks.push(chunk);
      chunk = character;
    });

  if (chunk) chunks.push(chunk);
  return chunks;
}

function splitTextToWidth(text, maxWidth, font, size) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      currentLine = word;
      return;
    }

    const chunks = splitLongWordToWidth(word, maxWidth, font, size);
    lines.push(...chunks.slice(0, -1));
    currentLine = chunks[chunks.length - 1] || "";
  });

  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [""];
}

function drawBoundedText(page, text, x, y, maxWidth, font, size, options = {}) {
  const color = options.color ?? black;
  const fitted = fitTextToWidth(text, maxWidth, font, size, options);
  if (!fitted.text) return fitted;
  page.drawText(fitted.text, { x, y, size: fitted.size, font, color });
  return fitted;
}

function drawRightBoundedText(page, text, leftX, rightX, y, font, size, options = {}) {
  const color = options.color ?? black;
  const maxWidth = Math.max(0, rightX - leftX);
  const fitted = fitTextToWidth(text, maxWidth, font, size, options);
  if (!fitted.text) return fitted;
  page.drawText(fitted.text, {
    x: rightX - fitted.width,
    y,
    size: fitted.size,
    font,
    color,
  });
  return fitted;
}

function drawCenteredBoundedText(page, text, leftX, rightX, y, font, size, options = {}) {
  const color = options.color ?? black;
  const maxWidth = Math.max(0, rightX - leftX);
  const fitted = fitTextToWidth(text, maxWidth, font, size, options);
  if (!fitted.text) return fitted;
  page.drawText(fitted.text, {
    x: leftX + (maxWidth - fitted.width) / 2,
    y,
    size: fitted.size,
    font,
    color,
  });
  return fitted;
}

function drawCurrencyAmount(page, amount, currency, y, font, currencyX, amountRightX, options = {}) {
  const parsedAmount = parseAmount(amount);
  const fontSize = options.size ?? 10;
  const minSize = options.minSize ?? 7;

  if (parsedAmount < 0) {
    drawRightBoundedText(page, `${currency}${formatMoney(parsedAmount, currency)}`, currencyX, amountRightX, y, font, fontSize, {
      minSize,
    });
    return;
  }

  drawBoundedText(page, currency, currencyX, y, 29, font, fontSize, { minSize });
  drawRightBoundedText(page, formatMoney(parsedAmount, currency), currencyX + 28, amountRightX, y, font, fontSize, {
    minSize,
  });
}

export function defaultInvoiceData() {
  return {
    companyName: "",
    customerName: "Melanie Chalil",
    email: "melanie.chalil@gmail.com",
    phone: "012-223 6976",
    invoiceDate: getCurrentInvoiceDate(),
    documentLabel: "INVOICE",
    invoiceTitle: "LeVince Chauffeur Service",
    receiptNumber: "104247",
    currency: "RM",
    serviceGroups: [
      createServiceGroup({
        heading: "Private Chauffeur Service",
        dates: [
          createServiceDate({
            date: "10th May",
            lines: [createServiceLine({ description: "Airport Transfer", qty: "1", amount: "140.00" })],
          }),
          createServiceDate({
            date: "14th May",
            lines: [createServiceLine({ description: "Airport Transfer", qty: "1", amount: "140.00" })],
          }),
        ],
      }),
    ],
  };
}

export function createEmptyInvoiceData() {
  return {
    companyName: "",
    customerName: "",
    email: "",
    phone: "",
    invoiceDate: getCurrentInvoiceDate(),
    documentLabel: "INVOICE",
    invoiceTitle: "LeVince Chauffeur Service",
    receiptNumber: "",
    currency: "RM",
    serviceGroups: [createServiceGroup()],
  };
}

export function createServiceLine(values = {}) {
  return {
    id: values.id || newItemId(),
    description: values.description || "",
    qty: values.qty ?? "",
    amount: values.amount || "",
    isNote: Boolean(values.isNote),
    isRemark: Boolean(values.isRemark),
    isAdjustment: Boolean(values.isAdjustment),
  };
}

export function createServiceDate(values = {}) {
  const lines =
    Array.isArray(values.lines) && values.lines.length
      ? values.lines.map((line) => createServiceLine(line))
      : [createServiceLine(values)];

  return {
    id: values.id || newItemId(),
    date: values.date || values.serviceDate || "",
    lines,
  };
}

export function createServiceGroup(values = {}) {
  const dates =
    Array.isArray(values.dates) && values.dates.length
      ? values.dates.map((dateGroup) => createServiceDate(dateGroup))
      : [createServiceDate(values)];

  return {
    id: values.id || newItemId(),
    heading: values.heading || values.serviceHeading || "Private Chauffeur Service",
    dates,
  };
}

function normaliseServiceGroups(data = {}) {
  if (Array.isArray(data.serviceGroups) && data.serviceGroups.length) {
    return data.serviceGroups.map((group) => createServiceGroup(group));
  }

  if (Array.isArray(data.items) && data.items.length) {
    const dates = [];
    data.items.forEach((item, index) => {
      const date = item.serviceDate || (index === 0 ? data.serviceDate || "" : "");
      let targetDate = dates[dates.length - 1];
      if (!targetDate || targetDate.date !== date) {
        targetDate = { id: newItemId(), date, lines: [] };
        dates.push(targetDate);
      }
      targetDate.lines.push(createServiceLine(item));
    });

    return [
      createServiceGroup({
        heading: data.serviceHeading || "Private Chauffeur Service",
        dates,
      }),
    ];
  }

  return [createServiceGroup({ heading: data.serviceHeading || "Private Chauffeur Service" })];
}

export function normaliseInvoiceData(data = {}) {
  const { items, serviceDate, serviceHeading, serviceGroups, ...rest } = data || {};
  return {
    ...createEmptyInvoiceData(),
    ...rest,
    serviceGroups: normaliseServiceGroups({ ...data, items, serviceDate, serviceHeading, serviceGroups }),
  };
}

function buildTableRows(serviceGroups, font) {
  return serviceGroups.flatMap((group) => {
    const rows = [];
    const heading = String(group.heading || "").trim();
    if (heading) rows.push({ type: "heading", text: heading });

    group.dates.forEach((dateGroup, dateIndex) => {
      const date = String(dateGroup.date || "").trim();
      if (dateIndex > 0) rows.push({ type: "spacer" });
      if (date) rows.push({ type: "date", text: date });
      let previousLine = null;
      let lineIndex = 0;
      while (lineIndex < dateGroup.lines.length) {
        const line = dateGroup.lines[lineIndex];
        if (isRemarkLine(line)) {
          const remarkLines = [];

          while (lineIndex < dateGroup.lines.length && isRemarkLine(dateGroup.lines[lineIndex])) {
            const noteLine = dateGroup.lines[lineIndex];
            const descriptionLines = splitTextToWidth(
              noteLine.description,
              TABLE_DESCRIPTION_MAX_WIDTH,
              font,
              TABLE_TEXT_SIZE,
            );
            remarkLines.push(...descriptionLines);
            previousLine = noteLine;
            lineIndex += 1;
          }

          if (remarkLines.length) {
            if (previousLine && rows.length && rows[rows.length - 1]?.type !== "spacer") {
              const rowBeforeRemark = rows[rows.length - 1];
              if (rowBeforeRemark.type === "line" && !isDescriptionOnlyLine(rowBeforeRemark.line)) {
                rows.push({ type: "spacer" });
              }
            }

            rows.push({
              type: "remark",
              lines: remarkLines,
              slots: Math.max(1, Math.ceil((remarkLines.length * REMARK_LINE_HEIGHT + 4) / TABLE_ROW_HEIGHT)),
            });
          }
          continue;
        }

        if (isDescriptionOnlyLine(line) && previousLine && !isDescriptionOnlyLine(previousLine)) {
          rows.push({ type: "spacer" });
        }

        const descriptionLines = splitTextToWidth(
          line.description,
          TABLE_DESCRIPTION_MAX_WIDTH,
          font,
          TABLE_TEXT_SIZE,
        );
        descriptionLines.forEach((description, lineIndex) => {
          rows.push({
            type: "line",
            line,
            text: description,
            showValues: lineIndex === 0,
          });
        });
        previousLine = line;
        lineIndex += 1;
      }
    });

    return rows;
  });
}

function getRowSlots(row) {
  return row?.slots || 1;
}

function getRowsSlotCount(rows) {
  return rows.reduce((sum, row) => sum + getRowSlots(row), 0);
}

function paginateRows(rows) {
  if (!rows.length) return [[]];
  const pages = [];
  let currentPage = [];
  let currentPageSlots = 0;
  let index = 0;

  function currentPageLimit() {
    return pages.length === 0 ? TABLE_ROWS_PER_PAGE : TABLE_ROWS_PER_PAGE - 1;
  }

  function flushPage() {
    if (currentPage.length) {
      pages.push(currentPage);
      currentPage = [];
      currentPageSlots = 0;
    }
  }

  function pushRow(row) {
    const limit = currentPageLimit();
    const rowSlots = getRowSlots(row);

    if (row.type === "spacer" && currentPageSlots > limit - 3) {
      flushPage();
      return;
    }

    if (row.type === "date" && currentPageSlots > limit - 2) {
      flushPage();
    }

    if (currentPageSlots > 0 && currentPageSlots + rowSlots > limit) {
      flushPage();
    }

    if (row.type === "spacer" && currentPageSlots === 0) return;
    currentPage.push(row);
    currentPageSlots += rowSlots;
  }

  while (index < rows.length) {
    const row = rows[index];
    const isDateBlockStart =
      row.type === "date" || (row.type === "spacer" && rows[index + 1]?.type === "date");

    if (isDateBlockStart) {
      let endIndex = index + 1;
      while (endIndex < rows.length && rows[endIndex].type !== "spacer") endIndex += 1;
      const block = rows.slice(index, endIndex);
      const blockLength =
        block[0]?.type === "spacer" && currentPageSlots === 0
          ? getRowsSlotCount(block.slice(1))
          : getRowsSlotCount(block);
      const limit = currentPageLimit();

      if (
        currentPageSlots > 0 &&
        blockLength <= limit &&
        currentPageSlots + blockLength > limit
      ) {
        flushPage();
      }

      block.forEach(pushRow);
      index = endIndex;
      continue;
    }

    pushRow(row);
    index += 1;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

export function getInvoiceSubtotal(data) {
  return normaliseInvoiceData(data).serviceGroups.reduce(
    (groupSum, group) =>
      groupSum +
      group.dates.reduce(
        (dateSum, dateGroup) =>
          dateSum + dateGroup.lines.reduce((lineSum, line) => lineSum + parseAmount(line.amount), 0),
        0,
      ),
    0,
  );
}

function isDescriptionOnlyLine(line) {
  return Boolean(line.isNote) || Boolean(line.isRemark) || !String(line.amount || "").trim();
}

function isRemarkLine(line) {
  return Boolean(line.isRemark) || Boolean(line.isNote);
}

function isAdjustmentLine(line) {
  return Boolean(line.isAdjustment);
}

export function validateInvoice(data) {
  const invoiceData = normaliseInvoiceData(data);
  const missing = [];
  if (!String(invoiceData.customerName || "").trim()) missing.push("Customer name");
  if (!String(invoiceData.invoiceDate || "").trim()) missing.push("Date");
  if (!String(invoiceData.invoiceTitle || "").trim()) missing.push("Invoice title");
  if (!String(invoiceData.receiptNumber || "").trim()) missing.push("Document number");
  if (invoiceData.serviceGroups.some((group) => !String(group.heading || "").trim())) missing.push("Service heading");
  if (
    !invoiceData.serviceGroups.length ||
    invoiceData.serviceGroups.some(
      (group) => !group.dates.length || group.dates.some((dateGroup) => !String(dateGroup.date || "").trim()),
    )
  ) {
    missing.push("Service date");
  }
  if (
    invoiceData.serviceGroups.some((group) =>
      group.dates.some(
        (dateGroup) =>
          !dateGroup.lines.length || dateGroup.lines.some((line) => !String(line.description || "").trim()),
      ),
    )
  ) {
    missing.push("Description");
  }
  if (
    invoiceData.serviceGroups.some((group) =>
      group.dates.some((dateGroup) =>
        dateGroup.lines.some(
          (line) => !isDescriptionOnlyLine(line) && !isAdjustmentLine(line) && !String(line.qty || "").trim(),
        ),
      ),
    )
  ) {
    missing.push("Qty");
  }
  if (
    invoiceData.serviceGroups.some((group) =>
      group.dates.some((dateGroup) =>
        dateGroup.lines.some((line) => {
          if (isDescriptionOnlyLine(line)) return false;
          if (isAdjustmentLine(line)) return parseAmount(line.amount) === 0;
          return parseAmount(line.amount) <= 0;
        }),
      ),
    )
  ) {
    missing.push("Amount");
  }
  return [...new Set(missing)];
}

export async function generateInvoicePdf(data) {
  const invoiceData = normaliseInvoiceData(data);
  const invoiceSubtotal = getInvoiceSubtotal(invoiceData);

  const logoBytes = await fetch(LOGO_URL).then((response) => {
    if (!response.ok) throw new Error("Unable to load Levince logo asset.");
    return response.arrayBuffer();
  });

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaLight = helvetica;
  const logo = await pdfDoc.embedPng(logoBytes);
  const tableRows = buildTableRows(invoiceData.serviceGroups, helvetica);
  const pageRows = paginateRows(tableRows);
  const repeatedHeading = String(invoiceData.serviceGroups[0]?.heading || "").trim();

  function drawInvoicePage(page, rowsForPage, subtotal, total, includeTotal) {
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: white });
  page.drawImage(logo, {
    x: 242,
    y: 753,
    width: 111,
    height: 60,
  });

  const headerX = 211.36092;
  const headerMaxWidth = 325;
  const labelX = 60.69292;
  const colonX = 204.69292;
  const headerRows = [
    ["COMPANY NAME", "companyName", 727.2937],
    ["CUSTOMER NAME", "customerName", 708.3937],
    ["EMAIL", "email", 689.4937],
    ["PHONE", "phone", 670.5937],
    ["DATE", "invoiceDate", 651.6937],
    ["INVOICE TITLE", "invoiceTitle", 632.7937],
  ];

  for (const [label, field, y] of headerRows) {
    page.drawText(label, { x: labelX, y, size: 12, font: helvetica, color: black });
    page.drawText(":", { x: colonX, y, size: 12, font: helvetica, color: black });
    const value = String(invoiceData[field] || "").trim();
    if (!value) continue;
    if (field === "email") {
      drawBoundedText(page, value, headerX, y, headerMaxWidth, helvetica, 12, {
        color: emailColor,
        minSize: 7,
      });
    } else {
      drawBoundedText(page, value, headerX, y, headerMaxWidth, helvetica, 12, { minSize: 7 });
    }
  }

  drawBoundedText(
    page,
    String(invoiceData.documentLabel || "INVOICE").trim().toUpperCase(),
    56.69292,
    599.9809,
    126,
    helveticaLight,
    15,
    { color: receiptRed, minSize: 8 },
  );
  drawBoundedText(page, String(invoiceData.receiptNumber || "").trim(), 56.69292, 578.4679, 104, helvetica, 15, {
    color: receiptRed,
    minSize: 8,
  });

  const tableHeaderX = 193.1103;
  const tableHeaderY = 594.1902;
  const tableRightX = 538.5871;
  const tableLeftX = 197.2353;
  const descMaxWidth = TABLE_DESCRIPTION_MAX_WIDTH;
  const descDividerX = 395.5421;
  const amountDividerX = 464.3019;
  const currencyX = 468.6769;
  const amountRightX = 534.4619;
  const firstRowY = 580.2609;
  const currency = String(invoiceData.currency || "RM").trim() || "RM";

  page.drawRectangle({
    x: tableHeaderX,
    y: tableHeaderY,
    width: descDividerX - tableHeaderX,
    height: 20.25,
    color: tableRed,
    borderColor: tableRed,
    borderWidth: 0,
  });
  page.drawRectangle({
    x: descDividerX,
    y: tableHeaderY,
    width: amountDividerX - descDividerX,
    height: 20.25,
    color: tableRed,
    borderColor: tableRed,
    borderWidth: 0,
  });
  page.drawRectangle({
    x: amountDividerX,
    y: tableHeaderY,
    width: tableRightX - amountDividerX,
    height: 20.25,
    color: tableRed,
    borderColor: tableRed,
    borderWidth: 0,
  });
  drawCenteredBoundedText(page, "Description", tableHeaderX, descDividerX, 600.6258, helvetica, 10, {
    color: white,
  });
  drawCenteredBoundedText(page, "Qty", descDividerX, amountDividerX, 600.6258, helvetica, 10, {
    color: white,
  });
  drawCenteredBoundedText(page, "Amount", amountDividerX, tableRightX, 600.6258, helvetica, 10, {
    color: white,
  });

  page.drawLine({
    start: { x: descDividerX, y: tableHeaderY + 0.5 },
    end: { x: descDividerX, y: tableHeaderY + 20.75 },
    thickness: 0.25,
    color: headerDividerGrey,
  });
  page.drawLine({
    start: { x: amountDividerX, y: tableHeaderY + 0.5 },
    end: { x: amountDividerX, y: tableHeaderY + 20.75 },
    thickness: 0.25,
    color: headerDividerGrey,
  });

  [descDividerX, amountDividerX].forEach((x) => {
    page.drawLine({
      start: { x, y: 177.5262 },
      end: { x, y: 614.5959 },
      thickness: 0.75,
      color: lineGrey,
      dashArray: [1.5, 1.5],
    });
  });

  const boundarySlots = [];
  let boundarySlotCursor = 0;
  rowsForPage.forEach((row) => {
    boundarySlotCursor += getRowSlots(row);
    if (boundarySlotCursor <= TABLE_DASHED_BOUNDARIES) boundarySlots.push(boundarySlotCursor);
  });
  for (let slot = boundarySlotCursor + 1; slot <= TABLE_DASHED_BOUNDARIES; slot += 1) {
    boundarySlots.push(slot);
  }

  [...new Set(boundarySlots)]
    .sort((a, b) => a - b)
    .forEach((slot) => {
      const y = 573.5959 - (slot - 1) * TABLE_ROW_HEIGHT;
      page.drawLine({
        start: { x: 192.9853, y },
        end: { x: tableRightX, y },
        thickness: 0.75,
        color: lineGrey,
        dashArray: [1.5, 1.5],
      });
    });

  let rowSlotCursor = 0;
  rowsForPage.forEach((row) => {
    const y = firstRowY - rowSlotCursor * TABLE_ROW_HEIGHT;
    const rowSlots = getRowSlots(row);
    rowSlotCursor += rowSlots;

    if (row.type === "spacer") return;
    if (row.type === "remark") {
      row.lines.forEach((line, lineIndex) => {
        page.drawText(line || "", {
          x: tableLeftX,
          y: y - lineIndex * REMARK_LINE_HEIGHT,
          size: TABLE_TEXT_SIZE,
          font: helvetica,
          color: black,
        });
      });
      return;
    }
    if (row.type === "heading") {
      drawBoundedText(page, row.text, tableLeftX, y, descMaxWidth, helveticaBold, 10, { minSize: 7 });
      return;
    }
    if (row.type === "date") {
      drawBoundedText(page, row.text, tableLeftX, y, descMaxWidth, helvetica, 10, { minSize: 7 });
      return;
    }

    const amount = parseAmount(row.line.amount);
    const isDescriptionOnly = isDescriptionOnlyLine(row.line);
    const isAdjustment = isAdjustmentLine(row.line);
    page.drawText(row.text || "", { x: tableLeftX, y, size: TABLE_TEXT_SIZE, font: helvetica, color: black });
    if (row.showValues && !isDescriptionOnly) {
      if (!isAdjustment) {
        drawCenteredBoundedText(page, row.line.qty || "", descDividerX, amountDividerX, y, helvetica, 10, {
          minSize: 7,
        });
      }
      drawCurrencyAmount(page, amount, currency, y - 0.0101, helvetica, currencyX, amountRightX, { minSize: 7 });
    }
  });

  const subtotalY = 205.7368;
  const totalY = 184.8469;
  page.drawLine({
    start: { x: 192.6103, y: 219.9012 },
    end: { x: tableRightX, y: 219.9012 },
    thickness: 0.5,
    color: black,
  });
  page.drawLine({
    start: { x: 192.6103, y: 199.0262 },
    end: { x: tableRightX, y: 199.0262 },
    thickness: 0.5,
    color: black,
  });
  page.drawLine({
    start: { x: 192.6103, y: 178.0262 },
    end: { x: tableRightX, y: 178.0262 },
    thickness: 1,
    color: black,
  });

  if (includeTotal) {
    drawBoundedText(page, "Subtotal", 399.9172, subtotalY, amountDividerX - 399.9172 - 2, helvetica, 10, {
      minSize: 7,
    });
    drawCurrencyAmount(page, subtotal, currency, subtotalY, helvetica, currencyX, amountRightX, { minSize: 7 });
    drawBoundedText(page, "Total", 399.9172, totalY, amountDividerX - 399.9172 - 2, helveticaBold, 10, {
      minSize: 7,
    });
    drawCurrencyAmount(page, total, currency, totalY, helveticaBold, currencyX, amountRightX, { minSize: 7 });
  }

  page.drawText("Notes:", { x: 60.69292, y: 153.9324, size: 10, font: helveticaBold, color: black });
  const notes = [
    "Payments can be made to:",
    "Name : Vincenology Solution",
    "Address : 141 Jalan Dato Onn Jaafar 30300 Ipoh Perak",
    "Bank : Malayan Banking Berhad",
    "Account Number : 5144-8652-7367",
    "Bank Holder : Vincenology Solution",
    "Swift Code : MBBEMYKL",
  ];
  notes.forEach((line, index) => {
    page.drawText(line, {
      x: 60.69292,
      y: 130.5904 - index * 12,
      size: 10,
      font: helvetica,
      color: black,
    });
  });
  page.drawText("Vincenology Solution 141 Jalan Dato Onn Jaafar 30300 Ipoh Perak.", {
    x: 56.69292,
    y: 42.51964,
    size: 9,
    font: helveticaBold,
    color: footerGrey,
  });
  }

  pageRows.forEach((rowsForPage, pageIndex) => {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const drawableRows =
      pageIndex > 0 && repeatedHeading
        ? [{ type: "heading", text: repeatedHeading }, ...rowsForPage]
        : rowsForPage;
    drawInvoicePage(
      page,
      drawableRows,
      invoiceSubtotal,
      invoiceSubtotal,
      pageIndex === pageRows.length - 1,
    );
  });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const filename = `Levince_Chauffeur_${cleanFilename(invoiceData.receiptNumber)}_${cleanFilename(invoiceData.customerName)}.pdf`;
  return { blob, filename };
}
