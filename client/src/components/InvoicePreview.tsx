import { X, Printer } from 'lucide-react';

interface InvoiceItem {
  sn: number;
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface BusinessSnapshot {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  pan: string;
  vat_number: string;
  logo_url: string;
  stamp_url: string;
  signature_url: string;
}

interface CustomerSnapshot {
  name: string;
  phone: string;
  address: string;
  pan: string;
}

interface Invoice {
  id: string;
  invoice_number: number;
  invoice_type: 'commercial' | 'tax_invoice' | 'abbreviated';
  bill_language: 'en' | 'ne' | 'bilingual';
  paper_size: 'A4' | 'A5' | 'thermal';
  business_snapshot: BusinessSnapshot;
  customer_snapshot: CustomerSnapshot;
  items_snapshot: InvoiceItem[];
  total_amount: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  net_amount: number;
  amount_paid: number;
  due_amount: number;
  payment_method: string;
  notes: string;
  created_at: string;
  sale_date?: string;
}

interface InvoicePreviewProps {
  invoice: Invoice;
  onClose: () => void;
  onPrint: () => void;
}

const nepaliLabels: Record<string, string> = {
  taxInvoice: 'कर बिजक',
  invoice: 'बिजक',
  invoiceNo: 'बीजक नं.',
  date: 'मिति',
  issueDate: 'जारी मिति',
  sellerName: 'विक्रेताको नाम',
  address: 'ठेगाना',
  buyerName: 'क्रेताको नाम',
  pan: 'प्यान',
  paymentMethod: 'भुक्तानी विधि',
  particulars: 'विवरण',
  quantity: 'परिमाण',
  unitPrice: 'प्रति इकाई मूल्य',
  amount: 'रकम',
  total: 'जम्मा',
  discount: 'छुट',
  vat: 'कर',
  netAmount: 'कुल रकम',
  paid: 'भुक्तानी',
  due: 'बक्यौता',
  sellersSignature: 'विक्रेताको सही',
  shopStamp: 'दोस्रो छाप',
  cash: 'नगद',
  credit: 'उधारो',
  partial: 'आंशिक',
};

const englishLabels: Record<string, string> = {
  taxInvoice: 'TAX INVOICE',
  invoice: 'INVOICE',
  invoiceNo: 'Invoice No.',
  date: 'Date',
  issueDate: 'Issue Date',
  sellerName: 'Seller Name',
  address: 'Address',
  buyerName: 'Buyer Name',
  pan: 'PAN',
  paymentMethod: 'Payment Method',
  particulars: 'Particulars',
  quantity: 'Qty',
  unitPrice: 'Unit Price',
  amount: 'Amount',
  total: 'Total',
  discount: 'Discount',
  vat: 'VAT',
  netAmount: 'Net Amount',
  paid: 'Paid',
  due: 'Due',
  sellersSignature: "Seller's Signature",
  shopStamp: 'Shop Stamp',
  cash: 'Cash',
  credit: 'Credit',
  partial: 'Partial',
};

function getLabel(
  key: string,
  language: 'en' | 'ne' | 'bilingual'
): string {
  const nepali = nepaliLabels[key];
  const english = englishLabels[key];
  if (language === 'en') return english;
  if (language === 'ne') return nepali;
  return `${english} / ${nepali}`;
}

function getPaymentMethodLabel(
  method: string,
  language: 'en' | 'ne' | 'bilingual'
): string {
  const methodKey = method.toLowerCase();
  if (methodKey === 'cash') return getLabel('cash', language);
  if (methodKey === 'credit') return getLabel('credit', language);
  if (methodKey === 'partial') return getLabel('partial', language);
  return method;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getPaperSizeClasses(paperSize: string): string {
  switch (paperSize) {
    case 'A5':
      return 'max-w-[520px] mx-auto text-[11px]';
    case 'thermal':
      return 'max-w-[300px] mx-auto text-[10px]';
    case 'A4':
    default:
      return 'max-w-[800px] mx-auto text-sm';
  }
}

function getHeaderTitle(
  invoiceType: string,
  language: 'en' | 'ne' | 'bilingual'
): string {
  if (invoiceType === 'tax_invoice') return getLabel('taxInvoice', language);
  return getLabel('invoice', language);
}

export default function InvoicePreview({ invoice, onClose, onPrint }: InvoicePreviewProps) {
  const { bill_language, paper_size, invoice_type } = invoice;
  const isThermal = paper_size === 'thermal';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {getHeaderTitle(invoice_type, bill_language)}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrint}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div
            id="invoice-preview"
            className={`bg-white border border-gray-200 shadow-sm ${getPaperSizeClasses(paper_size)} ${
              isThermal ? 'p-3' : 'p-8'
            }`}
          >
            {!isThermal && invoice.business_snapshot.logo_url && (
              <div className="flex justify-center mb-4">
                <img
                  src={invoice.business_snapshot.logo_url}
                  alt={invoice.business_snapshot.shop_name}
                  className="h-16 object-contain"
                />
              </div>
            )}

            <div className="text-center mb-6">
              <h1
                className={`font-bold text-gray-900 ${
                  isThermal ? 'text-base' : 'text-2xl'
                }`}
              >
                {invoice.business_snapshot.shop_name}
              </h1>
              {invoice.business_snapshot.address && (
                <p className="text-gray-600 mt-1">
                  {invoice.business_snapshot.address}
                </p>
              )}
              {(invoice.business_snapshot.phone ||
                invoice.business_snapshot.email) && (
                <p className="text-gray-600">
                  {invoice.business_snapshot.phone}
                  {invoice.business_snapshot.phone &&
                  invoice.business_snapshot.email
                    ? ' | '
                    : ''}
                  {invoice.business_snapshot.email}
                </p>
              )}
              {invoice.business_snapshot.website && (
                <p className="text-gray-600">{invoice.business_snapshot.website}</p>
              )}
              {invoice.business_snapshot.pan && (
                <p className="text-gray-700 font-medium mt-1">
                  {getLabel('pan', bill_language)}: {invoice.business_snapshot.pan}
                </p>
              )}
              {invoice.business_snapshot.vat_number && (
                <p className="text-gray-700 font-medium">
                  VAT No: {invoice.business_snapshot.vat_number}
                </p>
              )}
            </div>

            <div
              className={`text-center mb-6 border-t border-b border-gray-300 py-2 ${
                isThermal ? 'text-sm' : 'text-xl'
              } font-bold text-gray-900 uppercase tracking-wide`}
            >
              {getHeaderTitle(invoice_type, bill_language)}
            </div>

            <div
              className={`grid ${
                isThermal ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-4'
              } mb-6 text-sm`}
            >
              <div className="space-y-1">
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700">
                    {getLabel('invoiceNo', bill_language)}:
                  </span>
                  <span className="text-gray-900">
                    {invoice.invoice_number}
                  </span>
                </div>
                {invoice.sale_date && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-700">
                      {getLabel('date', bill_language)}:
                    </span>
                    <span className="text-gray-900">
                      {formatDate(invoice.sale_date)}
                    </span>
                  </div>
                )}
              </div>
              <div className={`space-y-1 ${isThermal ? '' : 'text-right'}`}>
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700">
                    {getLabel('issueDate', bill_language)}:
                  </span>
                  <span className="text-gray-900">
                    {formatDate(invoice.created_at)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3
                className={`font-semibold text-gray-800 mb-2 ${
                  isThermal ? 'text-xs' : 'text-sm'
                } border-b border-gray-200 pb-1`}
              >
                {getLabel('buyerName', bill_language)}
              </h3>
              <div className={`${isThermal ? 'text-xs' : 'text-sm'} space-y-1`}>
                <div className="flex gap-2">
                  <span className="text-gray-600">
                    {getLabel('buyerName', bill_language)}:
                  </span>
                  <span className="text-gray-900 font-medium">
                    {invoice.customer_snapshot.name}
                  </span>
                </div>
                {invoice.customer_snapshot.address && (
                  <div className="flex gap-2">
                    <span className="text-gray-600">
                      {getLabel('address', bill_language)}:
                    </span>
                    <span className="text-gray-900">
                      {invoice.customer_snapshot.address}
                    </span>
                  </div>
                )}
                {invoice.customer_snapshot.phone && (
                  <div className="flex gap-2">
                    <span className="text-gray-600">Phone:</span>
                    <span className="text-gray-900">
                      {invoice.customer_snapshot.phone}
                    </span>
                  </div>
                )}
                {invoice.customer_snapshot.pan && (
                  <div className="flex gap-2">
                    <span className="text-gray-600">
                      {getLabel('pan', bill_language)}:
                    </span>
                    <span className="text-gray-900">
                      {invoice.customer_snapshot.pan}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold text-gray-700">
                      S.N.
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">
                      {getLabel('particulars', bill_language)}
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold text-gray-700">
                      {getLabel('quantity', bill_language)}
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-right font-semibold text-gray-700">
                      {getLabel('unitPrice', bill_language)}
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-right font-semibold text-gray-700">
                      {getLabel('amount', bill_language)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items_snapshot.map((item) => (
                    <tr key={item.sn}>
                      <td className="border border-gray-300 px-3 py-2 text-center text-gray-700">
                        {item.sn}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-left text-gray-900">
                        {item.name}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center text-gray-700">
                        {item.quantity}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-right text-gray-700">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-right text-gray-900 font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-6">
              <div className={`${isThermal ? 'w-full' : 'w-72'}`}>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">
                    {getLabel('total', bill_language)}
                  </span>
                  <span className="text-gray-900 font-medium">
                    {formatCurrency(invoice.total_amount)}
                  </span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-gray-600">
                      {getLabel('discount', bill_language)}
                    </span>
                    <span className="text-red-600 font-medium">
                      -{formatCurrency(invoice.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">
                    {getLabel('vat', bill_language)} ({invoice.vat_rate}%)
                  </span>
                  <span className="text-gray-900 font-medium">
                    {formatCurrency(invoice.vat_amount)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t border-gray-300 mt-1">
                  <span className="font-bold text-gray-800">
                    {getLabel('netAmount', bill_language)}
                  </span>
                  <span className="font-bold text-gray-900 text-lg">
                    {formatCurrency(invoice.net_amount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end mb-6">
              <div className={`${isThermal ? 'w-full' : 'w-72'}`}>
                <div className="flex justify-between py-1 text-sm">
                  <span className="text-gray-600">
                    {getLabel('paid', bill_language)}
                  </span>
                  <span className="text-green-600 font-medium">
                    {formatCurrency(invoice.amount_paid)}
                  </span>
                </div>
                {invoice.due_amount > 0 && (
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-gray-600">
                      {getLabel('due', bill_language)}
                    </span>
                    <span className="text-red-600 font-medium">
                      {formatCurrency(invoice.due_amount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 text-sm mt-1 border-t border-gray-200">
                  <span className="text-gray-600">
                    {getLabel('paymentMethod', bill_language)}
                  </span>
                  <span className="text-gray-900 font-medium">
                    {getPaymentMethodLabel(invoice.payment_method, bill_language)}
                  </span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700">{invoice.notes}</p>
              </div>
            )}

            <div
              className={`flex ${
                isThermal
                  ? 'flex-col items-center gap-4'
                  : 'justify-between items-end'
              } mt-8 pt-6 border-t border-gray-200`}
            >
              <div className="text-center">
                {invoice.business_snapshot.signature_url ? (
                  <img
                    src={invoice.business_snapshot.signature_url}
                    alt="Seller's Signature"
                    className="h-12 object-contain mb-2"
                  />
                ) : (
                  <p className="text-sm text-gray-600 mb-8">
                    _________________________
                  </p>
                )}
                <p className="text-sm font-medium text-gray-700">
                  {getLabel('sellersSignature', bill_language)}
                </p>
              </div>

              {invoice.business_snapshot.stamp_url && (
                <div className="text-center">
                  <img
                    src={invoice.business_snapshot.stamp_url}
                    alt="Shop Stamp"
                    className="h-16 object-contain mb-1"
                  />
                  <p className="text-xs text-gray-500">
                    {getLabel('shopStamp', bill_language)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
