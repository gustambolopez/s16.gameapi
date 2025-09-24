import { hostname } from "node:os";
import boxen from "boxen";
import chalk from "chalk";
import express from "express";
import fetch from "node-fetch";
import ora from "ora";
import { api_graphql, Image, link_base, linksuffix } from "./value.js";

const app = express();
const port = parseInt(process.env.PORT, 10) || 8080;
const cachesearch = new Map();
const cacheduration = 6 * 60 * 1000;
const maxCacheSize = 1000;

app.use(express.json());
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, PATCH, OPTIONS",
	);
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}
	next();
});

const image_suffix = "-512x512";
const image_suffixtwo = "-512x384";

function cleanupCache() {
	if (cachesearch.size <= maxCacheSize) return;

	const entries = Array.from(cachesearch.entries());
	entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

	const toDelete = entries.slice(0, Math.floor(maxCacheSize * 0.2));
	for (const [key] of toDelete) {
		cachesearch.delete(key);
	}
}

/**
 * @param {string} url
 * @returns {Promise<string | null>}
 */
async function checkstatus(url) {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 3000);

		const res = await fetch(url, {
			method: "HEAD",
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		return res.ok ? url : null;
	} catch (err) {
		if (err.name !== "AbortError") {
			console.error(`error in the image ${url}:`, err.message);
		}
		return null;
	}
}

async function theresultlmao(result) {
	const id = result.id;
	const link = `${link_base}${id}${linksuffix}`;
	const possibleImageUrls = [
		`${Image}${id}${image_suffix}.jpg`,
		`${Image}${id}${image_suffix}.jpeg`,
		`${Image}${id}${image_suffixtwo}.jpg`,
		`${Image}${id}${image_suffixtwo}.jpeg`,
	];

	const imagePromises = possibleImageUrls.map((url) => checkstatus(url));
	const imageResults = await Promise.allSettled(imagePromises);

	let theimageurl = null;
	for (const result of imageResults) {
		if (result.status === "fulfilled" && result.value) {
			theimageurl = result.value;
			break;
		}
	}

	const { id: _, ...exclude } = result;
	return {
		...exclude,
		link,
		...(theimageurl && {
			img: theimageurl,
		}),
	};
}

app.get("/v0/api/games/q=:searchTerm", async (req, res) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const term = String(req.params.searchTerm || "").trim();
		let quantity = parseInt(req.query.quantity, 10) || 21000;
		const sortByTitle = req.query.sortBytitle !== undefined;

		if (quantity > 1000) quantity = 1000;

		const cacheKey = `${term}-${quantity}-${sortByTitle}`;

		if (cachesearch.has(cacheKey)) {
			const cachedData = cachesearch.get(cacheKey);
			if (Date.now() - cachedData.timestamp < cacheduration) {
				console.log("loading from cache:", cacheKey);
				return res.json(cachedData.results);
			}
			cachesearch.delete(cacheKey);
		}

		const query = `
      query SearchGames($search: String!, $hits: Int!) {
        gamesSearched(input: { search: $search, hitsPerPage: $hits }) {
          hits {
            objectID
            type
            title
            description
            instruction
            tags
            categories
            company
            mobile
            keyFeatures
            slugs { name active }
            publishedAt
            lastPublishedAt
            languages
          }
        }
      }
    `;

		const resp = await fetch(api_graphql, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Origin: "https://gamedistribution.com",
				Referer: "https://gamedistribution.com/",
			},
			body: JSON.stringify({
				query,
				variables: {
					search: term,
					hits: quantity,
				},
			}),
			signal: controller.signal,
		});

		if (!resp.ok) {
			const errText = await resp.text();
			console.error(`GraphQL error ${resp.status}: ${errText}`);
			return res.status(resp.status).json({
				error: `Fetch failed: ${errText}`,
			});
		}

		const data = await resp.json();
		if (data.errors) {
			console.error("GraphQL returned errors:", data.errors);
			return res.status(500).json({
				error: "GraphQL errors",
				details: data.errors,
			});
		}

		const hits = data?.data?.gamesSearched?.hits ?? [];
		const results = await Promise.all(
			hits.map((result) =>
				theresultlmao({
					id: result.objectID,
					...result,
					mobile: result.mobile?.map((m) =>
						m === "ForIOS" ? "IOS" : m === "ForAndroid" ? "Android" : m,
					),
				}),
			),
		);

		if (results.length === 0) {
			return res.status(404).json({
				error: "no games found.",
			});
		}

		if (sortByTitle) {
			results.sort((a, b) => a.title.localeCompare(b.title));
		}

		cleanupCache();
		cachesearch.set(cacheKey, {
			results,
			timestamp: Date.now(),
		});
		console.log("Stored cache:", cacheKey);
		res.json(results);
	} catch (err) {
		console.error("Fetch error:", err);
		if (err.name === "AbortError") {
			return res.status(408).json({
				error: "Request timeout",
			});
		}
		res.status(500).json({
			error: "Server error",
			details: err.message,
		});
	} finally {
		clearTimeout(timeout);
	}
});

app.get("/v0/api/games/:id", async (req, res) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const gameId = String(req.params.id || "").trim();

		const query = `
      query SearchGameById($search: String!) {
        gamesSearched(input: { search: $search, hitsPerPage: 1 }) {
          hits {
            objectID
            type
            title
            description
            instruction
            tags
            categories
            company
            mobile
            keyFeatures
            slugs { name active }
            publishedAt
            lastPublishedAt
            languages
          }
        }
      }
    `;

		const resp = await fetch(api_graphql, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Origin: "https://gamedistribution.com",
				Referer: "https://gamedistribution.com/",
			},
			body: JSON.stringify({
				query,
				variables: {
					search: gameId,
				},
			}),
			signal: controller.signal,
		});

		if (!resp.ok) {
			const errText = await resp.text();
			console.error(`GraphQL error ${resp.status}: ${errText}`);
			return res.status(resp.status).json({
				error: `Fetch failed: ${errText}`,
			});
		}

		const data = await resp.json();
		if (data.errors) {
			console.error("GraphQL returned errors:", data.errors);
			return res.status(500).json({
				error: "GraphQL errors",
				details: data.errors,
			});
		}

		const found = data?.data?.gamesSearched?.hits?.find(
			(g) => g.objectID === gameId,
		);
		if (!found) {
			return res.status(404).json({
				error: "Game not found, is the ID correct or does it exist?",
			});
		}

		const gameResult = await theresultlmao({
			id: found.objectID,
			...found,
			mobile: found.mobile?.map((m) =>
				m === "ForIOS" ? "IOS" : m === "ForAndroid" ? "Android" : m,
			),
		});
		res.json([
			gameResult,
		]);
	} catch (err) {
		console.error("Fetch error:", err);
		if (err.name === "AbortError") {
			return res.status(408).json({
				error: "Request timeout",
			});
		}
		res.status(500).json({
			error: "Server error",
			details: err.message,
		});
	} finally {
		clearTimeout(timeout);
	}
});

app.get("/health", (_req, res) => {
	res.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		cacheSize: cachesearch.size,
		memory: process.memoryUsage(),
	});
});

const DEV_MESSAGE =
	process.env.DEV_MESSAGE ||
	'(Hosted on heaven previously altera, go check it here "https://discord.gg/qk4HmXf8tz"). to search something try /v0/api/games/q=(yoursearch)';

app.get("/", (_req, res) => {
	res.send(DEV_MESSAGE);
});

const spinner = ora("starting server...").start();
const server = app.listen(port, () => {
	spinner.succeed("server started");
	const info = `
${chalk.bold(
	chalk.hex("#059d4aff")(`
███████╗ ██╗ ██████╗     █████╗ ██████╗ ██╗
██╔════╝███║██╔════╝    ██╔══██╗██╔══██╗██║
███████╗╚██║███████╗    ███████║██████╔╝██║
╚════██║ ██║██╔═══██╗   ██╔══██║██╔═══╝ ██║
███████║ ██║╚██████╔╝██╗██║  ██║██║     ██║
╚══════╝ ╚═╝ ╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝

`),
)}
  ${chalk.bold(chalk.hex("#1E90FF")("local host:"))} http://localhost${port === 80 ? "" : `:${chalk.bold(port)}`}
  ${chalk.bold(chalk.hex("#1E90FF")("system hostname:"))} http://${hostname()}${port === 80 ? "" : `:${chalk.bold(port)}`}
  ${chalk.bold(chalk.hex("#1E90FF")("direct ip:"))} http://127.0.0.1${port === 80 ? "" : `:${chalk.bold(port)}`}
`;
	console.log(
		boxen(info, {
			padding: 1,
			borderColor: "green",
			borderStyle: "round",
		}),
	);
});

function logWithTime(message) {
	console.log(`[${new Date().toISOString()}] ${message}`);
}

function shutdown() {
	spinner.start("shutting down server...");
	logWithTime(chalk.yellow("SIGTERM signal received: closing HTTP server"));
	server.close(() => {
		logWithTime(chalk.green("server closed."));
		spinner.succeed("server shutdown complete");
		process.exit(0);
	});
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
	spinner.fail("Uncaught Exception!");
	console.error(
		boxen(chalk.red.bold("[UNCAUGHT EXCEPTION]"), {
			padding: 1,
			borderColor: "red",
			borderStyle: "round",
		}),
		err,
	);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	spinner.fail("Unhandled Rejection!");
	console.error(
		boxen(chalk.red.bold("[UNHANDLED REJECTION]"), {
			padding: 1,
			borderColor: "red",
			borderStyle: "round",
		}),
		reason,
	);
	process.exit(1);
});
