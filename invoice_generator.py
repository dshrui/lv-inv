from __future__ import annotations

import argparse
import json
import re
from copy import copy
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Any

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


DEFAULT_TEMPLATE = "Levince Chauffeur 104247.pdf"
DEFAULT_OUTPUT_DIR = Path("output/invoices")


@dataclass
class InvoiceItem:
    description: str
    qty: str
    amount: Decimal


def parse_money(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        amount = value
    else:
        cleaned = str(value).replace(",", "").replace("RM", "").strip()
        try:
            amount = Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError(f"Invalid amount: {value!r}") from exc
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def money_text(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}"


def clean_filename(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9 _.-]+", "", value).strip()
    value = re.sub(r"\s+", "_", value)
    return value or "invoice"


def read_invoice_data(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Input JSON file not found: {path}")
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError("Input JSON must contain one invoice object.")
    return data


def normalize_items(data: dict[str, Any]) -> list[InvoiceItem]:
    raw_items = data.get("items")
    if raw_items:
        if not isinstance(raw_items, list):
            raise ValueError("'items' must be a list when provided.")
        items = []
        for index, item in enumerate(raw_items, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"Item {index} must be an object.")
            items.append(
                InvoiceItem(
                    description=str(item.get("description", "")).strip(),
                    qty=str(item.get("qty", "")).strip(),
                    amount=parse_money(item.get("amount", "0")),
                )
            )
        return items

    return [
        InvoiceItem(
            description=str(data.get("description", "")).strip(),
            qty=str(data.get("qty", "")).strip(),
            amount=parse_money(data.get("amount", "0")),
        )
    ]


def validate_invoice_data(data: dict[str, Any], items: list[InvoiceItem]) -> None:
    required_fields = [
        "customer_name",
        "date",
        "invoice_title",
        "receipt_number",
    ]
    missing = [field for field in required_fields if not str(data.get(field, "")).strip()]
    if not items or any(not item.description for item in items):
        missing.append("description")
    if any(not item.qty for item in items):
        missing.append("qty")
    if missing:
        joined = ", ".join(sorted(set(missing)))
        raise ValueError(f"Missing required invoice field(s): {joined}")


def draw_fit_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
    min_font_size: float = 8,
    fill_color: colors.Color = colors.black,
) -> float:
    text = str(text or "")
    size = font_size
    while size > min_font_size and stringWidth(text, font_name, size) > max_width:
        size -= 0.5
    c.setFillColor(fill_color)
    c.setFont(font_name, size)
    c.drawString(x, y, text)
    return size


def draw_fit_or_truncate_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
    min_font_size: float = 8,
) -> None:
    text = str(text or "")
    fitted_size = font_size
    while fitted_size > min_font_size and stringWidth(text, font_name, fitted_size) > max_width:
        fitted_size -= 0.5

    if stringWidth(text, font_name, fitted_size) <= max_width:
        c.setFillColor(colors.black)
        c.setFont(font_name, fitted_size)
        c.drawString(x, y, text)
        return

    suffix = "..."
    trimmed = text
    while trimmed and stringWidth(f"{trimmed}{suffix}", font_name, fitted_size) > max_width:
        trimmed = trimmed[:-1]
    c.setFillColor(colors.black)
    c.setFont(font_name, fitted_size)
    c.drawString(x, y, f"{trimmed.rstrip()}{suffix}")


def draw_wrapped_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
    line_height: float,
    max_lines: int = 2,
) -> int:
    words = str(text or "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    if len(lines) > max_lines:
        kept = lines[:max_lines]
        last = kept[-1]
        while last and stringWidth(f"{last}...", font_name, font_size) > max_width:
            last = last[:-1]
        kept[-1] = f"{last}..."
        lines = kept

    c.setFillColor(colors.black)
    c.setFont(font_name, font_size)
    for offset, line in enumerate(lines or [""]):
        c.drawString(x, y - (offset * line_height), line)
    return len(lines)


def whiteout(c: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    c.setFillColor(colors.white)
    c.setStrokeColor(colors.white)
    c.rect(x, y, width, height, fill=1, stroke=0)


def create_overlay(data: dict[str, Any], items: list[InvoiceItem], page_width: float, page_height: float) -> BytesIO:
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=(page_width, page_height))

    red = colors.HexColor("#a7191d")
    blue = colors.HexColor("#0000EE")

    header_x = 211.36
    header_max_width = 325
    header_rows = [
        ("company_name", 726.5),
        ("customer_name", 712.5),
        ("email", 698.5),
        ("phone", 684.5),
        ("date", 670.5),
        ("invoice_title", 656.5),
    ]

    for field, y in header_rows:
        whiteout(c, header_x - 2, y - 3, header_max_width + 6, 16)
        value = str(data.get(field, "")).strip()
        if not value:
            continue
        if field == "email":
            font_size = draw_fit_text(c, value, header_x, y, header_max_width, "Helvetica", 12, fill_color=blue)
            underline_width = stringWidth(value, "Helvetica", font_size)
            c.setStrokeColor(blue)
            c.setLineWidth(0.5)
            c.line(header_x, y - 1.5, header_x + underline_width, y - 1.5)
        else:
            draw_fit_text(c, value, header_x, y, header_max_width, "Helvetica", 12)

    receipt_number = str(data.get("receipt_number", "")).strip()
    whiteout(c, 54, 594, 105, 24)
    c.setFillColor(red)
    c.setFont("Helvetica", 15)
    c.drawString(56.69, 598.3, receipt_number)

    title = str(data.get("line_item_title") or data.get("invoice_title", "")).strip()
    service_date = str(data.get("service_date", "")).strip()

    table_left_x = 197.24
    desc_max_width = 195
    qty_center_x = 430.0
    currency_x = 468.68
    amount_right_x = 534.46

    title_y = 600.6
    service_date_y = 579.9
    first_item_y = 559.1
    row_height = 20.75

    whiteout(c, table_left_x - 2, title_y - 4, 198, 16)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(table_left_x, title_y, title)

    if service_date:
        whiteout(c, table_left_x - 2, service_date_y - 4, 198, 16)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        c.drawString(table_left_x, service_date_y, service_date)

    # Clear the original single line item and any amount carried by the PDF template.
    for y in [first_item_y - (i * row_height) for i in range(max(1, min(len(items), 10)))]:
        whiteout(c, table_left_x - 2, y - 4, 198, 16)
        whiteout(c, qty_center_x - 18, y - 4, 36, 16)
        whiteout(c, currency_x - 2, y - 4, 68, 16)

    c.setFont("Helvetica", 10)
    subtotal = Decimal("0.00")
    for index, item in enumerate(items):
        y = first_item_y - (index * row_height)
        if y < 300:
            raise ValueError("Too many invoice items for this one-page template.")
        draw_fit_or_truncate_text(c, item.description, table_left_x, y, desc_max_width, "Helvetica", 10, 7.5)
        c.setFont("Helvetica", 10)
        c.drawCentredString(qty_center_x, y, item.qty)
        c.drawString(currency_x, y, str(data.get("currency", "RM")).strip() or "RM")
        c.drawRightString(amount_right_x, y, money_text(item.amount))
        subtotal += item.amount

    subtotal_y = 247.3
    total_y = 226.5
    total = parse_money(data.get("total", subtotal))

    for y in [subtotal_y, total_y]:
        whiteout(c, currency_x - 2, y - 4, 68, 16)

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    c.drawString(currency_x, subtotal_y, str(data.get("currency", "RM")).strip() or "RM")
    c.drawRightString(amount_right_x, subtotal_y, money_text(subtotal))

    c.setFont("Helvetica-Bold", 10)
    c.drawString(currency_x, total_y, str(data.get("currency", "RM")).strip() or "RM")
    c.drawRightString(amount_right_x, total_y, money_text(total))

    c.save()
    packet.seek(0)
    return packet


def generate_invoice(template_path: Path, data_path: Path, output_dir: Path) -> Path:
    data = read_invoice_data(data_path)
    items = normalize_items(data)
    validate_invoice_data(data, items)

    reader = PdfReader(str(template_path))
    if not reader.pages:
        raise ValueError(f"Template PDF has no pages: {template_path}")

    source_page = reader.pages[0]
    page = copy(source_page)
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)

    overlay_pdf = PdfReader(create_overlay(data, items, page_width, page_height))
    overlay_page = overlay_pdf.pages[0]
    page.merge_page(overlay_page)

    if "/Annots" in page:
        del page["/Annots"]

    writer = PdfWriter()
    writer.add_page(page)

    output_dir.mkdir(parents=True, exist_ok=True)
    receipt = clean_filename(str(data.get("receipt_number", "receipt")))
    customer = clean_filename(str(data.get("customer_name", "customer")))
    output_path = output_dir / f"Levince_Chauffeur_{receipt}_{customer}.pdf"
    with output_path.open("wb") as file:
        writer.write(file)

    return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a Levince invoice PDF from a JSON input file.")
    parser.add_argument("--data", default="invoice_input.sample.json", help="Path to invoice JSON input.")
    parser.add_argument("--template", default=DEFAULT_TEMPLATE, help="Path to the invoice PDF template.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Folder for generated PDFs.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    output = generate_invoice(
        template_path=Path(args.template),
        data_path=Path(args.data),
        output_dir=Path(args.output_dir),
    )
    print(f"Generated invoice: {output}")


if __name__ == "__main__":
    main()
