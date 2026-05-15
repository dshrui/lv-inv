import {
  createServiceDate,
  createServiceGroup,
  createServiceLine,
  normaliseInvoiceData,
} from "../pdf/invoicePdf.js";

const CURRENCY_ALIASES = {
  RM: "RM",
  MYR: "RM",
  RINGGIT: "RM",
  "MALAYSIAN RINGGIT": "RM",
  TWD: "TWD",
  NTD: "TWD",
  NT: "TWD",
  "NT$": "TWD",
  "NEW TAIWAN DOLLAR": "TWD",
  "NEW TAIWAN DOLLARS": "TWD",
  "TAIWAN DOLLAR": "TWD",
  "TAIWAN DOLLARS": "TWD",
  "TAIWANESE DOLLAR": "TWD",
  "TAIWANESE DOLLARS": "TWD",
  USD: "USD",
  "US$": "USD",
  "US DOLLAR": "USD",
  "US DOLLARS": "USD",
  SGD: "SGD",
  "S$": "SGD",
  "SINGAPORE DOLLAR": "SGD",
  "SINGAPORE DOLLARS": "SGD",
  HKD: "HKD",
  "HK$": "HKD",
  AUD: "AUD",
  "A$": "AUD",
  GBP: "GBP",
  EUR: "EUR",
  JPY: "JPY",
  CNY: "CNY",
  RMB: "CNY",
  THB: "THB",
  IDR: "IDR",
  PHP: "PHP",
  KRW: "KRW",
};
const KNOWN_CURRENCY_PARTS = [
  "MALAYSIAN\\s+RINGGIT",
  "RINGGIT",
  "NEW\\s+TAIWAN\\s+DOLLARS?",
  "TAIWANESE\\s+DOLLARS?",
  "TAIWAN\\s+DOLLARS?",
  "US\\s+DOLLARS?",
  "SINGAPORE\\s+DOLLARS?",
  "NT\\$",
  "US\\$",
  "S\\$",
  "HK\\$",
  "A\\$",
  "RM",
  "MYR",
  "TWD",
  "NTD",
  "NT",
  "USD",
  "SGD",
  "HKD",
  "AUD",
  "GBP",
  "EUR",
  "JPY",
  "CNY",
  "RMB",
  "THB",
  "IDR",
  "PHP",
  "KRW",
];
const KNOWN_CURRENCY_PATTERN = KNOWN_CURRENCY_PARTS.join("|");
const CURRENCY_PATTERN = [...KNOWN_CURRENCY_PARTS, "[A-Z]{3}"].join("|");
const QTY_PATTERN = "\\d+(?:\\.\\d+)?\\s*(?:h|hr|hrs|hour|hours|x|pax)?";

function cleanFieldValue(value) {
  const trimmed = String(value || "").trim();
  return trimmed === "-" ? "" : trimmed;
}

function isServiceDateLine(value) {
  return /^\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+(?:\s+\d{4})?$/i.test(value.trim());
}

function normaliseCurrency(value) {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return CURRENCY_ALIASES[cleaned] || cleaned;
}

function parseAmountText(value) {
  const trimmed = String(value || "").trim();
  const currencyBeforeAmount = trimmed.match(
    new RegExp(`^(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)$`, "i"),
  );
  if (currencyBeforeAmount) {
    return {
      amount: currencyBeforeAmount[2].replace(/,/g, ""),
      currency: normaliseCurrency(currencyBeforeAmount[1]),
    };
  }

  const amountBeforeCurrency = trimmed.match(
    new RegExp(`^([\\d,]+(?:\\.\\d{1,2})?)\\s*(${CURRENCY_PATTERN})$`, "i"),
  );
  if (amountBeforeCurrency) {
    return {
      amount: amountBeforeCurrency[1].replace(/,/g, ""),
      currency: normaliseCurrency(amountBeforeCurrency[2]),
    };
  }

  const numericOnly = trimmed.match(/^([\d,]+(?:\.\d{1,2})?)$/);
  if (numericOnly) return { amount: numericOnly[1].replace(/,/g, ""), currency: "" };

  return { amount: "", currency: "" };
}

function cleanDescriptionNote(value) {
  return String(value || "").trim();
}

function isRemarkHeading(value) {
  return /^remarks?$/i.test(String(value || "").trim().replace(/:$/, ""));
}

function isSeparatorLine(value) {
  return /^=+$/.test(String(value || "").trim());
}

function isDailySubtotalLine(value) {
  if (!/^\*+.*\*+$/.test(String(value || "").trim())) return false;
  const cleaned = String(value || "")
    .trim()
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim();
  return Boolean(parseAmountText(cleaned).amount);
}

function isPaymentSummaryLine(value) {
  return /^(deposit|total|balance)\b/i.test(String(value || "").trim());
}

function detectCurrencyInText(value) {
  const match = String(value || "").match(new RegExp(`(^|\\s)(${KNOWN_CURRENCY_PATTERN})(?=\\s|$|[.,/]|\\d)`, "i"));
  return match ? normaliseCurrency(match[2]) : "";
}

function createDescriptionOnlyLine(description) {
  return createServiceLine({
    description,
    qty: "",
    amount: "",
    isNote: true,
    isRemark: true,
  });
}

function createAdjustmentLine(description, amount) {
  return createServiceLine({
    description,
    qty: "",
    amount: formatAmount(amount),
    isAdjustment: true,
  });
}

function normaliseContextDescription(description) {
  const cleaned = String(description || "").trim();
  if (/^overtime\s+1\s*(?:h|hr|hrs|hour|hours)$/i.test(cleaned)) return "Overtime";
  return cleaned;
}

function applyQuantityToDescription(description, qty) {
  const cleanedQty = String(qty || "").replace(/\s+/g, "");
  const duration = cleanedQty.match(/^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours)$/i);
  if (duration) {
    return {
      description: `${description} ${duration[1]}H`.trim(),
      qty: "1",
    };
  }

  return {
    description,
    qty: cleanedQty || "1",
  };
}

function isVehicleDetailLine(value) {
  return /^(alphard|vellfire|hiace|innova|starex|estima)$/i.test(String(value || "").trim());
}

function formatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1";
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function parseMultiplierText(value) {
  const rawText = String(value || "").trim();
  const multiplierMatches = [...rawText.matchAll(/\bx\s*(\d+(?:\.\d+)?)(?:\s*([A-Za-z]+))?/gi)];
  if (!multiplierMatches.length) {
    return {
      amountMultiplier: 1,
      displayQty: 1,
      text: "",
      includesDays: false,
      includesCars: false,
    };
  }

  const amountMultiplier = multiplierMatches.reduce((product, match) => product * Number(match[1]), 1);
  const carMatch = multiplierMatches.find((match) => /^cars?$/i.test(match[2] || ""));
  const includesDays = multiplierMatches.some((match) => /^days?$/i.test(match[2] || ""));
  const displayQty = includesDays ? 1 : Number(carMatch?.[1] || multiplierMatches[0][1] || 1);

  return {
    amountMultiplier,
    displayQty,
    text: rawText,
    includesDays,
    includesCars: Boolean(carMatch),
  };
}

function formatUnitRate(value) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return String(value || "");
  return parsed.toLocaleString("en-MY", { maximumFractionDigits: 2 });
}

function createParsedRateLine({ context, detail, currency, rate, multiplierText, qty }) {
  const cleanedContext = String(context || "").trim();
  const inferredDetail = !String(detail || "").trim() && /^disposal\b/i.test(cleanedContext) ? "Alphard" : detail;
  const cleanedDetail = String(inferredDetail || "")
    .trim()
    .replace(/\s*-\s*$/, "");
  const descriptionBase = [cleanedContext, cleanedDetail].filter(Boolean).join(" - ") || cleanedContext || cleanedDetail;
  const description = multiplierText?.includesDays && !cleanedDetail
    ? `${descriptionBase} ${normaliseCurrency(currency)}${formatUnitRate(rate)} ${multiplierText.text}`.trim()
    : descriptionBase;
  const quantity = qty || multiplierText?.displayQty || 1;
  const amount = Number(String(rate || "0").replace(/,/g, "")) * (multiplierText?.amountMultiplier || quantity);

  return {
    description,
    qty: formatNumber(quantity),
    amount: formatAmount(amount),
    currency: normaliseCurrency(currency),
  };
}

function parseRateLine(value, context = "") {
  const trimmed = String(value || "").trim();
  const detailCurrencyRate = trimmed.match(
    new RegExp(`^(.*?)\\s*-\\s*(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)(.*)$`, "i"),
  );
  if (detailCurrencyRate) {
    const multiplier = parseMultiplierText(detailCurrencyRate[4]);
    return createParsedRateLine({
      context,
      detail: detailCurrencyRate[1],
      currency: detailCurrencyRate[2],
      rate: detailCurrencyRate[3],
      multiplierText: multiplier,
      qty: multiplier.displayQty,
    });
  }

  const currencyRate = trimmed.match(
    new RegExp(`^(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)(.*)$`, "i"),
  );
  if (currencyRate) {
    const multiplier = parseMultiplierText(currencyRate[3]);
    return createParsedRateLine({
      context,
      detail: "",
      currency: currencyRate[1],
      rate: currencyRate[2],
      multiplierText: multiplier,
      qty: multiplier.displayQty,
    });
  }

  const rateCurrency = trimmed.match(
    new RegExp(`^([\\d,]+(?:\\.\\d{1,2})?)\\s*(${CURRENCY_PATTERN})(.*)$`, "i"),
  );
  if (rateCurrency) {
    const multiplier = parseMultiplierText(rateCurrency[3]);
    return createParsedRateLine({
      context,
      detail: "",
      currency: rateCurrency[2],
      rate: rateCurrency[1],
      multiplierText: multiplier,
      qty: multiplier.displayQty,
    });
  }

  return null;
}

function parseDepositAdjustmentLine(value) {
  const trimmed = String(value || "").trim();
  if (!/^deposit\b/i.test(trimmed) || /=/.test(trimmed)) return null;

  const match = trimmed.match(new RegExp(`\\b(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)`, "i"));
  if (!match) return null;

  return {
    description: trimmed,
    amount: -Number(match[2].replace(/,/g, "")),
    currency: normaliseCurrency(match[1]),
  };
}

function isAmountOrRateLine(value) {
  return Boolean(parseAmountText(value).amount || parseRateLine(value));
}

function splitDescriptionAndAmount(value) {
  const trimmed = String(value || "").trim();
  const qtyAmountCurrency = trimmed.match(
    new RegExp(`^(.*?)\\s+(${QTY_PATTERN})\\s+([\\d,]+(?:\\.\\d{1,2})?)\\s*(${CURRENCY_PATTERN})$`, "i"),
  );
  if (qtyAmountCurrency) {
    const parsedQty = applyQuantityToDescription(qtyAmountCurrency[1].trim(), qtyAmountCurrency[2]);
    return {
      description: parsedQty.description,
      qty: parsedQty.qty,
      amount: qtyAmountCurrency[3].replace(/,/g, ""),
      currency: normaliseCurrency(qtyAmountCurrency[4]),
    };
  }

  const qtyCurrencyAmount = trimmed.match(
    new RegExp(`^(.*?)\\s+(${QTY_PATTERN})\\s+(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)$`, "i"),
  );
  if (qtyCurrencyAmount) {
    const parsedQty = applyQuantityToDescription(qtyCurrencyAmount[1].trim(), qtyCurrencyAmount[2]);
    return {
      description: parsedQty.description,
      qty: parsedQty.qty,
      amount: qtyCurrencyAmount[4].replace(/,/g, ""),
      currency: normaliseCurrency(qtyCurrencyAmount[3]),
    };
  }

  const inlineAmount = trimmed.match(
    new RegExp(`^(.*?)\\s+(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)$`, "i"),
  );
  if (inlineAmount) {
    return {
      description: inlineAmount[1].trim(),
      qty: "1",
      amount: inlineAmount[3].replace(/,/g, ""),
      currency: normaliseCurrency(inlineAmount[2]),
    };
  }

  const trailingCurrencyAmount = trimmed.match(
    new RegExp(`^(.*?)\\s+([\\d,]+(?:\\.\\d{1,2})?)\\s*(${CURRENCY_PATTERN})$`, "i"),
  );
  if (trailingCurrencyAmount) {
    return {
      description: trailingCurrencyAmount[1].trim(),
      qty: "1",
      amount: trailingCurrencyAmount[2].replace(/,/g, ""),
      currency: normaliseCurrency(trailingCurrencyAmount[3]),
    };
  }

  return {
    description: trimmed,
    qty: "1",
    amount: "",
    currency: "",
  };
}

function formatAmount(value) {
  const parsed = Number(String(value || "0").replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed === 0) return "";
  return parsed.toFixed(2);
}

function inferServiceHeading(explicitHeading) {
  return String(explicitHeading || "").trim() || "Private Chauffeur Service";
}

export function parsePastedInvoiceDetails(rawText, currentInvoice) {
  const nextInvoice = normaliseInvoiceData(currentInvoice);
  const unlabelledLines = [];
  const providedCustomerFields = {
    companyName: false,
    customerName: false,
    email: false,
    phone: false,
  };
  let explicitServiceHeading = "";

  String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const labelled = line.match(/^([^:]+)\s*:\s*(.*)$/);
      if (!labelled) {
        unlabelledLines.push(line);
        return;
      }

      const label = labelled[1].trim().toLowerCase();
      const value = cleanFieldValue(labelled[2]);

      if (/^(name|customer|customer name)$/.test(label)) {
        providedCustomerFields.customerName = true;
        nextInvoice.customerName = value;
      } else if (/^(company|company name)$/.test(label)) {
        providedCustomerFields.companyName = true;
        nextInvoice.companyName = value;
      } else if (label === "email") {
        providedCustomerFields.email = true;
        nextInvoice.email = value;
      } else if (/^(mobile|phone|tel|telephone)$/.test(label)) {
        providedCustomerFields.phone = true;
        nextInvoice.phone = value;
      } else if (/^(date|invoice date)$/.test(label)) nextInvoice.invoiceDate = value;
      else if (/^(document label|document type|invoice label|receipt label|type)$/.test(label)) {
        nextInvoice.documentLabel = value || nextInvoice.documentLabel;
      }
      else if (/^(invoice title|title)$/.test(label)) nextInvoice.invoiceTitle = value;
      else if (/^(service heading|service title|service section|service type)$/.test(label)) explicitServiceHeading = value;
      else if (
        /^(receipt|receipt no|receipt number|invoice no|invoice number|document no|document number|quotation no|quotation number)$/.test(
          label,
        )
      ) {
        nextInvoice.receiptNumber = value;
      } else if (label === "currency") nextInvoice.currency = value || nextInvoice.currency;
      else unlabelledLines.push(line);
    });

  if (Object.values(providedCustomerFields).some(Boolean)) {
    Object.entries(providedCustomerFields).forEach(([field, wasProvided]) => {
      if (!wasProvided) nextInvoice[field] = "";
    });
  }

  const dateGroups = [];
  let currentDateGroup = null;
  let pendingLine = null;
  let lastCompletedLine = null;
  let detectedCurrency = "";
  let isInRemarkSection = false;
  let currentServiceContext = "";

  unlabelledLines.forEach((line, index) => {
    const standaloneAmount = parseAmountText(line);
    const nextStandaloneAmount = parseAmountText(unlabelledLines[index + 1] || "");
    const nextLineIsAmount = Boolean(nextStandaloneAmount.amount || isAmountOrRateLine(unlabelledLines[index + 1]));

    if (isSeparatorLine(line) || isDailySubtotalLine(line)) {
      pendingLine = null;
      lastCompletedLine = null;
      return;
    }

    if (isServiceDateLine(line)) {
      isInRemarkSection = false;
      currentDateGroup = { ...createServiceDate({ date: line }), lines: [] };
      dateGroups.push(currentDateGroup);
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (isPaymentSummaryLine(line)) {
      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      const adjustment = parseDepositAdjustmentLine(line);
      if (adjustment) {
        currentDateGroup.lines.push(createAdjustmentLine(adjustment.description, adjustment.amount));
        if (adjustment.currency) detectedCurrency = adjustment.currency;
      }
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (/^\*+/.test(line)) {
      const description = cleanDescriptionNote(line);
      if (!description) return;

      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      const noteCurrency = detectCurrencyInText(description);
      if (noteCurrency) detectedCurrency = noteCurrency;
      currentDateGroup.lines.push(createDescriptionOnlyLine(description));
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (isRemarkHeading(line)) {
      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      isInRemarkSection = true;
      currentDateGroup.lines.push(createDescriptionOnlyLine("Remark"));
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (isInRemarkSection) {
      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      const noteCurrency = detectCurrencyInText(line);
      if (noteCurrency) detectedCurrency = noteCurrency;
      currentDateGroup.lines.push(createDescriptionOnlyLine(line));
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (standaloneAmount.amount && pendingLine) {
      pendingLine.amount = formatAmount(standaloneAmount.amount);
      if (standaloneAmount.currency) detectedCurrency = standaloneAmount.currency;
      lastCompletedLine = pendingLine;
      pendingLine = null;
      return;
    }

    if (!currentDateGroup) {
      currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
      dateGroups.push(currentDateGroup);
    }

    const parsedRateLine = parseRateLine(line, currentServiceContext);
    if (parsedRateLine) {
      const serviceLine = createServiceLine({
        description: parsedRateLine.description,
        qty: parsedRateLine.qty,
        amount: parsedRateLine.amount,
      });
      currentDateGroup.lines.push(serviceLine);
      if (parsedRateLine.currency) detectedCurrency = parsedRateLine.currency;
      pendingLine = null;
      lastCompletedLine = serviceLine;
      return;
    }

    const parsedLine = splitDescriptionAndAmount(line);

    if (!parsedLine.amount && nextLineIsAmount) {
      currentServiceContext = normaliseContextDescription(parsedLine.description);
      pendingLine = null;
      lastCompletedLine = null;
      return;
    }

    if (!parsedLine.amount && pendingLine) {
      if (isVehicleDetailLine(parsedLine.description)) return;
      pendingLine.description = `${pendingLine.description} - ${parsedLine.description}`.trim();
      return;
    }

    if (!parsedLine.amount && lastCompletedLine) {
      if (isVehicleDetailLine(parsedLine.description)) return;

      if (nextLineIsAmount) {
        const serviceLine = createServiceLine({
          description: parsedLine.description,
          qty: parsedLine.qty || "1",
          amount: "",
        });
        currentDateGroup.lines.push(serviceLine);
        pendingLine = serviceLine;
        lastCompletedLine = null;
        return;
      }

      lastCompletedLine.description = `${lastCompletedLine.description} - ${parsedLine.description}`.trim();
      return;
    }

    const serviceLine = createServiceLine({
      description: parsedLine.description,
      qty: parsedLine.qty || "1",
      amount: formatAmount(parsedLine.amount),
    });
    currentDateGroup.lines.push(serviceLine);
    if (parsedLine.currency) detectedCurrency = parsedLine.currency;
    pendingLine = serviceLine.amount ? null : serviceLine;
    lastCompletedLine = serviceLine.amount ? serviceLine : null;
  });

  const populatedDates = dateGroups
    .map((dateGroup) => ({
      ...dateGroup,
      lines: dateGroup.lines.length ? dateGroup.lines : [createServiceLine()],
    }))
    .filter((dateGroup) => dateGroup.date || dateGroup.lines.some((line) => line.description || line.amount));

  if (populatedDates.length) {
    if (detectedCurrency) nextInvoice.currency = detectedCurrency;
    nextInvoice.serviceGroups = [
      createServiceGroup({
        heading: inferServiceHeading(explicitServiceHeading),
        dates: populatedDates,
      }),
    ];
  }

  return nextInvoice;
}
