# Levince Invoice Generator

Personal web app for generating Levince invoice PDFs from the existing invoice layout.

The app runs fully in the browser. No backend, database, API key, or uploaded customer data is required.

## Local Use

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, fill in the invoice details, click `Generate PDF`, then download the PDF.

You can also paste invoice details into the Quick Paste box, then click `Apply details` to populate the customer and service fields.

When Quick Paste includes customer details, those customer fields are treated as the latest source of truth. If a new pasted invoice has no company name, the company name field is cleared so a previous invoice's company does not carry over.

## Production Build

```bash
npm run build
```

The static site will be generated in `dist/`.

## GitHub Pages Deployment

This repo includes `.github/workflows/deploy.yml`.

After pushing to GitHub:

1. Go to the GitHub repository.
2. Open `Settings` > `Pages`.
3. Set source to `GitHub Actions`.
4. Push to the `main` branch.

GitHub Actions will build the app and deploy the `dist/` folder to GitHub Pages.

## Invoice Layout

The web app generates a clean PDF from code based on the current invoice layout. Static assets are kept here:

```text
public/assets/levince-logo.png
public/templates/levince-invoice-template.pdf
```

`public/templates/levince-invoice-template.pdf` is kept as the visual reference. The generated PDF does not reuse old invoice text underneath, which avoids sending hidden previous-customer details inside the output PDF.

## Fields Supported

- Company name
- Customer name
- Email
- Phone
- Date
- Document label, such as `INVOICE`, `RECEIPT`, or `QUOTATION`
- Invoice title
- Document number
- Currency
- Service sections
- Service heading per section
- Service dates under each section
- One or more descriptions under each date
- Qty and amount per description
- Quick paste from plain-text invoice details

Rows can also be description-only. Leave Amount blank for remark rows or service description rows that should not affect the subtotal. Qty and Amount are only needed for chargeable rows.

Each service section follows the invoice design:

```text
Private Chauffeur Service / other editable heading
10th May
Airport Transfer
Additional Waiting Time
14th May
Airport Transfer
```

The service heading is editable, dates can be added under the heading, and each date can contain multiple service descriptions. The logo, notes, bank details, and fixed layout remain generated into the PDF automatically.

The invoice `Date` field is editable and defaults to the current date when a new draft or sample invoice is created.

The default service heading is `Private Chauffeur Service`. Quick Paste will keep this default unless the pasted text explicitly includes a service heading field, such as `Service Heading : Airport Transfer Service`.

If the service rows exceed one page, the PDF automatically creates continuation pages with the same invoice layout and continues the remaining rows on the next page.

Long service descriptions wrap into continuation rows at the same font size instead of being squeezed smaller.

Quick paste supports plain text such as:

```text
Name : Melanie Chalil
Company Name : -
Email : melanie.chalil@gmail.com
Mobile : 012-223 6976

10th May
Airport Transfer
RM140
```

It also recognises quantity-plus-currency lines such as:

```text
Name : Lee Jia En
Company Name : Taraf Nusantara Sdn Bhd
Email : lee.jiaen@setiaawan.com
Mobile : 0182105340

13 May 2026
Taipei Chauffeur Service 10h 13000 TWD
Alphard

**Additional hourly rate @ 1500 TWD / hour
**Inclusive one airport transfer on 13rd and 15th May.
```

Supported currency inputs include `RM`, `MYR`, `TWD`, `NTD`, `NT$`, and common ISO-style currency codes such as `USD`, `SGD`, `HKD`, `AUD`, `GBP`, `EUR`, `JPY`, `CNY`, `THB`, `IDR`, `PHP`, and `KRW`. Unknown three-letter currency codes are kept as entered.

Lines beginning with `**` are treated as remarks. The `**` is kept in the generated PDF, the text stays inside the Description column only, and the Qty and Amount cells remain blank.

The parser also recognises a `Remark` or `Remarks` heading. Text below that heading is treated as a remark block without adding `**` if the pasted text did not include it.

When remarks follow a paid service row, the PDF leaves one blank table row before the remark block. Long remark text wraps to the next line at the same font size inside the Description column instead of spilling into Qty or Amount.

Hour-based terms such as `10h`, `10H`, or `10 hours` are kept inside the service description. The Qty column remains the number of services, for example `Taipei Chauffeur Service 10h 13000 TWD` becomes Description `Taipei Chauffeur Service 10H`, Qty `1`, and Amount `TWD 13,000`.

Itemized pasted details such as `Alphard - RM250`, `Starex - RM300 x 2`, or `Starex - RM190 x 4 cars x 2 way` are converted into service rows. Starred daily totals such as `*RM250*` and separator lines are ignored. Deposit paid lines are converted into negative adjustment rows, while final summary lines such as `Total RM34,410` and `Balance RM12,125` are ignored because the PDF calculates the final total itself.

## Legacy Python Generator

`invoice_generator.py` is kept as a command-line fallback. The main workflow is now the web app.
