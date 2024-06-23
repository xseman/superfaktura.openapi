import swagger from "https://esm.sh/swagger-ui-dist@5.10.2";
import crypto from "https://esm.sh/crypto-js@4.2.0";

swagger.SwaggerUIBundle({
	// url: "http://localhost:8000/openapi.yaml",
	url: 'https://raw.githubusercontent.com/xseman/superfaktura.openapi/master/openapi.yaml',
	dom_id: "#swagger-ui",
	syntaxHighlight: { theme: "idea" },
	deepLinking: true,
	persistAuthorization: true,
	requestInterceptor: websupportAuth,
});

/**
 * @param {swagger.SwaggerRequest} req 
 */
function websupportAuth(req) {
	const auth = JSON.parse(window.localStorage.getItem("authorized"));
	if (auth) {
		const {
			username: apiKey, 
			password: secret
		} = auth.basicAuth.value;
		const date = new Date().toISOString();
		const path = new URL(req.url).pathname;
		const signature = crypto
			.HmacSHA1(`${req.method} ${path} ${date}`, secret)
			.toString(crypto.enc.Hex);

		console.log(req.method, path, date);
		req.headers = {
			...req.headers,
			Date: date,
			Authorization: "Basic " + window.btoa(apiKey + ":" + signature),
		};
	}

	return req;
}

