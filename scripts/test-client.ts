/**
 * Offline test of the generated TypeScript client (see scripts/generate.sh).
 *
 *   ./scripts/generate.sh && bun scripts/test-client.ts
 *
 * Starts a local mock server that answers with the JSON examples from
 * docs/superfaktura and checks:
 *   - request serialization: paths, named parameters, Authorization header,
 *     request bodies with the original (PascalCase / snake_case) keys
 *   - response deserialization: documented JSON mapped to camelCase models
 *
 * No credentials are used and no request leaves the machine.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	BankAccountsApi,
	CashRegisterItemApi,
	ClientsApi,
	Configuration,
	ContactPersonsApi,
	ExpensesApi,
	InvoiceApi,
	ResponseError,
	TagsApi,
	ValueListsApi,
	type Middleware,
} from "../client/index.ts";

// --------------------------------------------------------------------------
// Helpers users need with the generated client (documented in README.md)
// --------------------------------------------------------------------------

/** `Authorization: SFAPI email=...&apikey=...&module=...[&company_id=...]` with URL encoded values. */
export function sfapiAuthorization(opts: { email: string; apikey: string; module: string; companyId?: string }): string {
	const params = new URLSearchParams({ email: opts.email, apikey: opts.apikey, module: opts.module });
	if (opts.companyId) {
		params.set("company_id", opts.companyId);
	}
	return `SFAPI ${params.toString()}`;
}

/**
 * SuperFaktura reads filters as CakePHP named parameters appended to the path
 * (`/invoices/index.json/listinfo:1/page:2`), not as a query string.
 */
export const namedParams: Middleware = {
	async pre({ url, init }) {
		const u = new URL(url);
		if (!u.search) {
			return;
		}
		const named = [...u.searchParams]
			.map(([key, value]) => `/${key}:${value.replace(/[/?#% ]/g, encodeURIComponent)}`)
			.join("");
		u.search = "";
		u.pathname = u.pathname.replace(/\/$/, "") + named;
		return { url: u.toString(), init };
	},
};

// --------------------------------------------------------------------------
// Test infrastructure
// --------------------------------------------------------------------------

const DOCS = join(import.meta.dir, "..", "docs", "superfaktura");

/** First ```json block of `## section` (optionally after `#### heading`) in a docs file. */
function docExample(file: string, section: string, heading?: string): unknown {
	const md = readFileSync(join(DOCS, file), "utf8");
	const start = md.indexOf(`\n## ${section}\n`);
	if (start < 0) {
		throw new Error(`section "${section}" not found in ${file}`);
	}
	let body = md.slice(start + 1);
	const end = body.indexOf("\n## ", 3);
	if (end > 0) {
		body = body.slice(0, end);
	}
	if (heading) {
		const h = body.indexOf(`#### ${heading}\n`);
		if (h < 0) {
			throw new Error(`heading "${heading}" not found in ${file} / ${section}`);
		}
		body = body.slice(h);
	}
	const match = body.match(/```json\s*\n([\s\S]*?)```/i);
	if (!match) {
		throw new Error(`no JSON example in ${file} / ${section} / ${heading ?? ""}`);
	}
	return JSON.parse(match[1]);
}

type Route = { status?: number; json?: unknown; bytes?: string; contentType?: string };
type Seen = { method: string; path: string; headers: Headers; body: string };

const routes = new Map<string, Route>();
const seen: Seen[] = [];

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		const path = decodeURIComponent(url.pathname) + url.search;
		seen.push({ method: req.method, path, headers: req.headers, body: await req.text() });
		const route = routes.get(`${req.method} ${path}`);
		if (!route) {
			return Response.json({ error: 1, error_message: `no mock for ${req.method} ${path}` }, { status: 599 });
		}
		if (route.bytes !== undefined) {
			return new Response(route.bytes, { status: route.status ?? 200, headers: { "Content-Type": route.contentType ?? "application/octet-stream" } });
		}
		return Response.json(route.json, { status: route.status ?? 200 });
	},
});

const AUTH = sfapiAuthorization({ email: "hello+world@example.com", apikey: "c0a4cdcd", module: "Test 1.0", companyId: "123" });
const config = new Configuration({
	basePath: server.url.origin,
	headers: { Authorization: AUTH },
	middleware: [namedParams],
});

function last(): Seen {
	const s = seen.at(-1);
	if (!s) {
		throw new Error("no request recorded");
	}
	return s;
}

function eq(actual: unknown, expected: unknown, what: string): void {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		throw new Error(`${what}: expected ${e}, got ${a}`);
	}
}

let failed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		console.log(`ok   ${name}`);
	} catch (err) {
		failed++;
		console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : String(err)}`);
	}
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

const invoices = new InvoiceApi(config);

await test("auth header is URL encoded SFAPI value", async () => {
	eq(AUTH, "SFAPI email=hello%2Bworld%40example.com&apikey=c0a4cdcd&module=Test+1.0&company_id=123", "Authorization");
});

await test("POST /invoices/create serializes body keys and maps response", async () => {
	routes.set("POST /invoices/create", { json: docExample("invoice.md", "Add invoice", "Successful addition") });
	const res = await invoices.postInvoicesCreate({
		invoiceCreateReq: {
			invoice: { name: "Test API", created: new Date("2019-02-28"), invoiceCurrency: "EUR" },
			invoiceItem: [{ name: "item 1", description: "description of item 1", tax: 20, unitPrice: 10 }],
			client: { name: "Company name", ico: "44981082", updateAddressbook: 1 },
			invoiceSetting: { language: "eng", bysquare: true },
			tag: { tag: [123, 456] },
		},
	});
	const req = last();
	eq(req.headers.get("authorization"), AUTH, "Authorization header");
	eq(req.headers.get("content-type"), "application/json", "Content-Type");
	eq(
		JSON.parse(req.body),
		{
			Invoice: { created: "2019-02-28", invoice_currency: "EUR", name: "Test API" },
			InvoiceItem: [{ description: "description of item 1", name: "item 1", tax: 20, unit_price: 10 }],
			Client: { ico: "44981082", name: "Company name", update_addressbook: 1 },
			InvoiceSetting: { bysquare: true, language: "eng" },
			Tag: { Tag: [123, 456] },
		},
		"request body",
	);
	eq(res.errorMessage, "Invoice created", "error_message");
	eq(res.data?.invoice?.invoiceNoFormatted, "ZAL12019001", "Invoice.invoice_no_formatted");
	eq(res.data?.invoiceItem?.[0]?.unitPrice, 10, "InvoiceItem[0].unit_price");
	eq(res.data?.invoiceItem?.[0]?.accountingDetail?.analyticsAccount, "311", "InvoiceItem[0].AccountingDetail");
	eq(res.data?.summary?.invoiceTotal, 10.8, "Summary.invoice_total");
	eq(res.data?.myData?.bankAccount?.[0]?.iban, "SK0000000000000000", "MyData.BankAccount[0].iban");
	eq(res.data?.invoiceExtra?.pickupPointId, "23", "InvoiceExtra.pickup_point_id");
});

await test("GET /invoices/index.json/listinfo:1 sends named parameters and maps list", async () => {
	routes.set("GET /invoices/index.json/listinfo:1/page:2/per_page:1/type:regular|proforma/created:3/created_since:2050-01-01", {
		json: docExample("invoice.md", "Get list of invoices"),
	});
	const list = await invoices.getInvoicesIndexJsonListinfo1({
		page: 2,
		perPage: 1,
		type: "regular|proforma",
		created: 3,
		createdSince: new Date("2050-01-01"),
	});
	eq(last().path, "/invoices/index.json/listinfo:1/page:2/per_page:1/type:regular|proforma/created:3/created_since:2050-01-01", "request path");
	eq([list.itemCount, list.page, list.pageCount, list.perPage], [2, 2, 2, 1], "paging");
	eq(list.items?.[0]?.invoice?.token, "c3b05c50", "items[0].Invoice.token");
	eq(list.items?.[0]?._0?.toPay, "12.000000", 'items[0]["0"].to_pay');
	eq(list.items?.[0]?.clientData?.name, "John Doe", "items[0].ClientData.name");
});

await test("GET /invoices/view/{id}.json maps invoice detail", async () => {
	routes.set("GET /invoices/view/1.json", { json: docExample("invoice.md", "Get invoice detail", "Success") });
	const detail = await invoices.getInvoicesViewInvoiceIdJson({ invoiceId: 1 });
	eq(detail.invoice?.invoiceNoFormatted, "2020001", "Invoice.invoice_no_formatted");
	eq(detail.invoiceSetting?.onlinePayment, null, "InvoiceSetting.online_payment");
	eq(detail.myData?.country?.iso, "sk", "MyData.country.iso");
	eq(detail.summaryInvoice?.vatBaseSeparatePositive, { "20": 10 }, "SummaryInvoice");
});

await test("GET /invoices/view/{id}.json raises ResponseError on 404", async () => {
	routes.set("GET /invoices/view/999.json", { status: 404, json: docExample("invoice.md", "Get invoice detail", "Wrong invoice") });
	try {
		await invoices.getInvoicesViewInvoiceIdJson({ invoiceId: 999 });
		throw new Error("expected ResponseError");
	} catch (err) {
		if (!(err instanceof ResponseError)) {
			throw err;
		}
		eq(err.response.status, 404, "status");
		eq(((await err.response.json()) as { error_message: string }).error_message, "Invoice not found", "error_message");
	}
});

await test("GET /{language}/invoices/pdf/{id}/token:{token} returns a Blob", async () => {
	routes.set("GET /slo/invoices/pdf/1275/token:09feb1bd/bysquare:1", { bytes: "%PDF-1.4 test", contentType: "application/pdf" });
	const pdf = await invoices.getLanguageInvoicesPdfInvoiceIdTokenToken({ language: "slo", invoiceId: 1275, token: "09feb1bd", bysquare: 1 });
	eq((await pdf.text()).startsWith("%PDF"), true, "PDF body");
});

await test("POST /clients/create serializes Client and maps response", async () => {
	routes.set("POST /clients/create", { json: docExample("clients.md", "Create client", "Successful addition") });
	const res = await new ClientsApi(config).postClientsCreate({
		clientCreateReq: { client: { name: "Jozef Mrkvicka", countryId: 191, deliveryZip: "811 04", dueDate: 20 } },
	});
	eq(JSON.parse(last().body), { Client: { country_id: 191, delivery_zip: "811 04", due_date: 20, name: "Jozef Mrkvicka" } }, "request body");
	eq(res.data?.client?.id, "4", "data.Client.id");
	eq(res.data?.client?.deliveryName, "Jozef Mrkvicka", "data.Client.delivery_name");
});

await test("POST /bank_accounts/add serializes reserved word `default`", async () => {
	routes.set("POST /bank_accounts/add", { json: docExample("bank-account.md", "Add bank account", "Successful creation") });
	const res = await new BankAccountsApi(config).postBankAccountsAdd({
		bankAccountReq: { bankName: "NovaBanka", iban: "SK000011112222333344", swift: "suzuki", _default: 1, show: 1, showAccount: 1 },
	});
	eq(
		JSON.parse(last().body),
		{ bank_name: "NovaBanka", default: 1, iban: "SK000011112222333344", show: 1, show_account: 1, swift: "suzuki" },
		"request body",
	);
	eq(res.bankAccount?.bankName, "NovaBanka", "BankAccount.bank_name");
	eq(res.bankAccount?._default, 1, "BankAccount.default");
});

await test("GET /expenses/view/{id}.json maps expense detail", async () => {
	routes.set("GET /expenses/view/1.json", { json: docExample("expenses.md", "Expense detail", "Successfully show details") });
	const exp = await new ExpensesApi(config).getExpensesViewIdJson({ id: 1 });
	eq(exp.expense?.name, "Foo bar", "Expense.name");
	eq(exp.expenseItem?.[0]?.unitPrice, "12.1400", "ExpenseItem[0].unit_price");
	eq(exp.expenseBasicRate?.[0]?.total, "12.1400", "ExpenseBasicRate[0].total");
	eq(exp.vatSummary, [{ base: 12.14, vat: 0 }], "VatSummary");
});

await test("GET /cash_register_items/index/{id} sends named parameter", async () => {
	routes.set("GET /cash_register_items/index/2/term:P2020003", { json: docExample("cash-register-item.md", "Get cash register items") });
	const items = await new CashRegisterItemApi(config).getCashRegisterItemsIndexId({ id: 2, term: "P2020003" });
	eq(items.itemCount, 1, "itemCount");
	eq(items.cashRegister?.name, "CR2-EET", "CashRegister.name");
	eq(items.items?.[0]?.cashRegisterItem?.cashItemNoFormatted, "P2020003", "items[0].CashRegisterItem");
});

await test("GET /contact_people/getContactPeople/{id} maps contacts", async () => {
	routes.set("GET /contact_people/getContactPeople/3", { json: docExample("contact-persons.md", "Get contact persons", "Successful") });
	const people = await new ContactPersonsApi(config).getContactPeopleGetContactPeopleId({ id: 3 });
	eq(people[0]?.contactPerson?.email, "janko.hrasko@example.com", "[0].ContactPerson.email");
	eq(people[1]?.contactPerson?.client, true, "[1].ContactPerson.client");
});

await test("GET /sequences/index.json maps sequences by document type", async () => {
	routes.set("GET /sequences/index.json", { json: docExample("value-lists.md", "Sequences") });
	const seq = await new ValueListsApi(config).getSequencesIndexJson();
	eq(seq.regular?.[0]?.sequenceFormatted, "2020001", "regular[0].sequence_formatted");
	eq(seq.cashRegisterIn?.[0]?.mask, "PRRRRCCC", "cash_register_in[0].mask");
});

await test("GET /tags/index.json returns id -> name map", async () => {
	routes.set("GET /tags/index.json", { json: docExample("tags.md", "Get list of tags") });
	const tags = await new TagsApi(config).getTagsIndexJson();
	eq(tags, { "1": "abc" }, "tags");
});

server.stop(true);
if (failed > 0) {
	console.log(`\n${failed} test(s) failed`);
	process.exit(1);
}
console.log("\nall tests passed");
