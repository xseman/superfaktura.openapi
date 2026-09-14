import swagger from "https://esm.sh/swagger-ui-dist@5.10.2";

// Served locally by ./serve.sh (repository root is the web root): use the working copy.
// Anywhere else: use the published specification from GitHub.
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const specUrl = isLocal
	? new URL("../openapi.yaml", window.location.href).href
	: "https://raw.githubusercontent.com/xseman/superfaktura.openapi/master/openapi.yaml";

// Authentication uses the `SFAPI` apiKey scheme: click "Authorize" and paste the whole
// header value, e.g. `SFAPI email=api%40example.com&apikey=YOURKEY&module=MyModule&company_id=`.
// Values have to be URL encoded (see https://github.com/superfaktura/docs/blob/master/intro.md).
swagger.SwaggerUIBundle({
	url: specUrl,
	dom_id: "#swagger-ui",
	syntaxHighlight: { theme: "idea" },
	deepLinking: true,
	persistAuthorization: true,
});
