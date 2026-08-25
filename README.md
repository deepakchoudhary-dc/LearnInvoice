# Ledgerly — Free Offline Invoice Software for Traders and Small Businesses

Ledgerly is built for traders, shop owners, wholesalers, service businesses, freelancers, and small enterprises that need professional invoicing without subscriptions, AI, surveillance, or forced third-party services.

The goal is simple: give every business access to private, capable invoice software that works on its own machine and keeps financial records under the owner's control.

## Quick start

Requires [Node.js](https://nodejs.org) 18 or newer. No build step, no account, no internet needed after install.

```bash
cd LearnInvoice
npm install
npm start
```

Open the URL printed by the server (by default `http://127.0.0.1:3000`), create a vault password of at least 12 characters, and start billing.

> Your vault password cannot be recovered. Keep it in a password manager and keep encrypted backups in a separate safe location.

## Features

- **Invoices, quotations, proformas, credit notes** with per-line discounts, shipping, round-off and inclusive/exclusive tax pricing.
- **GST-ready** — HSN/SAC, GSTIN, CGST/SGST/IGST split by place of supply, amount in words, IRP-ready draft JSON export.
- **Point of sale** — barcode scanning, tap-to-bill catalog, walk-in customers, instant print receipt.
- **Inventory** — stock tracking, reorder levels, low-stock alerts.
- **Customers** — directory, credit limits, outstanding balances.
- **Expenses & recurring invoices** — log money going out; automate rent/subscription billing.
- **Reports** — sales by month, expenses by category, outstanding aging, GST liability, best sellers, audit trail. All exportable to CSV.
- **Encrypted backups** — AES-GCM backup files protected with their own password.
- **Works offline** — PDF creation uses the browser's native Print → Save as PDF.

## Where your data lives

Everything is stored **only on your computer**, inside the browser you use:

- Business records are AES-GCM encrypted in an IndexedDB database (`OfflineInvoiceDB`) using your vault password.
- Only non-secret key-derivation metadata (a random salt) is kept in localStorage.

Nothing is ever sent anywhere. The bundled server only serves the app files to your own machine (`127.0.0.1`).

## Deleting / resetting local data

Two ways:

1. **In the app** — go to *Business & backup → Vault → "Erase all data…"*. It asks for confirmation twice, then wipes every record.
2. **Manually** — open DevTools (F12) → *Application* tab:
   - *Storage → IndexedDB* → delete the `OfflineInvoiceDB` database.
   - *Local Storage* → remove the `vault_salt` and `vault_kdf_iterations` keys.

Or simply clear site data for `127.0.0.1:3000` from your browser settings. After erasing, the app behaves like a fresh install and asks you to create a new vault.

## India GST / e-invoice note

Ledgerly can prepare, audit, print, and export invoice data offline. It can export an IRP-ready draft, but an official IRN and signed QR code must still be issued by the authorised Invoice Registration Portal.

## Development checks

```bash
npm test        # unit tests for math, GST, documents, CSV, backup
npm run lint    # TypeScript type check
```

## Project structure

```
LearnInvoice/
├── public/
│   ├── index.html          # app shell + vault gate
│   ├── style.css           # design system
│   └── js/
│       ├── app.js          # router, views, actions
│       └── modules/        # domain logic: state, crypto, documents,
│                           # gst math, reports, backup, csv, validation
├── src/server.ts           # tiny static file server (Express)
└── src/tests/              # plain Node test scripts
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Keep the project offline-first, privacy-first, accessible to small businesses, and free from compulsory AI or third-party service dependencies.

## License

Licensed under the [MIT License](LICENSE). Use it, improve it, share it, and help make dependable invoicing software available to everyone.
