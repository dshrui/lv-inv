import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  createEmptyInvoiceData,
  createServiceDate,
  createServiceGroup,
  createServiceLine,
  DEFAULT_FOOTER_TEXT,
  DEFAULT_HEADER_LABELS,
  DEFAULT_NOTES_TITLE,
  DEFAULT_PAYMENT_NOTES,
  defaultInvoiceData,
  generateInvoicePdf,
  getCurrentInvoiceDate,
  getInvoiceSubtotal,
  getInvoiceTotal,
  normaliseInvoiceData,
  validateInvoice,
} from "./pdf/invoicePdf";
import { parsePastedInvoiceDetails as parseInvoiceTextDetails } from "./utils/invoiceTextParser";

const STORAGE_KEY = "levince-invoice-draft";

function formatAmount(value) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function withDefaultPaymentNotes(invoice) {
  return {
    ...invoice,
    notesTitle: DEFAULT_NOTES_TITLE,
    paymentNotes: DEFAULT_PAYMENT_NOTES,
    footerText: DEFAULT_FOOTER_TEXT,
  };
}

function readStoredDraft() {
  const today = getCurrentInvoiceDate();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...defaultInvoiceData(), invoiceDate: today };
    const draft = normaliseInvoiceData(JSON.parse(stored));
    return withDefaultPaymentNotes({ ...draft, invoiceDate: today });
  } catch {
    return { ...defaultInvoiceData(), invoiceDate: today };
  }
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <b> *</b> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  const [invoice, setInvoice] = useState(readStoredDraft);
  const [previewUrl, setPreviewUrl] = useState("");
  const [generatedBlob, setGeneratedBlob] = useState(null);
  const [filename, setFilename] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [quickPasteText, setQuickPasteText] = useState("");
  const [quickPasteStatus, setQuickPasteStatus] = useState("");
  const lastPreviewUrl = useRef("");

  const missingFields = useMemo(() => validateInvoice(invoice), [invoice]);
  const subtotal = useMemo(() => getInvoiceSubtotal(invoice), [invoice]);
  const total = useMemo(() => getInvoiceTotal(invoice), [invoice]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoice));
  }, [invoice]);

  useEffect(
    () => () => {
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
    },
    [],
  );

  function updateInvoice(field, value) {
    setInvoice((current) => ({ ...current, [field]: value }));
  }

  function updateHeaderLabel(field, value) {
    setInvoice((current) => ({
      ...current,
      headerLabels: {
        ...DEFAULT_HEADER_LABELS,
        ...(current.headerLabels || {}),
        [field]: value,
      },
    }));
  }

  function getHeaderLabel(field) {
    return invoice.headerLabels?.[field] || DEFAULT_HEADER_LABELS[field] || "";
  }

  function updateServiceGroup(groupId, field, value) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId ? { ...group, [field]: value } : group,
      ),
    }));
  }

  function updateServiceDate(groupId, dateId, field, value) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              dates: group.dates.map((dateGroup) =>
                dateGroup.id === dateId ? { ...dateGroup, [field]: value } : dateGroup,
              ),
            }
          : group,
      ),
    }));
  }

  function updateServiceLine(groupId, dateId, lineId, field, value) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              dates: group.dates.map((dateGroup) =>
                dateGroup.id === dateId
                  ? {
                      ...dateGroup,
                      lines: dateGroup.lines.map((line) =>
                        line.id === lineId ? { ...line, [field]: value } : line,
                      ),
                    }
                  : dateGroup,
              ),
            }
          : group,
      ),
    }));
  }

  function addServiceGroup() {
    setInvoice((current) => ({
      ...current,
      serviceGroups: [...current.serviceGroups, createServiceGroup()],
    }));
  }

  function removeServiceGroup(groupId) {
    setInvoice((current) => ({
      ...current,
      serviceGroups:
        current.serviceGroups.length === 1
          ? [createServiceGroup()]
          : current.serviceGroups.filter((group) => group.id !== groupId),
    }));
  }

  function addServiceDate(groupId) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId ? { ...group, dates: [...group.dates, createServiceDate()] } : group,
      ),
    }));
  }

  function removeServiceDate(groupId, dateId) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              dates:
                group.dates.length === 1
                  ? [createServiceDate()]
                  : group.dates.filter((dateGroup) => dateGroup.id !== dateId),
            }
          : group,
      ),
    }));
  }

  function addServiceLine(groupId, dateId) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              dates: group.dates.map((dateGroup) =>
                dateGroup.id === dateId
                  ? { ...dateGroup, lines: [...dateGroup.lines, createServiceLine()] }
                  : dateGroup,
              ),
            }
          : group,
      ),
    }));
  }

  function removeServiceLine(groupId, dateId, lineId) {
    setInvoice((current) => ({
      ...current,
      serviceGroups: current.serviceGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              dates: group.dates.map((dateGroup) =>
                dateGroup.id === dateId
                  ? {
                      ...dateGroup,
                      lines:
                        dateGroup.lines.length === 1
                          ? [createServiceLine()]
                          : dateGroup.lines.filter((line) => line.id !== lineId),
                    }
                  : dateGroup,
              ),
            }
          : group,
      ),
    }));
  }

  async function handleGenerate() {
    setError("");
    const missing = validateInvoice(invoice);
    if (missing.length) {
      setError(`Please complete: ${missing.join(", ")}.`);
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateInvoicePdf(invoice);
      if (lastPreviewUrl.current) URL.revokeObjectURL(lastPreviewUrl.current);
      const url = URL.createObjectURL(result.blob);
      lastPreviewUrl.current = url;
      setPreviewUrl(url);
      setGeneratedBlob(result.blob);
      setFilename(result.filename);
    } catch (generationError) {
      setError(generationError.message || "Unable to generate PDF.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload() {
    if (!generatedBlob) return;

    const fileName = filename || "Levince Chauffeur.pdf";

    if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
      const file = new File([generatedBlob], fileName, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: fileName.replace(/\.pdf$/i, ""),
          });
          return;
        } catch (shareError) {
          if (shareError?.name === "AbortError") return;
        }
      }
    }

    const downloadUrl = URL.createObjectURL(generatedBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
  }

  function resetToSample() {
    setInvoice({ ...defaultInvoiceData(), invoiceDate: getCurrentInvoiceDate() });
    setError("");
  }

  function clearForm() {
    setInvoice({ ...createEmptyInvoiceData(), invoiceDate: getCurrentInvoiceDate() });
    setError("");
    setQuickPasteStatus("");
  }

  function applyQuickPaste() {
    if (!quickPasteText.trim()) {
      setQuickPasteStatus("Paste invoice details first.");
      return;
    }

    setInvoice((current) => parseInvoiceTextDetails(quickPasteText, current));
    setError("");
    setQuickPasteStatus("Details applied. Review the fields, then generate the PDF.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-label">Levince internal tool</p>
          <h1>Invoice Generator</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost-button" onClick={resetToSample} title="Load sample invoice">
            <RefreshCcw aria-hidden="true" />
            Sample
          </button>
          <button type="button" className="ghost-button" onClick={clearForm} title="Clear all invoice fields">
            <RotateCcw aria-hidden="true" />
            Clear
          </button>
        </div>
      </header>

      <div className="workspace">
        <form className="editor" onSubmit={(event) => event.preventDefault()}>
          <Section title="Quick Paste">
            <label className="field paste-field">
              <span>Invoice details</span>
              <textarea
                value={quickPasteText}
                placeholder={`Name : Melanie Chalil
Company Name : -
Email : melanie.chalil@gmail.com
Mobile : 012-223 6976

10th May
Airport Transfer
RM140

13 May 2026
Taipei Chauffeur Service 10h 13000 TWD
Alphard

**Additional hourly rate @ 1500 TWD / hour
**Inclusive one airport transfer on 13rd and 15th May.

Remark
For airport arrival, 90 minutes waiting time is included.`}
                onChange={(event) => setQuickPasteText(event.target.value)}
              />
            </label>
            <p className="mini-instruction">
              Remarks: start remark lines with <code>**</code>, or add a <code>Remark</code> heading and put the
              remark text below it. Remarks stay in the Description column with Qty and Amount blank.
            </p>
            <div className="paste-actions">
              <button type="button" className="secondary-button" onClick={applyQuickPaste}>
                <FileText aria-hidden="true" />
                Apply details
              </button>
              {quickPasteStatus ? <span>{quickPasteStatus}</span> : null}
            </div>
          </Section>

          <Section title="Customer">
            <div className="particulars-grid">
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("companyName")}
                  placeholder="COMPANY NAME"
                  onChange={(value) => updateHeaderLabel("companyName", value)}
                />
                <Field
                  label="Company value"
                  value={invoice.companyName}
                  placeholder="ABC Logistics Sdn Bhd"
                  onChange={(value) => updateInvoice("companyName", value)}
                />
              </div>
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("customerName")}
                  placeholder="CUSTOMER NAME"
                  onChange={(value) => updateHeaderLabel("customerName", value)}
                />
                <Field
                  label="Customer value"
                  value={invoice.customerName}
                  required
                  placeholder="Melanie Chalil"
                  onChange={(value) => updateInvoice("customerName", value)}
                />
              </div>
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("email")}
                  placeholder="EMAIL"
                  onChange={(value) => updateHeaderLabel("email", value)}
                />
                <Field
                  label="Email / address value"
                  value={invoice.email}
                  placeholder="customer@email.com"
                  onChange={(value) => updateInvoice("email", value)}
                />
              </div>
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("phone")}
                  placeholder="PHONE"
                  onChange={(value) => updateHeaderLabel("phone", value)}
                />
                <Field
                  label="Phone value"
                  value={invoice.phone}
                  placeholder="012-345 6789"
                  onChange={(value) => updateInvoice("phone", value)}
                />
              </div>
            </div>
          </Section>

          <Section title="Invoice">
            <div className="particulars-grid invoice-particulars">
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("invoiceDate")}
                  placeholder="DATE"
                  onChange={(value) => updateHeaderLabel("invoiceDate", value)}
                />
                <Field
                  label="Date value"
                  value={invoice.invoiceDate}
                  required
                  placeholder={getCurrentInvoiceDate()}
                  onChange={(value) => updateInvoice("invoiceDate", value)}
                />
              </div>
              <div className="particular-row">
                <Field
                  label="PDF label"
                  value={getHeaderLabel("invoiceTitle")}
                  placeholder="INVOICE TITLE"
                  onChange={(value) => updateHeaderLabel("invoiceTitle", value)}
                />
                <Field
                  label="Invoice title value"
                  value={invoice.invoiceTitle}
                  required
                  placeholder="LeVince Chauffeur Service"
                  onChange={(value) => updateInvoice("invoiceTitle", value)}
                />
              </div>
            </div>
            <div className="grid two">
              <Field
                label="Document label"
                value={invoice.documentLabel}
                placeholder="INVOICE or QUOTATION"
                onChange={(value) => updateInvoice("documentLabel", value)}
              />
              <Field
                label="Document number"
                value={invoice.receiptNumber}
                required
                placeholder="104247"
                onChange={(value) => updateInvoice("receiptNumber", value)}
              />
              <Field
                label="Currency"
                value={invoice.currency}
                placeholder="RM"
                onChange={(value) => updateInvoice("currency", value)}
              />
            </div>
          </Section>

          <Section title="Services">
            <p className="mini-instruction">
              Rows with a blank Amount are treated as description-only and will not affect the subtotal. Fill Qty and
              Amount only for chargeable rows.
            </p>
            <div className="service-groups">
              {invoice.serviceGroups.map((group, groupIndex) => (
                <article className="service-group" key={group.id}>
                  <div className="service-group-header">
                    <Field
                      label={`Service heading ${groupIndex + 1}`}
                      value={group.heading}
                      required
                      placeholder="Private Chauffeur Service"
                      onChange={(value) => updateServiceGroup(group.id, "heading", value)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => removeServiceGroup(group.id)}
                      title="Remove service section"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>

                  <div className="service-dates">
                    {group.dates.map((dateGroup) => (
                      <div className="service-date-card" key={dateGroup.id}>
                        <div className="service-date-header">
                          <Field
                            label="Service date"
                            value={dateGroup.date}
                            required
                            placeholder="10th May"
                            onChange={(value) => updateServiceDate(group.id, dateGroup.id, "date", value)}
                          />
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => removeServiceDate(group.id, dateGroup.id)}
                            title="Remove date"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>

                        <div className="line-items">
                          <div className="line-head service-line-head">
                            <span>Description</span>
                            <span>Qty</span>
                            <span>Amount</span>
                            <span />
                          </div>
                          {dateGroup.lines.map((line) => (
                            <div className="line-row service-line-row" key={line.id}>
                              <label className="line-input description-input">
                                <span>Description</span>
                                <input
                                  value={line.description}
                                  placeholder="Airport Transfer"
                                  onChange={(event) =>
                                    updateServiceLine(
                                      group.id,
                                      dateGroup.id,
                                      line.id,
                                      "description",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="line-input qty-input">
                                <span>Qty</span>
                                <input
                                  value={line.qty}
                                  inputMode="numeric"
                                  placeholder="1"
                                  onChange={(event) =>
                                    updateServiceLine(group.id, dateGroup.id, line.id, "qty", event.target.value)
                                  }
                                />
                              </label>
                              <label className="line-input amount-input">
                                <span>Amount</span>
                                <input
                                  value={line.amount}
                                  inputMode="decimal"
                                  placeholder="140.00"
                                  onChange={(event) =>
                                    updateServiceLine(group.id, dateGroup.id, line.id, "amount", event.target.value)
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => removeServiceLine(group.id, dateGroup.id, line.id)}
                                title="Remove description"
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => addServiceLine(group.id, dateGroup.id)}
                          title="Add description under this date"
                        >
                          <Plus aria-hidden="true" />
                          Add description
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => addServiceDate(group.id)}
                    title="Add date under this service heading"
                  >
                    <Plus aria-hidden="true" />
                    Add date
                  </button>
                </article>
              ))}
            </div>
            <div className="line-footer">
              <button type="button" className="secondary-button" onClick={addServiceGroup} title="Add service section">
                <Plus aria-hidden="true" />
                Add service section
              </button>
              <strong>
                Subtotal: {invoice.currency || "RM"}{" "}
                {formatAmount(subtotal)}
              </strong>
            </div>
            <div className="total-editor">
              <label className="field total-input">
                <span>Total value</span>
                <input
                  value={invoice.totalOverride ?? ""}
                  inputMode="decimal"
                  placeholder={formatAmount(subtotal)}
                  onChange={(event) => updateInvoice("totalOverride", event.target.value)}
                />
              </label>
              <strong>
                Final total: {invoice.currency || "RM"} {formatAmount(total)}
              </strong>
            </div>
          </Section>

          <Section title="Payment Notes">
            <div className="grid two">
              <Field
                label="Notes heading"
                value={invoice.notesTitle ?? ""}
                placeholder={DEFAULT_NOTES_TITLE}
                onChange={(value) => updateInvoice("notesTitle", value)}
              />
              <Field
                label="Footer line"
                value={invoice.footerText ?? ""}
                placeholder={DEFAULT_FOOTER_TEXT}
                onChange={(value) => updateInvoice("footerText", value)}
              />
            </div>
            <label className="field notes-field">
              <span>Payment note body</span>
              <textarea
                value={invoice.paymentNotes ?? ""}
                placeholder={DEFAULT_PAYMENT_NOTES}
                onChange={(event) => updateInvoice("paymentNotes", event.target.value)}
              />
            </label>
          </Section>

          {error ? <p className="error-message">{error}</p> : null}
          {!error && missingFields.length ? (
            <p className="hint">Required before generating: {missingFields.join(", ")}.</p>
          ) : null}

          <div className="generate-bar">
            <button type="button" className="primary-button" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="spin" aria-hidden="true" /> : <FileText aria-hidden="true" />}
              Generate PDF
            </button>
            {previewUrl ? (
              <button type="button" className="download-button" onClick={handleDownload}>
                <Download aria-hidden="true" />
                Download
              </button>
            ) : null}
          </div>
        </form>

        <aside className="preview-panel">
          <div className="preview-header">
            <div>
              <p>Output preview</p>
              <h2>{filename || "No PDF generated yet"}</h2>
            </div>
          </div>
          <div className="pdf-frame">
            {previewUrl ? (
              <iframe title="Generated invoice preview" src={previewUrl} />
            ) : (
              <div className="empty-state">
                <FileText aria-hidden="true" />
                <span>Fill in the invoice fields and generate the PDF.</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
