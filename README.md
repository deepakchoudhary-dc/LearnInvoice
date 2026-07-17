# Ledgerly — Free Offline Invoice Software for Traders and Small Businesses

Ledgerly is built for traders, shop owners, wholesalers, service businesses, freelancers, and small enterprises that need professional invoicing without subscriptions, AI, surveillance, or forced third-party services.

The goal is simple: give every business access to private, capable invoice software that works on its own machine and keeps financial records under the owner's control.

## Why Ledgerly

- Works locally and does not depend on a cloud account, AI service, analytics service, payment gateway, font CDN, or PDF CDN.
- Protects saved data in a password-encrypted local vault.
- Creates invoices, quotations/proformas, and credit notes.
- Keeps customer and product/service catalogs with HSN/SAC, GSTIN, tax rates, pricing, and units.
- Supports GST/VAT/no-tax documents, per-line discounts, multiple currencies, payment instructions, partial payments, overdue tracking, and credit notes.
- Provides local reports for receivables, customer sales, document history, and audit events.
- Exports encrypted backups, audit CSV files, and IRP-ready invoice draft JSON.
- Uses the browser's native Print / Save as PDF flow, so PDF creation also works offline.

## Who it is for

Ledgerly is for people who want billing software that serves their business—not software that sells their financial data, locks their records behind subscriptions, or forces them to rely on AI.

You can use it for a retail shop, wholesale trade, professional service, local manufacturing business, repair center, freelancer practice, or any small business that needs clear invoices and trustworthy records.

## Run locally

```powershell
cd LearnInvoice
npm install
npm run start
```

Open the local URL printed by the server. By default it runs only on `127.0.0.1`.

## India GST / e-invoice note

Ledgerly can prepare, audit, print, and export invoice data offline. It can export an IRP-ready draft, but an official IRN and signed QR code must still be issued by the authorised Invoice Registration Portal.

## Protect your records

Your vault password cannot be recovered. Keep it in a password manager and keep encrypted backups in a separate safe location.

## Development checks

```powershell
npm test
npm audit --omit=dev --audit-level=moderate
```

## Contributing

Contributions are welcome. Keep the project offline-first, privacy-first, accessible to small businesses, and free from compulsory AI or third-party service dependencies.

## License

Licensed under the [MIT License](LICENSE). Use it, improve it, share it, and help make dependable invoicing software available to everyone.
