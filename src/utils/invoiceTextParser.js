import {
  createServiceDate,
  createServiceGroup,
  createServiceLine,
  DEFAULT_HEADER_LABELS,
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
const QTY_PATTERN = "\\d+(?:\\.\\d+)?\\s*(?:h|hr|hrs|hour|hours|x|pax|%)?";
const DATE_DAY_PATTERN = "\\d{1,2}(?:st|nd|rd|th)?";
const DATE_MONTH_PATTERN = "[A-Za-z]+";
const DATE_YEAR_PATTERN = "\\d{4}";
const DATE_SEPARATOR_PATTERN = "(?:-|\\bto\\b|\\u2013|\\u2014)";
const SINGLE_DATE_PATTERN = `${DATE_DAY_PATTERN}\\s+${DATE_MONTH_PATTERN}(?:\\s+${DATE_YEAR_PATTERN})?`;
const SAME_MONTH_DATE_RANGE_PATTERN = `${DATE_DAY_PATTERN}\\s*${DATE_SEPARATOR_PATTERN}\\s*${DATE_DAY_PATTERN}\\s+${DATE_MONTH_PATTERN}(?:\\s+${DATE_YEAR_PATTERN})?`;
const FULL_DATE_RANGE_PATTERN = `${DATE_DAY_PATTERN}\\s+${DATE_MONTH_PATTERN}(?:\\s+${DATE_YEAR_PATTERN})?\\s*${DATE_SEPARATOR_PATTERN}\\s*${DATE_DAY_PATTERN}\\s+${DATE_MONTH_PATTERN}(?:\\s+${DATE_YEAR_PATTERN})?`;

function cleanFieldValue(value) {
  const trimmed = String(value || "").trim();
  return trimmed === "-" ? "" : trimmed;
}

function isEmailLine(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isPhoneLine(value) {
  const trimmed = String(value || "").trim();
  const digitCount = trimmed.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15 && /^[+()\d\s-]+$/.test(trimmed);
}

function isServiceDateLine(value) {
  return new RegExp(
    `^(?:${SINGLE_DATE_PATTERN}|${SAME_MONTH_DATE_RANGE_PATTERN}|${FULL_DATE_RANGE_PATTERN})$`,
    "i",
  ).test(value.trim());
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

function normalisePlainDescriptionLine(value) {
  return String(value || "")
    .trim()
    .replace(/^vehicle\s*:\s*/i, "Vehicle: ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\s+/g, " ");
}

function isTripInfoInstructionLine(value) {
  return /^amend\s+(?:trip\s+)?info$/i.test(String(value || "").trim());
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

function isRateNoteLine(value) {
  return new RegExp(`\\b(${CURRENCY_PATTERN})\\s*[\\d,]+(?:\\.\\d{1,2})?\\s*/\\s*(?:h|hr|hrs|hour|hours)\\b`, "i").test(
    String(value || "").trim(),
  );
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

function createDetailLine(description) {
  return createServiceLine({
    description,
    qty: "",
    amount: "",
    isDetail: true,
  });
}

function createPlainDescriptionLine(description) {
  return createServiceLine({
    description: normalisePlainDescriptionLine(description),
    qty: "",
    amount: "",
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
  return /^(alphard|vellfire|hiace|innova|starex|estima|(?:toyota\s+)?camry)$/i.test(String(value || "").trim());
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
  const dayMatch = multiplierMatches.find((match) => /^days?$/i.test(match[2] || ""));
  const includesDays = multiplierMatches.some((match) => /^days?$/i.test(match[2] || ""));
  const displayQty = Number(carMatch?.[1] || dayMatch?.[1] || multiplierMatches[0][1] || 1);

  return {
    amountMultiplier,
    displayQty,
    text: rawText,
    includesDays,
    includesCars: Boolean(carMatch),
  };
}

function getTrailingRateDetail(value) {
  return String(value || "")
    .replace(/\bx\s*\d+(?:\.\d+)?(?:\s*[A-Za-z]+)?/gi, "")
    .replace(/^[\s,/-]+|[\s,/-]+$/g, "")
    .trim();
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
  const description =
    descriptionBase ||
    `${normaliseCurrency(currency)}${formatUnitRate(rate)} ${multiplierText?.text || ""}`.trim();
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
    const trailingDetail = getTrailingRateDetail(detailCurrencyRate[4]);
    return createParsedRateLine({
      context,
      detail: [detailCurrencyRate[1], trailingDetail].filter(Boolean).join(" - "),
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
      detail: getTrailingRateDetail(currencyRate[3]),
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
      detail: getTrailingRateDetail(rateCurrency[3]),
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

function parseDiscountAdjustmentLine(value) {
  const trimmed = String(value || "").trim();
  if (!/^discount\b/i.test(trimmed)) return null;

  const currencyBeforeAmount = trimmed.match(new RegExp(`\\b(${CURRENCY_PATTERN})\\s*([\\d,]+(?:\\.\\d{1,2})?)`, "i"));
  const amountBeforeCurrency = trimmed.match(new RegExp(`\\b([\\d,]+(?:\\.\\d{1,2})?)\\s*(${CURRENCY_PATTERN})\\b`, "i"));
  const match = currencyBeforeAmount || amountBeforeCurrency;
  if (!match) return null;

  const currency = currencyBeforeAmount ? match[1] : match[2];
  const amount = currencyBeforeAmount ? match[2] : match[1];
  const description =
    trimmed
      .replace(match[0], "")
      .replace(/\s+/g, " ")
      .trim() || "Discount";

  return {
    description,
    amount: -Number(amount.replace(/,/g, "")),
    currency: normaliseCurrency(currency),
  };
}

function parsePercentageChargeLine(value) {
  const trimmed = String(value || "").trim();
  if (!/%/.test(trimmed)) return null;

  const hasChargeContext = /(credit\s*card|card|payment\s*gateway|gateway)/i.test(trimmed);
  const isBarePercentage = /^\+?\s*\d+(?:\.\d+)?\s*%$/i.test(trimmed);
  const isTotalPlusPercentage = /^total\s*\+\s*\d+(?:\.\d+)?\s*%$/i.test(trimmed);
  if (!hasChargeContext && !isBarePercentage && !isTotalPlusPercentage) return null;

  const percentageMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!percentageMatch) return null;

  return {
    description: "Credit Card Payment Gateway Charges",
    qty: "",
    percentage: Number(percentageMatch[1]),
  };
}

function getParsedSubtotal(dateGroups) {
  return dateGroups.reduce(
    (total, dateGroup) =>
      total +
      dateGroup.lines.reduce((lineTotal, line) => {
        const amount = Number(String(line.amount || "0").replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) return lineTotal;
        return lineTotal + amount;
      }, 0),
    0,
  );
}

function isAmountOrRateLine(value) {
  return Boolean(parseAmountText(value).amount || parseRateLine(value) || splitDescriptionAndAmount(value).amount);
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
    qty: "",
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

function inferDocumentLabelFromField(label, fallback = "") {
  if (/^receipts?\b/i.test(label)) return "RECEIPT";
  if (/^quotations?\b/i.test(label)) return "QUOTATION";
  if (/^(invoices?|inv)\b/i.test(label)) return "INVOICE";
  return fallback;
}

function parseStandaloneDocumentLine(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(receipts?|quotations?|invoices?|inv)\b(?:\s*(?:no\.?|number|#)?\s*[:#-]?\s*(.*))?$/i);
  if (!match) return null;

  const receiptNumber = cleanFieldValue(match[2]);
  if (receiptNumber && !/\d/.test(receiptNumber)) return null;

  return {
    documentLabel: inferDocumentLabelFromField(match[1]),
    receiptNumber,
  };
}

export function parsePastedInvoiceDetails(rawText, currentInvoice) {
  const nextInvoice = normaliseInvoiceData(currentInvoice);
  nextInvoice.totalOverride = "";
  const unlabelledLines = [];
  const providedCustomerFields = {
    companyName: false,
    customerName: false,
    email: false,
    phone: false,
  };
  const fallbackCustomerFields = {
    licenseNumber: "",
    address: "",
  };
  let explicitServiceHeading = "";
  let isCollectingAddress = false;

  function appendAddressLine(value) {
    const cleaned = cleanFieldValue(value);
    if (!cleaned) return;
    fallbackCustomerFields.address = [fallbackCustomerFields.address, cleaned].filter(Boolean).join(" ");
  }

  function setHeaderLabel(field, label) {
    nextInvoice.headerLabels = {
      ...DEFAULT_HEADER_LABELS,
      ...(nextInvoice.headerLabels || {}),
      [field]: label,
    };
  }

  function applyUnlabelledCustomerDetails(lines) {
    const firstServiceDateIndex = lines.findIndex((line) => isServiceDateLine(line));
    if (firstServiceDateIndex <= 0) return lines;

    const leadingLines = lines.slice(0, firstServiceDateIndex);
    const hasContactSignal = leadingLines.some((line) => isEmailLine(line) || isPhoneLine(line));
    if (!hasContactSignal) return lines;

    const nameCandidates = [];
    const remainingLeadingLines = [];

    if (!providedCustomerFields.companyName) nextInvoice.companyName = "";
    if (!providedCustomerFields.customerName) nextInvoice.customerName = "";
    if (!providedCustomerFields.email) nextInvoice.email = "";
    if (!providedCustomerFields.phone) nextInvoice.phone = "";

    leadingLines.forEach((line) => {
      const cleaned = cleanFieldValue(line);
      if (!cleaned) return;

      if (isEmailLine(cleaned)) {
        if (!providedCustomerFields.email) {
          nextInvoice.email = cleaned;
          setHeaderLabel("email", DEFAULT_HEADER_LABELS.email);
        }
        return;
      }

      if (isPhoneLine(cleaned)) {
        if (!providedCustomerFields.phone) {
          nextInvoice.phone = cleaned;
          setHeaderLabel("phone", DEFAULT_HEADER_LABELS.phone);
        }
        return;
      }

      if (!isAmountOrRateLine(cleaned) && !isRemarkHeading(cleaned) && !/^vehicle\s*:/i.test(cleaned)) {
        nameCandidates.push(cleaned);
        return;
      }

      remainingLeadingLines.push(line);
    });

    if (nameCandidates.length === 1 && !providedCustomerFields.customerName) {
      nextInvoice.customerName = nameCandidates[0];
      setHeaderLabel("customerName", DEFAULT_HEADER_LABELS.customerName);
    } else if (nameCandidates.length > 1) {
      if (!providedCustomerFields.companyName) {
        nextInvoice.companyName = nameCandidates[0];
        setHeaderLabel("companyName", DEFAULT_HEADER_LABELS.companyName);
      }
      if (!providedCustomerFields.customerName) {
        nextInvoice.customerName = nameCandidates[1];
        setHeaderLabel("customerName", DEFAULT_HEADER_LABELS.customerName);
      }
      remainingLeadingLines.push(...nameCandidates.slice(2));
    }

    return [...remainingLeadingLines, ...lines.slice(firstServiceDateIndex)];
  }

  function hasCustomerDisplayContext() {
    return Boolean(
      String(nextInvoice.companyName || "").trim() ||
        String(nextInvoice.email || "").trim() ||
        String(nextInvoice.phone || "").trim() ||
        fallbackCustomerFields.licenseNumber ||
        fallbackCustomerFields.address ||
        Object.values(providedCustomerFields).some(Boolean),
    );
  }

  String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const labelled = line.match(/^([^:]+)\s*:\s*(.*)$/);
      const standaloneDocument = labelled ? null : parseStandaloneDocumentLine(line);
      if (standaloneDocument) {
        nextInvoice.documentLabel = standaloneDocument.documentLabel;
        if (standaloneDocument.receiptNumber) nextInvoice.receiptNumber = standaloneDocument.receiptNumber;
        isCollectingAddress = false;
        return;
      }

      if (isCollectingAddress && !labelled) {
        if (!isServiceDateLine(line) && !isAmountOrRateLine(line) && !isRemarkHeading(line)) {
          appendAddressLine(line);
          return;
        }
        isCollectingAddress = false;
      }

      if (!labelled) {
        unlabelledLines.push(line);
        return;
      }

      const label = labelled[1].trim().toLowerCase();
      const value = cleanFieldValue(labelled[2]);
      isCollectingAddress = false;

      if (/^(name|customer|customer name)$/.test(label)) {
        providedCustomerFields.customerName = true;
        nextInvoice.customerName = value;
        setHeaderLabel("customerName", DEFAULT_HEADER_LABELS.customerName);
      } else if (/^(company|company name)$/.test(label)) {
        providedCustomerFields.companyName = true;
        nextInvoice.companyName = value;
        setHeaderLabel("companyName", DEFAULT_HEADER_LABELS.companyName);
      } else if (label === "email") {
        providedCustomerFields.email = true;
        nextInvoice.email = value;
        setHeaderLabel("email", DEFAULT_HEADER_LABELS.email);
      } else if (
        /^(mobile|mobile no|mobile number|phone|phone no|phone number|tel|telephone|contact|contact no|contact number|whatsapp|whatsapp no|whatsapp number|handphone)$/.test(
          label,
        )
      ) {
        providedCustomerFields.phone = true;
        nextInvoice.phone = value;
        setHeaderLabel("phone", DEFAULT_HEADER_LABELS.phone);
      } else if (/^(date|invoice date)$/.test(label)) nextInvoice.invoiceDate = value;
      else if (/^(document label|document type|invoice label|receipt label|type)$/.test(label)) {
        nextInvoice.documentLabel = inferDocumentLabelFromField(value) || value || nextInvoice.documentLabel;
      }
      else if (/^(invoice title|title)$/.test(label)) nextInvoice.invoiceTitle = value;
      else if (/^(service heading|service title|service section|service type)$/.test(label)) explicitServiceHeading = value;
      else if (
        /^(receipt|receipt no|receipt number|invoice|invoice no|invoice number|inv|inv no|inv number|document no|document number|quotation|quotation no|quotation number)$/.test(
          label,
        )
      ) {
        const inferredDocumentLabel = inferDocumentLabelFromField(label);
        if (inferredDocumentLabel) nextInvoice.documentLabel = inferredDocumentLabel;
        nextInvoice.receiptNumber = value;
      } else if (label === "currency") nextInvoice.currency = value || nextInvoice.currency;
      else if (
        /^(license|licence|license no|licence no|license number|licence number|company license|company licence|company license number|company licence number)$/.test(
          label,
        )
      ) {
        fallbackCustomerFields.licenseNumber = value;
      } else if (/^(address|company address|billing address)$/.test(label)) {
        appendAddressLine(value);
        if (!value) isCollectingAddress = true;
      }
      else if (/^(vehicle|car)$/.test(label) && value) unlabelledLines.push(`Vehicle: ${value}`);
      else unlabelledLines.push(line);
    });

  if (Object.values(providedCustomerFields).some(Boolean)) {
    Object.entries(providedCustomerFields).forEach(([field, wasProvided]) => {
      if (!wasProvided) nextInvoice[field] = "";
    });
  }

  if (!String(nextInvoice.customerName || "").trim() && fallbackCustomerFields.licenseNumber) {
    setHeaderLabel("customerName", "LICENSE NUMBER");
    nextInvoice.customerName = fallbackCustomerFields.licenseNumber;
  }
  if (!String(nextInvoice.email || "").trim() && fallbackCustomerFields.address) {
    setHeaderLabel("email", "ADDRESS");
    nextInvoice.email = fallbackCustomerFields.address;
  }
  if (!String(nextInvoice.phone || "").trim() && (fallbackCustomerFields.licenseNumber || fallbackCustomerFields.address)) {
    setHeaderLabel("phone", DEFAULT_HEADER_LABELS.phone);
    nextInvoice.phone = "-";
  }

  const serviceInputLines = applyUnlabelledCustomerDetails(unlabelledLines);
  if (!String(nextInvoice.customerName || "").trim() && hasCustomerDisplayContext()) {
    setHeaderLabel("customerName", DEFAULT_HEADER_LABELS.customerName);
    nextInvoice.customerName = "-";
  }

  const dateGroups = [];
  let currentDateGroup = null;
  let pendingLine = null;
  let lastCompletedLine = null;
  let detectedCurrency = "";
  let isInRemarkSection = false;
  let currentServiceContext = "";

  serviceInputLines.forEach((line, index) => {
    const standaloneAmount = parseAmountText(line);
    const nextStandaloneAmount = parseAmountText(serviceInputLines[index + 1] || "");
    const nextLineIsAmount = Boolean(nextStandaloneAmount.amount || isAmountOrRateLine(serviceInputLines[index + 1]));

    if (isSeparatorLine(line) || isDailySubtotalLine(line)) {
      pendingLine = null;
      lastCompletedLine = null;
      return;
    }

    if (isTripInfoInstructionLine(line)) {
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
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

    const percentageCharge = parsePercentageChargeLine(line);
    if (percentageCharge) {
      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      const chargeBase = getParsedSubtotal(dateGroups);
      const serviceLine = createServiceLine({
        description: percentageCharge.description,
        qty: percentageCharge.qty,
        amount: formatAmount(chargeBase * (percentageCharge.percentage / 100)),
        isAdjustment: true,
      });
      currentDateGroup.lines.push(serviceLine);
      pendingLine = null;
      lastCompletedLine = serviceLine;
      currentServiceContext = "";
      return;
    }

    const discountAdjustment = parseDiscountAdjustmentLine(line);
    if (discountAdjustment) {
      if (!currentDateGroup) {
        currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
        dateGroups.push(currentDateGroup);
      }

      currentDateGroup.lines.push(createAdjustmentLine(discountAdjustment.description, discountAdjustment.amount));
      if (discountAdjustment.currency) detectedCurrency = discountAdjustment.currency;
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
      if (!String(pendingLine.qty || "").trim()) pendingLine.qty = "1";
      if (standaloneAmount.currency) detectedCurrency = standaloneAmount.currency;
      lastCompletedLine = pendingLine;
      pendingLine = null;
      return;
    }

    if (!currentDateGroup) {
      currentDateGroup = { ...createServiceDate({ date: "" }), lines: [] };
      dateGroups.push(currentDateGroup);
    }

    if (/^vehicle\s*:/i.test(line)) {
      currentDateGroup.lines.push(createPlainDescriptionLine(line));
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    if (isRateNoteLine(line)) {
      const noteCurrency = detectCurrencyInText(line);
      if (noteCurrency) detectedCurrency = noteCurrency;
      currentDateGroup.lines.push(createPlainDescriptionLine(line));
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
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
      currentServiceContext = "";
      return;
    }

    const parsedLine = splitDescriptionAndAmount(line);

    if (parsedLine.amount && currentServiceContext) {
      if (isVehicleDetailLine(parsedLine.description)) {
        const serviceLine = createServiceLine({
          description: currentServiceContext,
          qty: parsedLine.qty || "1",
          amount: formatAmount(parsedLine.amount),
        });
        currentDateGroup.lines.push(serviceLine);
        currentDateGroup.lines.push(createDetailLine(parsedLine.description));
        if (parsedLine.currency) detectedCurrency = parsedLine.currency;
        pendingLine = null;
        lastCompletedLine = serviceLine;
        currentServiceContext = "";
        return;
      }
      const serviceLine = createServiceLine({
        description: [currentServiceContext, parsedLine.description].filter(Boolean).join(" - "),
        qty: parsedLine.qty || "1",
        amount: formatAmount(parsedLine.amount),
      });
      currentDateGroup.lines.push(serviceLine);
      if (parsedLine.currency) detectedCurrency = parsedLine.currency;
      pendingLine = null;
      lastCompletedLine = serviceLine;
      currentServiceContext = "";
      return;
    }

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
      if (/^vehicle\s*:/i.test(parsedLine.description)) {
        currentDateGroup.lines.push(createPlainDescriptionLine(parsedLine.description));
        pendingLine = null;
        lastCompletedLine = null;
        currentServiceContext = "";
        return;
      }

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

    if (!parsedLine.amount) {
      if (/^vehicle\s*:/i.test(parsedLine.description)) {
        currentDateGroup.lines.push(createPlainDescriptionLine(parsedLine.description));
      } else {
        currentDateGroup.lines.push(createDescriptionOnlyLine(parsedLine.description));
      }
      pendingLine = null;
      lastCompletedLine = null;
      currentServiceContext = "";
      return;
    }

    const serviceLine = createServiceLine({
      description: parsedLine.description,
      qty: parsedLine.qty,
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
