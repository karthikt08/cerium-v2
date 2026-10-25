/**
 * Produce a clean invoice document independent of the workspace's dialogs,
 * responsive layout, scrolling tables and print-media rules.
 * The caller supplies the invoice article already escaped by the renderer.
 */
const escapeAttribute = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

export function invoicePrintHTML({invoiceMarkup, paper = 'A4', title = 'Invoice'} = {}) {
  if (typeof invoiceMarkup !== 'string' || !/^\s*<article\b[^>]*\binvoice-document\b/i.test(invoiceMarkup)) {
    throw new TypeError('Expected a rendered invoice document.');
  }
  const page = paper === 'Letter' ? 'Letter' : 'A4';
  const documentTitle = escapeAttribute(String(title).slice(0, 120));
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${documentTitle}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#e9edf3;color:#273247;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:12px/1.52 Arial,Helvetica,sans-serif}
  h1,h2,h3,p{margin:0}
  .print-toolbar{max-width:950px;margin:20px auto 12px;padding:0 18px;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}
  .print-toolbar p{font-size:12px;color:#46546b}
  .print-toolbar button{font:600 13px Arial,sans-serif;background:#294fc7;border:0;color:white;border-radius:5px;padding:11px 19px;cursor:pointer}
  .print-sheet{background:white;width:${page === 'A4' ? '210mm' : '215.9mm'};min-height:${page === 'A4' ? '297mm' : '279.4mm'};padding:17mm 16mm 20mm;margin:0 auto 25px;box-shadow:0 6px 28px #202a3a24}
  .invoice-document{color:#273247;width:100%;max-width:none;overflow:visible;overflow-wrap:break-word;padding:0}
  .invoice-top{display:flex;align-items:flex-start;justify-content:space-between;gap:28px;border-bottom:2px solid #243a60;padding-bottom:19px;margin-bottom:22px}
  .invoice-top>div:first-child{flex:1;min-width:0}
  .invoice-top>div:last-child{text-align:right;flex:none;max-width:42%;min-width:105px}
  .invoice-top h2{font-size:19px;line-height:1.24;font-weight:700;letter-spacing:-.25px;margin:0 0 9px;overflow-wrap:anywhere}
  .invoice-top p{font-size:10.4px;line-height:1.58;color:#4c596d;white-space:normal;overflow-wrap:anywhere}
  .invoice-top .eyebrow{font-size:11px;letter-spacing:.06em;font-weight:700;text-transform:uppercase;color:#263955;margin:1px 0 9px;overflow-wrap:anywhere}
  .badge{display:inline-block;font-size:9px;font-weight:700;border-radius:3px;padding:4px 9px;background:#edf2fb;color:#36547a;vertical-align:top}
  .invoice-info{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.8fr) minmax(0,.8fr);gap:24px;margin-bottom:19px}
  .invoice-info>div{min-width:0;overflow-wrap:anywhere}
  .invoice-info small{display:block;text-transform:uppercase;font-size:9px;color:#637086;font-weight:700;letter-spacing:.07em;margin-bottom:5px}
  .invoice-info strong{display:block;font-size:11px;color:#273247}
  .invoice-info p{font-size:10px;line-height:1.55;color:#506078;margin:4px 0 0;white-space:pre-wrap}
  .invoice-document .muted{font-size:10px;line-height:1.65;color:#627088;margin:8px 0 10px;overflow-wrap:anywhere}
  .invoice-document .table-scroll{width:100%;max-width:none;overflow:visible!important;margin:16px 0 0}
  .invoice-document table{width:100%;border-spacing:0;border-collapse:collapse;table-layout:fixed;font-variant-numeric:tabular-nums}
  .invoice-document th,.invoice-document td{box-sizing:border-box;text-align:left;vertical-align:top;border:0;border-bottom:1px solid #e0e7ee;white-space:normal;overflow-wrap:anywhere;word-break:normal;padding:10px 7px;font-size:10.2px;line-height:1.46;min-width:0;max-width:none}
  .invoice-document th{background:#f3f6f9;color:#364861;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-top:1px solid #d9e1ed}
  .invoice-document th:first-child,.invoice-document td:first-child{width:43%;padding-left:10px}
  .invoice-document th:nth-child(2),.invoice-document td:nth-child(2){width:11%;text-align:center}
  .invoice-document th:nth-child(3),.invoice-document td:nth-child(3){width:23%;text-align:right}
  .invoice-document th:nth-child(4),.invoice-document td:nth-child(4){width:23%;text-align:right;padding-right:10px}
  .invoice-document td:first-child{font-weight:500;color:#2c3a50}
  .invoice-tax-summary{width:45%;min-width:225px;margin:20px 0 0 auto;break-inside:avoid;page-break-inside:avoid}
  .invoice-tax-summary p{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:5px 0;font-size:10.5px;line-height:1.55}
  .invoice-tax-summary strong{font-weight:700}
  .invoice-total{display:flex;justify-content:space-between;gap:20px;border-top:1.5px solid #c5d0dd;padding:14px 0 12px;margin:14px 0 16px auto;min-width:225px;max-width:45%;font-weight:700;font-size:16px;line-height:1.32;break-inside:avoid;page-break-inside:avoid}
  .invoice-total span:last-child{text-align:right;overflow-wrap:anywhere}
  .invoice-preserve-lines{font-size:10.4px;line-height:1.62;margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}
  .invoice-document a{color:#273247;text-decoration:none;overflow-wrap:anywhere}
  .invoice-document [data-no-print]{display:none!important}
  @page{size:${page};margin:16mm 16mm 17mm}
  @media print{
    html,body{background:white!important;width:auto!important;min-width:0!important;margin:0!important;padding:0!important}
    .print-toolbar{display:none!important}
    .print-sheet{width:auto!important;min-height:0!important;max-width:none!important;box-shadow:none!important;padding:0!important;margin:0!important;border:0!important}
    .invoice-document{font-size:11px!important}
    .invoice-document .table-scroll{overflow:visible!important;height:auto!important;max-height:none!important}
    .invoice-document table{page-break-inside:auto;break-inside:auto}
    .invoice-document thead{display:table-header-group}
    .invoice-document tbody{display:table-row-group}
    .invoice-document tr{page-break-inside:avoid;break-inside:avoid}
    .invoice-document .invoice-top,.invoice-document .invoice-info{page-break-inside:avoid;break-inside:avoid}
    .invoice-document .invoice-tax-summary,.invoice-document .invoice-total{break-inside:avoid;page-break-inside:avoid}
  }
  @media screen and (max-width:850px){.print-sheet{max-width:100%;min-height:0;padding:25px 22px}.invoice-top{gap:16px}.invoice-info{gap:14px}}
</style></head><body>
<div class="print-toolbar"><p>Review the invoice below. Choose <strong>Save as PDF</strong> in your browser's print dialog.</p><button type="button" onclick="window.print()">Print / Save PDF</button></div>
<main class="print-sheet">${invoiceMarkup}</main>
</body></html>`;
}

export function openInvoicePrint(options) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Your browser blocked the invoice window. Allow popups and retry.');
  popup.document.open();
  popup.document.write(invoicePrintHTML(options));
  popup.document.close();
  popup.opener = null;
  popup.focus();
  return popup;
}
