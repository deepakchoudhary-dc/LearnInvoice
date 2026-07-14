# 📄 Ultimate Smart Invoice Generator
*(Formerly Invoice Memory Agent)*

A premium, privacy-first, and lightning-fast invoice generation workspace. Designed with a modern SaaS aesthetic, this application empowers you to create, manage, and export professional invoices without relying on external APIs, databases, or third-party AI services. Everything runs **100% locally** on your machine.

---

## 🌟 Core Features

### 1. Seamless 3-Pane Workspace
The UI is divided into a professional 3-pane layout designed to maximize productivity and reduce cognitive load:
*   **Navigation & Settings**: A dark-mode sidebar for global settings (Theme Color, Currency) and local JSON Template Import/Export.
*   **The Workstation**: The central column where data is entered. It features two tabs: the standard manual "Builder" and the powerful "⚡ Smart Tools".
*   **Live Preview Engine**: A real-time, precisely paginated A4 document preview that updates instantly with every keystroke.

### 2. Enterprise Multi-Page A4 Engine
Never worry about long invoices breaking your format.
*   If you add dozens of line items, the system intelligently calculates the exact pixel height and seamlessly spills the table over to a new A4 page within the preview.
*   Generates flawless PDFs with perfect page breaks—guaranteeing that rows are never cut in half during export.

### 3. "Smart Tools" (100% Local Intelligence)
Located in the center pane, these tools provide advanced automation but execute completely offline using highly optimized vanilla JavaScript:
*   **⚡ Command Parser**: Type commands like `discount 15%` or `due today`, hit Execute, and watch the invoice update instantly.
*   **📝 Smart Text Extract**: Paste a messy email or meeting notes into the Magic Paste box. The local parser scans the text for keywords and prices, automatically building your line items.
*   **🔍 Local Auditor**: Validate your invoice before sending. The system checks for anomalies like past-due dates, missing tax IDs, or unusually high discounts.
*   **✉️ Reminders Generator**: Instantly draft a perfectly formatted, professional payment reminder email containing the client's information, invoice number, and total due.

### 4. Advanced Interactivity
*   **Drag-and-Drop Sorting**: Reorder your line items visually by dragging the `⋮⋮` handle up or down.
*   **Click-to-Edit**: Click directly on the Client Name, Address, or Notes right on the live A4 preview to type and edit them without breaking your workflow.

---

## 🚀 Getting Started

### Prerequisites
*   [Node.js](https://nodejs.org/) (v16.x or higher)
*   npm (installed alongside Node.js)

### Installation
1. Clone or download the repository to your local machine.
2. Navigate to the project directory:
   ```bash
   cd LearnInvoice
   ```
3. Install the minimal local dependencies:
   ```bash
   npm install
   ```

### Running the Application
To start the local server and open the application in your browser, simply run:
```bash
npm run start
```
The server will automatically launch the Ultimate Smart Invoice Generator on `http://localhost:3000`.

---

## 🏗️ Architecture & Tech Stack

This project strictly adheres to a zero-API, local-first philosophy to ensure absolute data privacy for your financial documents.

*   **Frontend UI**: Vanilla HTML5 and CSS3 (utilizing Custom Properties and Flexbox/CSS Grid).
*   **Frontend Logic**: Vanilla JavaScript (ES6+), handling complex multi-page pagination, drag-and-drop APIs, and localized "Smart" parsing algorithms.
*   **PDF Generation**: Utilizes `html2pdf.js` via CDN for client-side rendering.
*   **Backend / Serving**: A highly minimal Node.js / Express server for securely serving the static assets to your local browser.
*   **Data Persistence**: Relies on secure JSON file export/import, keeping your client data out of the cloud.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome. Feel free to check the issues page if you want to contribute to the local smart algorithms or the UI layout.

## 📝 License
This project is open-source and available under the standard MIT License.
