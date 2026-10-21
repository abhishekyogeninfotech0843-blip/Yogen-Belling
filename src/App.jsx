import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import "./App.css";

const INVOICES_KEY = "yogen-billing-invoices";
const COMPANY_KEY = "yogen-billing-company";
const INVOICE_SEQUENCE_KEY = "yogen-billing-next-sequence";

const money = (amount) =>
  Number(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const pdfMoney = (amount) =>
  `INR ${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const today = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const blankCustomer = () => ({ name: "", address: "", gstin: "" });
const blankItems = () => [
  { id: Date.now(), name: "", quantity: 1, unit: "unit", price: "" },
];

function readStoredValue(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
}

function App() {
  const [company, setCompany] = useState(() =>
    readStoredValue(COMPANY_KEY, {
      name: "Yogen Infotech",
      address: "",
      gstin: "",
      phone: "",
      email: "",
      paymentDetails: "",
    }),
  );
  const [invoices, setInvoices] = useState(() => {
    const saved = readStoredValue(INVOICES_KEY, []);
    return Array.isArray(saved) ? saved : [];
  });
  const [nextSequence, setNextSequence] = useState(() =>
    Math.max(
      Number(readStoredValue(INVOICE_SEQUENCE_KEY, 1)) || 1,
      ...invoices.map((invoice) => (Number(invoice.sequence) || 0) + 1),
    ),
  );
  const [storageError, setStorageError] = useState("");
  const [customer, setCustomer] = useState(blankCustomer);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("Tax Invoice");
  const [taxType, setTaxType] = useState("none");
  const [gstRate, setGstRate] = useState(18);
  const [items, setItems] = useState(blankItems);
  const [activeView, setActiveView] = useState("dashboard");
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [notice, setNotice] = useState("");

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0),
    0,
  );
  const gstAmount =
    taxType === "none" ? 0 : subtotal * (Number(gstRate) / 100);
  const cgst = taxType === "intra" ? gstAmount / 2 : 0;
  const sgst = taxType === "intra" ? gstAmount / 2 : 0;
  const igst = taxType === "inter" ? gstAmount : 0;
  const grandTotal = subtotal + gstAmount;
  const sortedInvoices = useMemo(
    () =>
      [...invoices].sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          Number(b.sequence || 0) - Number(a.sequence || 0),
      ),
    [invoices],
  );
  const filteredInvoices = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    if (!query) return sortedInvoices;
    return sortedInvoices.filter((invoice) => {
      const searchable = [
        invoice.id,
        invoice.title,
        invoice.date,
        invoice.customer?.name,
        invoice.customer?.address,
        invoice.customer?.gstin,
        invoice.company?.name,
        ...(invoice.items || []).map((item) => item.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(query);
    });
  }, [searchTerm, sortedInvoices]);
  const totalSales = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.grandTotal || 0),
    0,
  );

  function saveInvoices(nextInvoices, updatedSequence) {
    try {
      if (updatedSequence !== undefined) {
        localStorage.setItem(INVOICE_SEQUENCE_KEY, String(updatedSequence));
        setNextSequence(updatedSequence);
      }
      localStorage.setItem(INVOICES_KEY, JSON.stringify(nextInvoices));
      setInvoices(nextInvoices);
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Could not save invoices to local storage.", error);
      setStorageError(
        "Your latest change could not be saved on this device. Check available browser storage and try again.",
      );
      return false;
    }
  }

  function updateItem(id, field, value) {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addItem() {
    setItems((previous) => [
      ...previous,
      {
        id: Date.now() + Math.random(),
        name: "",
        quantity: 1,
        unit: "unit",
        price: "",
      },
    ]);
  }

  function removeItem(id) {
    setItems((previous) =>
      previous.length > 1
        ? previous.filter((item) => item.id !== id)
        : previous,
    );
  }

  function updateCompany(field, value) {
    const nextCompany = { ...company, [field]: value };
    setCompany(nextCompany);
    try {
      localStorage.setItem(COMPANY_KEY, JSON.stringify(nextCompany));
    } catch (error) {
      console.error("Could not save company details to local storage.", error);
      setStorageError(
        "Company details could not be saved on this device. Check available browser storage.",
      );
    }
  }

  function resetForm(sequence = nextSequence) {
    setEditingId(null);
    setCustomer(blankCustomer());
    setItems(blankItems());
    setInvoiceDate(today());
    setInvoiceNumber(`INV-${String(sequence).padStart(3, "0")}`);
    setInvoiceTitle("Invoice");
    setTaxType("none");
    setGstRate(18);
  }

  function startNewInvoice() {
    resetForm();
    setNotice("");
    setActiveView("create");
  }

  function editInvoice(invoice) {
    setEditingId(invoice.id);
    setInvoiceNumber(invoice.id);
    setInvoiceTitle(invoice.title || "Tax Invoice");
    setInvoiceDate(invoice.date);
    setCompany({ ...invoice.company });
    setCustomer({ ...invoice.customer });
    setTaxType(invoice.taxType || "intra");
    setGstRate(Number(invoice.gstRate || 0));
    setItems(
      invoice.items.map((item) => ({
        ...item,
        id: item.id || Date.now() + Math.random(),
      })),
    );
    setNotice("");
    setSelectedInvoice(null);
    setActiveView("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function createInvoice(event) {
    event.preventDefault();
    const id = invoiceNumber.trim();
    if (!id) {
      setNotice("Please enter an invoice number.");
      return;
    }
    if (!customer.name.trim()) {
      setNotice("Please enter the customer or company name.");
      return;
    }
    if (
      items.some(
        (item) =>
          !item.name.trim() ||
          !Number.isFinite(Number(item.quantity)) ||
          Number(item.quantity) <= 0 ||
          item.price === "" ||
          !Number.isFinite(Number(item.price)) ||
          Number(item.price) < 0,
      )
    ) {
      setNotice("Check each item name, quantity and price before saving.");
      return;
    }
    if (!invoiceTitle.trim()) {
      setNotice("Please enter a title for this invoice.");
      return;
    }
    if (
      invoices.some(
        (invoice) =>
          invoice.id.toLocaleLowerCase() === id.toLocaleLowerCase() &&
          invoice.id !== editingId,
      )
    ) {
      setNotice("That invoice number is already in use. Choose a unique number.");
      return;
    }

    const existing = invoices.find((invoice) => invoice.id === editingId);
    const invoice = {
      id,
      title: invoiceTitle.trim(),
      date: invoiceDate,
      company: { ...company },
      customer: { ...customer },
      taxType,
      gstRate: Number(gstRate),
      items: items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        price: Number(item.price),
        amount: Number(item.quantity) * Number(item.price),
      })),
      subtotal,
      cgst,
      sgst,
      igst,
      gstAmount,
      grandTotal,
      sequence: existing?.sequence || nextSequence,
    };
    const nextInvoices = existing
      ? invoices.map((saved) => (saved.id === editingId ? invoice : saved))
      : [invoice, ...invoices];

    const updatedSequence = existing ? nextSequence : nextSequence + 1;
    if (!saveInvoices(nextInvoices, updatedSequence)) return;
    setNotice(existing ? "Invoice changes saved." : "Invoice saved successfully.");
    resetForm(updatedSequence);
    setActiveView("history");
  }

  function deleteInvoice(invoice) {
    if (
      !window.confirm(
        `Delete invoice ${invoice.id} for ${invoice.customer.name}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const nextInvoices = invoices.filter((saved) => saved.id !== invoice.id);
    if (!saveInvoices(nextInvoices)) return;
    setSelectedInvoice(null);
    setNotice(`Invoice ${invoice.id} was deleted.`);
  }

  async function downloadPDF(invoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const showYogenLogo =
      invoice.company.name?.trim().toLocaleLowerCase() === "yogen infotech";
    let logo;
    if (showYogenLogo) {
      logo = new Image();
      logo.src = `${import.meta.env.BASE_URL}yogen-logo.png`;
      try {
        await logo.decode();
      } catch (error) {
        console.error("Could not load the Yogen logo for the invoice PDF.", error);
        setNotice("The Yogen logo could not be loaded. Please try downloading the invoice again.");
        return;
      }
    }

    doc.setFillColor(16, 34, 61);
    doc.rect(0, 0, pageWidth, 44, "F");
    if (logo) doc.addImage(logo, "PNG", margin, 7, 42, 10.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const companyName = doc.splitTextToSize(
      invoice.company.name || "YOGEN INFOTECH",
      pageWidth * 0.48 - margin,
    );
    doc.text(companyName.slice(0, 2), margin, 27, { lineHeightFactor: 1.15 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(191, 216, 232);
    doc.text(
      doc.splitTextToSize(invoice.title || "INVOICE", contentWidth * 0.58),
      margin,
      39,
    );
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`Invoice: ${invoice.id}`, pageWidth - margin, 16, {
      align: "right",
    });
    doc.text(`Date: ${invoice.date}`, pageWidth - margin, 26, {
      align: "right",
    });

    doc.setTextColor(35, 48, 65);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("FROM", margin, 56);
    doc.text("BILL TO", pageWidth / 2 + 5, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const columnWidth = (contentWidth - 12) / 2;
    const sellerDetails = [
      invoice.company.name,
      invoice.company.address,
      invoice.company.gstin ? `GSTIN: ${invoice.company.gstin}` : "",
      invoice.company.phone ? `Phone: ${invoice.company.phone}` : "",
      invoice.company.email ? `Email: ${invoice.company.email}` : "",
    ].filter(Boolean);
    const customerLines = [
      invoice.customer.name,
      invoice.customer.address,
      invoice.customer.gstin ? `GSTIN: ${invoice.customer.gstin}` : "",
    ].filter(Boolean);
    const wrapDetails = (details) =>
      details.flatMap((line) => doc.splitTextToSize(String(line), columnWidth));
    const sellerLines = wrapDetails(
      sellerDetails.length ? sellerDetails : ["Company details not provided"],
    );
    const wrappedCustomerLines = wrapDetails(customerLines);
    const detailY = 63;
    const lineHeight = 4.5;
    doc.text(sellerLines, margin, detailY, { lineHeightFactor: 1.3 });
    doc.text(wrappedCustomerLines, pageWidth / 2 + 5, detailY, {
      lineHeightFactor: 1.3,
    });
    const tableStartY =
      detailY +
      Math.max(sellerLines.length, wrappedCustomerLines.length, 1) * lineHeight +
      9;

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [["#", "Description", "Qty / Unit", "Unit Price", "Amount"]],
      body: invoice.items.map((item, index) => [
        index + 1,
        item.name,
        `${item.quantity} ${item.unit || "unit"}`,
        pdfMoney(item.price),
        pdfMoney(item.amount),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [20, 44, 79],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        overflow: "linebreak",
        valign: "middle",
        textColor: [44, 57, 75],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: contentWidth - 10 - 26 - 43 - 43 },
        2: { cellWidth: 26, halign: "center" },
        3: { cellWidth: 43, halign: "right" },
        4: { cellWidth: 43, halign: "right" },
      },
    });
    const totalsY = (doc.lastAutoTable?.finalY || tableStartY) + 8;
    const totals = [
      ["Subtotal", pdfMoney(invoice.subtotal)],
      ...(invoice.taxType === "none"
        ? []
        : invoice.taxType === "intra"
        ? [
            [`CGST (${invoice.gstRate / 2}%)`, pdfMoney(invoice.cgst)],
            [`SGST (${invoice.gstRate / 2}%)`, pdfMoney(invoice.sgst)],
          ]
        : [[`IGST (${invoice.gstRate}%)`, pdfMoney(invoice.igst)]]),
      ["Grand Total", pdfMoney(invoice.grandTotal)],
    ];
    autoTable(doc, {
      startY: totalsY,
      body: totals,
      theme: "plain",
      tableWidth: 90,
      margin: { left: pageWidth - margin - 90, right: margin },
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [44, 57, 75] },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 48, halign: "right" },
      },
      didParseCell(data) {
        if (data.row.index === totals.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [20, 100, 150];
          data.cell.styles.fontSize = 10;
        }
      },
    });
    let footerY = (doc.lastAutoTable?.finalY || totalsY) + 10;
    if (invoice.company.paymentDetails) {
      const paymentLines = doc.splitTextToSize(
        invoice.company.paymentDetails,
        contentWidth,
      );
      const paymentBlockHeight = 6 + paymentLines.length * lineHeight + 8;
      if (footerY + paymentBlockHeight > pageHeight - 20) {
        doc.addPage();
        footerY = 20;
      }
      doc.setTextColor(35, 48, 65);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("PAYMENT DETAILS", margin, footerY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(paymentLines, margin, footerY + 6, { lineHeightFactor: 1.3 });
      footerY += paymentBlockHeight;
    }
    if (footerY + 12 > pageHeight - 16) {
      doc.addPage();
      footerY = 20;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(35, 48, 65);
    doc.text("Thank you for your business!", margin, footerY + 5);
    doc.setDrawColor(225, 231, 238);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 145);
    doc.text(
      "Please verify all invoice and tax details before issuing.",
      margin,
      pageHeight - 9,
    );
    doc.save(`${invoice.id}.pdf`);
  }

  const navigation = [
    { id: "dashboard", icon: "◫", label: "Overview" },
    { id: "create", icon: "＋", label: "Create invoice" },
    { id: "history", icon: "▤", label: "Invoice history" },
  ];

  function renderInvoiceList(list, compact = false) {
    if (!list.length) {
      return (
        <div className="empty-state">
          <div className="empty-icon">▤</div>
          <h3>{searchTerm ? "No matching invoices" : "No invoices yet"}</h3>
          <p>
            {searchTerm
              ? "Try another invoice number, customer or software name."
              : "Create your first invoice to start building your sales history."}
          </p>
          {!searchTerm && (
            <button className="button button-primary" onClick={startNewInvoice}>
              Create an invoice
            </button>
          )}
        </div>
      );
    }
    return (
      <div className={compact ? "invoice-list compact-list" : "invoice-list"}>
        {list.map((invoice) => (
          <article className="invoice-item" key={invoice.id}>
            <div className="invoice-top">
              <div>
                <strong>{invoice.id}</strong>
                <span className="invoice-date">{invoice.date}</span>
              </div>
              <span className="invoice-status">Saved</span>
            </div>
            <p className="invoice-customer">{invoice.customer.name}</p>
            <p className="invoice-description">
              {invoice.title || "Tax Invoice"} ·{" "}
              {(invoice.items || []).map((item) => item.name).join(", ")}
            </p>
            <div className="invoice-bottom">
              <strong>{money(invoice.grandTotal)}</strong>
              <div className="invoice-actions">
                <button
                  className="button button-quiet"
                  onClick={() => setSelectedInvoice(invoice)}
                  aria-label={`View invoice ${invoice.id}`}
                >
                  View
                </button>
                <button
                  className="button button-quiet"
                  onClick={() => editInvoice(invoice)}
                  aria-label={`Edit invoice ${invoice.id}`}
                >
                  Edit
                </button>
                <button
                  className="button button-quiet"
                  onClick={() => downloadPDF(invoice)}
                  aria-label={`Download invoice ${invoice.id} as PDF`}
                >
                  PDF
                </button>
                <button
                  className="button button-danger-quiet"
                  onClick={() => deleteInvoice(invoice)}
                  aria-label={`Delete invoice ${invoice.id}`}
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderForm() {
    return (
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">BILLING WORKSPACE</span>
            <h2>{editingId ? `Edit ${editingId}` : "Create invoice"}</h2>
            <p>Create an invoice for rent, bills, services, products or any other charge.</p>
          </div>
          <span className="step-tag">PDF READY</span>
        </div>
        <form onSubmit={createInvoice}>
          <h3 className="section-title">Your details (seller / bill from)</h3>
          <label htmlFor="company-name">Your name or business name</label>
          <input
            id="company-name"
            value={company.name}
            onChange={(event) => updateCompany("name", event.target.value)}
            required
          />
          <label htmlFor="company-address">Your address</label>
          <textarea
            id="company-address"
            value={company.address}
            onChange={(event) => updateCompany("address", event.target.value)}
            placeholder="Your address"
            rows="2"
          />
          <div className="form-row">
            <div>
              <label htmlFor="company-gstin">Company GSTIN</label>
              <input
                id="company-gstin"
                value={company.gstin}
                onChange={(event) => updateCompany("gstin", event.target.value)}
                placeholder="GSTIN (optional)"
              />
            </div>
            <div>
              <label htmlFor="company-phone">Phone</label>
              <input
                id="company-phone"
                value={company.phone}
                onChange={(event) => updateCompany("phone", event.target.value)}
                placeholder="Company phone"
              />
            </div>
          </div>
          <label htmlFor="company-email">Company email</label>
          <input
            id="company-email"
            type="email"
            value={company.email}
            onChange={(event) => updateCompany("email", event.target.value)}
            placeholder="Company email"
          />
          <label htmlFor="payment-details">Payment instructions (optional)</label>
          <textarea
            id="payment-details"
            value={company.paymentDetails}
            onChange={(event) =>
              updateCompany("paymentDetails", event.target.value)
            }
            placeholder="Bank details or payment instructions"
            rows="2"
          />

          <h3 className="section-title">Invoice & recipient</h3>
          <label htmlFor="invoice-title">Invoice title</label>
          <input
            id="invoice-title"
            value={invoiceTitle}
            onChange={(event) => setInvoiceTitle(event.target.value)}
            placeholder="e.g. Rent Invoice, Electricity Bill"
            required
          />
          <div className="form-row">
            <div>
              <label htmlFor="invoice-number">Invoice number</label>
              <input
                id="invoice-number"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="invoice-date">Invoice date</label>
              <input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                required
              />
            </div>
          </div>
          <label htmlFor="customer-name">Billed to (person / company)</label>
          <input
            id="customer-name"
            value={customer.name}
            onChange={(event) =>
              setCustomer((previous) => ({
                ...previous,
                name: event.target.value,
              }))
            }
            placeholder="Tenant, customer or recipient name"
            required
          />
          <label htmlFor="customer-address">Customer address</label>
          <textarea
            id="customer-address"
            value={customer.address}
            onChange={(event) =>
              setCustomer((previous) => ({
                ...previous,
                address: event.target.value,
              }))
            }
            placeholder="Billing address"
            rows="2"
          />
          <label htmlFor="customer-gstin">Customer GSTIN</label>
          <input
            id="customer-gstin"
            value={customer.gstin}
            onChange={(event) =>
              setCustomer((previous) => ({
                ...previous,
                gstin: event.target.value,
              }))
            }
            placeholder="GSTIN, if applicable"
          />

          <h3 className="section-title">Items or charges</h3>
          <div className="items-heading">
            <label>Invoice items</label>
            <button className="button button-secondary" type="button" onClick={addItem}>
              + Add item
            </button>
          </div>
          {items.map((item, index) => (
            <div className="software-row" key={item.id}>
              <div className="software-row-title">
                <strong>Item {String(index + 1).padStart(2, "0")}</strong>
                {items.length > 1 && (
                  <button
                    className="button button-danger-quiet"
                    type="button"
                    onClick={() => removeItem(item.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <label htmlFor={`item-name-${item.id}`}>Description</label>
              <input
                id={`item-name-${item.id}`}
                value={item.name}
                onChange={(event) =>
                  updateItem(item.id, "name", event.target.value)
                }
                placeholder="e.g. October rent, electricity, repair"
                required
              />
              <div className="form-row item-pricing">
                <div>
                  <label htmlFor={`item-quantity-${item.id}`}>Quantity</label>
                  <input
                    id={`item-quantity-${item.id}`}
                    type="number"
                    min="0.01"
                    step="any"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.id, "quantity", event.target.value)
                    }
                    required
                  />
                </div>
                <div>
                  <label htmlFor={`item-unit-${item.id}`}>Unit</label>
                  <input
                    id={`item-unit-${item.id}`}
                    value={item.unit || ""}
                    onChange={(event) =>
                      updateItem(item.id, "unit", event.target.value)
                    }
                    placeholder="month, kWh, item"
                  />
                </div>
                <div>
                  <label htmlFor={`item-price-${item.id}`}>Price per unit (₹)</label>
                  <input
                    id={`item-price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(event) =>
                      updateItem(item.id, "price", event.target.value)
                    }
                    placeholder="50000"
                    required
                  />
                </div>
              </div>
              <p className="item-amount">
                Line total:{" "}
                {money(Number(item.quantity || 0) * Number(item.price || 0))}
              </p>
            </div>
          ))}
          <div className="form-row">
            <div>
              <label htmlFor="gst-rate">GST rate</label>
              <select
                id="gst-rate"
                value={gstRate}
                onChange={(event) => setGstRate(Number(event.target.value))}
                disabled={taxType === "none"}
              >
                {[0, 5, 12, 18, 28].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tax-type">Tax type</label>
              <select
                id="tax-type"
                value={taxType}
                onChange={(event) => setTaxType(event.target.value)}
              >
                <option value="none">No tax</option>
                <option value="intra">CGST + SGST</option>
                <option value="inter">IGST</option>
              </select>
            </div>
          </div>
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            {taxType === "none" ? null : taxType === "intra" ? (
              <>
                <div>
                  <span>CGST ({gstRate / 2}%)</span>
                  <strong>{money(cgst)}</strong>
                </div>
                <div>
                  <span>SGST ({gstRate / 2}%)</span>
                  <strong>{money(sgst)}</strong>
                </div>
              </>
            ) : (
              <div>
                <span>IGST ({gstRate}%)</span>
                <strong>{money(igst)}</strong>
              </div>
            )}
            <div className="grand-total">
              <span>Grand total</span>
              <strong>{money(grandTotal)}</strong>
            </div>
          </div>
          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              {editingId ? "Save invoice changes" : "Save invoice"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                resetForm();
                setActiveView("dashboard");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">Y</div>
          <div>
            <h2>YOGEN</h2>
            <span>INFOTECH</span>
          </div>
        </div>
        <p className="menu-label">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`menu-item ${activeView === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => {
                setNotice("");
                if (item.id === "create" && activeView !== "create") {
                  startNewInvoice();
                } else {
                  setActiveView(item.id);
                }
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="footer-avatar">YI</div>
          <div>
            <strong>Yogen Infotech</strong>
            <span>Invoice manager</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">YOGEN INFOTECH <span>/</span> BILLING</p>
            <h1>
              {activeView === "dashboard"
                ? "Good business starts here"
                : activeView === "history"
                  ? "Invoice history"
                  : editingId
                    ? "Update invoice"
                    : "Create an invoice"}
            </h1>
            <p className="muted">
              {activeView === "history"
                ? "Find every saved invoice and open its original document."
                : "Create, save and find invoices for any product, service or bill."}
            </p>
          </div>
          <button className="admin-badge" onClick={() => setActiveView("dashboard")}>
            <span>YI</span> Yogen Infotech
          </button>
        </header>

        {storageError && (
          <div className="storage-alert" role="alert">
            <span>{storageError}</span>
            <button onClick={() => setStorageError("")} aria-label="Dismiss storage warning">
              ×
            </button>
          </div>
        )}
        {notice && activeView !== "create" && (
          <div className="notice notice-banner" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}

        {activeView === "dashboard" && (
          <>
            <section className="welcome-card">
              <div>
                <span className="welcome-kicker">YOUR BILLING OVERVIEW</span>
                <h2>Make an invoice for anything.</h2>
                <p>Create custom invoices for rent, household bills, services or product sales.</p>
                <button className="button button-light" onClick={startNewInvoice}>
                  <span>＋</span> Create new invoice
                </button>
              </div>
              <div className="welcome-mark" aria-hidden="true">Y</div>
            </section>
            <section className="stats" aria-label="Billing summary">
              <div className="stat-card">
                <div className="stat-symbol">▤</div>
                <span>Total invoices</span>
                <strong>{invoices.length}</strong>
                <small>Saved on this device</small>
              </div>
              <div className="stat-card">
                <div className="stat-symbol sales-symbol">₹</div>
                <span>Total invoiced</span>
                <strong>{money(totalSales)}</strong>
                <small>Including applicable tax</small>
              </div>
              <div className="stat-card">
                <div className="stat-symbol customer-symbol">◎</div>
                <span>Recipients billed</span>
                <strong>
                  {new Set(invoices.map((invoice) => invoice.customer?.name).filter(Boolean)).size}
                </strong>
                <small>Unique customers</small>
              </div>
            </section>
            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">YOUR RECORDS</span>
                  <h2>Recent invoices</h2>
                  <p>Your latest invoices, ready to view or download.</p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => setActiveView("history")}
                >
                  View all <span aria-hidden="true">→</span>
                </button>
              </div>
              {renderInvoiceList(sortedInvoices.slice(0, 5), true)}
            </section>
          </>
        )}

        {activeView === "create" && renderForm()}

        {activeView === "history" && (
          <section className="panel history-panel">
            <div className="panel-heading history-heading">
              <div>
                <span className="eyebrow">ALL-TIME RECORDS</span>
                <h2>Every invoice, in one place</h2>
                <p>Search invoice number, recipient, date or item description.</p>
              </div>
              <button className="button button-primary" onClick={startNewInvoice}>
                + New invoice
              </button>
            </div>
            <div className="history-toolbar">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search invoices, recipients, items..."
                  aria-label="Search invoice history"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>
              <span className="results-count">
                {filteredInvoices.length} of {invoices.length} invoices
              </span>
            </div>
            {renderInvoiceList(filteredInvoices)}
          </section>
        )}

        <footer>
          <span>© {new Date().getFullYear()} Yogen Infotech</span>
          <span>Billing workspace · Records stay in this browser</span>
        </footer>
      </main>

      {selectedInvoice && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedInvoice(null);
          }}
        >
          <section
            className="invoice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">INVOICE DETAILS</span>
                <h2 id="invoice-modal-title">
                  {selectedInvoice.title || "Tax Invoice"}
                </h2>
                <p>{selectedInvoice.id} · {selectedInvoice.date}</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setSelectedInvoice(null)}
                aria-label="Close invoice details"
              >
                ×
              </button>
            </div>
            <div className="invoice-parties">
              <div>
                <span>FROM</span>
                <strong>{selectedInvoice.company.name}</strong>
                <p>{selectedInvoice.company.address || "No address provided"}</p>
              </div>
              <div>
                <span>BILLED TO</span>
                <strong>{selectedInvoice.customer.name}</strong>
                <p>{selectedInvoice.customer.address || "No address provided"}</p>
              </div>
            </div>
            <div className="modal-items">
              {selectedInvoice.items.map((item, index) => (
                <div className="modal-item" key={`${item.name}-${index}`}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.quantity} {item.unit || "unit"} × {money(item.price)}
                    </span>
                  </div>
                  <strong>{money(item.amount)}</strong>
                </div>
              ))}
            </div>
            <div className="modal-total">
              <span>
                {selectedInvoice.taxType === "none"
                  ? "Grand total"
                  : "Grand total (incl. GST)"}
              </span>
              <strong>{money(selectedInvoice.grandTotal)}</strong>
            </div>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => editInvoice(selectedInvoice)}
              >
                Edit invoice
              </button>
              <button
                className="button button-primary"
                onClick={() => downloadPDF(selectedInvoice)}
              >
                Download PDF
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
